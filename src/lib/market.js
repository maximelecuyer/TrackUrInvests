// Données de marché Yahoo Finance, relayées par le serveur local (voir vite.config.js).

const CACHE_PREFIX = 'tui:chart:';
const SYMBOLS_KEY = 'tui:symbols';

export const BENCHMARKS = [
  { symbol: 'IWDA.AS', label: 'MSCI World (iShares IWDA)' },
  { symbol: 'SSAC.L', label: 'MSCI ACWI, monde entier (iShares SSAC)' },
  { symbol: 'CW8.PA', label: 'MSCI World (Amundi CW8)' },
  { symbol: '^STOXX50E', label: 'Euro Stoxx 50' },
  { symbol: '^FCHI', label: 'CAC 40' },
  { symbol: 'PSP5.PA', label: 'S&P 500 (Amundi PSP5)' },
];

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJson(key, fallback) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // Quota dépassé ou stockage indisponible : on se passe du cache.
  }
}

/** Correspondances titre -> symbole Yahoo choisies (ou corrigées) par l'utilisateur. */
export function getSymbolOverrides() {
  return readJson(SYMBOLS_KEY, {});
}

export function setSymbolOverride(key, symbol) {
  const map = getSymbolOverrides();
  if (symbol) map[key] = symbol.trim().toUpperCase(); else delete map[key];
  writeJson(SYMBOLS_KEY, map);
}

async function yahoo(path) {
  const res = await fetch(`/yahoo${path}`);
  if (!res.ok) throw new Error(`Yahoo Finance a répondu ${res.status}`);
  return res.json();
}

/** Vérifie que le proxy local répond (l'app n'est pas ouverte en fichier statique). */
export async function isMarketAvailable() {
  try {
    await yahoo('/v8/finance/chart/%5EFCHI?range=5d&interval=1d');
    return true;
  } catch {
    return false;
  }
}

// Places européennes préférées quand un titre est coté à plusieurs endroits.
const PREFERRED_EXCHANGES = ['PAR', 'AMS', 'GER', 'FRA', 'MIL', 'EBS', 'BRU', 'MCE', 'LSE', 'NMS', 'NYQ'];

/** Cherche le symbole Yahoo d'un titre à partir de son ISIN, sinon de son libellé. */
export async function resolveSymbol({ isin, label }) {
  for (const query of [isin, label].filter(Boolean)) {
    const data = await yahoo(`/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`);
    const quotes = (data.quotes ?? []).filter((q) => q.symbol && q.quoteType !== 'OPTION');
    if (quotes.length === 0) continue;
    quotes.sort((a, b) => rank(a.exchange) - rank(b.exchange));
    return quotes[0].symbol;
  }
  return null;
}

function rank(exchange) {
  const i = PREFERRED_EXCHANGES.indexOf(exchange);
  return i < 0 ? PREFERRED_EXCHANGES.length : i;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Historique quotidien d'un symbole : { currency, series: [{date, close}] }.
 * Mis en cache une journée dans le navigateur.
 */
export async function getHistory(symbol, from, { adjusted = false } = {}) {
  const cacheKey = `${CACHE_PREFIX}${symbol}:${adjusted ? 'adj' : 'raw'}`;
  const cached = readJson(cacheKey, null);
  if (cached && cached.fetched === today() && cached.from <= from) {
    return { currency: cached.currency, series: unpack(cached.d, cached.c) };
  }
  const p1 = Math.floor(Date.parse(`${from}T00:00:00Z`) / 1000) - 7 * 86400;
  const p2 = Math.floor(Date.now() / 1000);
  const data = await yahoo(`/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d`);
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`Pas d'historique pour ${symbol}`);
  let currency = result.meta?.currency ?? 'EUR';
  const closes = adjusted
    ? result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close
    : result.indicators?.quote?.[0]?.close;
  // Les titres de Londres sont cotés en pence.
  const factor = currency === 'GBp' || currency === 'GBX' ? 0.01 : 1;
  if (factor !== 1) currency = 'GBP';
  const series = [];
  (result.timestamp ?? []).forEach((ts, i) => {
    const c = closes?.[i];
    if (c === null || c === undefined) return;
    const date = new Date(ts * 1000).toISOString().slice(0, 10);
    if (series.length && series[series.length - 1].date === date) series.pop();
    series.push({ date, close: c * factor });
  });
  writeJson(cacheKey, { fetched: today(), from, currency, d: series.map((p) => p.date), c: series.map((p) => p.close) });
  return { currency, series };
}

function unpack(dates, closes) {
  return dates.map((date, i) => ({ date, close: closes[i] }));
}

/** Convertit une série dans une autre devise vers l'euro. */
export async function toEur(history, from) {
  if (!history.currency || history.currency === 'EUR') return history.series;
  const fx = await getHistory(`${history.currency}EUR=X`, from);
  return convertSeries(history.series, fx.series);
}

/** Multiplie chaque cours par le dernier taux de change connu à sa date. */
export function convertSeries(series, fxSeries) {
  let j = -1;
  const out = [];
  for (const p of series) {
    while (j + 1 < fxSeries.length && fxSeries[j + 1].date <= p.date) j += 1;
    const rate = j >= 0 ? fxSeries[j].close : fxSeries[0]?.close;
    if (rate) out.push({ date: p.date, close: p.close * rate });
  }
  return out;
}

/** Vide le cache des cours (bouton "Actualiser"). */
export function clearHistoryCache() {
  const s = storage();
  if (!s) return;
  for (let i = s.length - 1; i >= 0; i -= 1) {
    const key = s.key(i);
    if (key?.startsWith(CACHE_PREFIX)) s.removeItem(key);
  }
}
