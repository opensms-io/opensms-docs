// MCP pages (integrate/mcp.md and console/ai-assistants.md).
//
// The static tests always run: they pin the statements that were wrong before
// (deployment banner, sandbox spend cap, scope columns, errors table, 405
// wording) and check every JSON example parses.
//
// The live tests need an API build with the MCP server switched on. They are
// skipped unless both are set:
//   OPENSMS_MCP_API      origin of that API, also the MCP issuer (for example http://127.0.0.1:18380)
//   OPENSMS_FIXTURE_DSN  local-stack database URL, used only to mark the new test owner's
//                        email verified because the local stack delivers no email
// They sign up an @opensms.test owner, register one client, connect three times
// with different scope sets, and compare what the server lists with the Scope
// columns of the docs' tools and prompts tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MCP = readFileSync(join(ROOT, 'integrate/mcp.md'), 'utf8');
const CONSOLE = readFileSync(join(ROOT, 'console/ai-assistants.md'), 'utf8');

/** The markdown table that follows a header row starting with `| first |`. */
function table(text, first) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`| ${first} |`));
  assert.ok(start >= 0, `table starting with ${first} not found`);
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
  }
  return rows;
}
const scopesOf = (cell) => [...cell.matchAll(/`([a-z-]+:[a-z]+)`/g)].map((m) => m[1]);
const nameOf = (cell) => cell.match(/`([a-z_]+)`/)[1];

/** Tool name to the scopes the docs say it needs. */
const docTools = Object.fromEntries(table(MCP, 'Tool').map((r) => [nameOf(r[0]), scopesOf(r[1])]));
/** Prompt name to the scopes the docs say it needs. */
const docPrompts = Object.fromEntries(table(MCP, 'Prompt').map((r) => [nameOf(r[0]), scopesOf(r[1])]));

test('banners say built but not deployed, not still being built', () => {
  for (const [name, text] of [['mcp.md', MCP], ['ai-assistants.md', CONSOLE]]) {
    assert.doesNotMatch(text, /still being built/i, name);
    assert.doesNotMatch(text, /planned design|agreed design/i, name);
    assert.match(text, /\*\*Not deployed yet\.\*\*/, name);
  }
  assert.doesNotMatch(MCP, /Example results are not shown yet/);
});

test('daily spend cap is documented as live only', () => {
  assert.doesNotMatch(MCP, /applies in sandbox too/);
  assert.match(MCP, /The cap is enforced only on \*\*live\*\* connections/);
  assert.match(CONSOLE, /The cap only stops sends on a \*\*Live\*\* connection/);
});

test('tools and prompts tables list the exact scopes the server gates on', () => {
  assert.deepEqual(Object.keys(docTools).sort(), ['create_batch', 'get_balance', 'get_lookup', 'get_message', 'list_messages', 'list_sender_ids', 'lookup_number', 'preview_message', 'send_message', 'send_otp', 'verify_otp']);
  assert.deepEqual(docTools.create_batch, ['messages:write', 'messages:read']);
  assert.deepEqual(docPrompts, {
    send_delivery_notification: ['messages:write', 'pricing:read'],
    verify_phone_number: ['messages:write'],
    check_delivery_status: ['messages:read'],
    estimate_campaign_cost: ['pricing:read'],
  });
  assert.match(MCP, /`create_batch` needs both `messages:write` and `messages:read`, so it disappears/);
});

test('errors table covers insufficient_scope and connection_revoked; replays count toward the rate', () => {
  const rows = table(MCP, 'Situation').map((r) => r.join(' '));
  assert.ok(rows.some((r) => r.includes('insufficient_scope') && r.includes('Permission missing')));
  assert.ok(rows.some((r) => r.includes('connection_revoked')));
  assert.match(MCP, /still counts toward the connection's spending rate/);
});

test('GET and DELETE wording matches auth-first order; list_messages to filter is partial', () => {
  assert.match(MCP, /An authenticated `GET` or `DELETE` returns `405`; without a valid token they get the same `401` challenge/);
  assert.match(MCP, /except the `to` filter of `list_messages`/);
});

test('every json example parses and errors do not promise structuredContent', () => {
  const blocks = [...MCP.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 10);
  for (const b of blocks) assert.doesNotThrow(() => JSON.parse(b), b.slice(0, 80));
  for (const b of blocks.map((x) => JSON.parse(x))) {
    if (b.result?.isError) {
      assert.equal(b.result.structuredContent, undefined, 'error example carries structuredContent');
      assert.equal(typeof b.result._meta?.['opensms.io/error']?.status, 'number', 'error example lacks _meta opensms.io/error');
    }
  }
  assert.doesNotMatch(MCP, /`structuredContent` holds `status`/);
  assert.doesNotMatch(MCP, /test build still attaches/);
  assert.match(MCP, /An error result has no `structuredContent`/);
  assert.match(MCP, /without `listChanged`/);
  assert.match(MCP, /`403` \(`forbidden_origin`\)/);
});

// ───────────────────────────── live

const LIVE = process.env.OPENSMS_MCP_API;
const DSN = process.env.OPENSMS_FIXTURE_DSN;
const skip = !LIVE || !DSN ? 'set OPENSMS_MCP_API and OPENSMS_FIXTURE_DSN to run against an MCP-enabled API' : false;

async function http(method, path, { token, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  let payload;
  if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(LIVE + path, { method, headers: h, body: payload, redirect: 'manual' });
  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, headers: res.headers, body: parsed };
}

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const REDIRECT = 'http://127.0.0.1:43117/callback';

async function owner() {
  const email = `mcp-docs-${process.pid}-${Date.now()}@opensms.test`;
  const res = await http('POST', '/v1/auth/signup', { body: { email, password: 'Docs-Test-Passw0rd-2026!', country_iso2: 'KE', workspace_name: 'MCP docs test' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { token, user_id: uid, workspace: { id: ws } } = res.body;
  const sql = `update users set email_verified_at=coalesce(email_verified_at,now()) where id='${uid}';
    insert into onboarding_states(workspace_id,step,status,updated_by) values('${ws}','email_verified','approved','${uid}')
    on conflict(workspace_id,step) do update set status='approved'`;
  const r = spawnSync('psql', [DSN, '-qc', sql], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { token, ws };
}

async function connect(o, clientId, scopes, cap) {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's', scope: scopes.join(' '), resource: `${LIVE}/mcp` });
  const auth = await http('GET', `/oauth/authorize?${q}`);
  assert.equal(auth.status, 302);
  const handle = new URL(auth.headers.get('location')).searchParams.get('request');
  const ap = await http('POST', `/v1/oauth/consent/${encodeURIComponent(handle)}/approve`, { token: o.token, body: { workspace_id: o.ws, environment: 'sandbox', scopes, daily_spend_cap: cap, send_rate_per_minute: 30, acknowledge_unverified: true } });
  assert.equal(ap.status, 200, JSON.stringify(ap.body));
  const code = new URL(ap.body.redirect_to).searchParams.get('code');
  const tok = await http('POST', '/oauth/token', { form: { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier, resource: `${LIVE}/mcp` } });
  assert.equal(tok.status, 200, JSON.stringify(tok.body));
  let id = 0;
  const rpc = async (method, params = {}) => {
    const r = await http('POST', '/mcp', { token: tok.body.access_token, headers: { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' }, body: { jsonrpc: '2.0', id: ++id, method, params } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  return { at: tok.body.access_token, rpc };
}

const expected = (table, granted) => Object.entries(table).filter(([, need]) => need.every((s) => granted.includes(s))).map(([n]) => n).sort();

test('live: GET and DELETE on /mcp are 401 without a token and 405 with one', { skip }, async () => {
  for (const m of ['GET', 'DELETE', 'POST']) {
    const r = await http(m, '/mcp');
    assert.equal(r.status, 401, m);
    assert.match(r.headers.get('www-authenticate') ?? '', /^Bearer resource_metadata="/, m);
  }
  const o = await owner();
  const reg = await http('POST', '/oauth/register', { body: { client_name: 'OpenSMS docs test', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] } });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const all = ['messages:read', 'messages:write', 'pricing:read', 'sender-ids:read', 'lookup:read', 'lookup:request', 'wallet:read'];
  const c = await connect(o, reg.body.client_id, all, '1');
  for (const m of ['GET', 'DELETE']) {
    const r = await http(m, '/mcp', { token: c.at, headers: { accept: 'application/json, text/event-stream' } });
    assert.equal(r.status, 405, m);
  }

  // Scope parity: what the server lists must equal the docs' Scope columns.
  const grants = [all, ['messages:write', 'pricing:read', 'lookup:request'], ['messages:read', 'messages:write']];
  for (const scopes of grants) {
    const g = scopes === all ? c : await connect(o, reg.body.client_id, scopes, '1');
    const tools = (await g.rpc('tools/list')).result.tools.map((t) => t.name).sort();
    assert.deepEqual(tools, expected(docTools, scopes), `tools for ${scopes}`);
    const prompts = (await g.rpc('prompts/list')).result.prompts.map((p) => p.name).sort();
    assert.deepEqual(prompts, expected(docPrompts, scopes), `prompts for ${scopes}`);
  }

  // Sandbox and the daily cap: a 1 KES cap never refuses a sandbox send.
  const s = await connect(o, reg.body.client_id, all, '1');
  for (let i = 0; i < 3; i++) {
    const r = await s.rpc('tools/call', { name: 'send_message', arguments: { to: '+254712345678', text: `Cap check ${i} ${Date.now()}` } });
    assert.notEqual(r.result.isError, true, JSON.stringify(r.result));
    assert.equal(r.result.structuredContent.environment, 'sandbox');
  }
  const bal = await s.rpc('tools/call', { name: 'get_balance', arguments: {} });
  assert.equal(bal.result.structuredContent.grant_daily_cap, '1');
  assert.equal(bal.result.structuredContent.grant_spent_today, '0');

  // Replays return the same message with replayed true, as the send_message example shows.
  const args = { to: '+254712345678', text: 'Your order A-1001 is out for delivery.', idempotency_key: `docs-${Date.now()}` };
  const first = (await s.rpc('tools/call', { name: 'send_message', arguments: args })).result;
  const again = (await s.rpc('tools/call', { name: 'send_message', arguments: args })).result;
  assert.equal(first.structuredContent.replayed, false);
  assert.equal(again.structuredContent.replayed, true);
  assert.equal(again.structuredContent.message_id, first.structuredContent.message_id);
  const conflict = (await s.rpc('tools/call', { name: 'send_message', arguments: { ...args, text: 'Different text, same key.' } })).result;
  assert.equal(conflict.isError, true);
  assert.match(conflict.content[0].text, /^Conflict: Idempotency-Key was already used with a different request\./);
  assert.match(conflict.content[0].text, /\n\[HTTP 409\]$/);
  assert.equal(conflict.structuredContent, undefined, 'error result must not carry structuredContent');
  assert.equal(conflict._meta['opensms.io/error'].status, 409);

  // initialize declares the three capabilities without listChanged.
  const init = await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'docs-test', version: '1' } });
  assert.deepEqual(init.result.capabilities, { tools: {}, resources: {}, prompts: {} });

  // A foreign Origin is refused even with a valid token.
  const foreign = await http('POST', '/mcp', { token: s.at, headers: { origin: 'https://evil.example', accept: 'application/json, text/event-stream' }, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error, 'forbidden_origin');
});
