import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { applySnapshotCost, buildDataset } from '../src/lib/dataset.js';
import { pickQuote } from '../src/lib/market.js';
import { OpType } from '../src/lib/operations.js';
import { parseExport, splitLabel } from '../src/lib/parse.js';
import { computePositions } from '../src/lib/portfolio.js';

const HEADER = ['Libellé', 'Cours', '', 'Dev', 'Var/Veille', 'Qté', 'PRU', 'Valorisation', '+/- values', '+/- values (%)', 'Poids', 'ISIN'];

/** Reproduit la mise en page de l'export "portefeuille" Fortuneo (.xls). */
function portfolioXls(date, lines, account = 'PEA M NOM Prenom') {
  const rows = [
    ['Portefeuille 12345678'], [`(${account})`], [date], [],
    HEADER,
    ...lines.map(([label, cours, qte, pru, isin]) => [label, cours, null, 'EUR', 0.0069, qte, pru, cours * qte, null, null, null, isin]),
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet0');
  return XLSX.write(wb, { type: 'array', bookType: 'biff8' });
}

const file = (name, data, lastModified = 1) => ({ name, data, lastModified });

describe('export portefeuille Fortuneo', () => {
  const data = portfolioXls('30/09/2026', [
    ['AIR LIQUIDE (AI)', 170.04, 1, 164.2795, 'FR0000120073'],
    ['AIR LIQUIDE PF27   (-)', 170.04, 1, 166.0827, 'FR001400T5U9'],
    ['Amundi MSCI World Swap - UCITS ETF - EUR (D) DIS (EWLD)', 41.515, 1, 30.4046, 'LU2655993207'],
  ]);

  it('lit la date, le compte et les lignes', () => {
    const res = parseExport(data, 'Export_portefeuille.xls');
    expect(res.kind).toBe('positions');
    expect(res.meta).toEqual({ date: '2026-09-30', account: 'PEA M NOM Prenom' });
    expect(res.records[0]).toMatchObject({
      label: 'AIR LIQUIDE', ticker: 'AI', isin: 'FR0000120073', quantity: 1, pru: 164.2795, lastPrice: 170.04, dayChange: 0.0069,
    });
    expect(res.records[2]).toMatchObject({ label: 'Amundi MSCI World Swap - UCITS ETF - EUR (D) DIS', ticker: 'EWLD' });
  });

  it('rattache les primes de fidélité à l\'action d\'origine', () => {
    const ds = buildDataset([file('a.xls', data)]);
    expect(ds.mode).toBe('snapshots');
    expect(ds.aliases.get('FR001400T5U9')).toBe('FR0000120073');
  });

  it('démarre l\'historique à la valeur de marché du premier export', () => {
    const ds = buildDataset([file('a.xls', data)]);
    expect(ds.operations).toHaveLength(3);
    expect(ds.operations[0]).toMatchObject({ type: OpType.BUY, date: '2026-09-30', quantity: 1, amount: 170.04, ticker: 'AI' });
  });

  it('reprend le PRU de Fortuneo pour les plus-values latentes', () => {
    const ds = buildDataset([file('a.xls', data)]);
    const [al] = applySnapshotCost(computePositions(ds.operations).positions, ds.snapshot);
    expect(al.pru).toBe(164.2795);
    expect(al.costBasis).toBe(164.2795);
  });
});

describe('historique reconstitué à partir de plusieurs exports', () => {
  const jan = portfolioXls('31/01/2026', [
    ['TOTALENERGIES (TTE)', 60, 10, 55, 'FR0000120271'],
    ['SANOFI (SAN)', 90, 5, 92, 'FR0000120578'],
  ]);
  const mar = portfolioXls('31/03/2026', [
    ['TOTALENERGIES (TTE)', 62, 15, 56.5, 'FR0000120271'], // +5 titres
    ['SANOFI (SAN)', 88, 2, 92, 'FR0000120578'], // -3 titres
    ['AXA (CS)', 40, 4, 35, 'FR0000120628'], // nouvelle ligne
  ]);
  const ds = buildDataset([file('mars.xls', mar, 2), file('janvier.xls', jan, 1), file('copie janvier.xls', jan, 3)]);

  it('ignore les copies et trie par date', () => {
    expect(ds.snapshotDates).toEqual(['2026-01-31', '2026-03-31']);
    expect(ds.snapshot).toHaveLength(3);
  });

  it('déduit achats et ventes des écarts', () => {
    const march = ds.operations.filter((o) => o.date === '2026-03-31');
    const tte = march.find((o) => o.key === 'FR0000120271');
    expect(tte).toMatchObject({ type: OpType.BUY, quantity: 5 });
    // Hausse du prix de revient total : ce qui a réellement été investi.
    expect(tte.amount).toBeCloseTo(15 * 56.5 - 10 * 55, 6);
    expect(ds.operations.find((o) => o.date === '2026-01-31' && o.key === 'FR0000120271').amount).toBe(600);
    expect(march.find((o) => o.key === 'FR0000120578')).toMatchObject({ type: OpType.SELL, quantity: 3, amount: 3 * 88 });
    expect(march.find((o) => o.key === 'FR0000120628')).toMatchObject({ type: OpType.BUY, quantity: 4, amount: 140 });
  });

  it('retrouve les quantités et PRU du dernier export', () => {
    const { positions } = computePositions(ds.operations);
    const byKey = Object.fromEntries(applySnapshotCost(positions, ds.snapshot).map((p) => [p.key, p]));
    expect(byKey.FR0000120271.quantity).toBe(15);
    expect(byKey.FR0000120271.pru).toBeCloseTo(56.5, 6);
    expect(byKey.FR0000120578.quantity).toBe(2);
    expect(byKey.FR0000120578.pru).toBeCloseTo(92, 6);
  });

  it('suit chaque compte séparément', () => {
    const cto = portfolioXls('31/03/2026', [['AXA (CS)', 40, 1, 30, 'FR0000120628']], 'CTO M NOM Prenom');
    const both = buildDataset([file('jan.xls', jan), file('mar.xls', mar), file('cto.xls', cto)]);
    expect(both.accounts).toHaveLength(2);
    const { positions } = computePositions(both.operations);
    // Sans séparation par compte, la ligne CTO ferait croire à la vente des lignes du PEA.
    expect(positions.find((p) => p.key === 'FR0000120271').quantity).toBe(15);
    expect(positions.find((p) => p.key === 'FR0000120628').quantity).toBe(5);
  });
});

describe('splitLabel', () => {
  it.each([
    ['AIR LIQUIDE (AI)', { label: 'AIR LIQUIDE', ticker: 'AI', baseLabel: '' }],
    ['AIR LIQUIDE PF28   (-)', { label: 'AIR LIQUIDE PF28', ticker: '', baseLabel: 'AIR LIQUIDE' }],
    ['LVMH', { label: 'LVMH', ticker: '', baseLabel: '' }],
  ])('%s', (raw, expected) => expect(splitLabel(raw)).toEqual(expected));
});

describe('pickQuote', () => {
  it('préfère le symbole qui correspond au code mnémonique', () => {
    const quotes = [
      { symbol: 'AIL.DE', exchange: 'GER' },
      { symbol: 'AI.PA', exchange: 'PAR' },
      { symbol: 'AIQUY', exchange: 'PNK' },
    ];
    expect(pickQuote(quotes, 'AI').symbol).toBe('AI.PA');
    expect(pickQuote([{ symbol: 'X.DE', exchange: 'GER' }, { symbol: 'X.PA', exchange: 'PAR' }], '').symbol).toBe('X.PA');
  });
});

describe('exemple du dépôt', () => {
  it('lit l\'état du portefeuille d\'exemple au format Fortuneo', () => {
    const res = parseExport(readFileSync(new URL('../public/exemples/Portefeuille_exemple.csv', import.meta.url)), 'p.csv');
    expect(res.meta.date).toBe('2026-09-30');
    expect(res.records.map((r) => r.ticker)).toEqual(['IWDA', 'TTE', 'AI', 'MC']);
  });
});
