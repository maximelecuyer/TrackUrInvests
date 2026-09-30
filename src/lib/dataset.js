import { normalizeKey, parseExport } from './parse.js';
import { mergeOperations, normalizeOperation } from './operations.js';

/**
 * Transforme les fichiers d'un dossier en jeu de données :
 * opérations fusionnées et dédoublonnées, et dernier état du portefeuille connu.
 */
export function buildDataset(files) {
  const report = [];
  const operationLists = [];
  const snapshots = [];

  for (const file of files) {
    try {
      const parsed = parseExport(file.data, file.name);
      report.push({ name: file.name, kind: parsed.kind, count: parsed.records.length, headers: parsed.headers });
      if (parsed.kind === 'operations') operationLists.push(parsed.records);
      if (parsed.kind === 'positions') snapshots.push({ ...parsed, lastModified: file.lastModified });
    } catch (err) {
      report.push({ name: file.name, kind: 'error', count: 0, error: err.message });
    }
  }

  // Le plus récent export de portefeuille sert de référence (cours, ISIN).
  snapshots.sort((a, b) => b.lastModified - a.lastModified);
  const snapshot = snapshots[0]?.records ?? [];
  const isinByLabel = new Map();
  for (const snap of snapshots) {
    for (const r of snap.records) {
      if (r.isin && !isinByLabel.has(normalizeKey(r.label))) isinByLabel.set(normalizeKey(r.label), r.isin);
    }
  }

  const normalized = operationLists.map((records) => records.map((r) => normalizeOperation({
    ...r,
    isin: r.isin || isinByLabel.get(normalizeKey(r.label)) || '',
  })));
  const operations = mergeOperations(normalized);

  return { operations, snapshot, report };
}
