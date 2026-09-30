const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 4 });
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const dash = '–';

export const fmtEur = (v) => (v === null || v === undefined ? dash : eur.format(v));
export const fmtEur0 = (v) => (v === null || v === undefined ? dash : eur0.format(v));
export const fmtSignedEur = (v) => (v === null || v === undefined ? dash : (v > 0 ? '+' : '') + eur.format(v));
export const fmtPct = (v) => (v === null || v === undefined || !Number.isFinite(v) ? dash : pct.format(v));
export const fmtNum = (v) => (v === null || v === undefined ? dash : num.format(v));
export const fmtDate = (iso) => dateFmt.format(new Date(`${iso}T00:00:00Z`));
export const fmtMonth = (ts) => monthFmt.format(new Date(ts));
export const signClass = (v) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
