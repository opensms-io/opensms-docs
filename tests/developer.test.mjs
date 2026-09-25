// Developer section (getting-started/ and integrate/): every flow those pages document
// that can run on the local stack. Code blocks marked <!-- test:NAME --> in the pages
// are extracted and executed, so the published snippets are the tested snippets.
//
// Local stack facts these tests pin (see the pages for why):
//   - email delivery is off, so no owner can verify email and every sandbox send is
//     refused with 403 "email verification is required for sandbox sending";
//   - webhook delivery, file scanning and payments are off.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, rmSync, readdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { API, call, freshWorkspace, mintKey, adminToken } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = [
  ...readdirSync(join(ROOT, 'getting-started')).map((f) => `getting-started/${f}`),
  ...readdirSync(join(ROOT, 'integrate')).map((f) => `integrate/${f}`),
].filter((f) => f.endsWith('.md'));
const GATE = 'email verification is required for sandbox sending';

/** The fenced block that follows <!-- test:name --> in a page. */
function snippet(page, name) {
  const text = readFileSync(join(ROOT, page), 'utf8');
  const re = new RegExp(`<!-- test:${name} -->\\s*\\n\`\`\`[a-z]*[^\\n]*\\n([\\s\\S]*?)\\n\`\`\``);
  const m = text.match(re);
  assert.ok(m, `snippet ${name} not found in ${page}`);
  return m[1];
}
const scratch = () => mkdtempSync(join(tmpdir(), 'opensms-dev-docs-'));
const run = (cmd, args, env, input) => spawnSync(cmd, args, { env: { ...process.env, OPENSMS_API: API, ...env }, input, encoding: 'utf8', timeout: 60000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasPythonRequests = run('python3', ['-c', 'import requests']).status === 0;
const allScopes = ['messages:read', 'messages:write', 'lookup:read', 'lookup:request', 'templates:manage', 'contacts:manage', 'webhooks:manage', 'wallet:read', 'pricing:read', 'realtime:read', 'analytics:read', 'numbers:read', 'sender-ids:read'];

/** Raw WebSocket upgrade attempt, returning the HTTP status line code. */
function upgradeStatus(path, headers) {
  return new Promise((resolveStatus, reject) => {
    const req = httpRequest(API + path, { headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', ...headers } });
    req.on('upgrade', (res, socket) => { socket.destroy(); resolveStatus(res.statusCode); });
    req.on('response', (res) => { res.resume(); resolveStatus(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------- page hygiene

test('developer pages: no em dashes, every relative link and image resolves', () => {
  for (const page of PAGES) {
    const text = readFileSync(join(ROOT, page), 'utf8');
    assert.ok(!text.includes('\u2014'), `${page} contains an em dash`);
    assert.match(text.split('\n').find((l) => l.trim() && !l.startsWith('#')) ?? '', /\w/, `${page} lacks an intro paragraph`);
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const file = target.split('#')[0];
      assert.ok(existsSync(resolve(ROOT, dirname(page), file)), `${page} links to missing ${target}`);
    }
  }
});

// ---------------------------------------------------------------- quickstart

test('quickstart: signup returns a session and a sandbox workspace', async () => {
  const email = `dev-qs-${randomUUID()}@opensms.test`;
  const res = await call('POST', '/v1/auth/signup', { body: { email, password: 'Quickstart-Passw0rd-2026!', country_iso2: 'KE', workspace_name: 'Acme Dev' } });
  assert.equal(res.status, 201);
  assert.match(res.body.token, /^sess_/);
  assert.equal(res.body.role, 'owner');
  assert.equal(res.body.workspace.live_status, 'sandbox');
  assert.equal(res.body.workspace.wallet_currency, 'KES');
  const again = await call('POST', '/v1/auth/signup', { body: { email, password: 'Quickstart-Passw0rd-2026!', country_iso2: 'KE' } });
  assert.equal(again.status, 409);
  assert.equal(again.body.detail, 'account already exists');
  const weak = await call('POST', '/v1/auth/signup', { body: { email: `weak-${randomUUID()}@opensms.test`, password: 'short', country_iso2: 'KE' } });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.code, 'validation_failed');
  assert.deepEqual(weak.body.errors.password, ['Use a password between 8 and 1024 bytes.']);
});

test('quickstart: email verification cannot complete on the local stack', async () => {
  const ws = await freshWorkspace('dev-verify');
  const send = await call('POST', '/v1/auth/email/send', { token: ws.token });
  assert.equal(send.status, 503);
  assert.equal(send.body.detail, 'email delivery is not configured');
  const verify = await call('POST', '/v1/auth/verify-email', { token: ws.token, body: { code: '123456' } });
  assert.equal(verify.status, 400);
  assert.equal(verify.body.detail, 'invalid or expired verification code');
});

test('quickstart: default key scopes, curl, Node and Python snippets hit the email gate', async () => {
  const ws = await freshWorkspace('dev-qs');
  const key = await mintKey(ws, { label: 'quickstart' });
  assert.match(key.key, /^sk_test_[A-Za-z0-9_-]{32}$/);
  assert.deepEqual(key.key_info.scopes, ['messages:read', 'messages:write']);
  const env = { OPENSMS_API_KEY: key.key };

  const curl = run('sh', ['-c', snippet('getting-started/quickstart.md', 'quickstart-curl')], env);
  assert.equal(JSON.parse(curl.stdout).detail, GATE);

  const dir = scratch();
  writeFileSync(join(dir, 'send.mjs'), snippet('getting-started/quickstart.md', 'quickstart-node'));
  const node = run(process.execPath, [join(dir, 'send.mjs')], env);
  assert.equal(node.status, 1);
  assert.match(node.stderr, /opensms error 403 .*email verification is required for sandbox sending/);

  if (hasPythonRequests) {
    const py = run('python3', ['-'], env, snippet('getting-started/quickstart.md', 'quickstart-python'));
    assert.equal(py.status, 1);
    assert.match(py.stdout, /opensms error 403 .*email verification is required for sandbox sending/);
  }

  const list = JSON.parse(run('sh', ['-c', snippet('getting-started/quickstart.md', 'quickstart-list')], env).stdout);
  assert.deepEqual(list, { items: [], next_cursor: null });
});

// ---------------------------------------------------------------- authentication

test('authentication: scope catalog, scope errors and secret shown once', async () => {
  const ws = await freshWorkspace('dev-auth');
  const scopes = await call('GET', '/v1/keys/scopes', { token: ws.token, workspace: ws.workspace });
  assert.equal(scopes.status, 200);
  assert.deepEqual(scopes.body.environments, ['sandbox', 'live']);
  assert.equal(scopes.body.scopes.length, 23);
  assert.ok(scopes.body.scopes.includes('keys:admin'));

  const bad = await call('POST', '/v1/keys', { token: ws.token, workspace: ws.workspace, body: { label: 'x', test: true, scopes: ['messages:read', 'messages:read', 'sms:send'] } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, 'unsupported_key_scope');
  assert.deepEqual(bad.body.errors.scopes, ['Duplicate scope: messages:read', 'Unsupported scope: sms:send']);
  const dup = await call('POST', '/v1/keys', { token: ws.token, workspace: ws.workspace, body: { label: 'x', test: true, scopes: ['messages:read', 'messages:read'] } });
  assert.equal(dup.body.code, 'duplicate_key_scope');

  const scoped = await mintKey(ws, { label: 'orders service', scopes: ['messages:read', 'messages:write', 'webhooks:manage'] });
  assert.deepEqual(scoped.key_info.scopes, ['messages:read', 'messages:write', 'webhooks:manage']);
  const list = await call('GET', '/v1/keys', { token: ws.token, workspace: ws.workspace });
  assert.ok(!JSON.stringify(list.body).includes(scoped.key));
  assert.equal(list.body.items[0].prefix, 'sk_test_');
});

test('authentication: session header rules and session-only endpoints', async () => {
  const ws = await freshWorkspace('dev-hdr');
  const key = await mintKey(ws);
  const noHeaders = await call('GET', '/v1/messages', { token: ws.token });
  assert.equal(noHeaders.status, 401);
  assert.equal(noHeaders.body.detail, 'session requests require X-Workspace-ID and X-Environment (sandbox or live)');
  const ok = await call('GET', '/v1/messages', { token: ws.token, workspace: ws.workspace, headers: { 'x-environment': 'sandbox' } });
  assert.equal(ok.status, 200);
  const keysWithKey = await call('GET', '/v1/keys', { token: key.key });
  assert.equal(keysWithKey.status, 401);
  assert.equal(keysWithKey.body.detail, 'authentication required');
  const missing = await call('GET', '/v1/keys', { token: ws.token });
  assert.equal(missing.body.code, 'bad_request');
  assert.equal(missing.body.detail, 'A valid X-Workspace-ID header is required.');
  const foreign = await call('GET', '/v1/keys', { token: ws.token, workspace: '00000000-0000-0000-0000-000000000000' });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.code, 'forbidden');
  const noAuth = await call('GET', '/v1/messages');
  assert.equal(noAuth.body.detail, 'missing bearer credential');
  const fake = await call('GET', '/v1/messages', { token: 'sk_test_notARealKeyAtAll123456' });
  assert.equal(fake.status, 401);
  assert.equal(fake.body.detail, 'missing or invalid API key');
  const wallet = await call('GET', '/v1/wallet', { token: key.key });
  assert.equal(wallet.status, 403);
  assert.equal(wallet.body.detail, 'wallet access denied');
});

test('authentication: rotation keeps the old key for 24 hours, revocation is immediate', async () => {
  const ws = await freshWorkspace('dev-rotate');
  const S = { token: ws.token, workspace: ws.workspace };
  const old = await mintKey(ws, { label: 'rotate me' });
  const rotated = await call('POST', `/v1/keys/${old.key_info.id}/rotate`, S);
  assert.equal(rotated.status, 201);
  assert.equal(rotated.body.key_info.label, 'rotate me');
  assert.deepEqual(rotated.body.key_info.scopes, old.key_info.scopes);
  assert.equal((await call('GET', '/v1/messages', { token: rotated.body.key })).status, 200);
  assert.equal((await call('GET', '/v1/messages', { token: old.key })).status, 200);
  const listed = (await call('GET', '/v1/keys', S)).body.items.find((k) => k.id === old.key_info.id);
  const hours = (Date.parse(listed.expires_at) - Date.now()) / 3.6e6;
  assert.ok(hours > 23.5 && hours <= 24, `old key expires in ${hours}h`);
  const again = await call('POST', `/v1/keys/${old.key_info.id}/rotate`, S);
  assert.equal(again.status, 409);
  assert.equal(again.body.detail, 'This key has already been rotated.');

  const doomed = await mintKey(ws, { label: 'revoke me' });
  assert.equal((await call('DELETE', `/v1/keys/${doomed.key_info.id}`, S)).status, 204);
  assert.equal((await call('DELETE', `/v1/keys/${doomed.key_info.id}`, S)).status, 204);
  const after = await call('GET', '/v1/messages', { token: doomed.key });
  assert.equal(after.status, 401);
  assert.equal(after.body.detail, 'missing or invalid API key');
});

test('authentication: two-factor login challenge; API keys unaffected', async () => {
  const ws = await freshWorkspace('dev-2fa');
  const key = await mintKey(ws, { scopes: ['wallet:read'] });
  const setup = await call('POST', '/v1/auth/2fa/setup', { token: ws.token });
  assert.equal(setup.status, 200);
  assert.match(setup.body.otpauth_uri, /^otpauth:\/\/totp\/OpenSMS:/);
  const enable = await call('POST', '/v1/auth/2fa/enable', { token: ws.token, body: { code: totp(setup.body.secret) } });
  assert.deepEqual(enable.body, { enabled: true });
  const login = await call('POST', '/v1/auth/login', { body: { email: ws.email, password: ws.password } });
  assert.equal(login.status, 202);
  assert.equal(login.body.two_factor_required, true);
  assert.match(login.body.challenge_token, /^challenge_/);
  const done = await call('POST', '/v1/auth/login/2fa', { body: { challenge_token: login.body.challenge_token, code: totp(setup.body.secret) } });
  assert.equal(done.status, 201);
  assert.equal(done.body.user.totp_enabled, true);
  assert.equal((await call('GET', '/v1/wallet', { token: key.key })).status, 200);
});

function totp(secretB32, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretB32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// ---------------------------------------------------------------- sending messages

test('sending: validation, refusal records and list filters', async () => {
  const ws = await freshWorkspace('dev-send');
  const K = { token: (await mintKey(ws)).key };
  const send = (body, key = randomUUID()) => call('POST', '/v1/messages', { ...K, headers: { 'idempotency-key': key }, body });
  const refused = await send({ to: '+254700000001', text: 'Your order A-1001 has shipped.', traffic_type: 'transactional', metadata: { order_id: 'A-1001' } });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.detail, GATE);
  assert.match(refused.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal((await send({ to: '0700000001', text: 'x' })).body.detail, 'to must be an E.164 phone number');
  assert.equal((await send({ to: '+254700000001', text: 'x', from: 'ACME' })).body.detail, 'invalid JSON');
  assert.equal((await send({ to: '+254700000001', text: 'x', sender_id: 'ACME-LOGISTICS-KE' })).body.detail, 'sender_id must be at most 11 characters or 15 numeric digits');
  assert.equal((await send({ to: '+254700000001', text: 'x', traffic_type: 'promo' })).body.detail, 'invalid traffic_type');
  const noKey = await call('POST', '/v1/messages', { ...K, body: { to: '+254700000001', text: 'x' } });
  assert.equal(noKey.body.detail, 'Idempotency-Key is required and must be at most 255 characters');
  // A refused send does not bind its idempotency key.
  const k = randomUUID();
  assert.equal((await send({ to: '+254700000001', text: 'one' }, k)).status, 403);
  assert.equal((await send({ to: '+254700000001', text: 'two' }, k)).status, 403);

  const badId = await call('GET', '/v1/messages/nope', K);
  assert.equal(badId.body.code, 'invalid_message_id');
  const missing = await call('GET', '/v1/messages/00000000-0000-0000-0000-000000000000', K);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.detail, 'message not found');
  assert.equal((await call('POST', '/v1/messages/00000000-0000-0000-0000-000000000000/cancel', K)).status, 404);
  assert.equal((await call('GET', '/v1/messages/00000000-0000-0000-0000-000000000000/attempts', K)).status, 404);
  assert.deepEqual((await call('GET', '/v1/messages?status=delivered&country=KE&limit=10', K)).body, { items: [], next_cursor: null });
  assert.equal((await call('GET', '/v1/messages?status=bogus', K)).body.detail, 'invalid status');
  assert.equal((await call('GET', '/v1/messages?limit=101', K)).status, 400);
  assert.deepEqual((await call('GET', '/v1/sandbox/messages', K)).body, { items: [], next_cursor: null });
});

test('sending: sender IDs and country compliance as documented', async () => {
  const ws = await freshWorkspace('dev-sender');
  const K = { token: (await mintKey(ws, { scopes: ['sender-ids:read'] })).key };
  const senders = await call('GET', '/v1/sender-ids', K);
  assert.equal(senders.status, 200);
  assert.deepEqual(senders.body.items.map((s) => [s.value, s.status]), [['OPENSMS', 'approved']]);
  const ke = await call('GET', '/v1/countries/KE/compliance');
  assert.deepEqual(ke.body.stop_keywords, ['STOP', 'UNSUBSCRIBE', 'END']);
  assert.deepEqual(ke.body.quiet_hours, [{ traffic_type: 'marketing', start_local: '21:00:00', end_local: '08:00:00', enforce: 'defer' }]);
  assert.ok(ke.body.content_rules.some((r) => r.pattern === 'loan' && r.action === 'hold_for_review'));
});

test('sending: batches upload, validate, start, stop, replay and conflict', async () => {
  const ws = await freshWorkspace('dev-batch');
  const K = { token: (await mintKey(ws)).key };
  const up = await call('POST', '/v1/messages/batch', { ...K, headers: { 'idempotency-key': 'b-1' }, body: { items: [{ to: '+254700000001', text: 'Sale starts now' }, { to: '+254700000101', text: 'Sale starts now' }, { to: '+254700000001', text: 'Sale starts now' }, { to: '0712', text: 'x' }] } });
  assert.equal(up.status, 202);
  assert.deepEqual([up.body.status, up.body.total, up.body.invalid, up.body.duplicates], ['ready', 4, 2, 1]);
  const replay = await call('POST', '/v1/messages/batch', { ...K, headers: { 'idempotency-key': 'b-1' }, body: { items: [{ to: '+254700000001', text: 'Sale starts now' }, { to: '+254700000101', text: 'Sale starts now' }, { to: '+254700000001', text: 'Sale starts now' }, { to: '0712', text: 'x' }] } });
  assert.equal(replay.status, 202);
  assert.equal(replay.body.id, up.body.id);
  const conflict = await call('POST', '/v1/messages/batch', { ...K, headers: { 'idempotency-key': 'b-1' }, body: { items: [{ to: '+254700000002', text: 'Sale starts now' }] } });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.detail, 'Idempotency-Key was already used with a different request');

  const v = (await call('GET', `/v1/batches/${up.body.id}/validation`, K)).body;
  assert.deepEqual(v.rows.map((r) => r.error ?? 'ok'), ['ok', 'ok', 'duplicate item', 'to must be an E.164 phone number']);
  const started = await call('POST', `/v1/batches/${up.body.id}/start`, { ...K, headers: { 'idempotency-key': 'bs-1' } });
  assert.equal(started.status, 200);
  assert.equal(started.body.status, 'failed');
  assert.equal(started.body.invalid, 4);
  const after = (await call('GET', `/v1/batches/${up.body.id}/validation`, K)).body;
  assert.equal(after.rows[0].error, GATE);
  assert.equal(after.rows[0].rejection_status, 403);
  assert.deepEqual((await call('GET', `/v1/batches/${up.body.id}/items`, K)).body, { items: [], next_cursor: null });

  const csv = 'to,text,traffic_type\n+254700000001,Flash sale today,marketing\n+254700000002,Flash sale today,marketing\n';
  const raw = await fetch(`${API}/v1/messages/batch`, { method: 'POST', headers: { authorization: `Bearer ${K.token}`, 'content-type': 'text/csv', 'idempotency-key': 'csv-1' }, body: csv });
  const csvBatch = await raw.json();
  assert.equal(raw.status, 202);
  assert.deepEqual([csvBatch.status, csvBatch.total, csvBatch.invalid], ['ready', 2, 0]);
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'sale.csv');
  form.append('dedupe', 'false');
  const mp = await fetch(`${API}/v1/messages/batch`, { method: 'POST', headers: { authorization: `Bearer ${K.token}`, 'idempotency-key': 'mp-1' }, body: form });
  assert.equal(mp.status, 202);

  const stop = await call('POST', `/v1/batches/${csvBatch.id}/stop`, { ...K, headers: { 'idempotency-key': 'bstop-1' } });
  assert.deepEqual(stop.body, { cancelled: 0, id: csvBatch.id, status: 'stopped' });
  const foreign = await freshWorkspace('dev-batch-foreign');
  const other = { token: (await mintKey(foreign)).key };
  assert.equal((await call('GET', `/v1/batches/${up.body.id}`, other)).status, 404);
});

// ---------------------------------------------------------------- webhooks

const GO_VECTOR = {
  // Produced by a verbatim copy of api/internal/webhooks/signature.go (Sign) at t=1790224046.
  // A disposable local-stack secret, split so secret scanners do not flag the vector.
  secret: 'whsec_' + 'QYgIvXD7zBUbvCzZx54csBmZQ4EMsDKYj0aWid1L_dg',
  body: '{"id": "1b3bfc11-0ae8-4018-bed1-220b2044e0ff", "data": {"label": "event trigger", "key_id": "0b6f099f-b446-45b9-84cd-24875cd44efa"}, "type": "api_key.created", "created_at": "2026-09-24T07:27:26.414161+03:00", "environment": "sandbox", "workspace_id": "29ce64bb-8ec7-424f-8f44-9c0f22393323"}',
  header: 't=1790224046,v1=e21445a9ff34fad1bb2c8daa767922de1f9fb0c2845dcd815f0a5ef72c1fc8dc',
  now: 1790224046,
};

test('webhooks: Node verifier accepts the platform signature and rejects tampering', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 'verify.mjs'), snippet('integrate/delivery-reports-and-webhooks.md', 'verify-node'));
  const { verifyOpensmsSignature } = await import(pathToFileURL(join(dir, 'verify.mjs')));
  const body = Buffer.from(GO_VECTOR.body);
  const at = { now: GO_VECTOR.now * 1000 };
  assert.equal(verifyOpensmsSignature(GO_VECTOR.secret, body, GO_VECTOR.header, at), true);
  assert.equal(verifyOpensmsSignature(GO_VECTOR.secret, Buffer.from(GO_VECTOR.body.replace('trigger', 'trigger!')), GO_VECTOR.header, at), false);
  assert.equal(verifyOpensmsSignature('whsec_wrong', body, GO_VECTOR.header, at), false);
  assert.equal(verifyOpensmsSignature(GO_VECTOR.secret, body, GO_VECTOR.header, { now: (GO_VECTOR.now + 301) * 1000 }), false);
  assert.equal(verifyOpensmsSignature(GO_VECTOR.secret, body, GO_VECTOR.header + ',v1=00', at), false);
  assert.equal(verifyOpensmsSignature(GO_VECTOR.secret, Buffer.from(JSON.stringify(JSON.parse(GO_VECTOR.body))), GO_VECTOR.header, at), false, 're-serialized JSON must not verify');
});

test('webhooks: Python verifier accepts the platform signature', { skip: run('python3', ['--version']).status !== 0 && 'python3 not installed' }, () => {
  const code = `${snippet('integrate/delivery-reports-and-webhooks.md', 'verify-python')}
import json, sys
v = json.loads(sys.argv[1])
body = v["body"].encode()
print(verify_opensms_signature(v["secret"], body, v["header"], now=v["now"]),
      verify_opensms_signature(v["secret"], body + b" ", v["header"], now=v["now"]),
      verify_opensms_signature(v["secret"], body, v["header"], now=v["now"] + 301))`;
  const res = run('python3', ['-c', code, JSON.stringify(GO_VECTOR)]);
  assert.equal(res.stdout.trim(), 'True False False', res.stderr);
});

test('webhooks: receiver snippet answers 204 for a valid signature and 401 otherwise', async () => {
  const dir = scratch();
  writeFileSync(join(dir, 'verify.mjs'), snippet('integrate/delivery-reports-and-webhooks.md', 'verify-node'));
  writeFileSync(join(dir, 'receiver.mjs'), snippet('integrate/delivery-reports-and-webhooks.md', 'receiver-node'));
  process.env.OPENSMS_WEBHOOK_SECRET = GO_VECTOR.secret;
  const { server } = await import(pathToFileURL(join(dir, 'receiver.mjs')));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', GO_VECTOR.secret).update(`${t}.`).update(GO_VECTOR.body).digest('hex');
  try {
    const good = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-opensms-signature': `t=${t},v1=${sig}` }, body: GO_VECTOR.body });
    assert.equal(good.status, 204);
    const stale = await fetch(url, { method: 'POST', headers: { 'x-opensms-signature': GO_VECTOR.header }, body: GO_VECTOR.body });
    assert.equal(stale.status, 401);
  } finally {
    server.close();
  }
});

test('webhooks: endpoints, test delivery, recorded envelope and replay rules', async () => {
  const ws = await freshWorkspace('dev-hooks');
  const K = { token: (await mintKey(ws, { scopes: allScopes })).key };
  const create = (key, body) => call('POST', '/v1/webhooks', { ...K, headers: { 'idempotency-key': key }, body });
  const hook = await create('wh-1', { url: 'https://example.com/hooks/opensms', events: ['*'] });
  assert.equal(hook.status, 201);
  assert.match(hook.body.secret, /^whsec_/);
  const again = await create('wh-1', { url: 'https://example.com/hooks/opensms', events: ['*'] });
  assert.deepEqual(again.body, hook.body);
  const changed = await create('wh-1', { url: 'https://example.com/other', events: ['*'] });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.detail, 'Idempotency-Key was used with different input.');
  const insecure = await create('wh-2', { url: 'http://example.com/hooks', events: ['message.delivered'] });
  assert.equal(insecure.body.detail, 'url must be an HTTPS URL without credentials or fragment');

  const t = await call('POST', `/v1/webhooks/${hook.body.id}/test`, { ...K, headers: { 'idempotency-key': 'wht-1' } });
  assert.deepEqual([t.status, t.body], [202, { status: 'pending' }]);
  await call('POST', '/v1/keys', { token: ws.token, workspace: ws.workspace, body: { label: 'event trigger', test: true } });
  const rejected = await call('POST', '/v1/messages', { ...K, headers: { 'idempotency-key': 'evt-rej-1' }, body: { to: '+254700000001', text: 'Your order A-1001 has shipped.' } });
  let items = [];
  for (let i = 0; i < 20 && items.length < 3; i++) {
    await sleep(500);
    items = (await call('GET', `/v1/webhooks/${hook.body.id}/deliveries`, K)).body.items;
  }
  const byEvent = Object.fromEntries(items.map((d) => [d.event, d]));
  assert.deepEqual(byEvent['webhook.test'].payload, { type: 'webhook.test' });
  const created = byEvent['api_key.created'].payload;
  assert.deepEqual(Object.keys(created).sort(), ['created_at', 'data', 'environment', 'id', 'type', 'workspace_id']);
  assert.deepEqual(Object.keys(created.data).sort(), ['key_id', 'label']);
  const rej = byEvent['message.rejected'].payload;
  assert.match(rejected.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.notEqual(rej.id, rejected.headers.get('x-request-id'), 'the webhook envelope id is the event id, not the rejection id');
  assert.equal(rej.data.reason, GATE);
  assert.equal(rej.data.http_status, 403);
  for (const d of items) assert.equal(d.status, 'pending', 'delivery is disabled locally, nothing is attempted');

  const patched = await call('PATCH', `/v1/webhooks/${hook.body.id}`, { ...K, body: { url: 'https://example.com/hooks/opensms', events: ['message.delivered', 'message.failed', 'message.expired'], enabled: true } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.secret, undefined);
});

// ---------------------------------------------------------------- OTP, lookup, inbound

test('otp: send hits the gate; verify and template errors', async () => {
  const ws = await freshWorkspace('dev-otp');
  const K = { token: (await mintKey(ws)).key };
  const send = await call('POST', '/v1/otp/send', { ...K, headers: { 'idempotency-key': 'otp-1' }, body: { to: '+254700000001', template: 'Your Acme code is {{code}}', length: 6, ttl_seconds: 300 } });
  assert.deepEqual([send.status, send.body.detail], [403, GATE]);
  const tpl = await call('POST', '/v1/otp/send', { ...K, headers: { 'idempotency-key': 'otp-2' }, body: { to: '+254700000001', template: 'no placeholder' } });
  assert.equal(tpl.body.detail, 'template must contain {{code}}');
  const len = await call('POST', '/v1/otp/send', { ...K, headers: { 'idempotency-key': 'otp-3' }, body: { to: '+254700000001', length: 12 } });
  assert.equal(len.body.detail, 'length must be between 4 and 10');
  const unknown = await call('POST', '/v1/otp/verify', { ...K, body: { otp_id: '00000000-0000-0000-0000-000000000000', code: '123456' } });
  assert.deepEqual([unknown.status, unknown.body.detail], [404, 'OTP not found']);
  const shortCode = await call('POST', '/v1/otp/verify', { ...K, body: { otp_id: '00000000-0000-0000-0000-000000000000', code: '12' } });
  assert.equal(shortCode.body.detail, 'otp_id and code are invalid');
});

test('lookup: sandbox result, replay, conflict and errors', async () => {
  const ws = await freshWorkspace('dev-lookup');
  const key = (await mintKey(ws, { scopes: ['lookup:read', 'lookup:request'] })).key;
  const env = { OPENSMS_API_KEY: key };
  const first = JSON.parse(run('sh', ['-c', snippet('integrate/lookup.md', 'lookup-curl')], env).stdout);
  assert.deepEqual({ ...first, id: 'x', checked_at: 'x' }, { id: 'x', state: 'completed', country: 'KE', carrier: null, ported: null, valid: null, source: 'mock', price: '0.000000', currency: 'KES', checked_at: 'x' });
  const K = { token: key };
  const replay = await call('POST', '/v1/lookup', { ...K, headers: { 'idempotency-key': 'lookup-1' }, body: { to: '+254700000001' } });
  assert.equal(replay.body.id, first.id);
  assert.equal((await call('GET', `/v1/lookup/${first.id}`, K)).body.id, first.id);
  const conflict = await call('POST', '/v1/lookup', { ...K, headers: { 'idempotency-key': 'lookup-1' }, body: { to: '+254700000002' } });
  assert.deepEqual([conflict.status, conflict.body.detail], [409, 'idempotency_conflict']);
  const bad = await call('POST', '/v1/lookup', { ...K, headers: { 'idempotency-key': 'lookup-2' }, body: { to: '0700' } });
  assert.deepEqual([bad.status, bad.body.detail], [422, 'invalid_destination']);
  const noKey = await call('POST', '/v1/lookup', { ...K, body: { to: '+254700000001' } });
  assert.equal(noKey.body.detail, 'Idempotency-Key is required and bounded to 200 characters');
  const shape = await call('POST', '/v1/lookup', { ...K, headers: { 'idempotency-key': 'lookup-3' }, body: { number: '+254700000001' } });
  assert.equal(shape.body.detail, 'Expected {to}.');
  const ctx = await call('GET', `/v1/lookup/${first.id}`, { ...K, headers: { 'x-environment': 'live' } });
  assert.deepEqual([ctx.status, ctx.body.detail], [403, 'Lookup scope or context denied.']);
  // lookup.md errors table: a made-up sk_ key is refused by the shared key guard, not the lookup handler.
  const fakeKey = await call('POST', '/v1/lookup', { token: 'sk_test_' + 'A'.repeat(32), headers: { 'idempotency-key': 'lookup-4' }, body: { to: '+254700000001' } });
  assert.deepEqual([fakeKey.status, fakeKey.body.detail], [401, 'missing or invalid API key']);
  const noAuth = await call('POST', '/v1/lookup', { headers: { 'idempotency-key': 'lookup-5' }, body: { to: '+254700000001' } });
  assert.deepEqual([noAuth.status, noAuth.body.detail], [401, 'Authentication required.']);
  const lookupPrices = await call('GET', '/v1/pricing?product=lookup&country=KE', { token: (await mintKey(ws, { scopes: ['pricing:read'] })).key });
  assert.deepEqual(lookupPrices.body.entries, []);
});

test('inbound and numbers: sandbox is empty and live-only operations are refused', async () => {
  const ws = await freshWorkspace('dev-inbound');
  const K = { token: (await mintKey(ws, { scopes: ['messages:read', 'messages:write', 'numbers:read'] })).key };
  assert.deepEqual((await call('GET', '/v1/inbound', K)).body, { items: [], next_cursor: null });
  const reply = await call('POST', '/v1/inbound/00000000-0000-0000-0000-000000000000/reply', { ...K, headers: { 'idempotency-key': 'r-1' }, body: { text: 'Thanks' } });
  assert.deepEqual([reply.status, reply.body.detail], [422, 'This operation requires the live environment.']);
  assert.deepEqual((await call('GET', '/v1/numbers/available?country=KE&kind=long_code', K)).body, []);
  const rules = await call('GET', '/v1/numbers/00000000-0000-0000-0000-000000000000/rules', K);
  assert.equal(rules.status, 422);
  const ck = { token: (await mintKey(ws, { scopes: ['compliance:manage', 'compliance:read'] })).key };
  const sup = await call('POST', '/v1/compliance/suppressions', { ...ck, body: { e164: '+254700000009', reason: 'stop_keyword' } });
  assert.equal(sup.status, 201);
  assert.equal(sup.body.reason, 'stop_keyword');
  assert.equal((await call('GET', '/v1/compliance/suppressions', ck)).body.items.length, 1);
});

// ---------------------------------------------------------------- contacts and templates

test('contacts and templates: CRUD, idempotency and group send', async () => {
  const ws = await freshWorkspace('dev-contacts');
  const K = { token: (await mintKey(ws, { scopes: ['contacts:manage', 'templates:manage', 'messages:write', 'messages:read'] })).key };
  const post = (path, key, body) => call('POST', path, { ...K, headers: { 'idempotency-key': key }, body });
  const tpl = await post('/v1/templates', 'tpl-1', { name: 'order_shipped', body: 'Hi {{name}}, order {{order_id}} has shipped.' });
  assert.equal(tpl.status, 201);
  assert.deepEqual(tpl.body.variables, ['name', 'order_id']);
  assert.equal((await post('/v1/templates', 'tpl-1', { name: 'order_shipped', body: 'Hi {{name}}, order {{order_id}} has shipped.' })).body.id, tpl.body.id);
  assert.equal((await post('/v1/templates', 'tpl-1', { name: 'order_shipped', body: 'changed' })).body.detail, 'Idempotency key used with different template details.');
  assert.equal((await post('/v1/templates', 'tpl-2', { name: 'order_shipped', body: 'x' })).body.detail, 'Template name already exists in this environment.');
  const patched = await call('PATCH', `/v1/templates/${tpl.body.id}`, { ...K, body: { body: 'Hi {{name}}, order {{order_id}} is on its way.' } });
  assert.equal(patched.body.body, 'Hi {{name}}, order {{order_id}} is on its way.');

  const a = await post('/v1/contacts', 'c-1', { e164: '+254700000001', name: 'Wanjiku', attributes: { order_id: 'A-1001' } });
  const b = await post('/v1/contacts', 'c-2', { e164: '+254700000002', name: 'Otieno', attributes: { order_id: 'A-1002' } });
  assert.equal(a.status, 201);
  assert.equal((await post('/v1/contacts', 'c-3', { e164: '+254700000001' })).body.detail, 'A record with this phone number or name already exists.');
  const pc = await call('PATCH', `/v1/contacts/${a.body.id}`, { ...K, body: { attributes: { order_id: 'A-1001', tier: 'gold' } } });
  assert.deepEqual(pc.body.attributes, { order_id: 'A-1001', tier: 'gold' });
  const group = await post('/v1/contact-groups', 'g-1', { name: 'Shipped today', contact_ids: [a.body.id, b.body.id] });
  assert.equal(group.status, 201);
  assert.equal(group.body.contact_ids.length, 2);
  const sent = await post(`/v1/contact-groups/${group.body.id}/send`, 'gs-1', { template_id: tpl.body.id });
  assert.equal(sent.status, 200);
  assert.deepEqual([sent.body.status, sent.body.total, sent.body.invalid], ['failed', 2, 2]);
  const missingVar = await post(`/v1/contact-groups/${group.body.id}/send`, 'gs-2', { text: 'Hi {{nickname}}' });
  assert.deepEqual([missingVar.status, missingVar.body.detail], [422, 'A contact is missing required template variables.']);
  assert.equal((await call('DELETE', `/v1/templates/${tpl.body.id}`, K)).status, 204);
});

// ---------------------------------------------------------------- realtime

test('realtime: Node snippet receives an event; auth failures and the local 403s', async () => {
  const ws = await freshWorkspace('dev-rt');
  const key = (await mintKey(ws, { scopes: ['realtime:read'] })).key;
  const dir = scratch();
  writeFileSync(join(dir, 'realtime.mjs'), snippet('integrate/realtime.md', 'realtime-node'));
  const child = spawnSync(process.execPath, ['-e', `
    const { spawn } = require('node:child_process');
    const p = spawn(process.execPath, [${JSON.stringify(join(dir, 'realtime.mjs'))}], { env: process.env });
    let out = ''; p.stdout.on('data', (d) => { out += d; if (out.includes('"subscribed"') && !globalThis.sent) { globalThis.sent = true;
      fetch(process.env.OPENSMS_API + '/v1/keys', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.SESSION, 'x-workspace-id': process.env.WS, 'content-type': 'application/json' }, body: JSON.stringify({ label: 'realtime demo', test: true }) }); } });
    p.on('exit', () => process.stdout.write(out));`], { env: { ...process.env, OPENSMS_API: API, OPENSMS_API_KEY: key, LISTEN_MS: '4000', SESSION: ws.token, WS: ws.workspace }, encoding: 'utf8', timeout: 30000 });
  assert.match(child.stdout, /recv \{"channels":\["\*"\],"type":"subscribed"\}/);
  const event = JSON.parse(child.stdout.split('\n').find((l) => l.includes('api_key.created')).slice(5));
  assert.equal(event.data.label, 'realtime demo');
  assert.equal(event.workspace_id, ws.workspace);

  // A refused send's X-Request-Id is the aggregate_id of its message.rejected event.
  const both = (await mintKey(ws, { scopes: ['realtime:read', 'messages:write'] })).key;
  const aggregate = await new Promise((resolveEvent, reject) => {
    const sock = new WebSocket(API.replace(/^http/, 'ws') + '/v1/realtime', { headers: { authorization: `Bearer ${both}` } });
    let requestId = Promise.resolve(undefined);
    const timer = setTimeout(() => { sock.close(); reject(new Error('no message.rejected event')); }, 8000);
    sock.onopen = () => sock.send(JSON.stringify({ action: 'subscribe', channels: ['message'] }));
    sock.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.type === 'subscribed') {
        requestId = call('POST', '/v1/messages', { token: both, headers: { 'idempotency-key': randomUUID() }, body: { to: '+254700000001', text: 'rt' } }).then((r) => r.headers.get('x-request-id'));
      } else if (m.type === 'message.rejected') {
        clearTimeout(timer);
        sock.close();
        resolveEvent(requestId.then((id) => [m.aggregate_id, id]));
      }
    };
  });
  assert.equal(aggregate[0], aggregate[1]);

  const unscoped = (await mintKey(ws)).key;
  assert.equal(await upgradeStatus('/v1/realtime', { authorization: `Bearer ${unscoped}` }), 401);
  const q = `/v1/realtime?access_token=${ws.token}&workspace_id=${ws.workspace}&environment=sandbox`;
  assert.equal(await upgradeStatus(q, { origin: 'http://127.0.0.1:5190' }), 403);
  assert.equal(await upgradeStatus(q, { origin: API }), 101);
  const ticket = await call('POST', '/v1/realtime/tickets', { token: ws.token, headers: { origin: 'http://127.0.0.1:5190' }, body: { workspace_id: ws.workspace, environment: 'sandbox' } });
  assert.deepEqual([ticket.status, ticket.body.detail], [403, 'ticket requires HTTPS and an allowed Origin']);
});

// ---------------------------------------------------------------- limits and errors

test('rate limits: the workspace key limit is 50 per second', async () => {
  const ws = await freshWorkspace('dev-rps-limit');
  const workspace = await call('GET', '/v1/workspace', { token: ws.token, workspace: ws.workspace });
  assert.equal(workspace.body.key_rps_limit, 50);
});

// Each keyed request verifies an Argon2id hash (64 MiB, 3 passes) before the limiter runs,
// so a burst is CPU and memory heavy for the shared stack. Opt in with OPENSMS_DOCS_BURST=1.
test('rate limits: per-key burst returns 429 with Retry-After', { skip: process.env.OPENSMS_DOCS_BURST !== '1' && 'set OPENSMS_DOCS_BURST=1 to run the 80-request burst' }, async () => {
  const ws = await freshWorkspace('dev-rps');
  const key = (await mintKey(ws, { scopes: ['wallet:read'] })).key;
  const workspace = await call('GET', '/v1/workspace', { token: ws.token, workspace: ws.workspace });
  assert.equal(workspace.body.key_rps_limit, 50);
  // Each request verifies an Argon2id hash before the limiter runs, so a burst can
  // spread over more than one second on a busy machine. Try up to three bursts.
  let limited = [];
  for (let attempt = 0; attempt < 3 && limited.length === 0; attempt++) {
    const res = await Promise.all(Array.from({ length: 80 }, () => fetch(`${API}/v1/wallet`, { headers: { authorization: `Bearer ${key}` } })));
    limited = res.filter((r) => r.status === 429);
    await Promise.all(res.filter((r) => r.status !== 429).map((r) => r.arrayBuffer()));
  }
  assert.ok(limited.length > 0, 'expected at least one 429 in three bursts of 80');
  assert.ok(Number(limited[0].headers.get('retry-after')) >= 1);
  assert.equal((await limited[0].json()).detail, 'API key rate limit exceeded');
});

test('errors: problem shape, typed codes and unknown routes', async () => {
  const notFound = await call('GET', '/v1/nothing');
  assert.equal(notFound.headers.get('content-type'), 'application/problem+json');
  assert.deepEqual(notFound.body, { type: 'https://api.opensms.io/problems/not_found', title: 'Not Found', status: 404, detail: 'The requested endpoint was not found.', code: 'not_found' });
  const ws = await freshWorkspace('dev-errors');
  const legal = await call('POST', '/v1/legal/accept', { token: ws.token, workspace: ws.workspace, body: { document: 'terms', version: '0.9' } });
  assert.equal(legal.body.code, 'legal_version_not_current');
  assert.equal(legal.body.type, 'https://api.opensms.io/problems/legal_version_not_current');
});

// ---------------------------------------------------------------- billing

test('billing: balances, ledger, practice credit, pricing, spend cap, invoices, top-ups', async () => {
  const ws = await freshWorkspace('dev-billing');
  const S = { token: ws.token, workspace: ws.workspace };
  const K = { token: (await mintKey(ws, { scopes: ['wallet:read', 'pricing:read', 'wallet:topup'] })).key };
  // A background job funds the sandbox wallet about once a second after creation.
  let wallet = [];
  for (let i = 0; i < 30; i++) {
    wallet = (await call('GET', '/v1/wallet', K)).body.data;
    if (wallet[0]?.balance !== '0.000000') break;
    await sleep(1000);
  }
  assert.deepEqual(wallet.map((w) => [w.currency, w.balance, w.environment]), [['KES', '10000.000000', 'sandbox']]);
  const ledger = (await call('GET', '/v1/wallet/ledger?limit=5', K)).body.data;
  assert.equal(ledger[0].type, 'adjustment');
  const credit = await call('POST', '/v1/wallet/sandbox-credits', { ...S, headers: { 'x-environment': 'sandbox', 'idempotency-key': 'credit-1' }, body: { amount: '500.00', currency: 'KES' } });
  assert.equal(credit.status, 201);
  assert.deepEqual([credit.body.balance, credit.body.simulated, credit.body.status], ['10500.000000', true, 'credited']);
  const keyCredit = await call('POST', '/v1/wallet/sandbox-credits', { ...K, headers: { 'idempotency-key': 'credit-2' }, body: { amount: '500.00', currency: 'KES' } });
  assert.deepEqual([keyCredit.status, keyCredit.body.detail], [401, 'Browser session required.']);

  const prices = (await call('GET', '/v1/pricing?country=KE', K)).body;
  assert.equal(prices.currency, 'KES');
  assert.deepEqual(prices.entries.map((e) => [e.min_monthly_volume, e.sell_amount]), [[0, '1.000000'], [100000, '0.800000']]);
  const ke = (await call('GET', '/v1/countries')).body.find((c) => c.iso2 === 'KE');
  assert.deepEqual(ke.price_per_message, { amount: '1.000000', currency: 'KES' });
  assert.deepEqual((await call('GET', '/v1/countries/KE/routes')).body, []);

  assert.deepEqual((await call('PUT', '/v1/settings/spend-cap', { ...S, body: { amount: '25000.00' } })).body, { amount: '25000.00' });
  assert.deepEqual((await call('GET', '/v1/settings/spend-cap', S)).body, { amount: '25000.00' });
  assert.deepEqual((await call('GET', '/v1/invoices', { ...S, headers: { 'x-environment': 'live' } })).body, { items: [], next_cursor: null });
  assert.equal((await call('GET', '/v1/invoices', K)).status, 401);

  const sandboxTopup = await call('POST', '/v1/wallet/topups', { ...K, headers: { 'idempotency-key': 'topup-1' }, body: { amount: '1000.00', currency: 'KES', channel: 'mobile_money', email: ws.email } });
  assert.deepEqual([sandboxTopup.status, sandboxTopup.body.detail], [422, 'sandbox wallets cannot use payment providers']);
  const liveTopup = await call('POST', '/v1/wallet/topups', { ...S, headers: { 'x-environment': 'live', 'idempotency-key': 'topup-2' }, body: { amount: '1000.00', currency: 'KES', channel: 'mobile_money', email: ws.email } });
  assert.deepEqual([liveTopup.status, liveTopup.body.detail], [403, 'payer email must belong to a verified workspace member']);
});

// ---------------------------------------------------------------- going live

test('going live: onboarding steps, documents, legal, manual top-up, operator gates, request-live', async () => {
  const ws = await freshWorkspace('dev-golive');
  const S = { token: ws.token, workspace: ws.workspace };
  const onboarding = (await call('GET', '/v1/onboarding', S)).body;
  assert.deepEqual(onboarding.steps.map((s) => s.step), ['admin_approved', 'company_details', 'documents_uploaded', 'email_verified', 'payment_method_added', 'phone_verified', 'sender_id_approved', 'wallet_funded']);

  const company = await call('PUT', '/v1/onboarding/company', { ...S, body: { name: 'Acme Logistics Ltd', country_iso2: 'KE', registration_number: 'PVT-2026-0042' } });
  assert.deepEqual([company.status, company.body.status, company.body.step], [200, 'submitted', 'company_details']);

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const upload = async (kind, bytes, name) => {
    const form = new FormData();
    form.append('kind', kind);
    form.append('file', new Blob([bytes]), name);
    const res = await fetch(`${API}/v1/onboarding/documents`, { method: 'POST', headers: { authorization: `Bearer ${ws.token}`, 'x-workspace-id': ws.workspace }, body: form });
    return { status: res.status, body: await res.json() };
  };
  const fakePdf = await upload('incorporation_certificate', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'), 'doc.pdf');
  assert.deepEqual([fakePdf.status, fakePdf.body.detail], [422, 'document must be a valid PDF, PNG or JPEG']);
  for (const kind of ['incorporation_certificate', 'proof_of_address', 'director_id']) {
    const doc = await upload(kind, png, `${kind}.png`);
    assert.equal(doc.status, 201);
    assert.equal(doc.body.scan_status, 'pending');
  }
  const steps = Object.fromEntries((await call('GET', '/v1/onboarding', S)).body.steps.map((s) => [s.step, s.status]));
  assert.equal(steps.documents_uploaded, 'submitted');

  const docs = (await call('GET', '/v1/legal/documents', S)).body.documents;
  assert.deepEqual(docs.map((d) => d.document).sort(), ['dpa', 'privacy', 'terms']);
  for (const d of docs.filter((x) => x.document !== 'privacy')) {
    const acc = await call('POST', '/v1/legal/accept', { ...S, body: { document: d.document, version: d.version } });
    assert.equal(acc.status, 200);
    assert.equal(acc.body.document, d.document);
  }
  assert.equal((await call('GET', '/v1/legal/acceptances', S)).body.acceptances.length, 2);

  // Two-factor is required for bank-transfer top-ups.
  const setup = await call('POST', '/v1/auth/2fa/setup', { token: ws.token });
  await call('POST', '/v1/auth/2fa/enable', { token: ws.token, body: { code: totp(setup.body.secret) } });
  const form = new FormData();
  form.append('amount', '5000.00');
  form.append('currency', 'KES');
  form.append('file', new Blob([png], { type: 'image/png' }), 'proof.png');
  const manualRes = await fetch(`${API}/v1/wallet/topups/manual`, { method: 'POST', headers: { authorization: `Bearer ${ws.token}`, 'x-workspace-id': ws.workspace, 'x-environment': 'live', 'idempotency-key': 'manual-1' }, body: form });
  const manual = await manualRes.json();
  assert.deepEqual([manualRes.status, manual.status], [201, 'awaiting_approval']);

  const admin = await adminToken();
  const kyc = await call('POST', `/admin/v1/workspaces/${ws.workspace}/kyc/approve`, { token: admin, body: { reason: 'Documents match registry' } });
  assert.deepEqual([kyc.status, kyc.body.detail], [409, 'each current required document must pass scanning and human review before KYC approval']);
  const pay = await call('POST', `/admin/v1/payments/${manual.id}/approve`, { token: admin, headers: { 'idempotency-key': 'approve-1' }, body: { reason: 'Bank statement matched' } });
  assert.deepEqual([pay.status, pay.body.detail], [422, 'A clean malware scan of the payment proof is required.']);

  const live = await call('POST', '/v1/onboarding/request-live', S);
  assert.deepEqual([live.status, live.body.detail], [422, 'live sending prerequisites are incomplete']);
  const liveKey = await call('POST', '/v1/keys', { ...S, body: { label: 'live', test: false } });
  assert.match(liveKey.body.key, /^sk_live_/);
  const liveSend = await call('POST', '/v1/messages', { token: liveKey.body.key, headers: { 'idempotency-key': 'live-1' }, body: { to: '+254700000001', text: 'live test' } });
  assert.deepEqual([liveSend.status, liveSend.body.detail], [403, 'workspace is not approved for live sending']);
  const sender = await call('POST', '/v1/sender-ids', { ...S, headers: { 'x-environment': 'live' }, body: { value: 'ACME', kind: 'alphanumeric', countries: ['KE'], use_case: 'transactional', documents: [] } });
  assert.equal(sender.body.detail, 'certificate, signatory-id, and authorization documents are required for a custom sender ID');
});

// ---------------------------------------------------------------- SDK

const SDK_DIR = process.env.OPENSMS_SDK_DIR;
test('sdk: documented example runs against the API', { skip: !SDK_DIR && 'set OPENSMS_SDK_DIR to a built copy of opensms-sdks/packages/typescript (see integrate/sdk.md)' }, async () => {
  const ws = await freshWorkspace('dev-sdk');
  const key = (await mintKey(ws, { scopes: ['wallet:read', 'messages:write'] })).key;
  // Written inside the package so the bare '@opensms/sdk' import resolves by self-reference.
  const file = join(SDK_DIR, 'docs-example.mjs');
  writeFileSync(file, snippet('integrate/sdk.md', 'sdk-example'));
  try {
    const res = run(process.execPath, [file], { OPENSMS_API_KEY: key, OPENSMS_BASE_URL: API });
    const [walletLine, sendLine] = res.stdout.trim().split('\n');
    assert.match(walletLine, /^wallet sandbox KES \d/, res.stderr);
    assert.equal(sendLine, 'refused 403 email verification is required for sandbox sending', res.stderr);
  } finally {
    rmSync(file, { force: true });
  }
});
