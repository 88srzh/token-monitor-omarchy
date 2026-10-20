'use strict';

// The Omarchy bar widget's data feed: follows the Hub's stats stream and prints one
// JSON line per update on stdout, which the QML side reads with a SplitParser.
//
// Lines are `{ "type": "model", ... }` with a view model from dashboardModel.js,
// or `{ "type": "status", "connected": false, "error": ... }` while the Hub is
// unreachable. The bridge reconnects on its own and never exits on a Hub
// failure, so the widget only restarts it if the process itself dies.
//
// It deliberately does not send `x-token-monitor-stream: 2`: every update is
// then a complete `stats` event, and there is no freshness-only delta to merge.
// The secret travels in a header and never on a command line, because
// omarchy-shell launches this in the user session where `ps` shows every
// argument.

const { loadDotEnv, parseArgs } = require('../shared/config');
const { buildDashboardModel } = require('./dashboardModel');

const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 30_000;
// The Hub writes a heartbeat comment every 30 s; two missed beats is a dead link.
const STALL_MS = 75_000;
// Re-render without new stats so countdowns and "5m ago" keep moving.
const TICK_MS = 30_000;

// Incremental text/event-stream parser. Feed it chunks; it calls
// `onEvent({ event, data })` for each complete event and ignores comments.
function createSseParser(onEvent) {
  let buffer = '';
  let event = '';
  let data = [];
  return function feed(chunk) {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (line === '') {
        if (data.length) onEvent({ event: event || 'message', data: data.join('\n') });
        event = '';
        data = [];
      } else if (line.startsWith(':')) {
        continue;
      } else {
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
    }
  };
}

function runBridge({
  hubUrl, secret = '', write, fetchImpl = fetch, now = () => Date.now(), tickMs = TICK_MS
}) {
  const base = String(hubUrl).replace(/\/$/, '');
  let stopped = false;
  let latest = null;
  let controller = null;
  let retryMs = RETRY_MIN_MS;
  let retryTimer = null;

  function emitModel() {
    if (!latest) return;
    write({ type: 'model', connected: true, hubUrl: base, model: buildDashboardModel(latest, { now: now() }) });
  }

  function emitStatus(error) {
    write({ type: 'status', connected: false, hubUrl: base, error });
  }

  const ticker = setInterval(emitModel, tickMs);

  function handleEvent({ event, data }) {
    if (event !== 'snapshot' && event !== 'stats') return;
    let payload;
    try { payload = JSON.parse(data); } catch (_) { return; }
    if (!payload?.stats || typeof payload.stats !== 'object') return;
    latest = payload.stats;
    retryMs = RETRY_MIN_MS;
    emitModel();
  }

  async function connect() {
    controller = new AbortController();
    let stallTimer = null;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => controller.abort(new Error('stream stalled')), STALL_MS);
    };
    try {
      const headers = { accept: 'text/event-stream' };
      if (secret) headers.authorization = `Bearer ${secret}`;
      armStall();
      const response = await fetchImpl(`${base}/api/stats/stream`, { headers, signal: controller.signal });
      if (response.status === 401) throw new Error('unauthorized: check TOKEN_MONITOR_SECRET');
      if (!response.ok || !response.body) throw new Error(`hub responded ${response.status}`);
      const feed = createSseParser(handleEvent);
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        armStall();
        feed(decoder.decode(chunk, { stream: true }));
      }
      throw new Error('stream closed');
    } catch (error) {
      if (stopped) return;
      emitStatus(String(error?.cause?.code || error?.message || error));
    } finally {
      clearTimeout(stallTimer);
    }
    if (stopped) return;
    retryTimer = setTimeout(connect, retryMs);
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  }

  connect();

  return function stop() {
    stopped = true;
    clearInterval(ticker);
    clearTimeout(retryTimer);
    controller?.abort();
  };
}

if (require.main === module) {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));
  const hubUrl = String(args.hub || args.hubUrl || process.env.TOKEN_MONITOR_HUB_URL || 'http://127.0.0.1:17321');
  const secret = String(args.secret || process.env.TOKEN_MONITOR_SECRET || '').trim();
  // The shell closing its end of the pipe is how this process learns to quit.
  process.stdout.on('error', () => process.exit(0));
  const stop = runBridge({
    hubUrl,
    secret,
    write: (line) => process.stdout.write(`${JSON.stringify(line)}\n`)
  });
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    process.on(signal, () => { stop(); process.exit(0); });
  }
}

module.exports = { createSseParser, runBridge };
