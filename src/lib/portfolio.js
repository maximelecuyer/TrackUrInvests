import { OpType } from './operations.js';

/**
 * Calcule les lignes du portefeuille à partir des opérations triées par date.
 * PRU = coût total d'acquisition (frais inclus) / quantité détenue, méthode
 * du prix moyen pondéré utilisée par les courtiers français. Une vente sort
 * les titres au PRU et dégage une plus-value réalisée.
 */
export function computePositions(operations) {
  const positions = new Map();
  const totals = { invested: 0, withdrawn: 0, dividends: 0, fees: 0, taxes: 0, realized: 0, brokerage: 0 };
  const warnings = [];

  const getPos = (op) => {
    if (!positions.has(op.key)) {
      positions.set(op.key, {
        key: op.key, label: op.label, isin: op.isin, currency: op.currency,
        quantity: 0, costBasis: 0, realized: 0, dividends: 0, fees: 0,
        firstDate: op.date, lastDate: op.date,
      });
    }
    const pos = positions.get(op.key);
    if (!pos.isin && op.isin) pos.isin = op.isin;
    pos.lastDate = op.date;
    return pos;
  };

  for (const op of operations) {
    switch (op.type) {
      case OpType.BUY: {
        const pos = getPos(op);
        pos.quantity += op.quantity;
        pos.costBasis += op.amount;
        pos.fees += op.fees;
        totals.invested += op.amount;
        totals.brokerage += op.fees;
        break;
      }
      case OpType.SELL: {
        const pos = getPos(op);
        let qty = op.quantity;
        if (qty > pos.quantity + 1e-9) {
          warnings.push(`Vente de ${qty} ${op.label} le ${op.date} alors que seulement ${round(pos.quantity)} sont détenus (historique incomplet ?).`);
          qty = pos.quantity;
        }
        const pru = pos.quantity > 0 ? pos.costBasis / pos.quantity : 0;
        const costOut = pru * qty;
        const gain = op.amount - costOut;
        pos.quantity -= qty;
        pos.costBasis -= costOut;
        if (pos.quantity < 1e-9) { pos.quantity = 0; pos.costBasis = 0; }
        pos.realized += gain;
        pos.fees += op.fees;
        totals.realized += gain;
        totals.withdrawn += op.amount;
        totals.brokerage += op.fees;
        break;
      }
      case OpType.DIVIDEND: {
        const pos = getPos(op);
        pos.dividends += op.amount;
        totals.dividends += op.amount;
        break;
      }
      case OpType.FEE:
        totals.fees += op.amount;
        break;
      case OpType.TAX:
        totals.taxes += op.amount;
        break;
      default:
        break;
    }
  }

  const list = [...positions.values()].map((p) => ({
    ...p,
    pru: p.quantity > 0 ? p.costBasis / p.quantity : null,
  }));
  return { positions: list, totals, warnings };
}

/** Ajoute cours et valorisation aux lignes ouvertes. prices : Map clé -> cours en EUR. */
export function valuePositions(positions, prices) {
  return positions.map((p) => {
    const price = prices.get(p.key) ?? null;
    const marketValue = p.quantity > 0 && price !== null ? p.quantity * price : null;
    const unrealized = marketValue !== null ? marketValue - p.costBasis : null;
    return {
      ...p,
      price,
      marketValue,
      unrealized,
      unrealizedPct: unrealized !== null && p.costBasis > 0 ? unrealized / p.costBasis : null,
    };
  });
}

/** Dividendes et frais agrégés par mois ("aaaa-mm"). */
export function monthlyIncome(operations) {
  const months = new Map();
  for (const op of operations) {
    const m = op.date.slice(0, 7);
    if (!months.has(m)) months.set(m, { month: m, dividends: 0, fees: 0 });
    const row = months.get(m);
    if (op.type === OpType.DIVIDEND) row.dividends += op.amount;
    else if (op.type === OpType.FEE || op.type === OpType.TAX) row.fees += op.amount;
    else if (op.type === OpType.BUY || op.type === OpType.SELL) row.fees += op.fees;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function round(n) {
  return Math.round(n * 1e4) / 1e4;
}
