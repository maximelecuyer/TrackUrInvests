import { describe, expect, it } from 'vitest';
import { OpType } from '../src/lib/operations.js';
import { buildTimeline, dayRange, portfolioCashflows, xirr } from '../src/lib/performance.js';
import { convertSeries } from '../src/lib/market.js';

const buy = (date, key, quantity, amount) => ({ date, type: OpType.BUY, key, label: key, quantity, amount, fees: 0 });
const sell = (date, key, quantity, amount) => ({ date, type: OpType.SELL, key, label: key, quantity, amount, fees: 0 });

describe('dayRange', () => {
  it('inclut les bornes et traverse les mois', () => {
    expect(dayRange('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });
});

describe('xirr', () => {
  it('retrouve 10 % sur un an', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 1100 }])).toBeCloseTo(0.1, 3);
  });
  it('gère une perte', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 800 }])).toBeLessThan(0);
  });
  it('renvoie null sans flux positif', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }])).toBeNull();
  });
});

describe('buildTimeline', () => {
  const ops = [buy('2024-01-02', 'A', 10, 1000), sell('2024-01-04', 'A', 5, 600)];
  const prices = new Map([['A', [
    { date: '2024-01-02', close: 100 },
    { date: '2024-01-03', close: 110 },
    { date: '2024-01-04', close: 120 },
  ]]]);
  const bench = [
    { date: '2024-01-02', close: 50 },
    { date: '2024-01-03', close: 50 },
    { date: '2024-01-04', close: 60 },
  ];
  const { points } = buildTimeline(ops, prices, bench, '2024-01-05');

  it('valorise au dernier cours connu, week-ends compris', () => {
    expect(points.map((p) => p.value)).toEqual([1000, 1100, 600, 600]);
    expect(points.map((p) => p.invested)).toEqual([1000, 1000, 400, 400]);
  });

  it('simule les mêmes versements dans l\'indice', () => {
    // 1000 € achètent 20 parts à 50 ; la vente de 600 € à 60 en retire 10 : il reste 10 parts à 60.
    expect(points.map((p) => p.benchmark)).toEqual([1000, 1000, 600, 600]);
  });

  it('estime au prix de revient un titre sans cours', () => {
    const res = buildTimeline([buy('2024-01-02', 'B', 1, 500)], new Map(), bench, '2024-01-02');
    expect(res.points[0].value).toBe(500);
    expect(res.estimatedKeys).toEqual(['B']);
  });

  it('intègre dividendes et frais dans les flux', () => {
    const flows = portfolioCashflows([
      buy('2024-01-02', 'A', 1, 100),
      { date: '2024-06-01', type: OpType.DIVIDEND, amount: 5 },
      { date: '2024-12-31', type: OpType.FEE, amount: 2 },
    ]);
    expect(flows.map((f) => f.amount)).toEqual([-100, 5, -2]);
  });
});

describe('convertSeries', () => {
  it('applique le dernier taux connu', () => {
    const out = convertSeries(
      [{ date: '2024-01-02', close: 10 }, { date: '2024-01-03', close: 20 }],
      [{ date: '2024-01-01', close: 0.9 }, { date: '2024-01-03', close: 0.8 }],
    );
    expect(out.map((p) => p.close)).toEqual([9, 16]);
  });
});
