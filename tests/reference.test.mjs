// Tests for the customer API reference (reference/api/).
//
// 1. Every operation in api/openapi/customer.yaml is documented on its page and
//    listed in COVERAGE.md.
// 2. Every published example is replayed against the running API: the status code
//    must match the one on the page, and every top-level field shown must still be
//    returned. The scenarios are the ones scripts/gen-reference.mjs captured from.
// 3. No credential is published unredacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { operations, loadSpec, GROUPS, OUT_DIR, EXAMPLES_PATH, anchor, runScenarios } from '../scripts/gen-reference.mjs';

const examples = JSON.parse(readFileSync(EXAMPLES_PATH, 'utf8'));
const page = (slug) => readFileSync(resolve(OUT_DIR, `${slug}.md`), 'utf8');

test('every contract operation has a section on its page and a coverage row', () => {
  const spec = loadSpec();
  const all = operations(spec);
  assert.equal(all.length, 173, 'customer.yaml operation count changed: regenerate the reference');
  const coverage = page('COVERAGE');
  const index = page('README');
  for (const g of GROUPS) assert.ok(index.includes(`](${g.slug}.md)`), `README links ${g.slug}.md`);
  for (const o of all) {
    const text = page(o.group);
    assert.ok(text.includes(`\n## ${o.method} ${o.path}\n`), `${o.key} missing from ${o.group}.md`);
    assert.ok(coverage.includes(`(${o.group}.md#${anchor(`${o.method} ${o.path}`)})`), `${o.key} missing from COVERAGE.md`);
    const statuses = Object.keys(o.op.responses ?? {});
    const section = text.split(`\n## ${o.method} ${o.path}\n`)[1].split('\n## ')[0];
    for (const s of statuses) assert.ok(section.includes(`| \`${s}\` |`), `${o.key} response ${s} not documented`);
  }
});

test('published examples have no unredacted credentials', () => {
  const leak = /(sk_(test|live)_[A-Za-z0-9_-]{6,}|sess_[A-Za-z0-9_-]{6,}|whsec_[A-Za-z0-9_-]{6,}|rc_[0-9a-f]{8,}|challenge_[A-Za-z0-9_-]{6,}|secret=(?!REDACTED)[A-Z2-7]{8,})/;
  for (const f of readdirSync(OUT_DIR)) {
    const text = readFileSync(resolve(OUT_DIR, f), 'utf8');
    const m = text.match(leak);
    assert.equal(m, null, `${f} contains ${m?.[0]}`);
  }
});

test('live examples replay with the published status codes and fields', { timeout: 300_000 }, async (t) => {
  const live = await runScenarios();
  assert.deepEqual(live.__failures, [], 'scenario expectations failed');
  const seen = {};
  const published = Object.entries(examples).filter(([k]) => !k.startsWith('__'));
  let checked = 0;
  const skipped = [];
  for (const [op, list] of published) {
    for (const ex of list) {
      const key = `${op}|${ex.title ?? ''}`;
      const n = (seen[key] = (seen[key] ?? 0) + 1);
      const runs = live.__results.filter((r) => r.op === op && (r.title ?? '') === (ex.title ?? ''));
      const run = runs[n - 1];
      assert.ok(run, `${op} ${ex.title ?? ''}: no live run`);
      if (run.skipped) { skipped.push(`${op}: ${run.skipped}`); continue; }
      assert.equal(run.status, ex.response.status, `${op} ${ex.title ?? ''}: status`);
      for (const k of ex.keys) assert.ok(run.keys.includes(k), `${op} ${ex.title ?? ''}: field ${k} no longer returned`);
      checked += 1;
    }
  }
  for (const x of skipped) t.diagnostic(`not replayed: ${x}`);
  assert.ok(skipped.length <= 2, `too many skipped: ${skipped.join('; ')}`);
  assert.ok(checked >= 170, `only ${checked} examples checked`);
});

test('key examples show the documented shapes', () => {
  const first = (op) => examples[op][0].response;
  assert.equal(first('POST /v1/keys').status, 201);
  assert.match(first('POST /v1/keys').body.key, /^sk_test_.{3}\.\.\.$/);
  assert.equal(first('POST /v1/auth/signup').status, 201);
  assert.match(first('POST /v1/auth/signup').body.token, /^sess_/);
  assert.equal(first('POST /v1/auth/signup').body.workspace.live_status, 'sandbox');
  assert.equal(examples['POST /v1/auth/login'][1].response.status, 202);
  assert.equal(examples['POST /v1/auth/login'][1].response.body.two_factor_required, true);
  assert.equal(first('POST /v1/messages').status, 403);
  assert.equal(first('POST /v1/messages').body.detail, 'email verification is required for sandbox sending');
  assert.equal(first('POST /v1/messages/batch').status, 202);
  assert.equal(first('GET /v1/batches/{id}/validation').body.invalid, 1);
  assert.equal(first('POST /v1/webhooks').status, 201);
  assert.match(first('POST /v1/webhooks').body.secret, /^whsec_/);
  assert.equal(first('POST /v1/sender-ids').status, 201);
  assert.equal(first('POST /v1/sender-ids').body.status, 'pending_admin');
  assert.equal(first('POST /v1/lookup').body.source, 'mock');
  assert.equal(first('POST /v1/wallet/sandbox-credits').body.simulated, true);
  assert.equal(first('GET /v1/account/export/{id}').body.status, 'ready');
  assert.equal(first('GET /status/subscribe/confirm').body.status, 'subscribed');
  assert.ok(Array.isArray(first('POST /v1/auth/2fa/recovery-codes').body.codes));
  assert.equal(first('POST /v1/auth/2fa/recovery-codes').body.codes.length, 10);
});

test('reference pages have intact tables and internal links', () => {
  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.md'));
  const anchors = {};
  for (const f of files) {
    const seen = {};
    anchors[f] = new Set();
    for (const l of page(f.replace(/\.md$/, '')).split('\n')) {
      const m = l.match(/^#+ (.*)/);
      if (!m) continue;
      let a = anchor(m[1]);
      if (seen[a] !== undefined) { seen[a] += 1; a = `${a}-${seen[a]}`; } else seen[a] = 0;
      anchors[f].add(a);
    }
  }
  for (const f of files) {
    const text = page(f.replace(/\.md$/, ''));
    let cols = null; let code = false;
    for (const l of text.split('\n')) {
      if (l.startsWith('```')) code = !code;
      if (code) continue;
      if (l.startsWith('|')) {
        const n = l.replace(/\\\|/g, '').split('|').length;
        if (cols === null) cols = n; else assert.equal(n, cols, `${f}: ragged table row ${l.slice(0, 80)}`);
      } else cols = null;
    }
    for (const m of text.matchAll(/\]\(([^)\s]*?)(?:#([^)]+))?\)/g)) {
      const target = m[1] || f;
      if (/^https?:|^\.\.\//.test(target)) continue;
      assert.ok(anchors[target], `${f}: link to missing page ${m[0]}`);
      if (m[2]) assert.ok(anchors[target].has(m[2]), `${f}: link to missing anchor ${m[0]}`);
    }
  }
});
