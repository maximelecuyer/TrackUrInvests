import { normalizeKey, parseExport, splitLabel } from './parse.js';
import { mergeOperations, normalizeOperation, OpType } from './operations.js';

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Transforme les fichiers d'un dossier en jeu de données.
 *
 * - Avec un historique des opérations : calculs exacts à partir des opérations.
 * - Avec seulement des états du portefeuille : chaque export daté devient un
 *   point d'historique, et les écarts entre deux exports sont traduits en
 *   achats et ventes estimés (voir synthesizeOperations).
 */
export function buildDataset(files) {
  const report = [];
  const operationLists = [];
  const snapshots = [];

  for (const file of files) {
    try {
      const parsed = parseExport(file.data, file.name);
      report.push({ name: file.name, kind: parsed.kind, count: parsed.records.length, headers: parsed.headers, date: parsed.meta?.date });
      if (parsed.kind === 'operations') operationLists.push(parsed.records);
      if (parsed.kind === 'positions' && parsed.records.length) {
        snapshots.push({
          date: parsed.meta?.date ?? isoDay(file.lastModified ?? Date.now()),
          account: parsed.meta?.account || 'Compte',
          lastModified: file.lastModified ?? 0,
          records: parsed.records,
        });
      }
    } catch (err) {
      report.push({ name: file.name, kind: 'error', count: 0, error: err.message });
    }
  }

  const history = dedupeSnapshots(snapshots);
  const latest = latestPerAccount(history);
  const snapshot = latest.flatMap((s) => s.records);

  const infoByLabel = new Map();
  for (const snap of history) {
    for (const r of snap.records) {
      const k = normalizeKey(r.label);
      if (!infoByLabel.has(k)) infoByLabel.set(k, r);
    }
  }

  let operations;
  let mode;
  if (operationLists.length) {
    mode = 'operations';
    const normalized = operationLists.map((records) => records.map((r) => {
      const { label, ticker } = splitLabel(r.label);
      const info = infoByLabel.get(normalizeKey(label));
      return normalizeOperation({ ...r, label, ticker: ticker || info?.ticker || '', isin: r.isin || info?.isin || '' });
    }));
    operations = mergeOperations(normalized);
  } else {
    mode = history.length ? 'snapshots' : 'empty';
    operations = synthesizeOperations(history);
  }

  const aliases = loyaltyAliases([...snapshot, ...operations]);
  const snapshotDates = [...new Set(history.map((s) => s.date))].sort();
  return { mode, operations, snapshot, snapshotDates, accounts: latest.map((s) => s.account), aliases, report };
}

/** Un même état exporté deux fois (copie du fichier) ne compte qu'une fois. */
function dedupeSnapshots(snapshots) {
  const byId = new Map();
  for (const s of snapshots) {
    const id = `${s.account}|${s.date}`;
    const prev = byId.get(id);
    if (!prev || s.lastModified > prev.lastModified) byId.set(id, s);
  }
  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function latestPerAccount(history) {
  const latest = new Map();
  for (const s of history) latest.set(s.account, s); // history est trié par date
  return [...latest.values()];
}

const keyOf = (r) => r.isin || normalizeKey(r.label);

/**
 * Déduit des opérations à partir d'états successifs du portefeuille, compte par compte :
 * - premier export : chaque ligne est "achetée" à sa valeur de marché du jour (Qté x Cours).
 *   L'historique commence donc à cette date, ce qui rend la comparaison à l'indice équitable ;
 *   le PRU et la plus-value latente, eux, sont repris tels quels de l'export le plus récent.
 * - quantité en hausse : achat, pour la hausse du prix de revient total
 * - quantité en baisse : vente, au cours du jour de l'export
 * Les dividendes et les frais ne figurent pas dans ces exports.
 */
export function synthesizeOperations(history) {
  const ops = [];
  const previous = new Map(); // compte -> Map(clé -> ligne)
  for (const snap of history) {
    const first = !previous.has(snap.account);
    const before = previous.get(snap.account) ?? new Map();
    const after = new Map(snap.records.map((r) => [keyOf(r), r]));
    for (const key of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(key);
      const b = after.get(key);
      const q0 = a?.quantity ?? 0;
      const q1 = b?.quantity ?? 0;
      const ref = b ?? a;
      const base = {
        date: snap.date, key, label: ref.label, isin: ref.isin, ticker: ref.ticker ?? '',
        currency: ref.currency || 'EUR', fees: 0, estimated: true, source: 'état du portefeuille',
      };
      if (q1 > q0 + 1e-9) {
        const cost = first
          ? q1 * (b.lastPrice ?? b.pru ?? 0)
          : Math.max(0, q1 * (b.pru ?? b.lastPrice ?? 0) - q0 * (a?.pru ?? 0));
        ops.push({ ...base, type: OpType.BUY, rawType: 'Achat estimé', quantity: q1 - q0, amount: cost, gross: cost, price: cost / (q1 - q0) });
      } else if (q1 < q0 - 1e-9) {
        const price = b?.lastPrice ?? a.lastPrice ?? a.pru ?? 0;
        const amount = (q0 - q1) * price;
        ops.push({ ...base, type: OpType.SELL, rawType: 'Vente estimée', quantity: q0 - q1, amount, gross: amount, price });
      }
    }
    previous.set(snap.account, after);
  }
  // Achats avant ventes le même jour.
  return ops.sort((x, y) => x.date.localeCompare(y.date) || (x.type === OpType.BUY ? -1 : 1) - (y.type === OpType.BUY ? -1 : 1));
}

/**
 * Lignes de prime de fidélité ("AIR LIQUIDE PF27") : elles ont leur propre ISIN,
 * non coté, mais valent le cours de l'action d'origine. Renvoie Map clé -> clé de l'action.
 */
function loyaltyAliases(records) {
  const byLabel = new Map();
  for (const r of records) {
    const split = r.baseLabel === undefined ? splitLabel(r.label) : r;
    if (!split.baseLabel) byLabel.set(normalizeKey(r.label), r.key ?? keyOf(r));
  }
  const aliases = new Map();
  for (const r of records) {
    const split = r.baseLabel === undefined ? splitLabel(r.label) : r;
    const target = split.baseLabel && byLabel.get(normalizeKey(split.baseLabel));
    if (target) aliases.set(r.key ?? keyOf(r), target);
  }
  return aliases;
}

/** Ligne du dernier état du portefeuille correspondant à une position. */
export function findSnapshotLine(snapshot, position) {
  return snapshot.find((s) => (s.isin && s.isin === position.isin) || normalizeKey(s.label) === normalizeKey(position.label));
}

/**
 * Sans historique des opérations, le PRU calculé ne reflète que les exports
 * disponibles : on reprend celui de Fortuneo, qui est exact.
 */
export function applySnapshotCost(positions, snapshot) {
  return positions.map((p) => {
    const snap = findSnapshotLine(snapshot, p);
    if (!snap || snap.pru === null || p.quantity <= 0) return p;
    return { ...p, pru: snap.pru, costBasis: snap.pru * p.quantity };
  });
}
