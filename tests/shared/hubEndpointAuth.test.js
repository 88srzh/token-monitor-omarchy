'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  HUB_AUTH_DOMAIN,
  createHubAuthNonce,
  hubAuthProof,
  isHubAuthNonce,
  verifyHubEndpoint
} = require('../../src/shared/hubEndpointAuth');

test('the endpoint proof is deterministic, domain separated and nonce shaped', () => {
  const nonce = 'a'.repeat(64);
  assert.equal(hubAuthProof('owner-secret', nonce), hubAuthProof('owner-secret', nonce));
  assert.notEqual(hubAuthProof('owner-secret', nonce), hubAuthProof('other-secret', nonce));
  assert.notEqual(hubAuthProof('owner-secret', nonce), hubAuthProof('owner-secret', 'b'.repeat(64)));
  assert.equal(hubAuthProof('owner-secret', nonce).length, 64);
  assert.equal(isHubAuthNonce(nonce), true);
  assert.equal(isHubAuthNonce('a'.repeat(63)), false);
  assert.equal(isHubAuthNonce('A'.repeat(64)), false);
  assert.equal(isHubAuthNonce(null), false);
  assert.equal(createHubAuthNonce(() => Buffer.alloc(32, 0xab)), 'ab'.repeat(32));
  assert.equal(HUB_AUTH_DOMAIN, 'token-monitor-hub-auth-v1');
});

test('verifyHubEndpoint proves the endpoint without sending the secret', async () => {
  const nonce = 'b'.repeat(64);
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ nonce, proof: hubAuthProof('owner-secret', nonce) }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  const verified = await verifyHubEndpoint({
    hubUrl: 'http://127.0.0.1:17321/',
    secret: 'owner-secret',
    fetchImpl,
    nonceFactory: () => nonce
  });
  assert.equal(verified, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `http://127.0.0.1:17321/api/auth/challenge?nonce=${nonce}`);
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.cache, 'no-store');
});

test('verifyHubEndpoint rejects a wrong proof and a mismatched nonce', async () => {
  const nonce = 'c'.repeat(64);
  const wrongProof = async () => new Response(JSON.stringify({ nonce, proof: '0'.repeat(64) }), { status: 200 });
  await assert.rejects(
    verifyHubEndpoint({ hubUrl: 'http://127.0.0.1:17321', secret: 'owner-secret', fetchImpl: wrongProof, nonceFactory: () => nonce }),
    /wrong secret or impostor endpoint/
  );

  const wrongNonce = async () => new Response(JSON.stringify({
    nonce: 'd'.repeat(64),
    proof: hubAuthProof('owner-secret', 'd'.repeat(64))
  }), { status: 200 });
  await assert.rejects(
    verifyHubEndpoint({ hubUrl: 'http://127.0.0.1:17321', secret: 'owner-secret', fetchImpl: wrongNonce, nonceFactory: () => nonce }),
    /wrong secret or impostor endpoint/
  );
});

test('verifyHubEndpoint fails closed on HTTP errors and propagates network errors', async () => {
  const nonce = 'e'.repeat(64);
  await assert.rejects(
    verifyHubEndpoint({
      hubUrl: 'http://127.0.0.1:17321',
      secret: 'owner-secret',
      fetchImpl: async () => new Response('unauthorized', { status: 401 }),
      nonceFactory: () => nonce
    }),
    /HTTP 401/
  );

  const networkError = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
  await assert.rejects(
    verifyHubEndpoint({
      hubUrl: 'http://127.0.0.1:17321',
      secret: 'owner-secret',
      fetchImpl: async () => { throw networkError; },
      nonceFactory: () => nonce
    }),
    (error) => error.cause?.code === 'ECONNREFUSED'
  );
});

test('verifyHubEndpoint rejects a declared oversized challenge before reading it', async () => {
  const nonce = 'f'.repeat(64);
  let cancelled = false;
  const response = {
    ok: true,
    status: 200,
    headers: { get: (name) => name.toLowerCase() === 'content-length' ? '999999' : null },
    body: {
      cancel: async () => { cancelled = true; },
      getReader: () => { throw new Error('body must not be read'); }
    }
  };
  await assert.rejects(
    verifyHubEndpoint({
      hubUrl: 'http://127.0.0.1:17321',
      secret: 'owner-secret',
      fetchImpl: async () => response,
      nonceFactory: () => nonce
    }),
    /response too large/
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('verifyHubEndpoint bounds a chunked challenge body before JSON parsing', async () => {
  const nonce = '1'.repeat(64);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(3000).fill(0x20));
      controller.enqueue(new Uint8Array(3000).fill(0x20));
    },
    cancel() { cancelled = true; }
  });
  await assert.rejects(
    verifyHubEndpoint({
      hubUrl: 'http://127.0.0.1:17321',
      secret: 'owner-secret',
      fetchImpl: async () => new Response(stream, { status: 200 }),
      nonceFactory: () => nonce
    }),
    /response too large/
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('verifyHubEndpoint skips the challenge when no secret is configured', async () => {
  let called = false;
  const verified = await verifyHubEndpoint({
    hubUrl: 'http://127.0.0.1:17321',
    secret: '',
    fetchImpl: async () => { called = true; }
  });
  assert.equal(verified, true);
  assert.equal(called, false);
});
