// Shared helpers for the docs tests. Every documented flow is exercised against a
// running opensms API, so an example that drifts from the server fails here first.
//
//   OPENSMS_API          customer + admin API base (default http://127.0.0.1:18180)
//   OPENSMS_ADMIN_EMAIL  an operator created with cmd/opensms-admin
//   OPENSMS_ADMIN_PASSWORD
export const API = process.env.OPENSMS_API ?? 'http://127.0.0.1:18180';

let counter = 0;

/** Call the API. Returns { status, headers, body } and never throws on HTTP errors. */
export async function call(method, path, { token, workspace, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (workspace) h['x-workspace-id'] = workspace;
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, headers: res.headers, body: parsed };
}

/** A brand-new account and sandbox workspace, so tests never share state. */
export async function freshWorkspace(label = 'docs') {
  counter += 1;
  const email = `${label}-${process.pid}-${counter}-${Math.floor(performance.now())}@opensms.test`;
  const password = 'Docs-Test-Passw0rd-2026!';
  const res = await call('POST', '/v1/auth/signup', {
    body: { email, password, country_iso2: 'KE', workspace_name: `Docs ${label}` },
  });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, password, token: res.body.token, workspace: res.body.workspace.id, session: res.body };
}

/** Mint an API key in a workspace and return the plaintext secret plus metadata. */
export async function mintKey(ws, { label = 'docs key', test = true, scopes } = {}) {
  const res = await call('POST', '/v1/keys', {
    token: ws.token, workspace: ws.workspace, body: { label, test, ...(scopes ? { scopes } : {}) },
  });
  if (res.status !== 201) throw new Error(`key mint failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

/** An operator session token for /admin/v1. */
export async function adminToken() {
  const res = await call('POST', '/admin/v1/login', {
    body: { email: process.env.OPENSMS_ADMIN_EMAIL, password: process.env.OPENSMS_ADMIN_PASSWORD },
  });
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}
