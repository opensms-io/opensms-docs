import test from 'node:test';
import assert from 'node:assert/strict';
import { call, freshWorkspace, mintKey } from './lib.mjs';

test('health endpoints answer', async () => {
  assert.equal((await call('GET', '/healthz')).status, 200);
  assert.equal((await call('GET', '/readyz')).status, 200);
});

test('signup then mint a sandbox key shown once', async () => {
  const ws = await freshWorkspace('smoke');
  assert.equal(ws.session.workspace.live_status, 'sandbox');
  const minted = await mintKey(ws);
  assert.match(minted.key, /^sk_test_/);
  const list = await call('GET', '/v1/keys', { token: ws.token, workspace: ws.workspace });
  assert.equal(list.status, 200);
  assert.ok(!JSON.stringify(list.body).includes(minted.key), 'secret must never be listed again');
});
