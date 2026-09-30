import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDataset } from '../src/lib/dataset.js';
import { classifyOperation, OpType } from '../src/lib/operations.js';
import { computePositions, monthlyIncome, valuePositions } from '../src/lib/portfolio.js';

const file = (name) => ({ name, lastModified: 1, data: readFileSync(new URL(`../public/exemples/${name}`, import.meta.url)) });
const load = () => buildDataset([file('HistoriqueOperationsBourse_exemple.csv'), file('Portefeuille_exemple.csv')]);

describe('classifyOperation', () => {
  it.each([
    ['Achat Comptant', OpType.BUY],
    ['Vente Comptant', OpType.SELL],
    ['Encaissement dividende', OpType.DIVIDEND],
    ['Coupons', OpType.DIVIDEND],
    ['Taxe TTF', OpType.TAX],
    ['Droits de garde', OpType.FEE],
    ['Virement reçu', OpType.DEPOSIT],
    ['Opération sur titres', OpType.OTHER],
  ])('%s -> %s', (label, type) => expect(classifyOperation(label)).toBe(type));
});

describe('buildDataset', () => {
  it('complète les ISIN depuis l\'état du portefeuille', () => {
    const { operations, snapshot } = load();
    expect(snapshot).toHaveLength(4);
    expect(operations.find((o) => o.label === 'TOTALENERGIES').key).toBe('FR0000120271');
  });

  it('dédoublonne deux exports qui se chevauchent', () => {
    const a = file('HistoriqueOperationsBourse_exemple.csv');
    const b = { ...a, name: 'copie.csv' };
    expect(buildDataset([a, b]).operations).toHaveLength(buildDataset([a]).operations.length);
  });

  it('garde deux achats identiques du même jour dans un même fichier', () => {
    const csv = 'Libellé;Opération;Date;Qté;Montant net\nLVMH;Achat;01/03/2024;1;-700\nLVMH;Achat;01/03/2024;1;-700\n';
    const f = { name: 'x.csv', lastModified: 1, data: new TextEncoder().encode(csv).buffer };
    expect(buildDataset([f, { ...f, name: 'y.csv' }]).operations).toHaveLength(2);
  });
});

describe('computePositions', () => {
  const { operations } = load();
  const { positions, totals, warnings } = computePositions(operations);
  const byLabel = Object.fromEntries(positions.map((p) => [p.label, p]));

  it('calcule le PRU frais inclus', () => {
    expect(byLabel['ISHARES CORE MSCI WORLD'].quantity).toBe(35);
    expect(byLabel['ISHARES CORE MSCI WORLD'].pru).toBeCloseTo((1531.95 + 1233.45) / 35, 6);
  });

  it('sort les titres vendus au PRU et calcule la plus-value réalisée', () => {
    const al = byLabel['AIR LIQUIDE'];
    expect(al.quantity).toBe(6);
    expect(al.pru).toBeCloseTo(150.195, 6);
    expect(al.realized).toBeCloseTo(658.05 - 4 * 150.195, 6);
  });

  it('totalise dividendes, frais et taxes', () => {
    expect(totals.dividends).toBeCloseTo(45.6, 6);
    expect(totals.fees).toBeCloseTo(12, 6);
    expect(totals.taxes).toBeCloseTo(5.24, 6);
    expect(totals.brokerage).toBeCloseTo(1.95 * 6, 6);
    expect(warnings).toEqual([]);
  });

  it('valorise les lignes avec les cours fournis', () => {
    const valued = valuePositions(positions, new Map([['FR0000121014', 640]]));
    const lvmh = valued.find((p) => p.label === 'LVMH');
    expect(lvmh.marketValue).toBe(1280);
    expect(lvmh.unrealized).toBeCloseTo(1280 - 1561.95, 6);
  });

  it('signale une vente sans achat correspondant', () => {
    const res = computePositions([{ date: '2024-01-01', type: OpType.SELL, key: 'X', label: 'X', quantity: 5, amount: 100, fees: 0 }]);
    expect(res.warnings).toHaveLength(1);
  });

  it('agrège dividendes et frais par mois', () => {
    const months = monthlyIncome(operations);
    expect(months.find((m) => m.month === '2023-07').dividends).toBeCloseTo(22.2, 6);
    expect(months.find((m) => m.month === '2023-12').fees).toBeCloseTo(12, 6);
  });
});
