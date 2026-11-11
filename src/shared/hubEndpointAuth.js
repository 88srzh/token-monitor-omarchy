'use strict';

const crypto = require('node:crypto');

// A hub client must prove that the endpoint knows the shared secret before it
// sends that secret. Otherwise another local user can bind the loopback port
// while the real hub is down, receive the bearer header on the next reconnect,
// and reuse it against the real hub later.
//
// The client chooses a fresh random nonce and asks the endpoint to sign it. A
// real hub can produce the HMAC; an impostor cannot. The proof is not a
// credential and does not reveal the secret.
const HUB_AUTH_DOMAIN = 'token-monitor-hub-auth-v1';
const HUB_AUTH_NONCE_BYTES = 32;
const HUB_AUTH_NONCE_PATTERN = /^[0-9a-f]{64}$/;

function isHubAuthNonce(value) {
  return typeof value === 'string' && HUB_AUTH_NONCE_PATTERN.test(value);
}

function hubAuthProof(secret, nonce) {
  return crypto.createHmac('sha256', String(secret))
    .update(`${HUB_AUTH_DOMAIN}:${nonce}`)
    .digest('hex');
}

function createHubAuthNonce(randomBytes = crypto.randomBytes) {
  return randomBytes(HUB_AUTH_NONCE_BYTES).toString('hex');
}

function proofMatches(actual, expected) {
  if (!isHubAuthNonce(actual) || !isHubAuthNonce(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

// Resolves true when the endpoint proves it knows `secret`, or when there is no
// secret to protect. Throws without sending an Authorization header when the
// endpoint cannot prove itself; callers must not fall back to sending one.
async function verifyHubEndpoint({
  hubUrl,
  secret,
  fetchImpl = fetch,
  nonceFactory = createHubAuthNonce,
  timeoutMs = 5000
} = {}) {
  const value = String(secret || '').trim();
  if (!value) return true;
  const base = String(hubUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('hub endpoint proof failed: no hub URL');
  const nonce = nonceFactory();
  if (!isHubAuthNonce(nonce)) throw new Error('hub endpoint proof failed: invalid nonce');

  const controller = timeoutMs > 0 && typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(new Error('hub endpoint proof timed out')), timeoutMs)
    : null;
  try {
    const url = `${base}/api/auth/challenge?nonce=${encodeURIComponent(nonce)}`;
    const response = await fetchImpl(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) throw new Error(`hub endpoint proof failed: HTTP ${response.status}`);
    const body = await response.json();
    if (!body || body.nonce !== nonce || !proofMatches(body.proof, hubAuthProof(value, nonce))) {
      throw new Error('hub endpoint proof failed: wrong secret or impostor endpoint');
    }
    return true;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  HUB_AUTH_DOMAIN,
  HUB_AUTH_NONCE_BYTES,
  createHubAuthNonce,
  hubAuthProof,
  isHubAuthNonce,
  verifyHubEndpoint
};
