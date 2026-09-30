import { applySnapshotCost, buildDataset, findSnapshotLine } from './lib/dataset.js';
import {
  canRememberFolder, forgetFolder, getRememberedFolder, pickFolder, readFileList, readFolder, requestAccess,
} from './lib/folder.js';
import {
  BENCHMARKS, clearHistoryCache, getHistory, getSymbolOverrides, isMarketAvailable, resolveSymbol, setSymbolOverride, toEur,
} from './lib/market.js';
import { OpType } from './lib/operations.js';
import { normalizeKey, splitLabel } from './lib/parse.js';
import { benchmarkCashflows, buildTimeline, portfolioCashflows, xirr } from './lib/performance.js';
import { computePositions, monthlyIncome, valuePositions } from './lib/portfolio.js';
import { drawAllocation, drawGains, drawIncome, drawTimeline } from './ui/charts.js';
import {
  escapeHtml, fmtDate, fmtEur, fmtEur0, fmtNum, fmtPct, fmtSignedEur, signClass,
} from './ui/format.js';

const $ = (id) => document.getElementById(id);
const RESOLVED_KEY = 'tui:resolved';
const BENCHMARK_KEY = 'tui:benchmark';

const state = {
  sourceLabel: '',
  dataset: null,
  marketAvailable: null,
  series: new Map(), // clé titre -> cours en EUR
  symbols: new Map(), // clé titre -> symbole Yahoo utilisé
  symbolErrors: new Map(),
  benchmark: readSetting(BENCHMARK_KEY, BENCHMARKS[0].symbol),
  benchSeries: [],
  benchError: '',
  rangeYears: 0,
  loadingMarket: false,
};

const today = () => new Date().toISOString().slice(0, 10);

function readSetting(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : le réglage ne sera pas mémorisé.
  }
}

function readResolved() {
  try {
    return JSON.parse(localStorage.getItem(RESOLVED_KEY) ?? '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Chargement des fichiers
// ---------------------------------------------------------------------------

async function loadFromHandle(handle) {
  $('folder-status').textContent = `Lecture de « ${handle.name} »…`;
  const files = await readFolder(handle);
  await loadFiles(files, `Dossier « ${handle.name} »`);
}

async function loadFiles(files, sourceLabel) {
  state.sourceLabel = sourceLabel;
  state.dataset = buildDataset(files);
  const nOps = state.dataset.operations.length;
  $('folder-status').textContent = `${sourceLabel} : ${files.length} fichier(s), ${nOps} opération(s)`;
  $('empty-state').hidden = true;
  $('dashboard').hidden = false;
  render();
  await loadMarket();
}

// ---------------------------------------------------------------------------
// Cours de bourse
// ---------------------------------------------------------------------------

function heldKeys() {
  const seen = new Map();
  for (const op of state.dataset.operations) {
    if (op.type === OpType.BUY && !seen.has(op.key)) seen.set(op.key, op);
  }
  return [...seen.values()];
}

async function loadSecurity(op, from) {
  const overrides = getSymbolOverrides();
  const resolved = readResolved();
  let symbol = overrides[op.key] ?? resolved[op.key];
  try {
    if (!symbol) {
      symbol = await resolveSymbol({ isin: op.isin, label: op.label, ticker: op.ticker });
      if (!symbol) throw new Error('Symbole introuvable, saisissez-le dans le tableau');
      resolved[op.key] = symbol;
      writeSetting(RESOLVED_KEY, JSON.stringify({ ...readResolved(), [op.key]: symbol }));
    }
    state.symbols.set(op.key, symbol);
    const history = await getHistory(symbol, from);
    state.series.set(op.key, await toEur(history, from));
    state.symbolErrors.delete(op.key);
  } catch (err) {
    if (symbol) state.symbols.set(op.key, symbol);
    state.series.delete(op.key);
    state.symbolErrors.set(op.key, err.message);
  }
}

/** Ligne de prime de fidélité : même cours que l'action d'origine. */
async function loadAlias(op, from) {
  const target = state.dataset.aliases.get(op.key);
  if (state.series.has(target) && !getSymbolOverrides()[op.key]) {
    state.series.set(op.key, state.series.get(target));
    state.symbols.set(op.key, state.symbols.get(target));
    state.symbolErrors.delete(op.key);
  } else {
    await loadSecurity({ ...op, isin: '', label: splitLabel(op.label).baseLabel || op.label }, from);
  }
}

async function loadBenchmark(from) {
  try {
    const history = await getHistory(state.benchmark, from, { adjusted: true });
    state.benchSeries = await toEur(history, from);
    state.benchError = '';
  } catch (err) {
    state.benchSeries = [];
    state.benchError = err.message;
  }
}

async function loadMarket() {
  const ops = state.dataset.operations;
  if (!ops.length) return;
  state.marketAvailable ??= await isMarketAvailable();
  if (!state.marketAvailable) {
    render();
    return;
  }
  state.loadingMarket = true;
  render();
  const from = ops[0].date;
  const { aliases } = state.dataset;
  const held = heldKeys();
  const queue = held.filter((op) => !aliases.has(op.key));
  const worker = async () => {
    while (queue.length) await loadSecurity(queue.shift(), from);
  };
  await Promise.all([loadBenchmark(from), worker(), worker(), worker(), worker()]);
  for (const op of held.filter((o) => aliases.has(o.key))) await loadAlias(op, from);
  state.loadingMarket = false;
  render();
}

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

function snapshotLine(p) {
  return findSnapshotLine(state.dataset.snapshot, p);
}

/** Cours actuel et variation du jour : Yahoo Finance, sinon dernier export du portefeuille. */
function currentQuotes(positions) {
  const prices = new Map();
  const changes = new Map();
  for (const p of positions) {
    const series = state.series.get(p.key);
    if (series?.length) {
      prices.set(p.key, series[series.length - 1].close);
      if (series.length > 1) changes.set(p.key, series[series.length - 1].close / series[series.length - 2].close - 1);
      continue;
    }
    const snap = snapshotLine(p);
    const price = snap?.lastPrice ?? (snap?.marketValue && snap.quantity ? snap.marketValue / snap.quantity : null);
    if (price) prices.set(p.key, price);
    if (snap?.dayChange !== null && snap?.dayChange !== undefined) changes.set(p.key, snap.dayChange);
  }
  for (const [key, target] of state.dataset.aliases) {
    if (!prices.has(key) && prices.has(target)) prices.set(key, prices.get(target));
    if (!changes.has(key) && changes.has(target)) changes.set(key, changes.get(target));
  }
  return { prices, changes };
}

function render() {
  const { operations, report, mode } = state.dataset;
  const { positions, totals, warnings } = computePositions(operations);
  const quotes = currentQuotes(positions);
  const valued = valuePositions(mode === 'snapshots' ? applySnapshotCost(positions, state.dataset.snapshot) : positions, quotes.prices).map((p) => ({ ...p, dayChange: quotes.changes.get(p.key) ?? null }));
  const open = valued.filter((p) => p.quantity > 0);
  const unpriced = open.filter((p) => p.marketValue === null);
  const marketValue = open.reduce((s, p) => s + (p.marketValue ?? p.costBasis), 0);
  const unrealized = open.reduce((s, p) => s + (p.unrealized ?? 0), 0);
  const openCost = open.filter((p) => p.unrealized !== null).reduce((s, p) => s + p.costBasis, 0);
  const totalCost = open.reduce((s, p) => s + p.costBasis, 0);

  const { points, estimatedKeys } = buildTimeline(operations, state.series, state.benchSeries, today());
  const last = points[points.length - 1];
  const benchLabel = BENCHMARKS.find((b) => b.symbol === state.benchmark)?.label ?? state.benchmark;

  // Un rendement annualisé ou une comparaison sur quelques jours n'a pas de sens.
  const historyDays = operations.length ? (Date.parse(today()) - Date.parse(operations[0].date)) / 864e5 : 0;
  const longEnough = historyDays > 60;
  const flows = portfolioCashflows(operations);
  const irr = longEnough ? xirr([...flows, { date: today(), amount: marketValue }]) : null;
  const benchIrr = longEnough && last?.benchmark ? xirr([...benchmarkCashflows(operations), { date: today(), amount: last.benchmark }]) : null;
  const totalGain = marketValue + totals.withdrawn + totals.dividends - totals.invested - totals.fees - totals.taxes;
  const benchGain = last?.benchmark && historyDays >= 30 ? last.benchmark - last.invested : null;

  renderNotices({ warnings, unpriced, estimatedKeys, positions });
  renderKpis({
    mode,
    marketValue, unrealized, openCost, totals, totalGain, irr, benchIrr, benchGain, benchLabel,
    netInvested: totals.invested - totals.withdrawn,
    totalCost,
    since: operations[0]?.date,
    historyDays,
  });

  const cutoff = state.rangeYears
    ? new Date(Date.now() - state.rangeYears * 365.25 * 864e5).toISOString().slice(0, 10)
    : '';
  const visible = points.filter((p) => p.date >= cutoff);
  $('timeline-empty').hidden = visible.length > 1;
  $('chart-timeline').hidden = visible.length <= 1;
  if (visible.length > 1) drawTimeline(visible, { benchmarkLabel: benchLabel });
  const snapshotNote = mode === 'snapshots'
    ? ` Historique reconstitué depuis ${state.dataset.snapshotDates.length} export(s) du portefeuille (premier le ${fmtDate(state.dataset.snapshotDates[0])}) : ajoutez régulièrement un export au dossier pour l'enrichir.`
    : '';
  $('timeline-caption').textContent = (state.benchSeries.length
    ? `En orange, la valeur qu'aurait aujourd'hui votre argent s'il avait été placé dans ${benchLabel} aux mêmes dates et pour les mêmes montants.${mode === 'snapshots' ? '' : ' Votre portefeuille inclut les dividendes nets de frais.'}`
    : state.marketAvailable === false
      ? 'Cours de bourse indisponibles : les titres sont valorisés à leur prix de revient.'
      : 'Chargement des cours…') + snapshotNote;

  const byGain = open.filter((p) => p.unrealized !== null).sort((a, b) => b.unrealized - a.unrealized);
  drawGains(byGain);
  drawAllocation(groupLoyaltyLines(open.filter((p) => p.marketValue !== null)).sort((a, b) => b.marketValue - a.marketValue));
  $('card-income').hidden = mode === 'snapshots';
  if (mode !== 'snapshots') drawIncome(yearlyIncome(operations));
  renderTable(valued);
  renderReport(report, operations);
}

/** Regroupe les primes de fidélité avec l'action d'origine pour la répartition. */
function groupLoyaltyLines(positions) {
  const groups = new Map();
  for (const p of positions) {
    const key = state.dataset.aliases.get(p.key) ?? p.key;
    const g = groups.get(key);
    if (g) g.marketValue += p.marketValue;
    else groups.set(key, { label: p.label, marketValue: p.marketValue });
  }
  for (const [key, g] of groups) {
    const main = positions.find((p) => p.key === key);
    if (main) g.label = main.label;
  }
  return [...groups.values()];
}

function yearlyIncome(operations) {
  const years = new Map();
  for (const m of monthlyIncome(operations)) {
    const y = m.month.slice(0, 4);
    const row = years.get(y) ?? { year: y, dividends: 0, fees: 0 };
    row.dividends += m.dividends;
    row.fees += m.fees;
    years.set(y, row);
  }
  return [...years.values()];
}

function kpi(label, value, sub = '', cls = '') {
  return `<div class="kpi"><div class="label">${label}</div><div class="value ${cls}">${value}</div><div class="sub">${sub}</div></div>`;
}

function renderKpis(k) {
  const fees = k.totals.brokerage + k.totals.fees + k.totals.taxes;
  const vsBench = k.benchGain !== null
    ? `${escapeHtml(k.benchLabel)} : ${fmtSignedEur(k.benchGain)}${k.benchIrr !== null ? `, ${fmtPct(k.benchIrr)} par an` : ''}`
    : k.historyDays < 30 ? 'Disponible après un mois d\'historique' : 'Comparaison indisponible sans cours';
  const snapshots = k.mode === 'snapshots';
  const tiles = [
    kpi('Valeur actuelle', fmtEur0(k.marketValue), snapshots ? `Prix de revient : ${fmtEur0(k.totalCost)}` : `Net investi : ${fmtEur0(k.netInvested)}`),
    kpi(
      snapshots ? 'Évolution depuis le 1er export' : 'Gain total',
      fmtSignedEur(k.totalGain),
      [snapshots && k.since ? `Depuis le ${fmtDate(k.since)}` : '', k.irr !== null ? `Rendement ${fmtPct(k.irr)} par an` : ''].filter(Boolean).join(', '),
      signClass(k.totalGain),
    ),
    kpi('Comparé au marché', k.benchGain !== null ? fmtSignedEur(k.totalGain - k.benchGain) : '–', vsBench, signClass(k.benchGain !== null ? k.totalGain - k.benchGain : 0)),
    kpi('Plus-value latente', fmtSignedEur(k.unrealized), k.openCost ? fmtPct(k.unrealized / k.openCost) : '', signClass(k.unrealized)),
  ];
  if (!snapshots) {
    tiles.push(
      kpi('Plus-value réalisée', fmtSignedEur(k.totals.realized), 'Sur les ventes', signClass(k.totals.realized)),
      kpi('Dividendes perçus', fmtEur(k.totals.dividends)),
      kpi('Frais et taxes', fmtEur(fees), `Courtage ${fmtEur0(k.totals.brokerage)}, autres ${fmtEur0(k.totals.fees + k.totals.taxes)}`),
    );
  }
  $('kpis').innerHTML = tiles.join('');
}

function renderNotices({ warnings, unpriced, estimatedKeys, positions }) {
  const items = [];
  if (state.dataset.mode === 'snapshots') {
    items.push('Seuls des états du portefeuille ont été trouvés : les plus-values réalisées, dividendes et frais ne sont pas disponibles, et l\'historique est estimé d\'après les écarts entre exports. Ajoutez l\'historique des opérations au dossier pour des calculs exacts.');
  }
  if (state.dataset.operations.length === 0) {
    items.push('Aucune opération ni état du portefeuille reconnu dans ce dossier. Vérifiez qu\'il contient bien l\'historique des opérations exporté depuis Fortuneo (détail dans « Fichiers lus » en bas de page).');
  }
  if (state.marketAvailable === false) {
    items.push('Les cours de bourse ne sont pas accessibles. Lancez l\'application avec <code>npm start</code> (et non en ouvrant le fichier HTML directement) et vérifiez votre connexion.');
  }
  if (state.loadingMarket) items.push('Récupération des cours en cours…');
  if (state.benchError) items.push(`Indice ${escapeHtml(state.benchmark)} : ${escapeHtml(state.benchError)}`);
  const names = (keys) => keys.map((k) => escapeHtml(positions.find((p) => p.key === k)?.label ?? k)).join(', ');
  if (!state.loadingMarket && state.marketAvailable && estimatedKeys.length) {
    items.push(`Pas d'historique de cours pour : ${names(estimatedKeys)}. Ces lignes sont comptées à leur prix de revient dans la courbe. Corrigez leur symbole dans le tableau des lignes.`);
  }
  if (unpriced.length && !state.loadingMarket) {
    items.push(`Cours actuel inconnu pour : ${names(unpriced.map((p) => p.key))}.`);
  }
  for (const w of warnings) items.push(escapeHtml(w));
  $('notices').innerHTML = items.length ? `<div class="notice"><ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul></div>` : '';
}

function renderTable(valued) {
  document.querySelectorAll('#positions-table .ops-only').forEach((th) => { th.hidden = state.dataset.mode === 'snapshots'; });
  const showClosed = $('show-closed').checked;
  const rows = valued
    .filter((p) => showClosed || p.quantity > 0)
    .sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1) || a.label.localeCompare(b.label));
  $('positions-table').querySelector('tbody').innerHTML = rows.map((p) => {
    const symbol = state.symbols.get(p.key) ?? '';
    const error = state.symbolErrors.get(p.key);
    return `<tr class="${p.quantity > 0 ? '' : 'closed'}">
      <td title="${escapeHtml(p.isin)}">${escapeHtml(p.label)}</td>
      <td><input class="symbol ${error ? 'missing' : ''}" data-key="${escapeHtml(p.key)}" value="${escapeHtml(symbol)}"
        placeholder="ex. AI.PA" title="${escapeHtml(error ?? 'Symbole Yahoo Finance')}" /></td>
      <td class="num">${fmtNum(p.quantity)}</td>
      <td class="num">${fmtEur(p.pru)}</td>
      <td class="num">${fmtEur(p.price)}</td>
      <td class="num ${signClass(p.dayChange)}">${fmtPct(p.dayChange)}</td>
      <td class="num">${fmtEur0(p.marketValue)}</td>
      <td class="num ${signClass(p.unrealized)}">${fmtSignedEur(p.unrealized)}<br><small>${fmtPct(p.unrealizedPct)}</small></td>
      ${state.dataset.mode === 'snapshots' ? '' : `<td class="num ${signClass(p.realized)}">${p.realized ? fmtSignedEur(p.realized) : '–'}</td>
      <td class="num">${p.dividends ? fmtEur(p.dividends) : '–'}</td>`}
    </tr>`;
  }).join('');
}

const KIND_LABELS = { operations: 'Historique des opérations', positions: 'État du portefeuille', unknown: 'Non reconnu', error: 'Erreur de lecture' };

function renderReport(report, operations) {
  const byType = operations.reduce((acc, op) => ({ ...acc, [op.type]: (acc[op.type] ?? 0) + 1 }), {});
  const others = [...new Set(operations.filter((o) => o.type === OpType.OTHER).map((o) => o.rawType))];
  $('files-report').innerHTML = `
    <table>
      <thead><tr><th>Fichier</th><th>Type détecté</th><th class="num">Lignes</th><th>Colonnes</th></tr></thead>
      <tbody>${report.map((r) => `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td><span class="tag">${KIND_LABELS[r.kind]}</span>${r.date ? ` <small>au ${fmtDate(r.date)}</small>` : ''}</td>
        <td class="num">${r.count}</td>
        <td><small>${escapeHtml(r.error ?? (r.headers ?? []).filter(Boolean).join(', '))}</small></td>
      </tr>`).join('')}</tbody>
    </table>
    <p class="muted">Opérations après dédoublonnage : ${Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ') || 'aucune'}.</p>
    ${others.length ? `<p class="muted">Libellés non classés (ignorés dans les calculs) : ${others.map(escapeHtml).join(', ')}.</p>` : ''}`;
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

function setupBenchmarkSelect() {
  const select = $('select-benchmark');
  const options = BENCHMARKS.some((b) => b.symbol === state.benchmark)
    ? BENCHMARKS
    : [...BENCHMARKS, { symbol: state.benchmark, label: state.benchmark }];
  select.innerHTML = options.map((b) => `<option value="${escapeHtml(b.symbol)}">${escapeHtml(b.label)}</option>`).join('');
  select.value = state.benchmark;
  select.addEventListener('change', async () => {
    state.benchmark = select.value;
    writeSetting(BENCHMARK_KEY, state.benchmark);
    if (!state.dataset?.operations.length || !state.marketAvailable) return;
    await loadBenchmark(state.dataset.operations[0].date);
    render();
  });
}

function setupEvents() {
  const remember = canRememberFolder();
  $('btn-pick').hidden = !remember;
  $('fallback-label').hidden = remember;

  $('btn-pick').addEventListener('click', async () => {
    try {
      const handle = await pickFolder();
      $('btn-reload').hidden = false;
      await loadFromHandle(handle);
    } catch (err) {
      if (err.name !== 'AbortError') alert(`Impossible de lire le dossier : ${err.message}`);
    }
  });

  $('btn-reload').addEventListener('click', async () => {
    const remembered = await getRememberedFolder();
    if (!remembered) return;
    if (remembered.granted || await requestAccess(remembered.handle)) {
      clearHistoryCache();
      state.series.clear();
      await loadFromHandle(remembered.handle);
    } else {
      await forgetFolder();
    }
  });

  $('input-folder').addEventListener('change', async (e) => {
    const files = await readFileList(e.target.files);
    await loadFiles(files, `${files.length ? files[0].name.split('/')[0] : 'Dossier'}`);
  });

  $('btn-demo').addEventListener('click', async () => {
    const names = ['HistoriqueOperationsBourse_exemple.csv', 'Portefeuille_exemple.csv'];
    const files = await Promise.all(names.map(async (name) => ({
      name, lastModified: Date.now(), data: await (await fetch(`exemples/${name}`)).arrayBuffer(),
    })));
    await loadFiles(files, 'Données d\'exemple');
  });

  $('range-buttons').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-range]');
    if (!btn) return;
    state.rangeYears = Number(btn.dataset.range);
    $('range-buttons').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });

  $('show-closed').addEventListener('change', () => render());

  $('positions-table').addEventListener('change', async (e) => {
    const input = e.target.closest('input.symbol');
    if (!input) return;
    const key = input.dataset.key;
    setSymbolOverride(key, input.value);
    const op = state.dataset.operations.find((o) => o.key === key);
    if (op && state.marketAvailable) {
      await loadSecurity(op, state.dataset.operations[0].date);
      render();
    }
  });

  // Redessine les graphiques quand le thème clair/sombre change.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.dataset) render();
  });
}

async function init() {
  setupBenchmarkSelect();
  setupEvents();
  const remembered = await getRememberedFolder();
  if (!remembered) return;
  $('btn-reload').hidden = false;
  $('btn-reload').textContent = `Rouvrir « ${remembered.handle.name} »`;
  if (remembered.granted) await loadFromHandle(remembered.handle);
  else $('folder-status').textContent = `Dossier mémorisé : « ${remembered.handle.name} ». Cliquez sur « Rouvrir » pour autoriser la lecture.`;
}

init();
