'use strict';

// The Omarchy bar widget's view model: one pure projection of a Hub stats snapshot
// into ready-to-paint rows.
//
// QML cannot load the shared UMD modules (its global object is read-only, and
// they `require` each other), so every label, percentage and formatted figure
// is decided here, where the shared display helpers already live and node:test
// can reach them. The QML side lays out what it is given and computes nothing
// beyond geometry. Re-run this with a fresh `now` to advance relative times;
// the bridge does that on a timer rather than leaving clocks to QML.
//
// Labels and units stay in English, like the rest of Omarchy's shell.

const { CLIENT_LABELS } = require('../shared/clientCatalog');
const { LIMIT_PROVIDER_LABELS } = require('../shared/limits/providers');
const { limitWindowLabel } = require('../shared/limits/windowLabels');
const { limitWindowText } = require('../shared/limits/windowText');
const {
  creditsAmount, creditsCurrency, creditsMeterPercent, formatMoney, isCreditsWindow
} = require('../shared/limits/balanceDisplay');
const { formatCompactTokens } = require('../shared/compactTokens');
const { formatCompactCurrencyFromUsd } = require('../shared/compactMoney');
const { widgetVendorPalette } = require('../shared/vendorPresentation');
const {
  sessionActivityState, sessionContextWindow, sessionPromptCacheForRow, sessionWithActivity
} = require('../shared/sessionLive');
// Renderer modules, but UMD and free of DOM access: the Electron home view
// draws its activity grid, trend line and session subtitles with these, so the
// panel reuses them rather than restating the layout rules.
const { sessionModelLabel } = require('../electron/renderer/sessionRows');
const usageCharts = require('../electron/renderer/usageCharts');
const homeOverview = require('../electron/renderer/homeOverview');

const PERIOD_KEYS = ['today', 'month', 'allTime'];
const BREAKDOWN_ROWS = 8;
const PROJECT_ROWS = 8;
const SESSION_ROWS = 12;
const HISTORY_DAYS = 30;
// The Electron home view's trend span.
const TREND_DAYS = 45;
// The trend path is computed on this square and handed over in 0..1 units,
// so the panel scales it to whatever width it has.
const TREND_SCALE = 1000;
const UNCLASSIFIED_ID = 'unclassified';

// The widget's dark-surface palette: lifted brand colours, and `null` for the
// near-black marks so QML paints them in the theme's foreground instead.
const PALETTE = widgetVendorPalette();

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function timestampMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nowMs(value) {
  if (value instanceof Date) return value.getTime();
  const number = Number(value);
  return Number.isFinite(number) ? number : Date.now();
}

function tokensText(value) {
  return formatCompactTokens(finite(value));
}

function costText(value) {
  return formatCompactCurrencyFromUsd(finite(value), 'USD');
}

function vendorColor(id) {
  const style = PALETTE[id];
  if (!style || style.ink) return null;
  return style.color || null;
}

function clientLabel(id) {
  if (id === UNCLASSIFIED_ID) return 'Unclassified';
  return CLIENT_LABELS[id] || id;
}

// "2h 14m", "3d 4h", "<1m": the two most significant units, no seconds.
function durationText(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return '<1m';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${rest}m`;
}

function agoText(at, now) {
  const ms = timestampMs(at);
  if (!ms) return '';
  const delta = now - ms;
  if (delta < 60_000) return 'just now';
  return `${durationText(delta)} ago`;
}

// `crit` matches Omarchy's own agents panel, which raises the bar alarm for
// the last 10% of an allowance.
function toneForUsed(percent) {
  if (percent >= 90) return 'crit';
  if (percent >= 75) return 'warn';
  return 'ok';
}

// Ranked rows from a `{ id: tokens }` map, with costs from its sibling map.
// `total` adds a synthetic Unclassified row for tokens the period carries but
// no id owns, so the visible breakdown still adds up to the headline.
function rankedRows(tokensById, costsById, total, { limit, label, color }) {
  const entries = Object.entries(tokensById || {})
    .map(([id, tokens]) => ({ id, tokens: finite(tokens), cost: finite(costsById?.[id]) }))
    .filter((row) => row.tokens > 0);
  const attributed = entries.reduce((sum, row) => sum + row.tokens, 0);
  const remainder = finite(total) - attributed;
  if (remainder > 0 && entries.length) entries.push({ id: UNCLASSIFIED_ID, tokens: remainder, cost: 0, unclassified: true });
  entries.sort((a, b) => b.tokens - a.tokens || a.id.localeCompare(b.id));

  let rows = entries;
  if (entries.length > limit) {
    const rest = entries.slice(limit - 1);
    rows = entries.slice(0, limit - 1);
    rows.push({
      id: 'other',
      tokens: rest.reduce((sum, row) => sum + row.tokens, 0),
      cost: rest.reduce((sum, row) => sum + row.cost, 0),
      other: rest.length
    });
  }

  const max = rows.reduce((value, row) => Math.max(value, row.tokens), 0);
  const denominator = Math.max(finite(total), attributed, 1);
  return rows.map((row) => ({
    id: row.id,
    label: row.other ? `${row.other} more` : row.unclassified ? 'Unclassified' : label(row.id),
    color: row.other || row.unclassified ? null : color(row.id),
    tokens: row.tokens,
    tokensText: tokensText(row.tokens),
    costText: row.unclassified ? '' : costText(row.cost),
    share: row.tokens / denominator,
    shareText: `${Math.round((row.tokens / denominator) * 100)}%`,
    fraction: max > 0 ? row.tokens / max : 0
  }));
}

function projectRows(projects) {
  const entries = Object.entries(projects || {})
    .map(([key, project]) => ({ key, project: project || {} }))
    .filter(({ project }) => finite(project.tokens) > 0)
    .sort((a, b) => finite(b.project.tokens) - finite(a.project.tokens) || a.key.localeCompare(b.key))
    .slice(0, PROJECT_ROWS);
  const max = entries.reduce((value, { project }) => Math.max(value, finite(project.tokens)), 0);
  return entries.map(({ key, project }) => {
    const clients = Object.entries(project.clients || {}).sort((a, b) => finite(b[1]) - finite(a[1]));
    const lead = clients[0]?.[0] || '';
    return {
      id: key,
      label: String(project.label || key),
      clientLabel: lead ? clientLabel(lead) : '',
      color: lead ? vendorColor(lead) : null,
      tokensText: tokensText(project.tokens),
      costText: costText(project.costUsd),
      fraction: max > 0 ? finite(project.tokens) / max : 0
    };
  });
}

function periodView(period) {
  const src = period && typeof period === 'object' ? period : {};
  const total = finite(src.totalTokens);
  const cacheRead = finite(src.cacheReadTokens);
  const hasComponents = src.capabilities?.tokenComponents === true;
  const durationMs = finite(src.timedDurationMs);
  const throughput = src.capabilities?.throughput === true && durationMs > 0
    ? finite(src.timedOutputTokens) / (durationMs / 1000)
    : 0;
  return {
    totalTokens: total,
    tokensText: tokensText(total),
    tokensExact: Math.round(total).toLocaleString('en-US'),
    costText: costText(src.costUsd),
    outputText: hasComponents ? tokensText(src.outputTokens) : '—',
    cacheShareText: hasComponents && total > 0 ? `${Math.round((cacheRead / total) * 100)}%` : '—',
    throughputText: throughput > 0 ? `${throughput.toFixed(throughput >= 100 ? 0 : 1)} tok/s` : '—',
    clients: rankedRows(src.clients, src.clientCosts, total, {
      limit: BREAKDOWN_ROWS, label: clientLabel, color: vendorColor
    }),
    models: rankedRows(src.models, src.modelCosts, total, {
      limit: BREAKDOWN_ROWS, label: (id) => id, color: () => null
    }),
    projects: projectRows(src.projects)
  };
}

function limitWindowRow(provider, window, now) {
  const label = limitWindowLabel(provider.provider, window, 'Usage');
  const resetsAt = timestampMs(window.resetsAt);
  const resetText = resetsAt > now ? `resets in ${durationText(resetsAt - now)}` : String(window.resetDescription || '');
  const showMeter = window.showMeter !== false;

  if (isCreditsWindow(window)) {
    const remaining = creditsMeterPercent(provider, window);
    const amount = creditsAmount(provider, window);
    return {
      label,
      valueText: amount === null ? '—' : formatMoney(amount, creditsCurrency(provider, window)),
      detailText: '',
      resetText,
      showMeter: showMeter && remaining !== null,
      fraction: remaining === null ? 0 : remaining / 100,
      // A balance meter fills with what is left, so its tone runs the other way.
      tone: remaining === null ? 'ok' : toneForUsed(100 - remaining),
      usedPercent: remaining === null ? null : 100 - remaining
    };
  }

  const text = limitWindowText(provider, window, { formatCompact: (value) => tokensText(value) });
  const used = window.usedPercent === null || window.usedPercent === undefined ? null : finite(window.usedPercent);
  const clamped = used === null ? null : Math.max(0, Math.min(100, used));
  return {
    label,
    valueText: text.value || (clamped === null ? '—' : `${Math.round(clamped)}%`),
    detailText: text.detail || '',
    resetText,
    showMeter: showMeter && clamped !== null,
    fraction: clamped === null ? 0 : clamped / 100,
    tone: clamped === null ? 'ok' : toneForUsed(clamped),
    usedPercent: clamped
  };
}

// Only accounts with a reading get a block: a provider that is unconfigured,
// signed out or has never answered has nothing to show, and a row that only
// says so is noise in a bar panel. A failed refresh is different: the runtime
// keeps the last windows and reports the failure as the status, so those
// windows stay, marked stale, rather than the quota vanishing on a 429.
const DISABLED_LIMIT_STATUSES = new Set(['disabled', 'notConfigured']);

function limitRows(limits, now) {
  const providers = Array.isArray(limits?.providers) ? limits.providers : [];
  return providers
    .filter((provider) => provider && !DISABLED_LIMIT_STATUSES.has(provider.status))
    .map((provider) => ({
      provider,
      windows: (Array.isArray(provider.windows) ? provider.windows : [])
        .filter((window) => window && typeof window === 'object')
        .map((window) => limitWindowRow(provider, window, now))
    }))
    .filter(({ windows }) => windows.length > 0)
    .map(({ provider, windows }) => {
      return {
        id: String(provider.accountKey || provider.provider),
        provider: String(provider.provider || ''),
        label: LIMIT_PROVIDER_LABELS[provider.provider] || String(provider.provider || ''),
        account: String(provider.accountLabel || provider.accountName || ''),
        plan: String(provider.planLabel || ''),
        color: vendorColor(provider.provider === 'factory' ? 'droid' : provider.provider),
        stale: provider.stale === true || provider.status !== 'ok',
        updatedText: agoText(provider.updatedAt, now),
        windows
      };
    });
}

function sessionRows(periods, now) {
  // Today's sessions first; a quiet day falls back to the month so the list is
  // never empty while there is recent work to show.
  const period = [periods?.today, periods?.month].find((candidate) => Object.keys(candidate?.sessions || {}).length);
  if (!period) return [];
  return Object.keys(period.sessions)
    .map((key) => ({ key, session: sessionWithActivity(period, key) }))
    .filter(({ session }) => session && typeof session === 'object')
    .sort((a, b) => timestampMs(b.session.lastUsedAt) - timestampMs(a.session.lastUsedAt) || a.key.localeCompare(b.key))
    .slice(0, SESSION_ROWS)
    .map(({ key, session }) => {
      const context = sessionContextWindow(session);
      const promptCache = sessionPromptCacheForRow(session, now);
      const title = String(session.title || '').trim();
      const project = String(session.projectLabel || '').trim();
      return {
        id: key,
        clientLabel: clientLabel(session.client),
        color: vendorColor(session.client),
        title: title || project || String(session.sessionId || key).slice(0, 24),
        modelLabel: sessionModelLabel(session),
        project: title ? project : '',
        state: sessionActivityState(session, now),
        tokensText: tokensText(session.totalTokens),
        costText: costText(session.costUsd),
        lastUsedText: agoText(session.lastUsedAt, now),
        contextText: context ? `${context.percentLeft}% context left` : '',
        cacheText: promptCache ? `Cache ${promptCache.minutes}m` : '',
        cacheHint: promptCache ? `Prompt cache ~${promptCache.minutes}m left` : '',
        contextFraction: context ? context.percentUsed / 100 : 0
      };
    });
}

function localDateKey(ms) {
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function historyView(preview, now) {
  const byDate = new Map((Array.isArray(preview?.daily) ? preview.daily : [])
    .filter((row) => row && typeof row.date === 'string')
    .map((row) => [row.date, row]));
  // The preview skips idle days; a bar chart needs them as zero-height slots.
  const days = [];
  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const at = new Date(now);
    at.setHours(12, 0, 0, 0);
    at.setDate(at.getDate() - offset);
    const date = localDateKey(at.getTime());
    const row = byDate.get(date) || {};
    days.push({
      date,
      label: at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tokens: finite(row.tokens),
      tokensText: tokensText(row.tokens),
      costText: costText(row.cost)
    });
  }
  const max = days.reduce((value, day) => Math.max(value, day.tokens), 0);
  const summary = preview?.summary && typeof preview.summary === 'object' ? preview.summary : {};
  const windowTokens = days.reduce((sum, day) => sum + day.tokens, 0);
  return {
    days: days.map((day) => ({ ...day, fraction: max > 0 ? day.tokens / max : 0 })),
    windowTokensText: tokensText(windowTokens),
    activeDays: days.filter((day) => day.tokens > 0).length,
    currentStreak: finite(summary.currentStreak),
    longestStreak: finite(summary.longestStreak),
    peakDayText: tokensText(summary.peakDayTokens),
    favoriteModel: String(summary.favoriteModel || '')
  };
}

function shortMonthLabel(key) {
  const match = /^(\d{4})-(\d{2})/.exec(String(key || ''));
  if (!match) return String(key || '');
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
    .toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
}

function dayLabel(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  if (!match) return String(key || '');
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// "10/8", as the Electron trend axis writes it.
function trendDateLabel(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ''));
  return match ? `${Number(match[2])}/${Number(match[3])}` : String(key || '');
}

// An SVG path of M/L/C commands as `{ op, args }` steps in 0..1 units.
function normalizedPath(svgPath) {
  const steps = [];
  const pattern = /([MLC])([^MLC]*)/g;
  let match;
  while ((match = pattern.exec(String(svgPath || '')))) {
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map((value) => Number(value) / TREND_SCALE);
    if (args.every(Number.isFinite)) steps.push({ op: match[1], args });
  }
  return steps;
}

// The Electron home view's Activity and Trend modules: a rolling-year grid
// and a smoothed line, both with today patched in from the live period total
// so they agree with the headline above them.
function activityView(history, todayPeriod, now) {
  const today = usageCharts.localDayKey(new Date(now));
  const daily = homeOverview.patchDailyToday(
    Array.isArray(history?.daily) ? history.daily : [],
    today,
    finite(todayPeriod?.totalTokens),
    finite(todayPeriod?.costUsd)
  );
  // Cost is the Electron default heat metric; unpriced usage falls back to tokens.
  const byCost = daily.some((row) => finite(row?.cost) > 0);
  const points = usageCharts.computeHeatmapIntensities(daily)
    .map((row) => ({ ...row, intensity: byCost ? row.costIntensity : row.tokenIntensity }));
  const grid = usageCharts.rollingYearHeatmap(points, { endDate: today });
  const summary = history?.summary && typeof history.summary === 'object' ? history.summary : {};
  const activeDays = Number.isFinite(summary.activeDays)
    ? summary.activeDays
    : grid.cells.filter((cell) => cell.tokens > 0).length;

  const trendPoints = usageCharts.clampDaily(daily, TREND_DAYS);
  const chart = usageCharts.areaLineChart(trendPoints, {
    width: TREND_SCALE, height: TREND_SCALE, padTop: 0, padRight: 0, padBottom: 0, padLeft: 0, metric: 'tokens', curve: true
  });
  return {
    activity: {
      weeks: grid.weeks,
      activeDaysText: `${activeDays} active days`,
      cells: grid.cells.map((cell) => ({
        col: cell.col,
        row: cell.row,
        level: cell.intensity,
        today: cell.date === today,
        tooltip: cell.tokens > 0
          ? `${dayLabel(cell.date)} · ${tokensText(cell.tokens)} tokens · ${costText(cell.cost)}`
          : `${dayLabel(cell.date)} · no usage`
      })),
      months: grid.monthLabels.map((month) => ({ col: month.col, label: shortMonthLabel(month.label) }))
    },
    trend: {
      peakText: `Peak ${tokensText(homeOverview.longRangePeakDayTokens({ historySummary: summary, daily }))}`,
      dates: homeOverview.homeTrendSummary(trendPoints).dates.map(trendDateLabel),
      path: trendPoints.length > 1 ? normalizedPath(chart.linePath) : []
    }
  };
}

function deviceRows(devices, now) {
  return (Array.isArray(devices) ? devices : [])
    .filter((device) => device && device.deviceId)
    .map((device) => ({
      id: String(device.deviceId),
      name: String(device.deviceId),
      os: [device.osName, device.osVersion].filter(Boolean).join(' '),
      stale: device.stale === true,
      seenText: agoText(device.receivedAt || device.updatedAt, now),
      todayText: tokensText(device.periods?.today?.totalTokens)
    }))
    .sort((a, b) => Number(a.stale) - Number(b.stale) || a.name.localeCompare(b.name));
}

// What the bar item shows: today's figures, and the tightest quota anywhere so
// the icon can warn before the dashboard is opened.
function barView(today, limits) {
  let tightest = null;
  for (const provider of limits) {
    if (provider.stale) continue;
    for (const window of provider.windows) {
      if (window.usedPercent === null) continue;
      if (!tightest || window.usedPercent > tightest.usedPercent) {
        tightest = { ...window, provider: provider.label };
      }
    }
  }
  const lines = [`Today  ${today.tokensText} tokens · ${today.costText}`];
  if (tightest) {
    lines.push(`${tightest.provider} ${tightest.label}  ${tightest.valueText}${tightest.resetText ? ` · ${tightest.resetText}` : ''}`);
  }
  return {
    text: today.tokensText,
    tone: tightest ? tightest.tone : 'ok',
    tooltip: lines.join('\n')
  };
}

function buildDashboardModel(stats, options = {}) {
  const now = nowMs(options.now);
  const src = stats && typeof stats === 'object' ? stats : {};
  const periods = Object.fromEntries(PERIOD_KEYS.map((key) => [key, periodView(src.periods?.[key])]));
  const limits = limitRows(src.limits, now);
  // The bridge fetches the full history (a rolling year) when the Hub's
  // revision moves; until then the 30-day preview in the snapshot stands in.
  const longHistory = options.history && Array.isArray(options.history.daily) && options.history.daily.length
    ? options.history
    : src.historyPreview;
  const { activity, trend } = activityView(longHistory, src.periods?.today, now);
  return {
    updatedAt: String(src.updatedAt || ''),
    updatedText: agoText(src.updatedAt, now),
    periods,
    limits,
    sessions: sessionRows(src.periods, now),
    history: historyView(src.historyPreview, now),
    activity,
    trend,
    devices: deviceRows(src.devices, now),
    bar: barView(periods.today, limits)
  };
}

module.exports = { buildDashboardModel, durationText };
