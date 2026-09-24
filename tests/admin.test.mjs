// Operator console flows documented under admin/. Every request here is one the
// admin guides describe, run against the live API.
//
// Required: OPENSMS_ADMIN_EMAIL / OPENSMS_ADMIN_PASSWORD, a superadmin created with
//   opensms-admin --development-no-totp (no authenticator).
// Optional: OPENSMS_DOCS_OPERATORS, path to a JSON file describing operators created
//   with cmd/opensms-admin for the role and fresh-TOTP flows:
//     { "totp":    { "email", "password", "secret" },   // superadmin --with-totp
//       "ops":     { "email", "password" },             // --development-no-totp
//       "finance": { "email", "password" },
//       "support": { "email", "password" } }
//   Without it, tests that need those operators are skipped (and say so).
// Optional: DOCS_CAPTURE, a file path; every call is appended as JSON lines so the
//   examples in admin/*.md can be taken from a real run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { API, call as rawCall, freshWorkspace, adminToken } from './lib.mjs';

const operators = process.env.OPENSMS_DOCS_OPERATORS
  ? JSON.parse(readFileSync(process.env.OPENSMS_DOCS_OPERATORS, 'utf8'))
  : null;
const needOperators = operators ? false : 'set OPENSMS_DOCS_OPERATORS to run role and fresh-TOTP flows';

const redact = (v) => JSON.parse(JSON.stringify(v ?? null)
  .replace(/(sess_[A-Za-z]*_?)[A-Za-z0-9_-]{8,}/g, (m, p) => `${m.slice(0, p.length + 6)}...`)
  .replace(/(sk_(test|live)_)[A-Za-z0-9]{4,}/g, (m, p) => `${m.slice(0, p.length + 4)}...`));

async function call(label, method, path, opts = {}) {
  const res = await rawCall(method, path, opts);
  if (process.env.DOCS_CAPTURE) {
    appendFileSync(process.env.DOCS_CAPTURE, JSON.stringify({
      label, method, path, headers: opts.headers ?? {}, body: redact(opts.body), status: res.status, response: redact(res.body),
    }) + '\n');
  }
  return res;
}

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits), matching internal/auth/totp.go.
function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '')) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

async function upload(path, ws, fields, filename) {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\nstartxref\n0\n%%EOF\n');
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  fd.append('file', new Blob([pdf], { type: 'application/pdf' }), filename);
  const res = await fetch(API + path, { method: 'POST', headers: { authorization: `Bearer ${ws.token}`, 'x-workspace-id': ws.workspace, 'x-environment': 'live' }, body: fd });
  return { status: res.status, body: await res.json() };
}

const state = {};
const uniq = `${process.pid}${Date.now() % 100000}`;

test('operator login without an authenticator returns a session', async () => {
  const ok = await call('login', 'POST', '/admin/v1/login', { body: { email: process.env.OPENSMS_ADMIN_EMAIL, password: process.env.OPENSMS_ADMIN_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.match(ok.body.token, /^sess_/);
  assert.equal(ok.body.role, 'superadmin');
  assert.ok(ok.body.expires_at);
  state.admin = ok.body.token;
  // Wrong credentials are tried on an address that is not an operator: failed logins count
  // toward the 8-in-30-minutes lockout of the email they name, and the shared operator must
  // never be locked by a test run.
  const bad = await call('login-bad', 'POST', '/admin/v1/login', { body: { email: `not-an-operator-${uniq}@opensms.test`, password: 'wrong-password-123456' } });
  assert.equal(bad.status, 401);
});

test('operator login with an authenticator is two steps', { skip: needOperators }, async () => {
  const { email, password, secret } = operators.totp;
  const first = await call('login-totp', 'POST', '/admin/v1/login', { body: { email, password } });
  assert.equal(first.status, 202);
  assert.equal(first.body.challenge_type, 'admin_totp');
  assert.equal(first.body.next_path, '/admin/v1/auth/2fa/verify');
  const blocked = await call('challenge-not-a-session', 'GET', '/admin/v1/workspaces?limit=1', { token: first.body.challenge_token });
  assert.equal(blocked.status, 401);
  const verified = await call('verify-totp', 'POST', '/admin/v1/auth/2fa/verify', { token: first.body.challenge_token, body: { code: totp(secret) } });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.verified, true);
  // Re-verifying on an existing session refreshes the ten-minute factor window on that
  // same session: the token and the 12-hour expiry do not change (only the login
  // challenge is swapped for a new token).
  const again = await call('reverify-totp', 'POST', '/admin/v1/auth/2fa/verify', { token: verified.body.token, body: { code: totp(secret) } });
  assert.equal(again.status, 200);
  assert.equal(again.body.verified, true);
  assert.equal(again.body.token, verified.body.token, 'a re-verify keeps the same session token');
  assert.equal(again.body.expires_at, verified.body.expires_at, 'a re-verify does not extend the session');
  assert.notEqual(verified.body.token, first.body.challenge_token, 'the challenge is exchanged for a new session token');
  state.totp = again.body.token;
  state.totpAdminEmail = email;
  for (const role of ['ops', 'finance', 'support']) {
    const r = await rawCall('POST', '/admin/v1/login', { body: operators[role] });
    assert.equal(r.status, 200, `${role} login`);
    state[role] = r.body.token;
  }
});

test('customer sessions cannot use the admin API', async () => {
  const ws = await freshWorkspace('admin-guard');
  const res = await call('customer-denied', 'GET', '/admin/v1/workspaces', { token: ws.token });
  assert.equal(res.status, 403);
});

test('roles are enforced per endpoint', { skip: needOperators }, async () => {
  const expect = [
    ['support', 'GET', '/admin/v1/users?limit=1', 200],
    ['support', 'GET', '/admin/v1/workspaces?limit=1', 200],
    ['support', 'GET', '/admin/v1/routes', 200],
    ['support', 'GET', '/admin/v1/sender-ids/queue', 403],
    ['support', 'GET', '/admin/v1/incidents', 403],
    ['ops', 'GET', '/admin/v1/sender-ids/queue', 200],
    ['ops', 'GET', '/admin/v1/payments', 403],
    ['ops', 'GET', '/admin/v1/users?limit=1', 403],
    ['ops', 'GET', '/admin/v1/audit?limit=1', 403],
    ['finance', 'GET', '/admin/v1/payments', 200],
    ['finance', 'GET', '/admin/v1/settlement/provider-ledger', 200],
    ['finance', 'GET', '/admin/v1/compliance/held-messages', 403],
    ['finance', 'GET', '/admin/v1/admins', 403],
    ['support', 'GET', '/admin/v1/numbers', 403],
    ['finance', 'GET', '/admin/v1/numbers', 200],
    ['support', 'GET', '/admin/v1/pricing?limit=1', 200],
    ['support', 'GET', '/admin/v1/alerts', 403],
    ['ops', 'GET', '/admin/v1/broker/dead-letters', 200],
    ['finance', 'GET', '/admin/v1/broker/dead-letters', 403],
    ['finance', 'GET', '/admin/v1/reconciliation/lookups', 200],
    ['ops', 'GET', '/admin/v1/reconciliation/lookups', 403],
  ];
  for (const [role, method, path, status] of expect) {
    const r = await call(`role-${role}`, method, path, { token: state[role] });
    assert.equal(r.status, status, `${role} ${method} ${path}`);
  }
});

test('sender ID review: documents, reserved names and the platform decision', async (t) => {
  const ws = await freshWorkspace('admin-sender');
  state.senderWs = ws;
  const docs = [];
  for (const kind of ['certificate', 'signatory-id', 'authorization']) {
    const up = await upload('/v1/sender-documents', ws, { kind }, `${kind}.pdf`);
    assert.equal(up.status, 201);
    assert.equal(up.body.scan_status, 'pending');
    docs.push(up.body.id);
  }
  const created = await call('customer-sender-request', 'POST', '/v1/sender-ids', {
    token: ws.token, workspace: ws.workspace, headers: { 'x-environment': 'live' },
    body: { value: 'ACMECLINIC', kind: 'alphanumeric', use_case: 'transactional', sample_message: 'Your appointment is confirmed for 10:00.', countries: ['KE'], documents: docs },
  });
  assert.equal(created.status, 201);
  const id = created.body.id;

  const queue = await call('sender-queue', 'GET', '/admin/v1/sender-ids/queue', { token: state.admin });
  assert.equal(queue.status, 200);
  assert.ok(queue.body.some((s) => s.id === id && s.status === 'pending_admin'));
  const detail = await call('sender-detail', 'GET', `/admin/v1/sender-ids/${id}`, { token: state.admin });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.registrations[0].documents.sort(), [...docs].sort());
  const list = await call('sender-documents', 'GET', `/admin/v1/workspaces/${ws.workspace}/sender-documents`, { token: state.admin });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 3);

  // Scanning is a separate gate: an unscanned file cannot be downloaded or approved.
  const dl = await call('sender-document-download-unscanned', 'GET', `/admin/v1/workspaces/${ws.workspace}/sender-documents/${docs[0]}`, { token: state.admin });
  assert.equal(dl.status, 404);
  const approveDoc = await call('sender-document-approve-unscanned', 'POST', `/admin/v1/workspaces/${ws.workspace}/sender-documents/${docs[0]}/review`, { token: state.admin, body: { decision: 'approved' } });
  assert.equal(approveDoc.status, 409);
  const rejectDoc = await call('sender-document-reject', 'POST', `/admin/v1/workspaces/${ws.workspace}/sender-documents/${docs[2]}/review`, { token: state.admin, body: { decision: 'rejected', reason: 'Authorization letter is unsigned. Upload a signed copy.' } });
  assert.equal(rejectDoc.status, 204);
  const again = await call('sender-document-review-twice', 'POST', `/admin/v1/workspaces/${ws.workspace}/sender-documents/${docs[2]}/review`, { token: state.admin, body: { decision: 'approved' } });
  assert.equal(again.status, 409);

  // Platform decisions need an operator whose authenticator was verified in the last ten minutes.
  const noFactor = await call('sender-decision-no-totp', 'POST', `/admin/v1/sender-ids/${id}/decision`, { token: state.admin, body: { status: 'rejected', reason: 'Documents incomplete.' } });
  assert.equal(noFactor.status, 403);
  if (needOperators) { t.diagnostic(needOperators); return; }
  const approve = await call('sender-decision-approve-blocked', 'POST', `/admin/v1/sender-ids/${id}/decision`, { token: state.totp, body: { status: 'approved', reason: 'Brand matches certificate.' } });
  assert.equal(approve.status, 409);
  const reject = await call('sender-decision-reject', 'POST', `/admin/v1/sender-ids/${id}/decision`, { token: state.totp, body: { status: 'rejected', reason: 'The authorization letter is unsigned. Upload a signed letter and resubmit.' } });
  assert.equal(reject.status, 200);
  assert.deepEqual(reject.body, { id, status: 'rejected' });
  const seen = await call('customer-sender-after-reject', 'GET', `/v1/sender-ids/${id}`, { token: ws.token, workspace: ws.workspace, headers: { 'x-environment': 'live' } });
  assert.equal(seen.status, 200);
  assert.equal(seen.body.status, 'rejected');
  assert.match(seen.body.rejection_reason, /unsigned/);
  const submit = await call('sender-submit-not-approved', 'POST', `/admin/v1/sender-ids/${id}/submit`, { token: state.totp, body: { reason: 'Queue provider registration.' } });
  assert.equal(submit.status, 409);
});

test('protected sender names block matching requests', async () => {
  const value = `DBANK${uniq.slice(-4)}`;
  const made = await call('reserved-create', 'POST', '/admin/v1/reserved-sender-ids', { token: state.admin, body: { value, reason: 'Regulated bank brand, needs proof of authorization', category: 'financial', status: 'active', country_iso2: 'KE' } });
  assert.equal(made.status, 201);
  const ws = await freshWorkspace('admin-reserved');
  const attempt = await call('customer-reserved-request', 'POST', '/v1/sender-ids', {
    token: ws.token, workspace: ws.workspace, headers: { 'x-environment': 'live' },
    body: { value: `${value.slice(0, 1)}-${value.slice(1)}`.toLowerCase(), kind: 'alphanumeric', use_case: 'transactional', countries: ['KE'], documents: [] },
  });
  assert.equal(attempt.status, 409);
  const off = await call('reserved-update', 'PATCH', `/admin/v1/reserved-sender-ids/${made.body.id}`, { token: state.admin, body: { value, reason: 'Regulated bank brand, needs proof of authorization', category: 'financial', status: 'inactive', country_iso2: 'KE' } });
  assert.equal(off.status, 200);
  assert.equal(off.body.status, 'inactive');
  const del = await call('reserved-delete', 'DELETE', `/admin/v1/reserved-sender-ids/${made.body.id}`, { token: state.admin });
  assert.equal(del.status, 204);
  if (!needOperators) {
    const ops = await call('reserved-create-ops', 'POST', '/admin/v1/reserved-sender-ids', { token: state.ops, body: { value: `${value}X`, reason: 'ops cannot add protected names', category: 'other', status: 'active' } });
    assert.equal(ops.status, 403);
  }
});

test('KYC review and the live-access gates', async () => {
  const ws = await freshWorkspace('admin-kyc');
  const co = await call('customer-company', 'PUT', '/v1/onboarding/company', { token: ws.token, workspace: ws.workspace, body: { name: 'Acme Clinic Ltd', country_iso2: 'KE', registration_number: 'PVT-2026-0099' } });
  assert.equal(co.status, 200);
  const docs = [];
  for (const kind of ['incorporation_certificate', 'proof_of_address', 'director_id']) {
    const up = await upload('/v1/onboarding/documents', ws, { kind }, `${kind}.pdf`);
    assert.equal(up.status, 201);
    docs.push(up.body.id);
  }
  const detail = await call('workspace-detail', 'GET', `/admin/v1/workspaces/${ws.workspace}`, { token: state.admin });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.kyc_status, 'submitted');
  assert.equal(detail.body.live_status, 'sandbox');
  const list = await call('workspace-documents', 'GET', `/admin/v1/workspaces/${ws.workspace}/documents`, { token: state.admin });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 3);
  const approveDoc = await call('kyc-document-approve-unscanned', 'POST', `/admin/v1/workspaces/${ws.workspace}/documents/${docs[0]}/review`, { token: state.admin, body: { decision: 'approved' } });
  assert.equal(approveDoc.status, 409);
  const approve = await call('kyc-approve-blocked', 'POST', `/admin/v1/workspaces/${ws.workspace}/kyc/approve`, { token: state.admin, body: {} });
  assert.equal(approve.status, 409);
  const live = await call('live-from-sandbox', 'PUT', `/admin/v1/workspaces/${ws.workspace}`, { token: state.admin, body: { live_status: 'live', reason: 'Checks complete.' } });
  assert.equal(live.status, 409);
  const reject = await call('kyc-reject', 'POST', `/admin/v1/workspaces/${ws.workspace}/kyc/reject`, { token: state.admin, body: { reason: 'Proof of address is older than three months. Upload a recent utility bill.' } });
  assert.equal(reject.status, 204);
  const after = await call('workspace-after-kyc-reject', 'GET', `/admin/v1/workspaces/${ws.workspace}`, { token: state.admin });
  assert.equal(after.body.kyc_status, 'rejected');
  const onboarding = await call('customer-onboarding-after-reject', 'GET', '/v1/onboarding', { token: ws.token, workspace: ws.workspace });
  assert.equal(onboarding.status, 200);
  const wsList = await call('workspaces-search', 'GET', `/admin/v1/workspaces?limit=5`, { token: state.admin });
  assert.equal(wsList.status, 200);
  const msgs = await call('workspace-messages', 'GET', `/admin/v1/workspaces/${ws.workspace}/messages?limit=5`, { token: state.admin });
  assert.equal(msgs.status, 200);
  const ledger = await call('workspace-ledger', 'GET', `/admin/v1/workspaces/${ws.workspace}/ledger?limit=5`, { token: state.admin });
  assert.equal(ledger.status, 200);
});

test('pricing: preview a margin and import a workspace price', async (t) => {
  const preview = await call('pricing-preview', 'POST', '/admin/v1/pricing/preview-margin', { token: state.admin, body: { cost_amount: '0.62', sell_amount: '0.95', currency: 'KES' } });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.basis, 'quoted_preview');
  const list = await call('pricing-list', 'GET', '/admin/v1/pricing?limit=3', { token: state.admin });
  assert.equal(list.status, 200);
  const ke = list.body.find((p) => p.country_iso2 === 'KE');
  assert.ok(ke, 'a Kenya price exists');
  const ws = await freshWorkspace('admin-pricing');
  const csv = `country_id,workspace_id,product,markup_type,markup_value,sell_currency,effective_from,reason\n${ke.country_id},${ws.workspace},sms,absolute_price,0.85,KES,${new Date().toISOString().replace(/\.\d+Z$/, 'Z')},Negotiated rate for annual contract\n`;
  const form = () => { const fd = new FormData(); fd.append('file', new Blob([csv], { type: 'text/csv' }), 'prices.csv'); fd.append('reason', 'Negotiated rate for annual contract'); return fd; };
  const post = async (token, key) => {
    const res = await fetch(API + '/admin/v1/pricing/import', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'idempotency-key': key }, body: form() });
    const body = await res.json();
    if (process.env.DOCS_CAPTURE) appendFileSync(process.env.DOCS_CAPTURE, JSON.stringify({ label: 'pricing-import', method: 'POST', path: '/admin/v1/pricing/import', headers: { 'idempotency-key': key }, body: csv, status: res.status, response: body }) + '\n');
    return { status: res.status, body };
  };
  const denied = await post(state.admin, `docs-price-${uniq}-a`);
  assert.equal(denied.status, 403, 'imports need an enrolled authenticator verified in the last ten minutes');
  if (needOperators) { t.diagnostic(needOperators); return; }
  const ok = await post(state.totp, `docs-price-${uniq}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.imported, 1);
  assert.equal(ok.body.replayed, false);
  const replay = await post(state.totp, `docs-price-${uniq}`);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  const seen = await call('customer-pricing-override', 'GET', '/v1/pricing?country=KE', { token: ws.token, workspace: ws.workspace, headers: { 'x-environment': 'sandbox' } });
  assert.equal(seen.status, 200);
  const mine = seen.body.entries.find((e) => e.workspace_override);
  assert.ok(mine, 'workspace override is visible to the customer');
  assert.equal(mine.sell_amount, '0.850000');
  if (!needOperators) {
    const fin = await fetch(API + '/admin/v1/pricing/import', { method: 'POST', headers: { authorization: `Bearer ${state.ops}`, 'idempotency-key': `docs-price-${uniq}-ops` }, body: form() });
    assert.equal(fin.status, 403, 'ops cannot import prices');
  }
});

test('payments: manual transfer queue and wallet adjustment', async () => {
  const queue = await call('payments-queue', 'GET', '/admin/v1/payments', { token: state.admin });
  assert.equal(queue.status, 200);
  assert.ok(Array.isArray(queue.body.items));
  const missing = await call('payment-approve-unknown', 'POST', '/admin/v1/payments/00000000-0000-4000-8000-000000000000/approve', { token: state.admin, headers: { 'idempotency-key': `docs-pay-${uniq}` }, body: { reason: 'Bank receipt matched' } });
  assert.equal(missing.status, 404);
  // Transfers submitted from a sandbox workspace's live wallet sit here with a pending
  // scan on the docs stack (scanner off); approval must refuse them.
  const unscanned = queue.body.items.find((p) => p.status === 'awaiting_approval' && p.proof_scan_status !== 'clean');
  if (unscanned) {
    const refused = await call('payment-approve-unscanned', 'POST', `/admin/v1/payments/${unscanned.id}/approve`, { token: state.admin, headers: { 'idempotency-key': `docs-pay-scan-${uniq}` }, body: { reason: 'Bank receipt matched' } });
    assert.deepEqual([refused.status, refused.body.detail], [422, 'A clean malware scan of the payment proof is required.']);
  }
  const reviews = await call('payment-reviews', 'GET', '/admin/v1/payment-reviews', { token: state.admin });
  assert.equal(reviews.status, 200);
  // The console's wallet adjustment form posts here, but the API has no such route.
  const ws = await freshWorkspace('admin-wallet');
  const adjust = await call('wallet-adjust-missing', 'POST', `/admin/v1/workspaces/${ws.workspace}/wallet/adjust`, { token: state.admin, body: { amount: '25.00', reason: 'Goodwill credit' } });
  assert.equal(adjust.status, 404);
});

test('catalogue: country, carrier, provider and a disabled route', async () => {
  const countries = await call('countries-list', 'GET', '/admin/v1/countries', { token: state.admin });
  assert.equal(countries.status, 200);
  const ke = countries.body.find((c) => c.iso2 === 'KE');
  const bad = await call('country-create-invalid', 'POST', '/admin/v1/countries', { token: state.admin, body: { iso2: 'ke', name: 'Kenya', dial_code: '254', currency: 'KES', timezone: 'Africa/Nairobi' } });
  assert.equal(bad.status, 400);
  // The console's Add country form sends no timezone, which the API requires.
  const noTz = await call('country-create-no-timezone', 'POST', '/admin/v1/countries', { token: state.admin, body: { iso2: 'ZZ', name: 'Docs Test Land', dial_code: '+999', currency: 'KES', status: 'coming_soon', vat_percent: 0 } });
  assert.equal(noTz.status, 400);
  // Re-saving a country's current VAT changes nothing customers see but exercises the edit path.
  const rw = countries.body.find((c) => c.iso2 === 'RW');
  const edit = await call('country-update', 'PATCH', `/admin/v1/countries/${rw.id}`, { token: state.admin, body: { vat_percent: String(rw.vat_percent) } });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.iso2, 'RW');
  const carrier = await call('carrier-create', 'POST', '/admin/v1/carriers', { token: state.admin, body: { country_id: ke.id, name: `Docs Carrier ${uniq}`, prefixes: [], mcc_mnc: [] } });
  assert.equal(carrier.status, 201);
  const carrierPatch = await call('carrier-update', 'PATCH', `/admin/v1/carriers/${carrier.body.id}`, { token: state.admin, body: { name: `Docs Carrier ${uniq} (renamed)` } });
  assert.equal(carrierPatch.status, 200);
  const provider = await call('provider-create', 'POST', '/admin/v1/providers', { token: state.admin, body: { slug: `docs-provider-${uniq}`, name: `Docs Provider ${uniq}`, protocol: 'http', adapter: 'generic_http', status: 'pending_integration', dlr_supported: true, supports_alphanumeric: true, supports_numeric: true } });
  assert.equal(provider.status, 201);
  assert.equal(provider.body.status, 'pending_integration');
  state.provider = provider.body.id;
  const provDetail = await call('provider-detail', 'GET', `/admin/v1/providers/${provider.body.id}`, { token: state.admin });
  assert.equal(provDetail.status, 200);
  const provPatch = await call('provider-update', 'PATCH', `/admin/v1/providers/${provider.body.id}`, { token: state.admin, body: { onboarding_notes: 'Waiting for sandbox credentials from the account manager.' } });
  assert.equal(provPatch.status, 200);
  const testSendInvalid = await call('provider-test-send-invalid', 'POST', `/admin/v1/providers/${provider.body.id}/test-send`, { token: state.admin, body: {} });
  assert.deepEqual([testSendInvalid.status, testSendInvalid.body.detail], [400, 'to_e164 must be a valid E.164 destination for the controlled test handset.']);
  const testSend = await call('provider-test-send', 'POST', `/admin/v1/providers/${provider.body.id}/test-send`, { token: state.admin, body: { to_e164: '+254700000001', text: 'Route check' } });
  assert.equal(testSend.status, 501, 'direct provider test sending is not implemented');
  const route = await call('route-create', 'POST', '/admin/v1/routes', { token: state.admin, body: { provider_id: provider.body.id, country_id: ke.id, priority: 900, weight: 50 } });
  assert.equal(route.status, 201);
  assert.equal(route.body.enabled, false);
  const cost = await call('route-cost', 'POST', `/admin/v1/routes/${route.body.id}/costs`, { token: state.admin, body: { cost_amount: '0.45', cost_currency: 'KES', confidence: 'quote' } });
  assert.equal(cost.status, 201);
  const history = await call('route-cost-history', 'GET', `/admin/v1/routes/${route.body.id}/cost-history`, { token: state.admin });
  assert.equal(history.status, 200);
  assert.equal(history.body.length, 1);
  const patch = await call('route-update', 'PATCH', `/admin/v1/routes/${route.body.id}`, { token: state.admin, body: { weight: 25 } });
  assert.equal(patch.status, 200);
  const pin = await call('route-health-override', 'PUT', `/admin/v1/routes/${route.body.id}/health-override`, { token: state.admin, body: { status: 'down' } });
  assert.equal(pin.status, 200);
  const unpin = await call('route-health-auto', 'PUT', `/admin/v1/routes/${route.body.id}/health-override`, { token: state.admin, body: { status: null } });
  assert.equal(unpin.status, 200);
  const hh = await call('route-health-history', 'GET', `/admin/v1/routes/${route.body.id}/health-history`, { token: state.admin });
  assert.equal(hh.status, 200);
});

test('incidents: publish, update and resolve', async () => {
  const key = `docs-incident-${uniq}`;
  const made = await call('incident-create', 'POST', '/admin/v1/incidents', { token: state.admin, headers: { 'idempotency-key': key }, body: { title: 'Docs drill: delayed receipts on test route', severity: 'sev3', status: 'investigating', body: 'We are investigating delayed delivery receipts.', reason: 'Documentation drill, resolved immediately' } });
  assert.equal(made.status, 201);
  const replay = await call('incident-create-replay', 'POST', '/admin/v1/incidents', { token: state.admin, headers: { 'idempotency-key': key }, body: { title: 'Docs drill: delayed receipts on test route', severity: 'sev3', status: 'investigating', body: 'We are investigating delayed delivery receipts.', reason: 'Documentation drill, resolved immediately' } });
  assert.equal(replay.body.id, made.body.id);
  const resolved = await call('incident-resolve', 'PATCH', `/admin/v1/incidents/${made.body.id}`, { token: state.admin, headers: { 'idempotency-key': `${key}-r` }, body: { status: 'resolved', body: 'Receipts are flowing normally again.', reason: 'Drill complete' } });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'resolved');
  const reopen = await call('incident-reopen', 'PATCH', `/admin/v1/incidents/${made.body.id}`, { token: state.admin, headers: { 'idempotency-key': `${key}-o` }, body: { status: 'investigating', reason: 'Try to reopen' } });
  assert.equal(reopen.status, 409);
});

test('notifications: alert rules and the operator inbox', async () => {
  const catalog = await call('alerts-catalog', 'GET', '/admin/v1/alerts/catalog', { token: state.admin });
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.events['sender_id.requested']);
  const me = catalog.body.current_admin_id;
  const rule = await call('alert-rule-create', 'POST', '/admin/v1/alerts', { token: state.admin, body: { event: 'sender_id.requested', channel: 'in_app', target: me, enabled: true, reason: 'Review new sender applications quickly' } });
  assert.equal(rule.status, 201);
  const rules = await call('alert-rules', 'GET', '/admin/v1/alerts', { token: state.admin });
  assert.ok(rules.body.some((r) => r.id === rule.body.id));
  const inbox = await call('alerts-inbox', 'GET', '/admin/v1/alerts/inbox?limit=5', { token: state.admin });
  assert.equal(inbox.status, 200);
  const email = await call('alert-rule-email-unverified', 'POST', '/admin/v1/alerts', { token: state.admin, body: { event: 'sender_id.requested', channel: 'email', target: me, enabled: true, reason: 'Email me too please' } });
  assert.equal(email.status, 422);
  const del = await call('alert-rule-delete', 'DELETE', `/admin/v1/alerts/${rule.body.id}`, { token: state.admin, body: { reason: 'Docs run cleanup' } });
  assert.equal(del.status, 204);

  // A rule only matches events after it was saved; the worker fills the inbox on its next pass.
  const watch = await call('alert-rule-workspace-created', 'POST', '/admin/v1/alerts', { token: state.admin, body: { event: 'workspace.created', channel: 'in_app', target: me, enabled: true, reason: 'Watch new customer sign-ups' } });
  assert.equal(watch.status, 201);
  const ws = await freshWorkspace('admin-alert');
  let item;
  for (let i = 0; i < 30 && !item; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const page = await rawCall('GET', '/admin/v1/alerts/inbox?status=unacknowledged&limit=50', { token: state.admin });
    item = page.body.items.find((x) => x.workspace_id === ws.workspace);
  }
  assert.ok(item, 'in-app notification delivered within 60 seconds');
  const ack = await call('alerts-inbox-ack', 'POST', `/admin/v1/alerts/inbox/${item.id}/ack`, { token: state.admin, body: {} });
  assert.equal(ack.status, 200);
  const cleanup = await call('alert-rule-delete-2', 'DELETE', `/admin/v1/alerts/${watch.body.id}`, { token: state.admin, body: { reason: 'Docs run cleanup' } });
  assert.equal(cleanup.status, 204);
  if (!needOperators) {
    const support = await call('alerts-support', 'GET', '/admin/v1/alerts', { token: state.support });
    assert.equal(support.status, 403);
  }
});

test('customer users: lock, force logout, ban and unban', async (t) => {
  const ws = await freshWorkspace('admin-users');
  const found = await call('users-search', 'GET', `/admin/v1/users?email=${encodeURIComponent(ws.email)}`, { token: state.admin });
  assert.equal(found.status, 200);
  assert.equal(found.body.items.length, 1);
  const id = found.body.items[0].id;
  const detail = await call('user-detail', 'GET', `/admin/v1/users/${id}`, { token: state.admin });
  assert.equal(detail.status, 200);
  const noFactor = await call('user-lock-no-totp', 'POST', `/admin/v1/users/${id}/force-logout`, { token: state.admin, body: { reason: 'Suspicious sign-in reported' } });
  assert.equal(noFactor.status, 403);
  if (needOperators) { t.diagnostic(needOperators); return; }
  const logout = await call('user-force-logout', 'POST', `/admin/v1/users/${id}/force-logout`, { token: state.totp, body: { reason: 'Suspicious sign-in reported by the customer' } });
  assert.equal(logout.status, 204);
  const old = await rawCall('GET', '/v1/me', { token: ws.token });
  assert.equal(old.status, 401, 'existing customer sessions are revoked');
  const ban = await call('user-ban', 'POST', `/admin/v1/users/${id}/ban`, { token: state.totp, body: { reason: 'Account used to send fraudulent messages.' } });
  assert.equal(ban.status, 204);
  const suspended = await call('workspace-after-ban', 'GET', `/admin/v1/workspaces/${ws.workspace}`, { token: state.admin });
  assert.equal(suspended.body.live_status, 'suspended');
  const unban = await call('user-unban', 'POST', `/admin/v1/users/${id}/unban`, { token: state.totp, body: { reason: 'Investigation closed, no fraud found.' } });
  assert.equal(unban.status, 204);
  const history = await call('user-access-history', 'GET', `/admin/v1/users/${id}/access-history`, { token: state.support });
  assert.equal(history.status, 200);
  assert.equal(history.body.items.length, 2);
  const restore = await call('workspace-restore-sandbox', 'PUT', `/admin/v1/workspaces/${ws.workspace}`, { token: state.ops, body: { live_status: 'sandbox', reason: 'Owner unbanned after review' } });
  assert.equal(restore.status, 200);
  const supportLock = await call('user-lock-support', 'POST', `/admin/v1/users/${id}/lock`, { token: state.support, body: { reason: 'support cannot lock' } });
  assert.equal(supportLock.status, 403);
});

test('admins: list, invite and revoke', async (t) => {
  const list = await call('admins-list', 'GET', '/admin/v1/admins', { token: state.admin });
  assert.equal(list.status, 200);
  assert.ok(list.body.some((a) => a.email === process.env.OPENSMS_ADMIN_EMAIL));
  const denied = await call('admin-invite-no-totp', 'POST', '/admin/v1/admins/invite', { token: state.admin, body: { email: `docs-invitee-${uniq}@opensms.test`, role: 'support', reason: 'New support hire' } });
  assert.equal(denied.status, 403);
  if (needOperators) { t.diagnostic(needOperators); return; }
  const invite = await call('admin-invite', 'POST', '/admin/v1/admins/invite', { token: state.totp, body: { email: `docs-invitee-${uniq}@opensms.test`, role: 'support', reason: 'New support hire starting Monday' } });
  assert.equal(invite.status, 201);
  assert.equal(invite.body.delivery_status, 'pending');
  const dup = await call('admin-invite-duplicate', 'POST', '/admin/v1/admins/invite', { token: state.totp, body: { email: `docs-invitee-${uniq}@opensms.test`, role: 'support', reason: 'New support hire starting Monday' } });
  assert.equal(dup.status, 409);
  // The console's invite and remove forms send no reason; the API refuses both.
  const noReason = await call('admin-invite-no-reason', 'POST', '/admin/v1/admins/invite', { token: state.totp, body: { email: `docs-noreason-${uniq}@opensms.test`, role: 'support' } });
  assert.equal(noReason.status, 422);
  const removeNoReason = await call('admin-remove-no-reason', 'DELETE', '/admin/v1/admins/00000000-0000-4000-8000-000000000000', { token: state.totp });
  assert.equal(removeNoReason.status, 422);
  const removeMissing = await call('admin-remove-missing', 'DELETE', '/admin/v1/admins/00000000-0000-4000-8000-000000000000', { token: state.totp, body: { reason: 'Contract ended, access no longer needed' } });
  assert.equal(removeMissing.status, 404);
  const revoke = await call('admin-invite-revoke', 'DELETE', `/admin/v1/admins/invitations/${invite.body.id}`, { token: state.totp, body: { reason: 'Hire postponed' } });
  assert.equal(revoke.status, 204);
});

test('settlement: record provider invoice evidence', async () => {
  const token = operators ? state.finance : state.admin;
  const body = { provider_id: state.provider, period_start: '2026-08-01', period_end: '2026-09-01', amount: '1250.00', currency: 'KES', reason: 'August usage invoice from provider portal', evidence_reference: `INV-2026-08-${uniq}`, evidence_sha256: createHmac('sha256', 'docs').update(uniq).digest('hex') };
  const acct = await call('provider-account-put', 'PUT', `/admin/v1/providers/${state.provider}/account`, { token, body: { currency: 'KES', low_threshold: '500.00', balance_checks_enabled: false } });
  assert.equal(acct.status, 200);
  const made = await call('provider-invoice-create', 'POST', '/admin/v1/provider-invoices', { token, headers: { 'idempotency-key': `docs-inv-${uniq}` }, body });
  assert.equal(made.status, 201);
  assert.equal(made.body.reconciled, false);
  const replay = await call('provider-invoice-replay', 'POST', '/admin/v1/provider-invoices', { token, headers: { 'idempotency-key': `docs-inv-${uniq}` }, body });
  assert.equal(replay.body.id, made.body.id);
  const list = await call('provider-invoices', 'GET', `/admin/v1/provider-invoices?provider_id=${state.provider}&currency=KES&period_start=2026-08-01&period_end=2026-09-01`, { token });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
  if (operators) {
    const ops = await call('provider-invoice-ops', 'GET', `/admin/v1/provider-invoices?provider_id=${state.provider}&currency=KES&period_start=2026-08-01&period_end=2026-09-01`, { token: state.ops });
    assert.equal(ops.status, 403);
  }
});

test('audit log, legal documents and finance reads', async () => {
  const audit = await call('audit-list', 'GET', `/admin/v1/audit?limit=3&workspace_id=${state.senderWs.workspace}`, { token: state.admin });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.items.length > 0);
  const badFilter = await call('audit-bad-filter', 'GET', '/admin/v1/audit?action=x', { token: state.admin });
  assert.equal(badFilter.status, 400);
  const legal = await call('legal-list', 'GET', '/admin/v1/legal', { token: state.admin });
  assert.equal(legal.status, 200);
  for (const [label, path] of [
    ['settlement-ledger', '/admin/v1/settlement/provider-ledger'],
    ['settlement-invoices', '/admin/v1/settlement/invoices'],
    ['statements', '/admin/v1/statements'],
    ['auto-topup-intents', '/admin/v1/auto-topup-intents'],
    ['numbers', '/admin/v1/numbers'],
    ['file-scanning', '/admin/v1/operations/file-scanning'],
    ['held-messages', '/admin/v1/compliance/held-messages'],
    ['content-rules', '/admin/v1/compliance/content-rules'],
    ['quiet-hours', '/admin/v1/compliance/quiet-hours'],
    ['dlr-reviews', '/admin/v1/reconciliation/dlr-reviews'],
  ]) {
    const r = await call(label, 'GET', path, { token: state.admin });
    assert.equal(r.status, 200, `${label} ${JSON.stringify(r.body)}`);
  }
});


test('console payloads the API refuses (documented known issues)', async () => {
  // Add country form: no timezone.
  const country = await call('console-country-no-timezone', 'POST', '/admin/v1/countries', { token: state.admin, body: { iso2: 'ZZ', name: 'Docs Test', dial_code: '+999', currency: 'KES', vat_percent: '0', status: 'disabled' } });
  assert.equal(country.status, 400);
  assert.match(country.body.detail, /timezone/);
  // Provider detail form: null base_url and plain-text credentials.
  const provider = await call('console-provider-save', 'PATCH', `/admin/v1/providers/${state.provider}`, { token: state.admin, body: { status: 'pending_integration', base_url: null, adapter_config: {}, credentials: 'api-key-123' } });
  assert.equal(provider.status, 400);
  // Incident create dialog: no reason or body, server-owned timestamps (status resolved so nothing is ever public).
  const incident = await call('console-incident-create', 'POST', '/admin/v1/incidents', { token: state.admin, headers: { 'idempotency-key': `docs-ui-incident-${uniq}` }, body: { title: 'Console payload check', severity: 'sev3', status: 'resolved', country_ids: [], provider_ids: [], started_at: new Date().toISOString(), resolved_at: null } });
  assert.equal(incident.status, 400);
  // Legal publish form: no reason. Uses an existing version so nothing could be published.
  const legal = await call('console-legal-publish', 'POST', '/admin/v1/legal', { token: state.admin, body: { kind: 'terms', version: '1.0', url: 'https://opensms.io/legal/terms/1.0', published_at: new Date().toISOString() } });
  assert.equal(legal.status, 400);
  // Provider detail form: typed credentials go out as a plain string, even with a valid base URL.
  const creds = await call('console-provider-credentials-string', 'PATCH', `/admin/v1/providers/${state.provider}`, { token: state.admin, body: { status: 'pending_integration', base_url: 'https://api.provider.example/v1', adapter_config: {}, credentials: 'api-key-123' } });
  assert.deepEqual([creds.status, creds.body.detail], [400, 'credentials must be a nonempty object']);
  // Carrier form: codes typed in the placeholder's hyphenated format.
  const countries = await rawCall('GET', '/admin/v1/countries', { token: state.admin });
  const ke = countries.body.find((c) => c.iso2 === 'KE');
  const mcc = await call('console-carrier-mcc-hyphen', 'POST', '/admin/v1/carriers', { token: state.admin, body: { country_id: ke.id, name: `Docs placeholder ${uniq}`, prefixes: [], mcc_mnc: ['639-02'] } });
  assert.deepEqual([mcc.status, mcc.body.detail], [400, 'invalid operator code']);
  // Pricing Import CSV: the console uploads only the file (no reason field). Rows without their
  // own reason are refused before anything is imported.
  const fd = new FormData();
  fd.append('file', new Blob([`country_id,product,markup_type,markup_value,sell_currency,effective_from\n${ke.id},sms,absolute_price,0.85,KES,2026-01-01T00:00:00Z\n`], { type: 'text/csv' }), 'prices.csv');
  const res = await fetch(API + '/admin/v1/pricing/import', { method: 'POST', headers: { authorization: `Bearer ${state.admin}`, 'idempotency-key': `docs-ui-price-${uniq}` }, body: fd });
  assert.equal(res.status, 422, 'a console-shaped import without a reason is refused');
});

test('admin token helper from lib still works', async () => {
  assert.match(await adminToken(), /^sess_/);
});
