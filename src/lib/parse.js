import * as XLSX from '@e965/xlsx';

/** Supprime accents, ponctuation et casse pour comparer des en-têtes. */
export function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

/** Nombre au format français ("1 234,56 €", "-12,5", "12.5%") ou nombre natif. */
export function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let s = String(value).replace(/[\s  €$%]/g, '').replace(/[A-Za-z]+$/, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // Le dernier séparateur est le séparateur décimal.
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Date "jj/mm/aaaa", "aaaa-mm-jj", nombre de série Excel ou objet Date. Renvoie "aaaa-mm-jj". */
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toIsoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? toIsoDate(d.y, d.m, d.d) : null;
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toIsoDate(year, Number(m[2]), Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

function toIsoDate(y, m, d) {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Synonymes des colonnes rencontrées dans les exports Fortuneo (et variantes).
const COLUMN_SYNONYMS = {
  label: ['libelle', 'libelle valeur', 'valeur', 'titre', 'nom', 'instrument', 'produit'],
  isin: ['isin', 'code isin'],
  operation: ['operation', 'type operation', 'nature', 'type', 'sens', 'nature operation'],
  date: ['date', 'date operation', 'date d execution', 'date execution', 'date valeur', 'date de valeur', 'date d operation'],
  quantity: ['qte', 'quantite', 'qty', 'nombre', 'nb titres'],
  price: ['prix d exe', 'prix d execution', 'prix execution', 'cours d execution', 'prix unitaire', 'prix', 'cours execution'],
  gross: ['montant brut', 'brut'],
  fees: ['courtage', 'courtage commission', 'frais', 'commission', 'frais de courtage'],
  net: ['montant net', 'net', 'montant', 'montant operation'],
  currency: ['devise', 'monnaie', 'currency'],
  place: ['place', 'marche', 'bourse'],
  pru: ['pru', 'prix de revient', 'prix de revient unitaire', 'pam'],
  lastPrice: ['cours', 'dernier cours', 'cours actuel'],
  marketValue: ['valorisation', 'valorisation eur', 'montant valorise', 'valeur de marche'],
};

function matchColumn(header, field) {
  const key = normalizeKey(header);
  return COLUMN_SYNONYMS[field].some((syn) => key === syn || key.startsWith(`${syn} `));
}

/** Associe chaque champ connu à l'index de colonne correspondant. */
export function mapColumns(headers) {
  const mapping = {};
  const used = new Set();
  // Ordre important : les champs précis avant les champs génériques.
  const order = ['isin', 'date', 'operation', 'quantity', 'pru', 'price', 'gross', 'fees', 'net', 'currency', 'place', 'marketValue', 'lastPrice', 'label'];
  for (const field of order) {
    const idx = headers.findIndex((h, i) => !used.has(i) && matchColumn(h, field));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

/** Cherche la ligne d'en-tête dans les premières lignes de la feuille (les exports ont parfois un titre). */
function findHeaderRow(rows) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 25).forEach((row, index) => {
    const mapping = mapColumns(row.map((c) => String(c ?? '')));
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { index, score };
  });
  return best.score >= 3 ? best.index : -1;
}

/**
 * Détecte le type de tableau :
 *  - "operations" : historique (date + opération + montant)
 *  - "positions"  : état du portefeuille (quantité + PRU ou valorisation, sans date d'opération)
 */
function detectKind(mapping) {
  if (mapping.date !== undefined && mapping.operation !== undefined
    && (mapping.net !== undefined || mapping.gross !== undefined)) return 'operations';
  if (mapping.quantity !== undefined && (mapping.pru !== undefined || mapping.marketValue !== undefined)) return 'positions';
  return 'unknown';
}

/** Lit un classeur (xls, xlsx, csv, html déguisé en xls) et renvoie un tableau de lignes brutes. */
export function readSheetRows(data, fileName = '') {
  const isText = typeof data === 'string';
  const opts = { type: isText ? 'string' : 'array', cellDates: true, raw: false };
  if (/\.csv$/i.test(fileName) || isText) {
    const text = isText ? data : new TextDecoder(detectEncoding(data)).decode(data);
    opts.type = 'string';
    opts.FS = detectDelimiter(text);
    const wb = XLSX.read(text, { ...opts, raw: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
  }
  const wb = XLSX.read(data, opts);
  // On prend la première feuille qui contient un en-tête reconnaissable.
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    if (findHeaderRow(rows) >= 0) return rows;
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
}

function detectEncoding(buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return 'utf-8';
  } catch {
    return 'windows-1252';
  }
}

function detectDelimiter(text) {
  const firstLines = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = [';', '\t', ','].map((d) => [d, firstLines.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

/** Transforme les lignes brutes en objets typés. */
export function parseRows(rows, fileName = '') {
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) {
    return { kind: 'unknown', fileName, records: [], headers: rows[0] ?? [] };
  }
  const headers = rows[headerIndex].map((h) => String(h ?? '').trim());
  const mapping = mapColumns(headers);
  const kind = detectKind(mapping);
  const get = (row, field) => (mapping[field] === undefined ? null : row[mapping[field]]);

  const records = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (!row || row.every((c) => c === null || String(c).trim() === '')) continue;
    const label = cleanText(get(row, 'label'));
    if (kind === 'operations') {
      const date = parseDate(get(row, 'date'));
      if (!date) continue;
      records.push({
        date,
        label,
        isin: cleanIsin(get(row, 'isin')),
        operation: cleanText(get(row, 'operation')),
        quantity: parseNumber(get(row, 'quantity')),
        price: parseNumber(get(row, 'price')),
        gross: parseNumber(get(row, 'gross')),
        fees: parseNumber(get(row, 'fees')),
        net: parseNumber(get(row, 'net')),
        currency: cleanText(get(row, 'currency')) || 'EUR',
        place: cleanText(get(row, 'place')),
        source: fileName,
      });
    } else if (kind === 'positions') {
      const quantity = parseNumber(get(row, 'quantity'));
      if (!label || quantity === null) continue;
      records.push({
        label,
        isin: cleanIsin(get(row, 'isin')),
        quantity,
        pru: parseNumber(get(row, 'pru')),
        lastPrice: parseNumber(get(row, 'lastPrice')),
        marketValue: parseNumber(get(row, 'marketValue')),
        currency: cleanText(get(row, 'currency')) || 'EUR',
        source: fileName,
      });
    }
  }
  return { kind, fileName, records, headers };
}

function cleanText(v) {
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim();
}

function cleanIsin(v) {
  const s = cleanText(v).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(s) ? s : '';
}

/** Point d'entrée : contenu d'un fichier vers { kind, records }. */
export function parseExport(data, fileName = '') {
  return parseRows(readSheetRows(data, fileName), fileName);
}
