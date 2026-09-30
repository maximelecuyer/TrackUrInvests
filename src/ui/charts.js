import { Chart, registerables } from 'chart.js';
import { fmtDate, fmtEur, fmtEur0, fmtMonth, fmtPct, fmtSignedEur } from './format.js';

Chart.register(...registerables);

const charts = new Map();

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function theme() {
  return {
    text: css('--text'),
    text2: css('--text-2'),
    grid: css('--grid'),
    surface: css('--surface'),
    series1: css('--series-1'),
    series2: css('--series-2'),
    neutral: css('--neutral'),
    positive: css('--positive'),
    negative: css('--negative'),
  };
}

function baseOptions(t) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { labels: { color: t.text2, usePointStyle: true, pointStyle: 'line', boxWidth: 24 } },
      tooltip: {
        backgroundColor: t.surface,
        titleColor: t.text,
        bodyColor: t.text2,
        borderColor: t.grid,
        borderWidth: 1,
        padding: 10,
        usePointStyle: true,
      },
    },
  };
}

function axis(t, extra = {}) {
  return {
    grid: { color: t.grid, drawTicks: false },
    border: { color: t.grid },
    ticks: { color: t.text2, padding: 6 },
    ...extra,
  };
}

function draw(id, config) {
  charts.get(id)?.destroy();
  const canvas = document.getElementById(id);
  charts.set(id, new Chart(canvas, config));
}

const DAY = 864e5;

/** Raccourcit les libellés d'axe trop longs (le libellé complet reste dans l'infobulle). */
const shorten = (label, max = window.innerWidth < 600 ? 14 : 24) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);
const ts = (iso) => Date.parse(`${iso}T00:00:00Z`);

/** Valeur du portefeuille, indice et montant investi, sur un même axe en euros. */
export function drawTimeline(points, { benchmarkLabel }) {
  const t = theme();
  const line = (label, key, color, extra = {}) => ({
    label,
    data: points.filter((p) => p[key] !== null).map((p) => ({ x: ts(p.date), y: p[key] })),
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    tension: 0,
    ...extra,
  });
  const datasets = [
    line('Mon portefeuille', 'wealth', t.series1),
    line(`Mêmes versements dans ${benchmarkLabel}`, 'benchmark', t.series2),
    line('Montant net investi', 'invested', t.neutral, { borderWidth: 1.5, stepped: true }),
  ].filter((d) => d.data.length);

  const span = points.length ? ts(points[points.length - 1].date) - ts(points[0].date) : 0;
  draw('chart-timeline', {
    type: 'line',
    data: { datasets },
    options: {
      ...baseOptions(t),
      parsing: false,
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        ...baseOptions(t).plugins,
        decimation: { enabled: true, algorithm: 'lttb', samples: 400 },
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          callbacks: {
            title: (items) => fmtDate(new Date(items[0].parsed.x).toISOString().slice(0, 10)),
            label: (item) => ` ${item.dataset.label} : ${fmtEur0(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: axis(t, {
          type: 'linear',
          min: points.length ? ts(points[0].date) : undefined,
          max: points.length ? ts(points[points.length - 1].date) : undefined,
          grid: { display: false },
          ticks: {
            color: t.text2,
            maxTicksLimit: 8,
            callback: (v) => (span > 60 * DAY ? fmtMonth(v) : fmtDate(new Date(v).toISOString().slice(0, 10))),
          },
        }),
        y: axis(t, { ticks: { color: t.text2, callback: (v) => fmtEur0(v) } }),
      },
    },
  });
}

/** Barres horizontales triées, bleu si gain, rouge si perte. */
export function drawGains(rows) {
  const t = theme();
  document.getElementById('box-gains').style.height = `${Math.max(200, rows.length * 30 + 50)}px`;
  draw('chart-gains', {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [{
        label: 'Plus-value latente',
        data: rows.map((r) => r.unrealized),
        backgroundColor: rows.map((r) => (r.unrealized >= 0 ? t.positive : t.negative)),
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.7,
      }],
    },
    options: {
      ...baseOptions(t),
      indexAxis: 'y',
      plugins: {
        ...baseOptions(t).plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          callbacks: {
            label: (item) => {
              const r = rows[item.dataIndex];
              return ` ${fmtSignedEur(r.unrealized)} (${fmtPct(r.unrealizedPct)})`;
            },
          },
        },
      },
      scales: {
        x: axis(t, { ticks: { color: t.text2, callback: (v) => fmtEur0(v) } }),
        y: axis(t, { grid: { display: false }, ticks: { color: t.text, autoSkip: false, callback(v) { return shorten(this.getLabelForValue(v)); } } }),
      },
    },
  });
}

/** Poids de chaque ligne dans la valorisation totale. */
export function drawAllocation(rows) {
  const t = theme();
  const total = rows.reduce((s, r) => s + r.marketValue, 0);
  document.getElementById('box-allocation').style.height = `${Math.max(200, rows.length * 30 + 50)}px`;
  draw('chart-allocation', {
    type: 'bar',
    data: {
      labels: rows.map((r) => r.label),
      datasets: [{
        label: 'Poids',
        data: rows.map((r) => (total ? r.marketValue / total : 0)),
        backgroundColor: t.series1,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.7,
      }],
    },
    options: {
      ...baseOptions(t),
      indexAxis: 'y',
      plugins: {
        ...baseOptions(t).plugins,
        legend: { display: false },
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          callbacks: { label: (item) => ` ${fmtPct(item.parsed.x).replace('+', '')} soit ${fmtEur0(rows[item.dataIndex].marketValue)}` },
        },
      },
      scales: {
        x: axis(t, { min: 0, ticks: { color: t.text2, callback: (v) => fmtPct(v).replace('+', '') } }),
        y: axis(t, { grid: { display: false }, ticks: { color: t.text, autoSkip: false, callback(v) { return shorten(this.getLabelForValue(v)); } } }),
      },
    },
  });
}

/** Dividendes et frais par année, barres groupées. */
export function drawIncome(years) {
  const t = theme();
  const bar = (label, key, color) => ({
    label,
    data: years.map((y) => y[key]),
    backgroundColor: color,
    borderColor: t.surface,
    borderWidth: { left: 1, right: 1 },
    borderRadius: 4,
    borderSkipped: 'start',
    barPercentage: 0.8,
    categoryPercentage: 0.6,
  });
  draw('chart-income', {
    type: 'bar',
    data: {
      labels: years.map((y) => y.year),
      datasets: [bar('Dividendes perçus', 'dividends', t.series1), bar('Frais et taxes', 'fees', t.series2)],
    },
    options: {
      ...baseOptions(t),
      interaction: { mode: 'index', intersect: false },
      plugins: {
        ...baseOptions(t).plugins,
        legend: { labels: { color: t.text2, usePointStyle: true, pointStyle: 'rectRounded' } },
        tooltip: {
          ...baseOptions(t).plugins.tooltip,
          callbacks: { label: (item) => ` ${item.dataset.label} : ${fmtEur(item.parsed.y)}` },
        },
      },
      scales: {
        x: axis(t, { grid: { display: false } }),
        y: axis(t, { beginAtZero: true, ticks: { color: t.text2, callback: (v) => fmtEur0(v) } }),
      },
    },
  });
}
