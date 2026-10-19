'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDashboardModel, durationText } = require('../../src/quickshell/dashboardModel');

const NOW = Date.parse('2026-10-19T12:00:00.000Z');

function stats(overrides = {}) {
  return {
    updatedAt: '2026-10-19T11:59:00.000Z',
    periods: {
      today: {
        capabilities: { tokenComponents: true, throughput: true },
        totalTokens: 1500,
        costUsd: 0.25,
        cacheReadTokens: 900,
        outputTokens: 100,
        timedOutputTokens: 100,
        timedDurationMs: 2000,
        clients: { claude: 1000, codex: 400 },
        clientCosts: { claude: 0.2, codex: 0.05 },
        models: { 'claude-opus': 1000, 'gpt-5': 400 },
        modelCosts: { 'claude-opus': 0.2, 'gpt-5': 0.05 },
        projects: {
          'token-monitor': { label: 'token-monitor', tokens: 1400, costUsd: 0.25, clients: { claude: 1000, codex: 400 } }
        },
        sessions: {
          'claude:a': { client: 'claude', sessionId: 'a', totalTokens: 1000, costUsd: 0.2, lastUsedAt: '2026-10-19T11:58:00.000Z', projectLabel: 'token-monitor', contextTokens: 50_000, contextWindow: 200_000 },
          'codex:b': { client: 'codex', sessionId: 'b', totalTokens: 400, costUsd: 0.05, lastUsedAt: '2026-10-19T09:00:00.000Z', title: 'Fix the bar', projectLabel: 'omarchy' }
        }
      },
      month: { totalTokens: 9000, costUsd: 1.5, clients: { claude: 9000 }, clientCosts: { claude: 1.5 } },
      allTime: { totalTokens: 90_000, costUsd: 15 }
    },
    limits: {
      providers: [
        {
          provider: 'claude',
          accountKey: 'sha256:claude',
          status: 'ok',
          updatedAt: '2026-10-19T11:55:00.000Z',
          windows: [
            { kind: 'session', usedPercent: 82, resetsAt: '2026-10-19T14:14:00.000Z' },
            { kind: 'weekly', usedPercent: 20, resetsAt: '2026-10-22T12:00:00.000Z' }
          ]
        },
        {
          provider: 'openrouter',
          accountKey: 'sha256:or',
          status: 'ok',
          windows: [{ kind: 'billing', metric: 'credits', label: 'Credits', remaining: 12.5, currency: 'USD', remainingPercent: 10 }]
        },
        { provider: 'codex', accountKey: 'sha256:codex', status: 'unauthorized', windows: [] },
        { provider: 'cursor', accountKey: 'sha256:cursor', status: 'disabled', windows: [] }
      ]
    },
    historyPreview: {
      daily: [{ date: '2026-10-19', tokens: 1500, cost: 0.25 }, { date: '2026-10-17', tokens: 3000, cost: 0.5 }],
      summary: { currentStreak: 1, longestStreak: 4, peakDayTokens: 3000, favoriteModel: 'claude-opus' }
    },
    devices: [
      { deviceId: 'laptop', osName: 'Arch Linux', stale: false, receivedAt: '2026-10-19T11:59:30.000Z', periods: { today: { totalTokens: 1500 } } },
      { deviceId: 'desktop', stale: true, receivedAt: '2026-10-18T12:00:00.000Z' }
    ],
    ...overrides
  };
}

test('durationText keeps the two most significant units', () => {
  assert.equal(durationText(30_000), '<1m');
  assert.equal(durationText(14 * 60_000), '14m');
  assert.equal(durationText((2 * 60 + 14) * 60_000), '2h 14m');
  assert.equal(durationText(3 * 86_400_000 + 4 * 3_600_000 + 59_000), '3d 4h');
  assert.equal(durationText(-5), '<1m');
});

test('period breakdown ranks tools and adds an Unclassified remainder', () => {
  const { periods } = buildDashboardModel(stats(), { now: NOW });
  const today = periods.today;
  assert.equal(today.tokensText, '1.5K');
  assert.equal(today.tokensExact, '1,500');
  assert.equal(today.cacheShareText, '60%');
  assert.equal(today.throughputText, '50.0 tok/s');
  assert.deepEqual(today.clients.map((row) => [row.id, row.label, row.shareText]), [
    ['claude', 'Claude Code', '67%'],
    ['codex', 'Codex', '27%'],
    ['unclassified', 'Unclassified', '7%']
  ]);
  assert.equal(today.clients[0].fraction, 1);
  assert.equal(today.clients[2].color, null);
  assert.equal(today.clients[2].costText, '');
  assert.match(today.clients[0].color, /^#[0-9a-f]{6}$/i);
  assert.equal(today.projects[0].clientLabel, 'Claude Code');
});

test('a period without token components shows dashes instead of zeros', () => {
  const { periods } = buildDashboardModel(stats(), { now: NOW });
  assert.equal(periods.month.outputText, '—');
  assert.equal(periods.month.cacheShareText, '—');
  assert.equal(periods.allTime.clients.length, 0);
});

test('long breakdowns fold their tail into one row', () => {
  const clients = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`tool${index}`, 100 - index]));
  const model = buildDashboardModel(stats({ periods: { today: { totalTokens: 1134, clients } } }), { now: NOW });
  const rows = model.periods.today.clients;
  assert.equal(rows.length, 8);
  assert.equal(rows.at(-1).id, 'other');
  assert.equal(rows.at(-1).label, '5 more');
});

test('limits keep failures, drop disabled providers and use the shared labels', () => {
  const { limits } = buildDashboardModel(stats(), { now: NOW });
  assert.deepEqual(limits.map((row) => row.provider), ['claude', 'openrouter', 'codex']);

  const [claude, openrouter, codex] = limits;
  assert.equal(claude.label, 'Claude');
  assert.deepEqual(claude.windows.map((window) => [window.label, window.valueText, window.tone, window.resetText]), [
    ['Session', '82%', 'warn', 'resets in 2h 14m'],
    ['Weekly', '20%', 'ok', 'resets in 3d']
  ]);
  assert.equal(claude.updatedText, '5m ago');

  // A balance fills with what is left and alarms in its last 10%.
  assert.equal(openrouter.windows[0].valueText, '$12.50');
  assert.equal(openrouter.windows[0].fraction, 0.1);
  assert.equal(openrouter.windows[0].tone, 'crit');

  assert.equal(codex.statusText, 'Sign-in required');
  assert.deepEqual(codex.windows, []);
});

test('the bar alarms on the tightest fresh quota', () => {
  const { bar } = buildDashboardModel(stats(), { now: NOW });
  assert.equal(bar.text, '1.5K');
  assert.equal(bar.tone, 'crit');
  assert.equal(bar.tooltip, 'Today  1.5K tokens · $0.2500\nOpenRouter Credits  $12.50');
});

test('stale limits never colour the bar', () => {
  const input = stats();
  input.limits.providers = [{ ...input.limits.providers[0], stale: true }];
  const { bar } = buildDashboardModel(input, { now: NOW });
  assert.equal(bar.tone, 'ok');
  assert.equal(bar.tooltip, 'Today  1.5K tokens · $0.2500');
});

test('sessions are recent-first with activity and context', () => {
  const { sessions } = buildDashboardModel(stats(), { now: NOW });
  assert.deepEqual(sessions.map((row) => [row.id, row.title, row.project, row.state, row.lastUsedText]), [
    ['claude:a', 'token-monitor', '', 'running', '2m ago'],
    ['codex:b', 'Fix the bar', 'omarchy', 'idle', '3h ago']
  ]);
  assert.equal(sessions[0].contextText, '75% context left');
  assert.equal(sessions[0].contextFraction, 0.25);
});

test('history fills idle days so the chart has a slot for each', () => {
  const { history } = buildDashboardModel(stats(), { now: NOW });
  assert.equal(history.days.length, 30);
  const byDate = Object.fromEntries(history.days.map((day) => [day.date, day]));
  assert.equal(byDate['2026-10-17'].fraction, 1);
  assert.equal(byDate['2026-10-18'].tokens, 0);
  assert.equal(history.activeDays, 2);
  assert.equal(history.windowTokensText, '4.5K');
  assert.equal(history.favoriteModel, 'claude-opus');
});

test('devices list fresh ones first', () => {
  const { devices } = buildDashboardModel(stats(), { now: NOW });
  assert.deepEqual(devices.map((row) => [row.name, row.stale, row.seenText]), [
    ['laptop', false, 'just now'],
    ['desktop', true, '1d ago']
  ]);
});

test('an empty or malformed snapshot still yields a paintable model', () => {
  for (const input of [null, {}, { periods: { today: 'x' }, limits: { providers: [null] }, devices: [null] }]) {
    const model = buildDashboardModel(input, { now: NOW });
    assert.equal(model.periods.today.tokensText, '0');
    assert.deepEqual(model.limits, []);
    assert.deepEqual(model.sessions, []);
    assert.equal(model.history.days.length, 30);
    assert.equal(model.bar.tone, 'ok');
  }
});
