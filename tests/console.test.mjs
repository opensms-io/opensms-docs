// Checks every request, response and error message quoted in console/*.md against the
// running docs stack. The console guides are written for people using the web app, but
// every status they describe comes from one of these calls, so drift fails here first.
//
//   OPENSMS_ADMIN_EMAIL=... OPENSMS_ADMIN_PASSWORD=... node --test tests/console.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { API, adminToken, call, freshWorkspace } from './lib.mjs';

let n = 0;
const key = () => `console-docs-${process.pid}-${Date.now()}-${n++}`;

/** A call scoped to one workspace and environment, with an idempotency key on writes. */
function scoped(ws, env = 'sandbox') {
  return (method, path, body, headers = {}) => call(method, path, {
    token: ws.token, workspace: ws.workspace, body,
    headers: { 'x-environment': env, ...(method === 'GET' ? {} : { 'idempotency-key': key() }), ...headers },
  });
}

function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const k = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', k).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0');
}

async function upload(ws, path, fields, file) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (k !== '__env') fd.append(k, v);
  fd.append('file', new Blob([file.body], { type: file.type }), file.name);
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${ws.token}`, 'x-workspace-id': ws.workspace, 'x-environment': fields.__env ?? 'sandbox', 'idempotency-key': key() },
    body: fd,
  });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, body };
}

/** A small but well-formed PDF (with a correct cross-reference table), which the API's file checks accept. */
function makePdf(text) {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    null,
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
  ];
  const stream = `BT /F1 18 Tf 72 760 Td (${text}) Tj ET`;
  objs[3] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const MINI_PDF = makePdf('SAMPLE document for the OpenSMS guides');

test('overview: analytics need an environment and start empty', async () => {
  const ws = await freshWorkspace('console-overview');
  const bare = await call('GET', '/v1/analytics/overview?range=30d', { token: ws.token, workspace: ws.workspace });
  assert.equal(bare.status, 400);
  assert.equal(bare.body.detail, 'X-Environment must be live or sandbox');
  const api = scoped(ws);
  const o = await api('GET', '/v1/analytics/overview?range=30d');
  assert.equal(o.status, 200);
  assert.deepEqual([o.body.sent, o.body.delivered, o.body.failed, o.body.spend, o.body.currency, o.body.environment], [0, 0, 0, '0', 'KES', 'sandbox']);
  const ts = await api('GET', '/v1/analytics/timeseries?range=7d&bucket=day');
  assert.equal(ts.status, 200);
  assert.deepEqual(ts.body, []);
  for (const dim of ['by-country', 'by-carrier', 'by-sender-id']) {
    const r = await api('GET', `/v1/analytics/${dim}?range=30d`);
    assert.equal(r.status, 200, dim);
  }
});

test('billing: sandbox wallet, sandbox credits and their limits', async () => {
  const ws = await freshWorkspace('console-billing');
  const api = scoped(ws);
  // The daily reset job tops a new sandbox wallet up to 10,000 within seconds.
  let balance;
  for (let i = 0; i < 20; i += 1) {
    balance = (await api('GET', '/v1/wallet')).body.data[0].balance;
    if (balance === '10000.000000') break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(balance, '10000.000000');
  const add = await api('POST', '/v1/wallet/sandbox-credits', { amount: '250.00', currency: 'KES' });
  assert.equal(add.status, 201);
  assert.equal(add.body.simulated, true);
  assert.equal(add.body.status, 'credited');
  assert.equal(add.body.balance, '10250.000000');
  const tooMuch = await api('POST', '/v1/wallet/sandbox-credits', { amount: '20000.00', currency: 'KES' });
  assert.equal(tooMuch.status, 422);
  assert.equal(tooMuch.body.detail, 'Practice credit amount must be between 0.01 and 10,000.00.');
  const liveCredit = await scoped(ws, 'live')('POST', '/v1/wallet/sandbox-credits', { amount: '1.00', currency: 'KES' });
  assert.equal(liveCredit.status, 422);
  assert.equal(liveCredit.body.detail, 'Select the sandbox environment to add practice credits.');
  const ledger = await api('GET', '/v1/wallet/ledger?limit=5');
  assert.equal(ledger.body.data[0].type, 'adjustment');
  assert.equal(ledger.body.data[0].amount, '250.000000');
  // 250 already added today, so another 9,800 crosses the 10,000 daily limit.
  const overDaily = await api('POST', '/v1/wallet/sandbox-credits', { amount: '9800.00', currency: 'KES' });
  assert.equal(overDaily.status, 422);
  assert.equal(overDaily.body.detail, 'Daily practice credit limit is 10,000.00 across this workspace.');
});

test('billing: live funding cannot complete on the docs stack', async () => {
  const ws = await freshWorkspace('console-live-funding');
  const live = scoped(ws, 'live');
  const wallet = await live('GET', '/v1/wallet');
  assert.equal(wallet.body.data[0].environment, 'live');
  assert.equal(wallet.body.data[0].balance, '0.000000');
  const card = await live('POST', '/v1/wallet/topups', { amount: '1000', currency: 'KES', channel: 'card', email: ws.email });
  assert.equal(card.status, 403);
  assert.equal(card.body.detail, 'payer email must belong to a verified workspace member');
  const bank = await upload(ws, '/v1/wallet/topups/manual', { amount: '1000', currency: 'KES', __env: 'live' },
    { body: MINI_PDF, type: 'application/pdf', name: 'bank-slip.pdf' });
  assert.equal(bank.status, 403);
  assert.equal(bank.body.detail, 'Authorized membership and enabled two-factor authentication required.');
  for (const path of ['/v1/invoices', '/v1/payment-methods']) {
    const r = await live('GET', path);
    assert.equal(r.status, 200, path);
    assert.deepEqual(r.body.items, []);
  }
  const auto = await live('GET', '/v1/wallet/auto-topup');
  assert.equal(auto.body.enabled, false);
});

test('routes: six active markets, no provider routes, fallback toggle', async () => {
  const ws = await freshWorkspace('console-routes');
  const api = scoped(ws);
  const countries = await api('GET', '/v1/countries');
  assert.deepEqual(countries.body.filter((c) => c.status === 'active').map((c) => c.iso2).sort(), ['GB', 'GH', 'KE', 'NG', 'US', 'ZA']);
  const ke = await api('GET', '/v1/countries/KE/routes');
  assert.equal(ke.status, 200);
  assert.deepEqual(ke.body, []);
  assert.equal((await api('GET', '/v1/settings/routing')).body.allow_fallback, false);
  const on = await api('PUT', '/v1/settings/routing', { allow_fallback: true });
  assert.equal(on.status, 200);
  assert.equal(on.body.allow_fallback, true);
});

test('go live and verification: checklist, company details, documents, phone, review', async () => {
  const ws = await freshWorkspace('console-golive');
  const api = scoped(ws);
  const start = await api('GET', '/v1/onboarding');
  assert.equal(start.body.live_status, 'sandbox');
  assert.equal(start.body.steps.length, 8);
  assert.ok(start.body.steps.every((s) => s.status === 'pending'));
  const early = await api('POST', '/v1/onboarding/request-live');
  assert.equal(early.status, 422);
  assert.equal(early.body.detail, 'live sending prerequisites are incomplete');

  const blank = await api('PUT', '/v1/onboarding/company', { name: '', country_iso2: 'KE', registration_number: 'x' });
  assert.equal(blank.status, 422);
  const company = await api('PUT', '/v1/onboarding/company', { name: 'Acme Clinics Ltd', country_iso2: 'KE', registration_number: 'PVT-2026-0042' });
  assert.equal(company.status, 200);
  assert.equal(company.body.status, 'submitted');
  const again = await api('PUT', '/v1/onboarding/company', { name: 'Acme Clinics Ltd', country_iso2: 'KE', registration_number: 'PVT-2026-0043' });
  assert.equal(again.status, 409);
  assert.equal(again.body.detail, 'company details cannot be resubmitted in the current state');

  const fake = await upload(ws, '/v1/onboarding/documents', { kind: 'incorporation_certificate' },
    { body: Buffer.from('%PDF-1.4\nnot a real pdf\n'), type: 'application/pdf', name: 'not-really.pdf' });
  assert.equal(fake.status, 422);
  assert.equal(fake.body.detail, 'document must be a valid PDF, PNG or JPEG');
  for (const kind of ['incorporation_certificate', 'proof_of_address', 'director_id']) {
    const up = await upload(ws, '/v1/onboarding/documents', { kind }, { body: MINI_PDF, type: 'application/pdf', name: `${kind}.pdf` });
    assert.equal(up.status, 201, `${kind}: ${JSON.stringify(up.body)}`);
    assert.equal(up.body.scan_status, 'pending');
    assert.equal(up.body.review_status, 'pending');
  }
  const after = await api('GET', '/v1/onboarding');
  const step = (name) => after.body.steps.find((s) => s.step === name).status;
  assert.equal(step('company_details'), 'submitted');
  assert.equal(step('documents_uploaded'), 'submitted');

  // The console posts {phone}; the server only accepts {phone_e164} (recorded as drift).
  const asConsole = await api('POST', '/v1/onboarding/phone/send', { phone: '+254700000001' });
  assert.equal(asConsole.status, 400);
  assert.equal(asConsole.body.detail, 'invalid verification request');
  const asContract = await api('POST', '/v1/onboarding/phone/send', { phone_e164: '+254700000001' });
  assert.equal(asContract.status, 503);

  const email = await api('POST', '/v1/auth/email/send');
  assert.equal(email.status, 503);
  assert.equal(email.body.detail, 'email delivery is not configured');

  const op = await adminToken();
  const reason = 'The registration number does not match the certificate. Please correct it.';
  const rej = await call('POST', `/admin/v1/workspaces/${ws.workspace}/kyc/reject`, { token: op, body: { reason } });
  assert.equal(rej.status, 204);
  const rejected = await api('GET', '/v1/onboarding');
  const company2 = rejected.body.steps.find((s) => s.step === 'company_details');
  assert.equal(company2.status, 'rejected');
  assert.equal(company2.reason, reason);
  const fixed = await api('PUT', '/v1/onboarding/company', { name: 'Acme Clinics Ltd', country_iso2: 'KE', registration_number: 'PVT-2026-0043' });
  assert.equal(fixed.status, 200);
  // A rejection also sends the documents back, so replace one of them.
  const replaced = await upload(ws, '/v1/onboarding/documents', { kind: 'incorporation_certificate' },
    { body: MINI_PDF, type: 'application/pdf', name: 'certificate-v2.pdf' });
  assert.equal(replaced.status, 201);
  assert.equal(replaced.body.version, 2);
  // Approval needs clean virus scans, and scanning is off on the docs stack.
  const ok = await call('POST', `/admin/v1/workspaces/${ws.workspace}/kyc/approve`, { token: op, body: {} });
  assert.equal(ok.status, 409);
  assert.equal(ok.body.detail, 'each current required document must pass scanning and human review before KYC approval');

  let events = [];
  for (let i = 0; i < 30; i += 1) {
    events = (await api('GET', '/v1/notifications?limit=50')).body.items.map((it) => it.event);
    if (events.includes('workspace.kyc_rejected') && events.includes('workspace.created')) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  for (const e of ['workspace.created', 'onboarding.company_submitted', 'onboarding.document_uploaded', 'onboarding.documents_submitted', 'workspace.kyc_rejected']) {
    assert.ok(events.includes(e), `inbox has ${e}: ${events.join(', ')}`);
  }
});

test('compliance: suppressions and a market\'s rules', async () => {
  const ws = await freshWorkspace('console-compliance');
  const api = scoped(ws);
  const add = await api('POST', '/v1/compliance/suppressions', { e164: '+254700000009', reason: 'stop_keyword' });
  assert.equal(add.status, 201);
  assert.equal(add.body.reason, 'stop_keyword');
  const list = await api('GET', '/v1/compliance/suppressions?limit=50');
  assert.deepEqual(list.body.items.map((s) => s.e164), ['+254700000009']);
  const del = await api('DELETE', `/v1/compliance/suppressions/${add.body.id}`);
  assert.ok([200, 204].includes(del.status), `delete ${del.status}`);
  assert.deepEqual((await api('GET', '/v1/compliance/suppressions?limit=50')).body.items, []);

  // The console uploads a .csv/.txt file; the server only accepts JSON items (recorded as drift).
  const asFile = await upload(ws, '/v1/compliance/suppressions/import', {},
    { body: Buffer.from('+254700000011\n+254700000012\n'), type: 'text/csv', name: 'list.csv' });
  assert.equal(asFile.status, 400);
  assert.equal(asFile.body.detail, 'items must contain between 1 and 10000 suppressions');
  const asJson = await api('POST', '/v1/compliance/suppressions/import', { items: [{ e164: '+254700000011', reason: 'manual' }, { e164: '+254700000012', reason: 'manual' }] });
  assert.equal(asJson.status, 201);
  assert.deepEqual(asJson.body, { created: 2, received: 2 });

  const ke = await api('GET', '/v1/countries/KE/compliance');
  assert.deepEqual(ke.body.stop_keywords, ['STOP', 'UNSUBSCRIBE', 'END']);
  assert.deepEqual(ke.body.quiet_hours, [{ traffic_type: 'marketing', start_local: '21:00:00', end_local: '08:00:00', enforce: 'defer' }]);
  assert.deepEqual(ke.body.content_rules.map((r) => [r.pattern, r.action]), [
    ['loan', 'hold_for_review'], ['betting', 'hold_for_review'], ['casino', 'hold_for_review'], ['mkopo', 'hold_for_review'],
  ]);
  const gb = await api('GET', '/v1/countries/GB/compliance');
  assert.deepEqual([gb.body.quiet_hours, gb.body.content_rules], [[], []]);
});

test('notifications: inbox, mark read, preferences', async () => {
  const ws = await freshWorkspace('console-notifications');
  const api = scoped(ws);
  // The welcome notification is written by a background worker a moment after signup.
  let created;
  for (let i = 0; i < 30 && !created; i += 1) {
    created = (await api('GET', '/v1/notifications?limit=10')).body.items.find((i2) => i2.event === 'workspace.created');
    if (!created) await new Promise((r) => setTimeout(r, 500));
  }
  assert.equal(created.title, 'Workspace created');
  assert.equal(created.read_at, null);
  const read = await api('POST', `/v1/notifications/${created.id}/read`);
  assert.equal(read.status, 200);
  assert.ok(read.body.read_at);
  const unread = await api('GET', '/v1/notifications?limit=10&unread=true');
  assert.ok(!unread.body.items.some((i) => i.id === created.id));

  assert.deepEqual((await api('GET', '/v1/me/notifications')).body, []);
  const off = await api('PUT', '/v1/me/notifications', { workspace_id: ws.workspace, event: 'route.health_changed', channel: 'email', enabled: false });
  assert.equal(off.status, 200);
  assert.deepEqual((await api('GET', '/v1/me/notifications')).body, [
    { workspace_id: ws.workspace, event: 'route.health_changed', channel: 'email', enabled: false },
  ]);
});

test('settings: workspace, export, team invitations, deletion rules', async () => {
  const ws = await freshWorkspace('console-settings');
  const api = scoped(ws);
  const renamed = await api('PUT', '/v1/workspace', { name: 'Acme Clinics' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.name, 'Acme Clinics');
  assert.equal(renamed.body.data_retention_days, 30);
  assert.equal(renamed.body.spend_cap_amount, null);
  const badDays = await api('PUT', '/v1/workspace/retention', { days: 0 });
  assert.equal(badDays.status, 400);
  assert.equal(badDays.body.detail, 'days must be an integer between 1 and 400.');
  assert.equal((await api('PUT', '/v1/workspace/retention', { days: 90 })).body.days, 90);
  assert.equal((await api('PUT', '/v1/workspace/spend-cap', { amount: '5000.00' })).body.amount, '5000.00');
  const badCap = await api('PUT', '/v1/workspace/spend-cap', { amount: '' });
  assert.equal(badCap.status, 400);

  const exp = await api('POST', '/v1/account/export');
  assert.equal(exp.status, 202);
  assert.equal(exp.body.status, 'pending');
  let status;
  for (let i = 0; i < 20 && status !== 'ready'; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    status = (await api('GET', `/v1/account/export/${exp.body.id}`)).body.status;
  }
  assert.equal(status, 'ready');

  const inv = await api('POST', '/v1/invitations', { email: `wanjiru-${process.pid}-${Date.now()}@opensms.test`, role: 'developer' });
  assert.equal(inv.status, 201);
  assert.equal(inv.body.delivery_status, 'not_queued');
  const listed = await api('GET', '/v1/invitations?limit=100');
  assert.equal(listed.body.items[0].status, 'pending');
  const mate = await freshWorkspace('console-mate');
  const accept = await call('POST', `/v1/auth/invitations/${inv.body.token}/accept`, { token: mate.token });
  assert.equal(accept.status, 403);
  assert.equal(accept.body.detail, 'Verified invited email identity required.');
  const revoke = await api('DELETE', `/v1/invitations/${inv.body.id}`);
  assert.ok([200, 204].includes(revoke.status), `revoke ${revoke.status}`);

  const del = await api('POST', '/v1/account/delete', { code: '123456' });
  assert.equal(del.status, 403);
  assert.equal(del.body.detail, 'Enable two-factor authentication before requesting deletion.');
});

test('security: two-factor setup, recovery codes, sessions', async () => {
  const ws = await freshWorkspace('console-security');
  const api = scoped(ws);
  const setup = await api('POST', '/v1/auth/2fa/setup');
  assert.equal(setup.status, 200);
  assert.ok(setup.body.secret && setup.body.otpauth_uri.startsWith('otpauth://totp/'));
  const wrong = await api('POST', '/v1/auth/2fa/enable', { code: '000000' });
  assert.equal(wrong.status >= 400, true);
  assert.equal(wrong.body.detail, 'invalid authenticator code');
  const on = await api('POST', '/v1/auth/2fa/enable', { code: totp(setup.body.secret) });
  assert.equal(on.status, 200);
  assert.equal((await api('GET', '/v1/me')).body.user.totp_enabled, true);
  const codes = await api('POST', '/v1/auth/2fa/recovery-codes', { code: totp(setup.body.secret) });
  assert.equal(codes.status, 200);
  assert.equal(codes.body.codes.length, 10);
  assert.ok(codes.body.codes.every((c) => c.startsWith('rc_')));
  const sessions = await api('GET', '/v1/auth/sessions');
  assert.equal(sessions.body.sessions.filter((s) => s.current).length, 1);

  // With 2FA on, deleting the only workspace is refused until another exists.
  const del = await api('POST', '/v1/account/delete', { code: totp(setup.body.secret) });
  assert.equal(del.status, 409);
  assert.equal(del.body.detail, 'Create or join another active workspace before deleting your final workspace.');
});

test('api keys and sending: the example and states quoted in api-keys.md and messages.md', async () => {
  const ws = await freshWorkspace('console-keys');
  const api = scoped(ws);
  const created = await api('POST', '/v1/keys', { label: 'rot', test: true });
  assert.equal(created.status, 201);
  assert.match(created.body.key, /^sk_test_/);
  assert.equal(created.body.key_info.prefix, 'sk_test_');
  assert.deepEqual(created.body.key_info.scopes, ['messages:read', 'messages:write']);
  assert.equal(created.body.key_info.last_used_at, null);
  const noLabel = await api('POST', '/v1/keys', { label: '', test: true });
  assert.equal(noLabel.status >= 400, true);
  assert.match(noLabel.body.detail, /label is required/);

  // An unverified account cannot send, even in sandbox and even with a key.
  const send = await call('POST', '/v1/messages', {
    headers: { authorization: `Bearer ${created.body.key}`, 'idempotency-key': key() },
    body: { to: '+254700000001', text: 'Hi Wanjiru, your appointment is confirmed.' },
  });
  assert.equal(send.status >= 400, true);
  assert.match(send.body.detail, /email verification is required for sandbox sending/);

  const rotated = await api('POST', `/v1/keys/${created.body.key_info.id}/rotate`);
  assert.equal(rotated.status >= 200 && rotated.status < 300, true, `rotate ${rotated.status}`);
  assert.match(rotated.body.key, /^sk_test_/);
  const list = await api('GET', '/v1/keys');
  const old = (list.body.items ?? list.body).find((k) => k.id === created.body.key_info.id);
  const hours = (Date.parse(old.expires_at) - Date.now()) / 3.6e6;
  assert.ok(hours > 23.5 && hours <= 24.01, `old key expires in ${hours}h`);

  const revoke = await api('DELETE', `/v1/keys/${rotated.body.key_info.id}`);
  assert.ok([200, 204].includes(revoke.status), `revoke ${revoke.status}`);
  const after = await call('GET', '/v1/messages?limit=1', { headers: { authorization: `Bearer ${rotated.body.key}` } });
  assert.equal(after.status, 401);
});
