import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from '@e965/xlsx';
import { mapColumns, parseDate, parseExport, parseNumber } from '../src/lib/parse.js';

const example = (name) => readFileSync(new URL(`../public/exemples/${name}`, import.meta.url));

describe('parseNumber', () => {
  it.each([
    ['1 234,56', 1234.56],
    ['-1 531,95', -1531.95],
    ['12,5 €', 12.5],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['3,2%', 3.2],
    [42, 42],
    ['', null],
    ['abc', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe('parseDate', () => {
  it('lit les formats courants', () => {
    expect(parseDate('15/01/2023')).toBe('2023-01-15');
    expect(parseDate('5/2/24')).toBe('2024-02-05');
    expect(parseDate('2023-06-15')).toBe('2023-06-15');
    expect(parseDate(new Date(2023, 5, 15))).toBe('2023-06-15');
    expect(parseDate(45000)).toBe('2023-03-15'); // numéro de série Excel
    expect(parseDate('n/a')).toBeNull();
  });
});

describe('mapColumns', () => {
  it('ne confond pas PRU et prix d\'exécution', () => {
    const m = mapColumns(['Libellé', 'Quantité', 'Prix de revient unitaire', 'Cours', 'Valorisation']);
    expect(m).toMatchObject({ label: 0, quantity: 1, pru: 2, lastPrice: 3, marketValue: 4 });
  });
});

describe('parseExport', () => {
  it('reconnaît un historique d\'opérations CSV', () => {
    const res = parseExport(example('HistoriqueOperationsBourse_exemple.csv'), 'ops.csv');
    expect(res.kind).toBe('operations');
    expect(res.records).toHaveLength(10);
    expect(res.records[0]).toMatchObject({
      date: '2023-01-15', label: 'ISHARES CORE MSCI WORLD', operation: 'Achat Comptant',
      quantity: 20, price: 76.5, gross: 1530, fees: 1.95, net: -1531.95,
    });
  });

  it('reconnaît un état du portefeuille', () => {
    const res = parseExport(example('Portefeuille_exemple.csv'), 'pf.csv');
    expect(res.kind).toBe('positions');
    expect(res.records[1]).toMatchObject({ label: 'TOTALENERGIES', isin: 'FR0000120271', quantity: 30, pru: 58.27, lastPrice: 61.1 });
  });

  it('lit un fichier Excel avec une ligne de titre avant l\'en-tête', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Historique des opérations - Compte titres'],
      [],
      ['Libellé', 'Opération', 'Date', 'Qté', 'Montant net'],
      ['LVMH', 'Achat Comptant', new Date(2024, 1, 5), 2, -1561.95],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Opérations');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const res = parseExport(buf, 'export.xlsx');
    expect(res.kind).toBe('operations');
    expect(res.records[0]).toMatchObject({ date: '2024-02-05', quantity: 2, net: -1561.95 });
  });

  it('décode un CSV en Windows-1252', () => {
    const text = 'Libellé;Opération;Date;Qté;Montant net\nSOCIÉTÉ GÉNÉRALE;Achat Comptant;01/03/2024;10;-250,00\n';
    const bytes = Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
    const res = parseExport(bytes.buffer, 'ops.csv');
    expect(res.records[0].label).toBe('SOCIÉTÉ GÉNÉRALE');
  });

  it('signale un fichier non reconnu', () => {
    expect(parseExport(new TextEncoder().encode('a;b\n1;2\n').buffer, 'x.csv').kind).toBe('unknown');
  });
});
