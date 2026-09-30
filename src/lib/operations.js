import { normalizeKey } from './parse.js';

export const OpType = {
  BUY: 'achat',
  SELL: 'vente',
  DIVIDEND: 'dividende',
  FEE: 'frais',
  TAX: 'taxe',
  DEPOSIT: 'versement',
  WITHDRAWAL: 'retrait',
  OTHER: 'autre',
};

// Règles testées dans l'ordre : la première qui correspond l'emporte.
const RULES = [
  [OpType.TAX, ['taxe', 'ttf', 'prelevement', 'impot', 'csg', 'retenue']],
  [OpType.FEE, ['droits de garde', 'frais', 'commission', 'abonnement', 'cotisation']],
  [OpType.DIVIDEND, ['dividende', 'coupon', 'distribution', 'acompte', 'revenu']],
  [OpType.SELL, ['vente', 'cession', 'remboursement', 'rachat']],
  [OpType.BUY, ['achat', 'souscription', 'acquisition']],
  [OpType.WITHDRAWAL, ['virement emis', 'retrait', 'virement vers']],
  [OpType.DEPOSIT, ['versement', 'virement recu', 'virement de', 'virement', 'apport']],
];

export function classifyOperation(label) {
  const key = normalizeKey(label);
  for (const [type, words] of RULES) {
    if (words.some((w) => key.includes(w))) return type;
  }
  return OpType.OTHER;
}

/** Identifiant stable d'un titre : ISIN si connu, sinon libellé normalisé. */
export function securityKey(record) {
  return record.isin || normalizeKey(record.label);
}

const abs = (v) => (v === null || v === undefined ? null : Math.abs(v));

/** Convertit un enregistrement brut en opération normalisée (montants positifs). */
export function normalizeOperation(record) {
  const type = classifyOperation(record.operation);
  const quantity = abs(record.quantity) ?? 0;
  const fees = abs(record.fees) ?? 0;
  let gross = abs(record.gross);
  if (gross === null && record.price !== null && record.price !== undefined && quantity) {
    gross = Math.abs(record.price) * quantity;
  }
  let net = abs(record.net);
  if (net === null && gross !== null) {
    net = type === OpType.SELL ? gross - fees : gross + fees;
  }
  return {
    date: record.date,
    type,
    rawType: record.operation,
    key: securityKey(record),
    label: record.label,
    isin: record.isin || '',
    ticker: record.ticker || '',
    quantity,
    price: abs(record.price) ?? (quantity && gross ? gross / quantity : null),
    gross: gross ?? net ?? 0,
    fees,
    amount: net ?? 0,
    currency: record.currency || 'EUR',
    source: record.source,
  };
}

/**
 * Fusionne les opérations de plusieurs exports en supprimant les doublons
 * (deux exports qui se chevauchent contiennent les mêmes lignes).
 * Une même ligne peut légitimement apparaître plusieurs fois dans un fichier
 * (deux achats identiques le même jour) : on garde le nombre maximal
 * d'occurrences observé dans un seul fichier.
 */
export function mergeOperations(operationLists) {
  const best = new Map();
  for (const list of operationLists) {
    const counts = new Map();
    for (const op of list) {
      const id = [op.date, op.type, op.key, op.quantity.toFixed(6), op.amount.toFixed(2)].join('|');
      const entry = counts.get(id) ?? { op, n: 0 };
      entry.n += 1;
      counts.set(id, entry);
    }
    for (const [id, entry] of counts) {
      const prev = best.get(id);
      if (!prev || entry.n > prev.n) best.set(id, entry);
    }
  }
  const merged = [];
  for (const { op, n } of best.values()) {
    for (let i = 0; i < n; i += 1) merged.push(op);
  }
  return merged.sort(compareOps);
}

// Même jour : achats avant ventes pour ne jamais passer en quantité négative.
const TYPE_ORDER = { achat: 0, versement: 1, dividende: 2, vente: 3, frais: 4, taxe: 5, retrait: 6, autre: 7 };
function compareOps(a, b) {
  return a.date.localeCompare(b.date) || TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
}
