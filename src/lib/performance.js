import { OpType } from './operations.js';

/** Liste des jours ("aaaa-mm-jj") entre deux dates incluses. */
export function dayRange(from, to) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Curseur sur une série de cours triée : renvoie le dernier cours connu à une date. */
function priceCursor(series) {
  let i = -1;
  return (date) => {
    if (!series || series.length === 0) return null;
    while (i + 1 < series.length && series[i + 1].date <= date) i += 1;
    return i >= 0 ? series[i].close : null;
  };
}

/**
 * Reconstitue l'historique quotidien du portefeuille.
 *
 * - value : valorisation des titres détenus (dernier cours connu, sinon PRU)
 * - invested : montant net investi (achats - ventes)
 * - income : dividendes perçus - frais et taxes hors courtage
 * - wealth : value + income, ce que le portefeuille a réellement produit
 * - benchmark : valeur d'un portefeuille fictif qui aurait investi exactement
 *   les mêmes montants, aux mêmes dates, dans l'indice de référence
 *
 * @param operations opérations triées par date
 * @param priceSeries Map clé titre -> [{date, close}] en EUR, triées
 * @param benchmarkSeries [{date, close}] en EUR, triées (optionnel)
 * @param today date de fin ("aaaa-mm-jj")
 */
export function buildTimeline(operations, priceSeries, benchmarkSeries, today) {
  if (operations.length === 0) return { points: [], estimatedKeys: [] };
  const days = dayRange(operations[0].date, today);
  const cursors = new Map([...priceSeries].map(([k, s]) => [k, priceCursor(s)]));
  const benchPrice = priceCursor(benchmarkSeries);
  const holdings = new Map(); // clé -> { qty, cost }
  const estimatedKeys = new Set();
  let invested = 0;
  let income = 0;
  let benchUnits = 0;
  let pendingBench = 0; // montants investis avant le premier cours connu de l'indice
  let opIndex = 0;
  const points = [];

  for (const day of days) {
    const bp = benchPrice(day);
    if (bp && pendingBench) {
      benchUnits += pendingBench / bp;
      pendingBench = 0;
    }
    while (opIndex < operations.length && operations[opIndex].date <= day) {
      const op = operations[opIndex];
      opIndex += 1;
      const h = holdings.get(op.key) ?? { qty: 0, cost: 0 };
      if (op.type === OpType.BUY) {
        h.qty += op.quantity;
        h.cost += op.amount;
        invested += op.amount;
        if (bp) benchUnits += op.amount / bp; else pendingBench += op.amount;
      } else if (op.type === OpType.SELL) {
        const qty = Math.min(op.quantity, h.qty);
        const pru = h.qty > 0 ? h.cost / h.qty : 0;
        h.qty -= qty;
        h.cost -= pru * qty;
        invested -= op.amount;
        if (bp) benchUnits -= op.amount / bp; else pendingBench -= op.amount;
      } else if (op.type === OpType.DIVIDEND) {
        income += op.amount;
      } else if (op.type === OpType.FEE || op.type === OpType.TAX) {
        income -= op.amount;
      }
      holdings.set(op.key, h);
    }

    let value = 0;
    for (const [key, h] of holdings) {
      if (h.qty <= 1e-9) continue;
      const cursor = cursors.get(key);
      const price = cursor ? cursor(day) : null;
      if (price !== null) {
        value += h.qty * price;
      } else {
        value += h.cost;
        estimatedKeys.add(key);
      }
    }
    points.push({
      date: day,
      value,
      invested,
      income,
      wealth: value + income,
      benchmark: bp ? benchUnits * bp + pendingBench : null,
    });
  }
  return { points, estimatedKeys: [...estimatedKeys] };
}

/** Flux de trésorerie vus par l'investisseur (négatif = argent versé). */
export function portfolioCashflows(operations) {
  const flows = [];
  for (const op of operations) {
    if (op.type === OpType.BUY) flows.push({ date: op.date, amount: -op.amount });
    else if (op.type === OpType.SELL || op.type === OpType.DIVIDEND) flows.push({ date: op.date, amount: op.amount });
    else if (op.type === OpType.FEE || op.type === OpType.TAX) flows.push({ date: op.date, amount: -op.amount });
  }
  return flows;
}

export function benchmarkCashflows(operations) {
  return operations
    .filter((op) => op.type === OpType.BUY || op.type === OpType.SELL)
    .map((op) => ({ date: op.date, amount: op.type === OpType.BUY ? -op.amount : op.amount }));
}

/**
 * Taux de rendement interne annualisé (XIRR) : le taux qui annule la valeur
 * actuelle des flux. Tient compte du moment où chaque euro a été investi.
 * Renvoie null si le calcul ne converge pas.
 */
export function xirr(flows) {
  if (flows.length < 2) return null;
  const hasPos = flows.some((f) => f.amount > 0);
  const hasNeg = flows.some((f) => f.amount < 0);
  if (!hasPos || !hasNeg) return null;
  const t0 = Date.parse(flows[0].date);
  const years = flows.map((f) => (Date.parse(f.date) - t0) / (365.25 * 864e5));
  const npv = (r) => flows.reduce((s, f, i) => s + f.amount / (1 + r) ** years[i], 0);

  // Bissection sur ]-99 %, +1000 %] : robuste, pas besoin de dérivée.
  let lo = -0.99;
  let hi = 10;
  let fLo = npv(lo);
  const fHi = npv(hi);
  if (Number.isNaN(fLo) || Number.isNaN(fHi) || fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) return mid;
    if (fLo * fMid < 0) hi = mid; else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}
