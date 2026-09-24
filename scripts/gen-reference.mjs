#!/usr/bin/env node
// Generates the customer API reference in reference/api/ from the contract of
// record, api/openapi/customer.yaml, and embeds live examples captured against a
// running opensms API.
//
//   node scripts/gen-reference.mjs            render Markdown from the spec and the
//                                             saved examples (reference/api/examples.json)
//   node scripts/gen-reference.mjs --capture  run every scenario against OPENSMS_API
//                                             first, save examples.json, then render
//
// The capture needs OPENSMS_ADMIN_EMAIL / OPENSMS_ADMIN_PASSWORD (see tests/lib.mjs).
// tests/reference.test.mjs imports runScenarios() from this file and replays the
// same calls, so a published example that drifts from the server fails the tests.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHmac, randomUUID } from 'node:crypto';
import YAML from 'yaml';
import { API, call, freshWorkspace, mintKey, adminToken } from '../tests/lib.mjs';

const DOCS = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SPEC_PATH = resolve(DOCS, '../api/openapi/customer.yaml');
export const OUT_DIR = resolve(DOCS, 'reference/api');
export const EXAMPLES_PATH = resolve(OUT_DIR, 'examples.json');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// ---------------------------------------------------------------------------
// Spec loading and grouping
// ---------------------------------------------------------------------------

export function loadSpec() {
  return YAML.parse(readFileSync(SPEC_PATH, 'utf8'));
}

/** Every operation in document order, with a stable key "METHOD /path". */
export function operations(spec = loadSpec()) {
  const ops = [];
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const m of METHODS) {
      if (!item[m]) continue;
      const op = item[m];
      ops.push({
        key: `${m.toUpperCase()} ${path}`,
        method: m.toUpperCase(),
        path,
        op,
        pathParams: item.parameters ?? [],
        servers: item.servers ?? op.servers,
        tag: (op.tags ?? [])[0] ?? null,
        group: groupFor(op, path),
      });
    }
  }
  return ops;
}

// Pages. The contract tags only some operations; untagged operations are placed by
// path prefix (first match wins). A tagged operation always lands on its tag's page.
export const GROUPS = [
  { slug: 'authentication', title: 'Authentication', tag: 'Authentication', prefixes: ['/v1/auth/2fa', '/v1/auth/login', '/v1/auth/email', '/v1/auth/verify-email', '/v1/auth/cookie', '/v1/me'],
    intro: 'Sign-up, password and email-code login, two-factor authentication, email verification, password reset and session management. These operations create and manage the `sess_` bearer tokens that the customer app (and any script acting as a person) uses. Read this page if you are building a login flow or need to manage sessions; server-to-server integrations normally use API keys instead (see [API keys](api-keys.md)).' },
  { slug: 'account', title: 'Account', prefixes: ['/v1/account'],
    intro: 'Account-level data export and deletion for the signed-in user. For developers building self-service privacy tooling on top of a session token.' },
  { slug: 'workspaces', title: 'Workspaces and settings', prefixes: ['/v1/workspaces', '/v1/workspace', '/v1/settings'],
    intro: 'Read and update the current workspace, list and create workspaces, and manage workspace settings (retention, spend cap, routing preferences, notification defaults). All of these need a session token plus `X-Workspace-ID`. For developers automating workspace administration.' },
  { slug: 'members', title: 'Members and invitations', prefixes: ['/v1/members', '/v1/invitations', '/v1/auth/invitations'],
    intro: 'Invite people to a workspace, change their role, remove them, transfer ownership and accept invitations. Session tokens only. For developers building team management around OpenSMS.' },
  { slug: 'onboarding', title: 'Onboarding', prefixes: ['/v1/onboarding'],
    intro: 'The live-sending onboarding flow: onboarding state, phone verification, company details, KYC document upload and the request to go live. Session tokens only. For developers who script or embed the onboarding steps a workspace completes before it can send live traffic.' },
  { slug: 'legal', title: 'Legal', prefixes: ['/v1/legal'],
    intro: 'Current legal documents (terms, privacy, DPA) and the workspace\'s recorded acceptances. Session tokens only.' },
  { slug: 'api-keys', title: 'API keys', prefixes: ['/v1/keys'],
    intro: 'Mint, list, rotate and revoke workspace API keys (`sk_test_` for sandbox, `sk_live_` for live) and list the scopes a key can carry. Key management always needs a session token: an API key cannot mint other keys. For developers provisioning credentials for their own services.' },
  { slug: 'messages', title: 'Messages', tag: 'Messages', prefixes: ['/v1/messages'],
    intro: 'Send a single SMS, list and read messages, read delivery attempts and cancel scheduled messages. This is the core sending API, usually called with an API key that has `messages:write` / `messages:read`. For developers integrating SMS sending into an application.' },
  { slug: 'batches', title: 'Batches', tag: 'Batches',
    intro: 'Bulk sending: submit a batch of recipients, read its validation report and items, then start or stop it. For developers sending the same or templated content to many recipients.' },
  { slug: 'sandbox', title: 'Sandbox', tag: 'Sandbox',
    intro: 'The sandbox message log: in the sandbox environment messages are accepted and recorded but never handed to a carrier, and this endpoint lets you read what would have been sent. For developers testing an integration with a `sk_test_` key.' },
  { slug: 'inbound', title: 'Inbound', prefixes: ['/v1/inbound'],
    intro: 'Read inbound (mobile-originated) SMS received on the workspace\'s numbers and reply to them. For developers building two-way messaging.' },
  { slug: 'otp', title: 'OTP', tag: 'OTP',
    intro: 'One-time passcodes: OpenSMS generates, sends and verifies a code for you. API keys only. For developers adding phone verification or step-up authentication to their own product.' },
  { slug: 'templates', title: 'Templates', prefixes: ['/v1/templates'],
    intro: 'Reusable message templates with variables. For developers who keep message copy in OpenSMS rather than in their own code.' },
  { slug: 'contacts', title: 'Contacts and groups', prefixes: ['/v1/contacts', '/v1/contact-groups'],
    intro: 'Store contacts and contact groups, and send a message to a whole group. API keys need the `contacts:manage` scope. For developers syncing an address book into OpenSMS.' },
  { slug: 'sender-ids', title: 'Sender IDs', prefixes: ['/v1/sender-ids', '/v1/sender-id-drafts'],
    intro: 'Check, quote, draft, register and manage alphanumeric and numeric sender IDs. For developers automating sender ID registration.\n\n**Supporting documents (served, but not in the contract).** `POST /v1/sender-ids` needs the IDs of three uploaded documents, one of each kind `certificate`, `signatory-id` and `authorization`. They are uploaded with `POST /v1/sender-documents`, which is not yet in the OpenAPI contract. It takes a session token with `X-Workspace-ID` and `X-Environment` (owner or admin only; API keys are refused with 401), and a `multipart/form-data` body with one `kind` field, one `file` (PDF, PNG or JPEG, at most 10 MiB) and an optional `replaces_document_id`. It answers `201` with `id`, `kind`, `filename`, `content_type`, `size`, `scan_status`, `review_status`, `version`, `is_current` and `created_at`. A document still `pending` its malware scan is accepted for registration. `GET /v1/sender-documents` lists the workspace\'s documents and `GET /v1/sender-documents/{id}/download` returns one once its scan is `clean`. The registration example below was captured after uploading three documents this way.' },
  { slug: 'numbers', title: 'Numbers', tag: 'Numbers', prefixes: ['/v1/numbers'],
    intro: 'Search for, assign and release dedicated phone numbers and manage their inbound rules. Most number operations only work in the live environment. For developers building two-way or number-based messaging.' },
  { slug: 'webhooks', title: 'Webhooks', tag: 'Webhooks',
    intro: 'Register HTTPS endpoints that receive signed event callbacks (delivery receipts, inbound messages and more), inspect delivery history, send test events and replay deliveries. For developers who need push notifications instead of polling.' },
  { slug: 'compliance', title: 'Compliance', tag: 'Compliance', prefixes: ['/v1/compliance', '/v1/content-rules'],
    intro: 'Per-country compliance rules (stop keywords, quiet hours, content rules) and the workspace suppression list. For developers who need to check what will be blocked or deferred, or to manage opt-outs programmatically.' },
  { slug: 'catalogue', title: 'Catalogue', tag: 'Catalogue',
    intro: 'Public reference data: supported countries, carriers and routes. No authentication. For developers who want to show coverage or validate destinations.' },
  { slug: 'pricing', title: 'Pricing', tag: 'Pricing',
    intro: 'The workspace price book: per-country (and per-carrier) sell prices in the workspace currency. For developers estimating cost before sending.' },
  { slug: 'analytics', title: 'Analytics', tag: 'Analytics',
    intro: 'Aggregated sending analytics: overview totals, breakdowns by country, carrier and sender ID, and a time series. For developers building reporting dashboards.' },
  { slug: 'lookup', title: 'Number lookup', prefixes: ['/v1/lookup'],
    intro: 'Request and read carrier lookups (HLR-style) for a phone number. For developers who want to validate numbers or detect the current network before sending.' },
  { slug: 'wallet', title: 'Wallet and billing', prefixes: ['/v1/wallet', '/v1/payment-methods', '/v1/invoices'],
    intro: 'Prepaid wallet balances and ledger, sandbox credits, top-ups (card, manual bank transfer), auto top-up, saved payment methods and invoices. For developers who need to read spend or automate funding.' },
  { slug: 'notifications', title: 'Notifications', prefixes: ['/v1/notifications', '/v1/me/notifications'],
    intro: 'The signed-in user\'s in-app notification inbox and personal notification preferences. Session tokens only.' },
  { slug: 'realtime', title: 'Realtime', prefixes: ['/v1/realtime'],
    intro: 'Short-lived tickets for the realtime (websocket) event stream the customer app uses. For developers building a live UI on top of OpenSMS.' },
  { slug: 'status', title: 'Status', tag: 'Status',
    intro: 'The public service status page data and status-update email subscriptions. No authentication. For developers who want to surface OpenSMS health in their own tooling.' },
  { slug: 'health', title: 'Health', tag: 'Health', prefixes: ['/metrics'],
    intro: 'Liveness, readiness and metrics endpoints for whoever runs the API process. Not workspace-scoped and not something an integration normally calls.' },
  { slug: 'provider-callbacks', title: 'Provider callbacks', prefixes: ['/callbacks/'],
    intro: 'Inbound delivery-receipt callbacks from upstream SMS providers. These are called by providers, not by customers, and are listed here only because they are part of the customer contract. For operators wiring up a provider.' },
];

function groupFor(op, path) {
  const tag = (op.tags ?? [])[0];
  if (tag) {
    const g = GROUPS.find((x) => x.tag === tag);
    if (g) return g.slug;
  }
  // Longest matching prefix wins, so /v1/me/notifications beats /v1/me.
  let best = null;
  for (const g of GROUPS) for (const p of g.prefixes ?? []) {
    if ((path === p || path.startsWith(p.endsWith('/') ? p : p + '/') || path.startsWith(p + '?')) && (!best || p.length > best.len)) best = { slug: g.slug, len: p.length };
  }
  if (!best) throw new Error(`no reference group for ${path}`);
  return best.slug;
}

// ---------------------------------------------------------------------------
// Schema rendering
// ---------------------------------------------------------------------------

// '#/components/schemas/Session/properties/user' -> 'Session.user' (links to Session).
const refName = (ref) => {
  const parts = ref.replace(/^#\//, '').split('/');
  if (parts[0] === 'components' && parts.length > 3) return [parts[2], ...parts.slice(3).filter((x) => x !== 'properties' && x !== 'items')].join('.');
  return parts.pop();
};
const deref = (spec, obj) => {
  let o = obj;
  for (let i = 0; o && o.$ref && i < 10; i += 1) {
    const parts = o.$ref.replace(/^#\//, '').split('/');
    o = parts.reduce((acc, k) => acc?.[k], spec);
  }
  return o;
};
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim();
export const anchor = (text) => text.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');

function schemaLink(name, ctx) {
  return `[${name}](${ctx.onSchemasPage ? '' : 'schemas.md'}#${anchor(name.split('.')[0])})`;
}

function typeStr(s, ctx) {
  if (!s) return 'any';
  if (s.$ref) return schemaLink(refName(s.$ref), ctx);
  if (s.oneOf || s.anyOf) return (s.oneOf ?? s.anyOf).map((x) => typeStr(x, ctx)).join(' or ');
  if (s.allOf) return s.allOf.length === 1 ? typeStr(s.allOf[0], ctx) : 'object (all of ' + s.allOf.map((x) => typeStr(x, ctx)).join(', ') + ')';
  let types = Array.isArray(s.type) ? [...s.type] : s.type ? [s.type] : [];
  if (s.nullable && !types.includes('null')) types.push('null');
  if (types.length === 0) {
    if (s.properties) types = ['object'];
    else if (s.const !== undefined) return `const \`${JSON.stringify(s.const)}\``;
    else if (s.items) types = ['array'];
    else return 'any';
  }
  return types.map((t) => {
    if (t === 'array') return `array of ${typeStr(s.items, ctx)}`;
    if (t === 'object' && s.additionalProperties && typeof s.additionalProperties === 'object' && !s.properties) return `map of ${typeStr(s.additionalProperties, ctx)}`;
    if (t === 'string' && s.format) return `string (${s.format})`;
    if (t === 'integer' && s.format) return `integer (${s.format})`;
    return t;
  }).join(' | ');
}

const CONSTRAINTS = ['minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties', 'const', 'not'];

function notes(s) {
  if (!s || s.$ref) return '';
  const out = [];
  if (s.description) out.push(s.description);
  const enumVals = s.enum ?? s.items?.enum;
  if (enumVals) out.push(`One of: ${enumVals.map((v) => `\`${v}\``).join(', ')}.`);
  const c = [];
  for (const k of CONSTRAINTS) if (s[k] !== undefined && !(k === 'const' && !s.type)) c.push(`${k} \`${typeof s[k] === 'object' ? JSON.stringify(s[k]) : s[k]}\``);
  for (const k of ['minLength', 'maxLength', 'pattern']) if (s.items && s.items[k] !== undefined) c.push(`items ${k} \`${s.items[k]}\``);
  if (c.length) out.push(`Constraints: ${c.join(', ')}.`);
  if (s.examples) out.push(`Examples: ${s.examples.map((e) => `\`${JSON.stringify(e)}\``).join(', ')}.`);
  else if (s.example !== undefined && typeof s.example !== 'object') out.push(`Example: \`${s.example}\`.`);
  return out.join(' ');
}

function isInlineObject(s) {
  return s && !s.$ref && (s.properties || s.allOf);
}

function mergedProps(spec, s) {
  // Merge allOf members (resolving refs) into one property map.
  const props = {}; const req = new Set(s.required ?? []);
  const parts = s.allOf ? s.allOf.map((x) => deref(spec, x)) : [];
  for (const p of [...parts, s]) {
    Object.assign(props, p.properties ?? {});
    for (const r of p.required ?? []) req.add(r);
  }
  return { props, req };
}

/** Flatten an object schema into field rows: [name, type, required, default, notes]. */
function fieldRows(spec, s, ctx, prefix = '', depth = 0) {
  const rows = [];
  if (!s) return rows;
  const { props, req } = mergedProps(spec, s);
  for (const [name, raw] of Object.entries(props)) {
    const full = prefix + name;
    rows.push([`\`${full}\``, typeStr(raw, ctx), req.has(name) ? 'yes' : 'no', raw.default !== undefined ? `\`${JSON.stringify(raw.default)}\`` : '', notes(raw)]);
    if (depth < 4) {
      if (isInlineObject(raw)) rows.push(...fieldRows(spec, raw, ctx, `${full}.`, depth + 1));
      else if (raw.items && isInlineObject(raw.items)) rows.push(...fieldRows(spec, raw.items, ctx, `${full}[].`, depth + 1));
    }
  }
  if (s.additionalProperties === false) ctx.closed = true;
  return rows;
}

function table(head, rows) {
  if (!rows.length) return '';
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') + '\n';
}

/** Render a body schema (request or response) as text: link, table or alternatives. */
function renderBodySchema(spec, schema, ctx) {
  if (!schema) return '';
  const out = [];
  if (schema.$ref) {
    const name = refName(schema.$ref);
    const target = deref(spec, schema);
    out.push(`Schema: ${schemaLink(name, ctx)}.`);
    if (ctx.expandRefs && (target.properties || target.allOf)) {
      const c2 = { ...ctx, closed: false };
      out.push('', table(['Field', 'Type', 'Required', 'Default', 'Notes'], fieldRows(spec, target, c2)).trimEnd());
      if (c2.closed) out.push('', 'Unknown fields are rejected (`additionalProperties: false`).');
    }
    return out.join('\n');
  }
  if (schema.oneOf || schema.anyOf) {
    out.push('One of:');
    (schema.oneOf ?? schema.anyOf).forEach((alt, i) => {
      out.push('', `Alternative ${i + 1}: ${renderBodySchema(spec, alt, ctx)}`);
    });
    return out.join('\n');
  }
  if (isInlineObject(schema)) {
    const c2 = { ...ctx, closed: false };
    if (schema.description) out.push(schema.description, '');
    const rows = fieldRows(spec, schema, c2);
    out.push(table(['Field', 'Type', 'Required', 'Default', 'Notes'], rows).trimEnd());
    if (c2.closed) out.push('', 'Unknown fields are rejected (`additionalProperties: false`).');
    const extra = [];
    for (const k of ['minProperties', 'not']) if (schema[k] !== undefined) extra.push(`${k} \`${JSON.stringify(schema[k])}\``);
    if (extra.length) out.push('', `Object constraints: ${extra.join(', ')}.`);
    return out.join('\n');
  }
  if (schema.type === 'array' || schema.items) {
    const it = schema.items ?? {};
    if (isInlineObject(it)) return `Array of objects:\n\n${renderBodySchema(spec, it, ctx)}`;
    return `Type: ${typeStr(schema, ctx)}.${notes(schema) ? ' ' + notes(schema) : ''}`;
  }
  return `Type: ${typeStr(schema, ctx)}.${notes(schema) ? ' ' + notes(schema) : ''}`;
}

function authText(op) {
  const sec = op.security;
  if (sec === undefined) return 'Not declared in the contract (the operation has no `security` entry and the spec has no global default). See the description for what the handler requires.';
  if (sec.length === 0) return 'None. Public endpoint.';
  const alts = sec.map((req) => {
    const parts = Object.entries(req).map(([name, scopes]) => {
      if (name === 'Session') return 'session token (`Authorization: Bearer sess_...`)';
      if (name === 'ApiKey') return scopes.length ? `API key with scope ${scopes.map((x) => `\`${x}\``).join(' and ')}` : 'API key (any scope)';
      return `\`${name}\``;
    });
    return parts.join(' plus ');
  });
  const t = alts.join(', or ');
  return t[0].toUpperCase() + t.slice(1) + '.';
}

function paramRows(spec, o) {
  const merged = new Map();
  for (const p of [...o.pathParams, ...(o.op.parameters ?? [])]) {
    const r = deref(spec, p);
    merged.set(`${r.in}:${r.name}`, r);
  }
  const ctx = {};
  return [...merged.values()].map((p) => [
    `\`${p.name}\``, p.in, typeStr(p.schema, ctx), p.required || p.in === 'path' ? 'yes' : 'no',
    p.schema?.default !== undefined ? `\`${JSON.stringify(p.schema.default)}\`` : '',
    [p.description, notes({ ...(p.schema ?? {}), description: undefined })].filter(Boolean).join(' '),
  ]);
}

function responseRows(spec, o, ctx) {
  const rows = []; const details = [];
  for (const [status, raw] of Object.entries(o.op.responses ?? {})) {
    const r = deref(spec, raw);
    const isProblemRef = raw.$ref && /Problem|ServiceUnavailable/.test(raw.$ref);
    const types = Object.keys(r.content ?? {});
    let body = '';
    if (types.length) {
      body = types.map((t) => {
        const sch = r.content[t].schema;
        let b = `\`${t}\``;
        if (sch?.$ref) b += `: ${schemaLink(refName(sch.$ref), ctx)}`;
        else if (sch && isInlineObject(sch)) { b += ': see fields below'; details.push({ status, type: t, schema: sch }); }
        else if (sch && (sch.type === 'array' || sch.items)) {
          b += `: ${typeStr(sch, ctx)}`;
          if (isInlineObject(sch.items)) details.push({ status, type: t, schema: sch.items, array: true });
        } else if (sch) b += `: ${typeStr(sch, ctx)}`;
        return b;
      }).join('; ');
    }
    if (r.headers) body += (body ? '. ' : '') + 'Headers: ' + Object.keys(r.headers).map((h) => `\`${h}\``).join(', ');
    rows.push([`\`${status}\``, (isProblemRef ? '' : '') + (r.description ?? ''), body || 'No body']);
  }
  return { rows, details };
}

function renderOperation(spec, o, examples) {
  const ctx = { expandRefs: true };
  const lines = [];
  lines.push(`## ${o.method} ${o.path}`, '');
  lines.push(`**${cell(o.op.summary ?? '(no summary in contract)')}**`, '');
  const meta = [`Operation ID: ${o.op.operationId ? `\`${o.op.operationId}\`` : '_none in contract_'}`];
  if (o.tag) meta.push(`Tag: \`${o.tag}\``); else meta.push('Tag: _none in contract_');
  const servers = (o.servers ?? []).filter((s) => !LOOPBACK.test(s.url));
  if (servers.length) meta.push(`Server: ${servers.map((s) => `\`${s.url}\``).join(', ')}`);
  lines.push(meta.join('. ') + '.', '');
  if (o.op.description) lines.push(o.op.description.trim(), '');
  lines.push(`**Auth:** ${authText(o.op)}`, '');
  const pr = paramRows(spec, o);
  if (pr.length) lines.push('**Parameters**', '', table(['Name', 'In', 'Type', 'Required', 'Default', 'Notes'], pr));
  const rb = o.op.requestBody ? deref(spec, o.op.requestBody) : null;
  if (rb) {
    for (const [t, media] of Object.entries(rb.content ?? {})) {
      lines.push(`**Request body** (\`${t}\`, ${rb.required ? 'required' : 'optional'})`, '');
      if (rb.description) lines.push(rb.description, '');
      lines.push(renderBodySchema(spec, media.schema, ctx), '');
    }
  } else {
    lines.push('**Request body:** none.', '');
  }
  const { rows, details } = responseRows(spec, o, ctx);
  lines.push('**Responses**', '', table(['Status', 'Description', 'Body'], rows));
  for (const d of details) {
    lines.push(`Response \`${d.status}\` fields${d.array ? ' (per array item)' : ''}:`, '', renderBodySchema(spec, d.schema, { ...ctx, expandRefs: false }), '');
  }
  const ex = examples[o.key] ?? [];
  const skip = examples.__notExercised?.[o.key];
  if (ex.length) {
    for (const e of ex) lines.push(renderExample(e));
  } else if (skip && publicNote(skip)) {
    lines.push(`**Example:** none. ${publicNote(skip)}`, '');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Example rendering
// ---------------------------------------------------------------------------

/** JSON.stringify with 2-space indent, but arrays of scalars kept on one line. */
function pretty(v) {
  return JSON.stringify(v, null, 2).replace(/\[\n\s*((?:(?:"(?:[^"\\]|\\.)*"|-?[\d.eE+-]+|true|false|null),?\s*)+)\]/g, (m, inner) => {
    const flat = `[${inner.split('\n').map((x) => x.trim()).filter(Boolean).join(' ')}]`;
    return flat.length <= 100 ? flat : m;
  });
}

function shellQuote(s) { return `'${s.replace(/'/g, `'\\''`)}'`; }

function truncateArrays(v, notesOut, path = '') {
  if (Array.isArray(v)) {
    const keep = v.slice(0, 3).map((x, i) => truncateArrays(x, notesOut, `${path}[${i}]`));
    if (v.length > 3) notesOut.push(`\`${path || '(root)'}\` shows 3 of ${v.length} items`);
    return keep;
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = truncateArrays(x, notesOut, path ? `${path}.${k}` : k);
    return o;
  }
  return v;
}

// ---------------------------------------------------------------------------
// Public wording
// ---------------------------------------------------------------------------
//
// The examples were captured against a development stack with email, payments,
// webhook delivery and file scanning switched off. The published pages describe
// the behaviour a customer sees, not that stack: notes are rewritten here, and
// loopback hosts in captured requests and responses are swapped for neutral ones.
// COVERAGE.md (not published) keeps the maintainer's wording.

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/;

const PUBLIC_NOTES = [
  [/^(Why this is not the success path: )?Live environment only\..*/s, 'Live environment only. A sandbox key, or a session in the sandbox environment, gets this `422`.'],
  [/^(Why this is not the success path: )?Sandbox sending requires a verified email address\..*/s, 'Sending, including in the sandbox, requires the workspace owner to have verified their email address. Until then every send is refused with this `403`. The success shape is in the Responses table.'],
  [/^(Why this is not the success path: )?Email login codes are delivered by email.*/s, 'This is the `503` returned when email delivery is unavailable. Normally the request answers `202` and the code is emailed.'],
  [/^(Why this is not the success path: )?Email delivery is disabled.*/s, 'This is the `503` returned when email delivery is unavailable. Normally the request answers `202` and the verification email is sent.'],
  [/^(Why this is not the success path: )?Reset links are emailed.*/s, 'This is the `503` returned when email delivery is unavailable. Normally the request answers `202` and the reset link is emailed.'],
  [/^(Why this is not the success path: )?Tickets are issued only over HTTPS.*/s, 'Tickets are issued only over HTTPS and only to an allowed `Origin`. A request over plain HTTP, or from an origin that is not allowed, is refused like this.'],
  [/^(Why this is not the success path: )?Cookie mode is off.*/s, 'Cookie mode is optional and needs HTTPS and an allowed `Origin`. Where a deployment does not enable it the route is not mounted and answers `404`.'],
  [/^(Why this is not the success path: )?Phone codes are sent by SMS.*/s, 'This is the `503` returned when the SMS verification provider is unavailable. Normally the code is sent by SMS.'],
  [/^(Why this is not the success path: )?Only documents whose malware scan is `clean`.*/s, 'Only documents whose malware scan is `clean` can be downloaded. While a document is still `pending` its scan, the download answers `404`.'],
  [/^(Why this is not the success path: )?Saved cards exist only in the live environment.*/s, 'Saved cards exist only in the live environment, after a card payment, so a sandbox request is refused like this.'],
  [/^(Why this is not the success path: )?Top-ups go through Paystack.*/s, 'Top-ups go through Paystack in the live environment, so a sandbox request is refused like this.'],
  [/^(Why this is not the success path: )?Only terminal deliveries can be replayed.*/s, 'Only terminal deliveries can be replayed. A delivery that is still `pending` is refused with `409`, as here.'],
  [/^(Why this is not the success path: )?Only a sender whose request or a registration was rejected.*/s, 'Only a sender ID whose request or registration was rejected can be amended. One that is still `pending_admin` is refused like this.'],
  [/^(Why this is not the success path: )?The group send is accepted as a batch.*/s, 'The group send is accepted as a batch. Here the workspace owner had not verified their email yet, so every recipient was refused at admission and the batch is `failed` with all rows invalid.'],
  [/^The docs stack has no customer-visible KE routes.*/s, 'No customer-visible routes were configured for KE when this was captured, so the list is empty.'],
  [/^Empty because sandbox sending is refused.*/s, 'Empty here because no sandbox message had been sent from this workspace yet.'],
  [/^The docs stack has no number inventory.*/s, 'No numbers matched this search when it was captured, so the list is empty.'],
  [/^Served only on the optional dedicated metrics listener.*/s, 'Operator-only: served on a separate metrics listener that the operator enables, never on the public API. On the API itself this path answers `404`.'],
  [/^No scenario written for this operation\.$/, ''],
  [/^W.*Same limitation: there is no second member to remove\./s, 'This workspace has no second member, so removing one answers `404`, as here.'],
  [/^W.*Same limitation: there is no second member to transfer ownership to\./s, 'Ownership can only move to an existing member of the workspace. Naming anyone else is refused like this.'],
  [/^W.*No second member can join locally.*/s, 'The user named here is not a member of the workspace, so the call answers `404`.'],
  [/^W.*Requires a verified email identity.*/s, 'This needs a verified email address. Until the account has one, the call is refused like this.'],
  [/^W.*Invoices are issued for live spend only.*/s, 'Invoices are issued for live spend only. This shows the answer for an unknown invoice ID.'],
  [/^W.*No scheduled message can be created locally.*/s, 'This shows the answer for an unknown message ID.'],
  [/^W.*No message can be created locally.*/s, 'This shows the answer for an unknown message ID.'],
  [/^W.*Only an upstream provider holding that provider's receipt credential.*/s, "Only an upstream provider holding that provider's receipt credential can post receipts. Without it the endpoint answers `401`, as here."],
  [/^W.*Alias of \/v1\/auth\/password\/forgot.*/s, 'Alias of `/v1/auth/password/forgot`, with the same behaviour.'],
  [/^W.*Alias of \/v1\/auth\/password\/reset.*/s, 'Alias of `/v1/auth/password/reset`, with the same behaviour.'],
  [/^W.*Alias of the \/replay route.*/s, 'Alias of the `/replay` route, with the same behaviour.'],
  [/^W.*Accepting requires the invitee to have a verified email.*/s, 'Accepting an invitation requires the invitee to have a verified email address. Until they do, it is refused like this.'],
  [/^W.*No code can be received without email delivery.*/s, 'This shows the answer to a wrong or expired code.'],
  [/^W.*No verification code can be received.*/s, 'This shows the answer to a wrong or expired verification code.'],
  [/^W.*A valid reset token only arrives by email.*/s, 'This shows the answer to an invalid or expired reset token. A valid token arrives in the reset email.'],
  [/^W.*The start call succeeds, but every row is refused at admission.*/s, 'The start call succeeds. Here the workspace owner had not verified their email yet, so every row was refused at admission and the batch ended `failed`.'],
  [/^W.*The only batch that can exist locally has already finished.*/s, 'Only a batch that is still running can be stopped. This one had already finished, so the answer is `409`.'],
  [/^W.*No challenge can be issued locally.*/s, 'This shows the answer for an unknown challenge ID.'],
  [/^W.*Going live needs every onboarding step.*/s, 'Going live needs every onboarding step to be complete, including a verified email address. Until then the request is refused like this.'],
  [/^W.*No OTP can be sent locally.*/s, 'This shows the answer for an unknown `otp_id`.'],
];

/** A note as a customer should read it. Fails the render on unmapped stack wording. */
function publicNote(note) {
  for (const [re, text] of PUBLIC_NOTES) if (re.test(note)) return text;
  if (/docs stack|local stack|locally|not the success path|disabled here|127\.0\.0\.1|localhost/i.test(note)) {
    throw new Error(`gen-reference: add a public wording for this note to PUBLIC_NOTES:\n  ${note}`);
  }
  return note;
}

/** A captured example with loopback hosts replaced by neutral documentation values. */
function publicValue(v) {
  if (typeof v === 'string') {
    return v.replace(/https?:\/\/localhost:5190/g, 'https://app.example.com').replace(/\b127\.0\.0\.1\b/g, '203.0.113.24');
  }
  if (Array.isArray(v)) return v.map(publicValue);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, publicValue(x)]));
  return v;
}

function renderExample(e) {
  const lines = [];
  lines.push(`**Example${e.title ? `: ${e.title}` : ''}**`, '');
  e = publicValue(e);
  const curl = [`curl -s -X ${e.request.method} "$OPENSMS_API${e.request.url}"`];
  for (const [h, v] of Object.entries(e.request.headers ?? {})) curl.push(`  -H ${shellQuote(`${h}: ${v}`)}`);
  if (e.request.body !== undefined) {
    if (typeof e.request.body === 'string') curl.push(`  --data-binary ${shellQuote(e.request.body)}`);
    else { const j = JSON.stringify(e.request.body); curl.push(`  -d ${shellQuote(j.length <= 90 ? j : pretty(e.request.body))}`); }
  }
  if (e.request.form) for (const [k, v] of Object.entries(e.request.form)) curl.push(`  -F ${shellQuote(`${k}=${v}`)}`);
  lines.push('```bash', curl.join(' \\\n'), '```', '');
  const tn = [];
  const body = e.response.body;
  lines.push(`Response \`${e.response.status}\`${e.response.contentType ? ` (\`${e.response.contentType}\`)` : ''}:`, '');
  if (body === null || body === '' || body === undefined) lines.push('_Empty body._', '');
  else if (typeof body === 'string') lines.push('```text', body.length > 1200 ? body.slice(0, 1200) + '\n...' : body, '```', '');
  else lines.push('```json', pretty(truncateArrays(body, tn)), '```', '');
  if (tn.length) lines.push(`Truncated for length: ${tn.join('; ')}.`, '');
  if (e.note && publicNote(e.note)) lines.push(publicNote(e.note), '');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

/** 'yes' when a 2xx was captured, 'error path only' when only refusals could be, else 'no'. */
function liveLabel(ex) {
  if (!ex.length) return 'no';
  return ex.some((e) => e.response.status < 300) ? 'yes' : 'error path only';
}

const HEADER = '<!-- Generated by scripts/gen-reference.mjs from api/openapi/customer.yaml. Do not edit by hand: change the spec or the scenarios and regenerate. -->\n';

function renderGroupPage(spec, g, ops, examples) {
  const lines = [HEADER, `# ${g.title}`, '', g.intro, ''];
  lines.push(`Back to the [API reference index](README.md). Shared shapes are in [Schemas](schemas.md); conventions (auth headers, errors, pagination, idempotency) are in the [index](README.md#conventions).`, '');
  lines.push('| Method | Path | Summary |', '| --- | --- | --- |');
  for (const o of ops) lines.push(`| ${o.method} | [\`${o.path}\`](#${anchor(`${o.method} ${o.path}`)}) | ${cell(o.op.summary)} |`);
  lines.push('');
  for (const o of ops) lines.push(renderOperation(spec, o, examples), '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function renderSchemasPage(spec) {
  const lines = [HEADER, '# Schemas', '', 'Every named schema in the customer contract (`components.schemas` in the OpenAPI document), for developers who need the exact shape of a request or response body. Operation pages link here whenever a body is a named schema. Nested objects are flattened with dotted names, and `[]` marks the fields of array items.', '', 'Back to the [API reference index](README.md).', ''];
  const names = Object.keys(spec.components.schemas).sort((a, b) => a.localeCompare(b));
  lines.push(names.map((n) => `[${n}](#${anchor(n)})`).join(' · '), '');
  for (const n of names) {
    const s = spec.components.schemas[n];
    const ctx = { onSchemasPage: true };
    lines.push(`## ${n}`, '');
    if (s.description) lines.push(s.description, '');
    if (isInlineObject(s)) {
      const c2 = { ...ctx, closed: false };
      lines.push(table(['Field', 'Type', 'Required', 'Default', 'Notes'], fieldRows(spec, s, c2)));
      if (c2.closed) lines.push('Unknown fields are rejected (`additionalProperties: false`).', '');
      const extra = [];
      for (const k of ['minProperties', 'not', 'oneOf', 'anyOf']) if (s[k] !== undefined) extra.push(`${k} \`${JSON.stringify(s[k])}\``);
      if (extra.length) lines.push(`Object constraints: ${extra.join(', ')}.`, '');
    } else {
      lines.push(renderBodySchema(spec, s, ctx), '');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/ · /g, ', ');
}

function renderIndex(spec, all, examples) {
  const lines = [HEADER, '# Customer API reference', ''];
  lines.push('The exact contract of the OpenSMS customer API, for developers integrating with it. It is generated from the OpenAPI contract of record and lists every operation with its auth, parameters, request fields, responses and error statuses, and almost every operation also carries an example request and response. If you are new to OpenSMS, start with the task guides in [Integrate](../../integrate/) and come back here for field-level detail.', '');
  lines.push(`Contract version \`${spec.info.version}\` (OpenAPI \`${spec.openapi}\`): ${Object.keys(spec.paths).length} paths, ${all.length} operations, ${Object.keys(spec.components.schemas).length} named schemas.`, '');
  lines.push('> **Pre-launch.** OpenSMS is not publicly available yet. Sandbox access, and the API origin to use as `$OPENSMS_API`, come with an invitation from the [waitlist](https://opensms.io/#docs).', '');
  lines.push('## Pages', '');
  lines.push('| Page | Operations | Contract tag | Covers |', '| --- | --- | --- | --- |');
  for (const g of GROUPS) {
    const n = all.filter((o) => o.group === g.slug).length;
    const tags = [...new Set(all.filter((o) => o.group === g.slug).map((o) => o.tag ?? 'untagged'))].join(', ');
    lines.push(`| [${g.title}](${g.slug}.md) | ${n} | ${tags} | ${cell(g.intro.split('. ')[0])}. |`);
  }
  lines.push(`| [Schemas](schemas.md) | | | Every named request and response schema. |`, '');
  lines.push('The contract tags only ' + all.filter((o) => o.tag).length + ` of ${all.length} operations. Tagged operations sit on their tag's page; untagged operations are placed by path prefix (for example \`/v1/contacts\` and \`/v1/contact-groups\` share "Contacts and groups"). The "Contract tag" column shows which is which.`, '');
  lines.push('## Conventions', '');
  lines.push('**Base URL.** Customer routes live under `/v1` on the API port; public routes (`/status`, `/healthz`, `/readyz`, `/callbacks/...`) sit at the root. The examples use `$OPENSMS_API` for the base URL: the API origin from your sandbox invitation.', '');
  lines.push('**Authentication.** Two bearer credentials exist (`components.securitySchemes`):', '');
  lines.push(table(['Scheme', 'Header', 'Used by', 'Workspace and environment'], [
    ['`Session`', '`Authorization: Bearer sess_...`', 'People: the customer app, or a script acting as a signed-in user. Returned by signup and login.', 'Send `X-Workspace-ID: <workspace uuid>` and `X-Environment: sandbox` or `live` on workspace-scoped calls. The contract marks both headers optional (because API keys ignore them), but session calls without `X-Environment` are rejected with 400.'],
    ['`ApiKey`', '`Authorization: Bearer sk_test_...` or `sk_live_...`', 'Servers. Minted with `POST /v1/keys`; the secret is shown once.', 'The key carries its own workspace and environment (`sk_test_` = sandbox, `sk_live_` = live) and ignores both headers.'],
  ]));
  lines.push('Each operation lists the alternatives it accepts. "API key with scope `x`" means the key must hold that scope; a key without it gets `403` (see the [templates drift note](COVERAGE.md#contract-drift) for one place where the contract under-declares a scope). Operations that list only a session reject API keys with `401` "Browser session required." (example under [GET /v1/workspace](workspaces.md#get-v1workspace)).', '');
  lines.push('**Errors.** Errors use RFC 9457 problem details (`application/problem+json`, schema [Problem](schemas.md#problem)): `type`, `title`, `status`, `detail`, and sometimes `code`, `trace_id` and a per-field `errors` map. A real one:', '');
  const pe = Object.values(examples).flat().find((e) => e?.response?.body?.errors && e.response.status === 400) ?? Object.values(examples).flat().find((e) => e?.response?.status >= 400 && e?.response?.body?.detail);
  if (pe) lines.push('```json', pretty(pe.response.body), '```', '', `(from \`${pe.request.method} ${pe.request.url}\`)`, '');
  lines.push('**Pagination.** Most list endpoints return `{"items": [...], "next_cursor": "..."|null}` and accept `limit` and `cursor` (pass the previous page\'s `next_cursor`). Limits differ per operation (for example 1 to 200 with default 50 on most collections, 1 to 100 with default 20 on `GET /v1/messages`); each operation\'s Parameters table has the exact range. A few older lists return a bare array or a named array (`data`, `sessions`, `documents`); each operation shows its shape.', '');
  lines.push('**Idempotency.** Many create operations require an `Idempotency-Key` header (1 to 200 or 255 bytes, see each operation). Repeating a request with the same key and body replays the original result instead of creating a duplicate; reusing a key with a different body is a `409`. Both are shown under [POST /v1/templates](templates.md#post-v1templates).', '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function renderCoverage(spec, all, examples) {
  const lines = [HEADER, '# Reference coverage', ''];
  lines.push('Which customer operations were exercised against a live local stack while writing this reference, with the observed status, and why the rest were not. For maintainers of these docs and anyone judging how far to trust an example. Every example on the reference pages is a real response from these runs (secrets redacted to a prefix).', '');
  const yes = all.filter((o) => liveLabel(examples[o.key] ?? []) === 'yes').length;
  const errOnly = all.filter((o) => liveLabel(examples[o.key] ?? []) === 'error path only').length;
  lines.push(`Exercised live: **${yes + errOnly} of ${all.length}** operations. **${yes}** returned a success status; **${errOnly}** could only be exercised up to a refusal (\`error path only\`), and the "Notes" column says why. **${all.length - yes - errOnly}** not called.`, '');
  lines.push('**Regenerating.** From the docs repo: `node scripts/gen-reference.mjs` re-renders from the spec and the saved examples; `node scripts/gen-reference.mjs --capture` re-runs every example against a live API first (it needs `OPENSMS_API`, `OPENSMS_ADMIN_EMAIL` and `OPENSMS_ADMIN_PASSWORD`). `tests/reference.test.mjs` replays the examples and fails if a status code or key field changes. The published pages reword the notes below for customers (`PUBLIC_NOTES` in the generator) and swap loopback hosts for documentation values.', '');
  lines.push(`Stack: API built from this repo, development mode, with email delivery, live SMS dispatch, webhook delivery, payments and top-ups disabled, so flows that depend on those can only be shown up to the point where they stop.`, '');
  lines.push('## Why some operations only show a refusal', '');
  lines.push(table(['Local limitation', 'Effect'], [
    ['Email delivery is disabled, so no account can verify its email address.', 'Sandbox sending (`POST /v1/messages`, `/v1/otp/send`, batch and group sends) is refused with 403 or every row is refused; email login codes, password reset, invitation acceptance and received invitations cannot be completed; going live cannot be requested.'],
    ['No live workspace exists (going live needs a verified email).', 'Live-only operations (numbers, inbound replies, auto top-up, manual top-up, payment methods) answer 422.'],
    ['Payments, webhook delivery and file scanning are disabled.', 'Card top-ups are refused; webhook deliveries stay `pending` so replays are refused; uploaded documents stay unscanned so downloads answer 404.'],
    ['Cookie mode, HTTPS and the metrics listener are off.', '`/v1/auth/cookie/exchange` is not mounted (404), realtime tickets are refused (403), `/metrics` is not served on the API port.'],
  ]));
  lines.push('## Contract drift', '');
  lines.push('Places where the contract and the running code disagree. Code wins: the reference pages document the contract, and the examples show what the code actually returns.', '');
  const drift = [...staticDrift(spec), ...(examples.__drift ?? [])];
  if (drift.length) for (const d of drift) lines.push(`- ${d}`);
  else lines.push('- None found.');
  lines.push('');
  lines.push('## Routes served but not in the contract', '');
  lines.push('The customer API mounts these routes (`api/cmd/opensms/main.go`), but `customer.yaml` does not declare them, so they have no section on the reference pages. Statuses are from requests made against the docs stack.', '');
  lines.push(table(['Route', 'What it does', 'Observed on the docs stack'], [
    ['`POST /v1/sender-documents`', 'Upload one sender ID supporting document (multipart `kind` + `file`, optional `replaces_document_id`). Session only, owner or admin. Needed for `POST /v1/sender-ids`; see the note on [Sender IDs](sender-ids.md).', '201 for a PNG of each kind; an API key gets 401.'],
    ['`GET /v1/sender-documents`', 'List the workspace\'s sender documents as `{"items": [...]}`.', '200 with a session.'],
    ['`GET /v1/sender-documents/{id}/download`', 'Download a sender document. Only documents whose scan is `clean` are served.', '404, because file scanning is disabled and uploads stay `pending`.'],
    ['`GET /v1/realtime`', 'The WebSocket upgrade for the realtime event stream. Authenticates with an `Authorization` bearer, an `access_token` query parameter, or a one-use `ticket` from [POST /v1/realtime/tickets](realtime.md#post-v1realtimetickets).', '401 "authentication required" for a plain (non-upgrade) request with an API key.'],
    ['`GET /legal/{terms,privacy,dpa}/1.0`', 'Public HTML of each legal document version. These are the `url` values that [GET /v1/legal/documents](legal.md#get-v1legaldocuments) returns. GET and HEAD only; any other path under `/legal/` is 404.', '200 `text/html` for `/legal/terms/1.0`.'],
    ['`POST /v1/payments/paystack/webhook`', 'Paystack payment event receiver. Mounted only when `OPENSMS_PAYSTACK_SECRET` is set.', '404, because payments are disabled on the docs stack.'],
  ]));
  lines.push('## Operations', '');
  lines.push('| Operation ID | Operation | Page | Exercised live | Result status | Why not / notes |', '| --- | --- | --- | --- | --- | --- |');
  for (const o of all) {
    const ex = examples[o.key] ?? [];
    const g = GROUPS.find((x) => x.slug === o.group);
    const link = `[${o.method} \`${o.path}\`](${g.slug}.md#${anchor(`${o.method} ${o.path}`)})`;
    const statuses = [...new Set(ex.map((e) => e.response.status))].join(', ');
    lines.push(`| ${o.op.operationId ? `\`${o.op.operationId}\`` : '_none_'} | ${link} | ${g.title} | ${liveLabel(ex)} | ${statuses || examples.__probe?.[o.key] || ''} | ${ex.length ? cell(examples.__partial?.[o.key] ?? '') : cell(examples.__notExercised?.[o.key] ?? 'not attempted')} |`);
  }
  lines.push('', 'When "Exercised live" is `no`, "Result status" shows what an authenticated probe of the route returned, which at least proves the route is mounted.', '');
  return lines.join('\n');
}

export function render(examples = existsSync(EXAMPLES_PATH) ? JSON.parse(readFileSync(EXAMPLES_PATH, 'utf8')) : {}) {
  const spec = loadSpec();
  const all = operations(spec);
  mkdirSync(OUT_DIR, { recursive: true });
  for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.md')) unlinkSync(resolve(OUT_DIR, f));
  for (const g of GROUPS) {
    const ops = all.filter((o) => o.group === g.slug);
    if (!ops.length) throw new Error(`group ${g.slug} has no operations`);
    writeFileSync(resolve(OUT_DIR, `${g.slug}.md`), renderGroupPage(spec, g, ops, examples));
  }
  writeFileSync(resolve(OUT_DIR, 'schemas.md'), renderSchemasPage(spec));
  writeFileSync(resolve(OUT_DIR, 'README.md'), renderIndex(spec, all, examples));
  writeFileSync(resolve(OUT_DIR, 'COVERAGE.md'), renderCoverage(spec, all, examples));
  return { operations: all.length, groups: GROUPS.length };
}

// ---------------------------------------------------------------------------
// Live scenarios
// ---------------------------------------------------------------------------

/** RFC 6238 TOTP (SHA-1, 30 s steps, 6 digits), used by the two-factor examples. */
export function totp(secret, t = Date.now()) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += alpha.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const SECRET_FIELDS = new Set(['token', 'key', 'secret', 'challenge_token', 'csrf_token', 'ticket', 'recovery_code']);

/** Shorten anything credential-like to a recognisable prefix. */
export function redactString(s, field) {
  if (typeof s !== 'string') return s;
  if (/^Bearer \S+$/.test(s)) return `Bearer ${redactString(s.slice(7))}`;
  if (/^sess_./.test(s)) return s.slice(0, 9) + '...';
  if (/^sk_(test|live)_./.test(s)) return s.slice(0, 11) + '...';
  if (/^whsec_./.test(s)) return s.slice(0, 9) + '...';
  if (/^challenge_/.test(s)) return s.slice(0, 13) + '...';
  if (/^rc_[0-9a-f]+$/.test(s)) return s.slice(0, 6) + '...';
  if (/^otpauth:/.test(s)) return s.replace(/secret=[^&]+/, 'secret=REDACTED');
  if (field && SECRET_FIELDS.has(field)) return s.slice(0, 6) + '...';
  return s
    .replace(/token=[0-9a-f-]{8,}/g, (m) => m.slice(0, 12) + '...')
    .replace(/\/([0-9a-f]{64})(?=\/|$)/g, (m, t) => `/${t.slice(0, 6)}...`);
}

export function redact(v, field) {
  if (Array.isArray(v)) return v.map((x) => redact(x, field));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]));
  return redactString(v, field);
}

function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

/** Minimal JSON Schema check of a live body against the contract. Collects messages in out. */
function validate(spec, schema, value, where, out, depth = 0) {
  if (!schema || depth > 12) return;
  if (schema.$ref) { validate(spec, deref(spec, schema), value, where, out, depth + 1); return; }
  for (const s of schema.allOf ?? []) validate(spec, s, value, where, out, depth + 1);
  const alts = schema.oneOf ?? schema.anyOf;
  if (alts) {
    const ok = alts.some((a) => { const o = []; validate(spec, a, value, where, o, depth + 1); return o.length === 0; });
    if (!ok) out.push(`${where} matches none of the declared alternatives`);
    return;
  }
  const types = Array.isArray(schema.type) ? [...schema.type] : schema.type ? [schema.type] : [];
  if (schema.nullable) types.push('null');
  const actual = jsonType(value);
  if (types.length && !types.some((t) => t === actual || (t === 'number' && actual === 'integer'))) {
    out.push(`${where} is ${actual}, contract says ${types.join(' or ')}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) out.push(`${where} = ${JSON.stringify(value)} is not in the contract enum`);
  if (actual === 'object') {
    for (const r of schema.required ?? []) if (!(r in value)) out.push(`${where}.${r} is required by the contract but missing`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) validate(spec, schema.properties[k], v, `${where}.${k}`, out, depth + 1);
      else if (schema.additionalProperties === false) out.push(`${where}.${k} is returned but not declared (schema is closed)`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(spec, schema.additionalProperties, v, `${where}.${k}`, out, depth + 1);
    }
  }
  if (actual === 'array' && schema.items) value.slice(0, 5).forEach((x, i) => validate(spec, schema.items, x, `${where}[${i}]`, out, depth + 1));
}

let specText;
function specLine(path, method) {
  specText ??= readFileSync(SPEC_PATH, 'utf8').split('\n');
  const pi = specText.findIndex((l) => l === `  ${path}:`);
  if (pi < 0) return `api/openapi/customer.yaml`;
  let mi = specText.findIndex((l, i) => i > pi && l === `    ${method.toLowerCase()}:`);
  if (mi < 0) mi = pi;
  return `api/openapi/customer.yaml:${mi + 1}`;
}

/** Shape drift for one live response, as human-readable strings. */
function shapeDrift(spec, opsByKey, key, status, contentType, body) {
  const o = opsByKey.get(key);
  if (!o) return [`${key} is not in the contract`];
  const where = `${key} (${specLine(o.path, o.method)})`;
  const r = o.op.responses?.[String(status)];
  if (!r) return [`${where} answered ${status}, which the contract does not list (documented: ${Object.keys(o.op.responses ?? {}).join(', ')})`];
  const resp = deref(spec, r);
  if (!resp.content || body === null || body === '' || body === undefined) return [];
  const media = resp.content[contentType] ?? resp.content['application/json'] ?? Object.values(resp.content)[0];
  if (!media?.schema) return [];
  if (!resp.content[contentType] && contentType && !/problem/.test(contentType)) return [`${where} ${status} returned \`${contentType}\`, contract declares ${Object.keys(resp.content).map((x) => `\`${x}\``).join(', ')}`];
  if (typeof body === 'string' && (media.schema.type === 'string' || !media.schema.type)) return [];
  const out = [];
  validate(spec, media.schema, body, 'body', out);
  return out.map((m) => `${where} ${status}: ${m}`);
}

const ZERO = '00000000-0000-4000-8000-000000000000';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const LIVE_ONLY = 'Live environment only. The docs stack has no live workspace (going live needs a verified email, which needs email delivery, disabled here), so only the sandbox refusal is shown.';
const EMAIL_BLOCK = 'Sandbox sending requires a verified email address. The docs stack has email delivery disabled, so no account can verify its email and every send is refused with this 403; the success shape is in the Responses table.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(fn, until, tries = 30) {
  let last;
  for (let i = 0; i < tries; i += 1) { last = await fn(); if (until(last)) return last; await sleep(500); }
  return last;
}

/**
 * The scenario list. Each step is one real HTTP call:
 *   op       operation key "METHOD /path/template" (must exist in the contract)
 *   auth     'none' | 'session' (token + X-Workspace-ID + X-Environment) | 'bare' (token only) | 'key'
 *   url, body, form: values or functions of ctx
 *   idem     add an Idempotency-Key header
 *   expect   status (or list) the step must return
 *   check    (res, ctx) => error string or undefined, for key fields
 *   save     (ctx, res) => void
 *   record   false to run without publishing
 *   partial  note shown when the success path cannot be demonstrated locally
 */
function scenarioList() {
  const S = 'session';
  const has = (...keys) => (res) => { const miss = keys.filter((k) => !(res.body && typeof res.body === 'object' && k in res.body)); return miss.length ? `missing ${miss.join(', ')}` : undefined; };
  return [
    // Health, status, catalogue (public)
    { op: 'GET /healthz', auth: 'none', url: '/healthz', expect: 200 },
    { op: 'GET /readyz', auth: 'none', url: '/readyz', expect: 200 },
    { op: 'GET /status', auth: 'none', url: '/status', expect: 200, check: has('status', 'components') },
    { op: 'POST /status/subscribe', auth: 'none', url: '/status/subscribe', limited: true, body: () => ({ email: `status-${Date.now()}@opensms.test` }), expect: 202, check: has('id', 'status', 'confirm_url'), save: (c, r) => { c.statusConfirm = r.body.confirm_url; } },
    { op: 'GET /status/subscribe/confirm', auth: 'none', needs: (c) => c.statusConfirm, url: (c) => c.statusConfirm, expect: 200, check: has('id', 'status') },
    { op: 'GET /v1/countries', auth: 'none', url: '/v1/countries', expect: 200 },
    { op: 'GET /v1/countries/{iso2}/carriers', auth: 'none', url: '/v1/countries/KE/carriers', expect: 200 },
    { op: 'GET /v1/countries/{iso2}/routes', auth: 'none', url: '/v1/countries/KE/routes', expect: 200, note: 'The docs stack has no customer-visible KE routes configured, so the list is empty.' },
    { op: 'GET /v1/countries/{iso2}/compliance', auth: 'none', url: '/v1/countries/KE/compliance', expect: 200, check: has('iso2', 'stop_keywords', 'quiet_hours') },

    // Authentication
    { op: 'POST /v1/auth/signup', auth: 'none', url: '/v1/auth/signup', body: (c) => ({ email: c.ws.email.replace('@', '-2@'), password: 'Docs-Test-Passw0rd-2026!', country_iso2: 'KE', workspace_name: 'Acme Kenya' }), expect: 201, check: has('token', 'user', 'workspace', 'role') },
    { op: 'POST /v1/auth/signup', title: 'validation errors', auth: 'none', url: '/v1/auth/signup', body: { email: 'not-an-email', password: 'short', country_iso2: 'Kenya' }, expect: 400 },
    { op: 'POST /v1/auth/login', auth: 'none', url: '/v1/auth/login', body: (c) => ({ email: c.ws.email, password: c.ws.password }), expect: 201, check: has('token', 'expires_at'), save: (c, r) => { c.second = r.body.token; } },
    { op: 'GET /v1/auth/sessions', url: '/v1/auth/sessions', expect: 200, check: has('sessions'), save: (c, r) => { c.otherSession = r.body.sessions.find((x) => !x.current)?.id; } },
    { op: 'DELETE /v1/auth/sessions/{id}', method: 'DELETE', url: (c) => `/v1/auth/sessions/${c.otherSession}`, expect: 204 },
    { op: 'GET /v1/me', url: '/v1/me', expect: 200, check: has('user', 'workspace', 'role') },
    { op: 'POST /v1/auth/2fa/setup', auth: 'bare', url: '/v1/auth/2fa/setup', expect: 200, check: has('secret', 'otpauth_uri'), save: (c, r) => { c.totp = r.body.secret; } },
    { op: 'POST /v1/auth/2fa/enable', auth: 'bare', url: '/v1/auth/2fa/enable', body: (c) => ({ code: totp(c.totp) }), expect: 200, check: has('enabled') },
    { op: 'POST /v1/auth/2fa/verify', auth: 'bare', url: '/v1/auth/2fa/verify', body: (c) => ({ code: totp(c.totp) }), expect: 200, check: has('valid') },
    { op: 'POST /v1/auth/login', title: 'account with two-factor enabled', auth: 'none', url: '/v1/auth/login', body: (c) => ({ email: c.ws.email, password: c.ws.password }), expect: 202, check: has('challenge_token', 'two_factor_required'), save: (c, r) => { c.challenge = r.body.challenge_token; } },
    { op: 'POST /v1/auth/login/2fa', auth: 'none', url: '/v1/auth/login/2fa', body: (c) => ({ challenge_token: c.challenge, code: totp(c.totp) }), expect: 201, check: has('token'), save: (c, r) => { c.ws.token = r.body.token; } },
    { op: 'POST /v1/auth/2fa/recovery-codes', auth: 'bare', url: '/v1/auth/2fa/recovery-codes', body: (c) => ({ code: totp(c.totp) }), expect: 200, check: has('codes'), save: (c, r) => { c.recovery = r.body.codes; } },
    { op: 'POST /v1/auth/2fa/recovery-enrollment', auth: 'bare', url: '/v1/auth/2fa/recovery-enrollment', body: (c) => ({ recovery_code: c.recovery[0] }), expect: 200, check: has('enrollment_id', 'secret'), save: (c, r) => { c.enroll = r.body; } },
    { op: 'POST /v1/auth/2fa/recovery-enrollment/confirm', auth: 'bare', url: '/v1/auth/2fa/recovery-enrollment/confirm', body: (c) => ({ enrollment_id: c.enroll.enrollment_id, code: totp(c.enroll.secret) }), expect: 200, check: has('totp_enabled'), save: (c) => { c.totp = c.enroll.secret; } },
    { op: 'POST /v1/auth/login/code', auth: 'none', url: '/v1/auth/login/code', body: (c) => ({ email: c.ws.email }), expect: 503, partial: 'Email login codes are delivered by email, which is disabled on the docs stack, so the request is refused with 503 instead of 202.' },
    { op: 'POST /v1/auth/login/code/verify', auth: 'none', url: '/v1/auth/login/code/verify', body: (c) => ({ email: c.ws.email, code: '123456' }), expect: [400, 401], partial: 'No code can be received without email delivery, so only a rejected code is shown.' },
    { op: 'POST /v1/auth/email/send', auth: 'bare', url: '/v1/auth/email/send', expect: 503, partial: 'Email delivery is disabled on the docs stack, so the handler refuses with 503 instead of 202.' },
    { op: 'POST /v1/auth/verify-email', auth: 'bare', url: '/v1/auth/verify-email', body: { code: '123456' }, expect: 400, partial: 'No verification code can be received without email delivery, so only a rejected code is shown.' },
    { op: 'POST /v1/auth/password/forgot', auth: 'none', url: '/v1/auth/password/forgot', body: (c) => ({ email: c.ws.email }), expect: 503, partial: 'Reset links are emailed, and email delivery is disabled on the docs stack, so the handler answers 503 instead of 202.' },
    { op: 'POST /v1/auth/forgot-password', auth: 'none', url: '/v1/auth/forgot-password', body: (c) => ({ email: c.ws.email }), expect: 503, partial: 'Alias of /v1/auth/password/forgot; same email-delivery limitation.' },
    { op: 'POST /v1/auth/password/reset', auth: 'none', url: '/v1/auth/password/reset', body: { token: 'reset_0000000000000000', password: 'New-Passw0rd-2026!' }, expect: 400, partial: 'A valid reset token only arrives by email (disabled here), so only a rejected token is shown.' },
    { op: 'POST /v1/auth/reset-password', auth: 'none', url: '/v1/auth/reset-password', body: { token: 'reset_0000000000000000', password: 'New-Passw0rd-2026!' }, expect: 400, partial: 'Alias of /v1/auth/password/reset; same limitation.' },
    { op: 'POST /v1/auth/cookie/exchange', auth: 'bare', url: '/v1/auth/cookie/exchange', headers: { Origin: 'http://localhost:5190', 'X-CSRF-Token': 'exchange' }, expect: 404, partial: 'Cookie mode is off on the docs stack (it also requires HTTPS and an allowed Origin), and when it is off the route is not mounted, so it answers 404.' },

    // Workspaces and settings
    { op: 'GET /v1/workspace', url: '/v1/workspace', expect: 200, check: has('id', 'name', 'currency') },
    { op: 'GET /v1/workspace', title: 'API key on a session-only operation', auth: 'key', url: '/v1/workspace', expect: 401 },
    { op: 'PUT /v1/workspace', method: 'PUT', url: '/v1/workspace', body: { name: 'Acme Kenya' }, expect: 200, check: has('name') },
    { op: 'GET /v1/workspaces', auth: 'bare', url: '/v1/workspaces', expect: 200, check: has('items') },
    { op: 'POST /v1/workspaces', auth: 'bare', url: '/v1/workspaces', idem: true, body: { name: 'Acme Ghana', country_iso2: 'GH' }, expect: 201, check: has('id', 'currency') },
    { op: 'GET /v1/settings/retention', url: '/v1/settings/retention', expect: 200, check: has('days') },
    { op: 'PUT /v1/settings/retention', method: 'PUT', url: '/v1/settings/retention', body: { days: 90 }, expect: 200, check: has('days') },
    { op: 'GET /v1/workspace/retention', url: '/v1/workspace/retention', expect: 200, check: has('days') },
    { op: 'PUT /v1/workspace/retention', method: 'PUT', url: '/v1/workspace/retention', body: { days: 60 }, expect: 200, check: has('days') },
    { op: 'GET /v1/settings/spend-cap', url: '/v1/settings/spend-cap', expect: 200, check: has('amount') },
    { op: 'PUT /v1/settings/spend-cap', method: 'PUT', url: '/v1/settings/spend-cap', body: { amount: '5000' }, expect: 200, check: has('amount') },
    { op: 'GET /v1/workspace/spend-cap', url: '/v1/workspace/spend-cap', expect: 200, check: has('amount') },
    { op: 'PUT /v1/workspace/spend-cap', method: 'PUT', url: '/v1/workspace/spend-cap', body: { amount: null }, expect: 200, check: has('amount') },
    { op: 'GET /v1/settings/routing', url: '/v1/settings/routing', expect: 200, check: has('allow_fallback', 'pinned_provider_id') },
    { op: 'PUT /v1/settings/routing', method: 'PUT', url: '/v1/settings/routing', body: { allow_fallback: true }, expect: 200, check: has('allow_fallback') },
    { op: 'GET /v1/settings/notifications', url: '/v1/settings/notifications', expect: 200, check: has('items') },
    { op: 'PUT /v1/settings/notifications', method: 'PUT', url: '/v1/settings/notifications', body: { event: 'wallet.low_balance', channel: 'email', enabled: false }, expect: 200, check: has('items') },

    // Members and invitations
    { op: 'GET /v1/members', url: '/v1/members', expect: 200, check: has('items') },
    { op: 'POST /v1/members', url: '/v1/members', body: (c) => ({ email: c.mate.email, role: 'viewer' }), expect: 201, check: has('id', 'token', 'delivery_status'), save: (c, r) => { c.mateInvite = r.body.token; } },
    { op: 'POST /v1/auth/invitations/{token}/accept', auth: 'bare', token: (c) => c.mate.token, url: (c) => `/v1/auth/invitations/${c.mateInvite}/accept`, expect: 403, partial: 'Accepting requires the invitee to have a verified email, and email verification needs email delivery (disabled here), so only the refusal is shown.' },
    { op: 'PUT /v1/members/{user_id}/role', method: 'PUT', url: (c) => `/v1/members/${c.mate.userId}/role`, body: { role: 'developer' }, expect: 404, partial: 'No second member can join locally (invitation acceptance needs a verified email), so the call targets a real user who is not a member and gets 404.' },
    { op: 'POST /v1/members/{user_id}/transfer-ownership', url: (c) => `/v1/members/${c.mate.userId}/transfer-ownership`, body: (c) => ({ code: totp(c.totp) }), expect: 404, partial: 'Same limitation: there is no second member to transfer ownership to.' },
    { op: 'DELETE /v1/members/{user_id}', method: 'DELETE', url: (c) => `/v1/members/${c.mate.userId}`, expect: 404, partial: 'Same limitation: there is no second member to remove.' },
    { op: 'POST /v1/invitations', url: '/v1/invitations', body: () => ({ email: `teammate-${Date.now()}@opensms.test`, role: 'developer' }), expect: 201, check: has('id', 'token'), save: (c, r) => { c.invite = r.body.id; } },
    { op: 'GET /v1/invitations', url: '/v1/invitations', expect: 200, check: has('items') },
    { op: 'DELETE /v1/invitations/{id}', method: 'DELETE', url: (c) => `/v1/invitations/${c.invite}`, expect: 204 },
    { op: 'GET /v1/invitations/received', auth: 'bare', url: '/v1/invitations/received', expect: 403, partial: 'Requires a verified email identity, which cannot be obtained without email delivery, so the call is refused.' },

    // API keys
    { op: 'GET /v1/keys/scopes', url: '/v1/keys/scopes', expect: 200, check: has('scopes', 'environments'), save: (c, r) => { c.scopes = r.body.scopes; } },
    { op: 'POST /v1/keys', url: '/v1/keys', body: (c) => ({ label: 'reference docs', test: true, scopes: c.scopes }), expect: 201, check: (r) => (/^sk_test_/.test(r.body?.key ?? '') ? undefined : 'key is not sk_test_'), save: (c, r) => { c.key = r.body.key; c.keyId = r.body.key_info.id; } },
    { op: 'GET /v1/keys', url: '/v1/keys', expect: 200, check: (r, c) => (JSON.stringify(r.body).includes(c.key) ? 'secret listed' : has('items')(r)) },
    { op: 'POST /v1/keys', record: false, url: '/v1/keys', body: { label: 'to rotate', test: true }, expect: 201, save: (c, r) => { c.rotId = r.body.key_info.id; } },
    { op: 'POST /v1/keys/{id}/rotate', url: (c) => `/v1/keys/${c.rotId}/rotate`, idem: true, expect: 201, check: has('key', 'key_info'), save: (c, r) => { c.rotId = r.body.key_info.id; } },
    { op: 'DELETE /v1/keys/{id}', method: 'DELETE', url: (c) => `/v1/keys/${c.rotId}`, expect: 204 },

    // Messaging (API key)
    { op: 'POST /v1/messages', auth: 'key', url: '/v1/messages', idem: true, body: { to: '+254712345678', text: 'Your order 1042 has shipped.' }, expect: 403, partial: EMAIL_BLOCK },
    { op: 'POST /v1/messages', title: 'invalid recipient', auth: 'key', url: '/v1/messages', idem: true, body: { to: '0712345678', text: 'Hello' }, expect: 400 },
    { op: 'GET /v1/messages', auth: 'key', url: '/v1/messages?limit=10', expect: 200, check: has('items', 'next_cursor') },
    { op: 'GET /v1/messages/{id}', auth: 'key', url: `/v1/messages/${ZERO}`, expect: 404, partial: 'No message can be created locally (see POST /v1/messages), so only the not-found answer is shown.' },
    { op: 'GET /v1/messages/{id}/attempts', auth: 'key', url: `/v1/messages/${ZERO}/attempts`, expect: 404, partial: 'No message can be created locally, so only the not-found answer is shown.' },
    { op: 'POST /v1/messages/{id}/cancel', auth: 'key', url: `/v1/messages/${ZERO}/cancel`, expect: 404, partial: 'No scheduled message can be created locally, so only the not-found answer is shown.' },
    { op: 'GET /v1/sandbox/messages', auth: 'key', url: '/v1/sandbox/messages?limit=10', expect: 200, check: has('items'), note: 'Empty because sandbox sending is refused on the docs stack (see POST /v1/messages).' },
    { op: 'POST /v1/messages/batch', auth: 'key', url: '/v1/messages/batch', idem: true, body: { items: [{ to: '+254712345678', text: 'Hi Amina, your order has shipped.' }, { to: '+254722000111', text: 'Hi Brian, your order has shipped.' }, { to: '0700', text: 'bad number' }] }, expect: 202, check: has('id', 'status', 'total', 'invalid'), save: (c, r) => { c.batch = r.body.id; } },
    { op: 'GET /v1/batches/{id}', auth: 'key', url: (c) => `/v1/batches/${c.batch}`, expect: 200, check: has('id', 'status') },
    { op: 'GET /v1/batches/{id}/validation', auth: 'key', url: (c) => `/v1/batches/${c.batch}/validation`, expect: 200, check: has('rows', 'valid', 'invalid') },
    { op: 'POST /v1/batches/{id}/start', auth: 'key', url: (c) => `/v1/batches/${c.batch}/start`, idem: true, expect: 200, check: has('status'), partial: 'The start call succeeds, but every row is refused at admission because sandbox sending needs a verified email (disabled here), so the batch ends `failed`.' },
    { op: 'GET /v1/batches/{id}/items', auth: 'key', url: (c) => `/v1/batches/${c.batch}/items`, expect: 200, check: has('items') },
    { op: 'POST /v1/batches/{id}/stop', auth: 'key', url: (c) => `/v1/batches/${c.batch}/stop`, idem: true, expect: 409, partial: 'The only batch that can exist locally has already finished, so stopping it is a 409.' },
    { op: 'POST /v1/otp/send', auth: 'key', url: '/v1/otp/send', idem: true, body: { to: '+254712345678', length: 6, ttl_seconds: 300 }, expect: 403, partial: EMAIL_BLOCK },
    { op: 'POST /v1/otp/verify', auth: 'key', url: '/v1/otp/verify', body: { otp_id: ZERO, code: '123456' }, expect: [400, 404], partial: 'No OTP can be sent locally, so only an unknown otp_id is shown.' },

    // Templates
    { op: 'POST /v1/templates', auth: 'key', url: '/v1/templates', idem: 'tpl', body: { name: 'order_shipped', body: 'Hi {{name}}, order {{order}} has shipped.' }, expect: 201, check: has('id', 'variables'), save: (c, r) => { c.tpl = r.body.id; } },
    { op: 'POST /v1/templates', title: 'same Idempotency-Key and body: the original is replayed', auth: 'key', url: '/v1/templates', idem: 'tpl', body: { name: 'order_shipped', body: 'Hi {{name}}, order {{order}} has shipped.' }, expect: 201, check: (r, c) => (r.body?.id === c.tpl ? undefined : 'replay returned a different id') },
    { op: 'POST /v1/templates', title: 'same Idempotency-Key, different body', auth: 'key', url: '/v1/templates', idem: 'tpl', body: { name: 'order_delayed', body: 'Sorry {{name}}, order {{order}} is delayed.' }, expect: 409 },
    { op: 'GET /v1/templates', auth: 'key', url: '/v1/templates', expect: 200, check: has('items') },
    { op: 'GET /v1/templates/{id}', auth: 'key', url: (c) => `/v1/templates/${c.tpl}`, expect: 200, check: has('id', 'body') },
    { op: 'PATCH /v1/templates/{id}', auth: 'key', url: (c) => `/v1/templates/${c.tpl}`, body: { body: 'Hi {{name}}, order {{order}} is on its way.' }, expect: 200, check: has('body', 'variables') },
    { op: 'DELETE /v1/templates/{id}', auth: 'key', url: (c) => `/v1/templates/${c.tpl}`, expect: 204 },

    // Contacts
    { op: 'POST /v1/contacts', auth: 'key', url: '/v1/contacts', idem: true, body: { e164: '+254712345678', name: 'Amina W.', attributes: { tier: 'gold' } }, expect: 201, check: has('id', 'e164'), save: (c, r) => { c.contact = r.body.id; } },
    { op: 'GET /v1/contacts', auth: 'key', url: '/v1/contacts', expect: 200, check: has('items') },
    { op: 'GET /v1/contacts/{id}', auth: 'key', url: (c) => `/v1/contacts/${c.contact}`, expect: 200, check: has('id') },
    { op: 'PATCH /v1/contacts/{id}', auth: 'key', url: (c) => `/v1/contacts/${c.contact}`, body: { name: 'Amina Wanjiru' }, expect: 200, check: has('name') },
    { op: 'POST /v1/contact-groups', auth: 'key', url: '/v1/contact-groups', idem: true, body: (c) => ({ name: 'VIP customers', contact_ids: [c.contact] }), expect: 201, check: has('id', 'contact_ids'), save: (c, r) => { c.group = r.body.id; } },
    { op: 'GET /v1/contact-groups', auth: 'key', url: '/v1/contact-groups', expect: 200, check: has('items') },
    { op: 'GET /v1/contact-groups/{id}', auth: 'key', url: (c) => `/v1/contact-groups/${c.group}`, expect: 200, check: has('id') },
    { op: 'PATCH /v1/contact-groups/{id}', auth: 'key', url: (c) => `/v1/contact-groups/${c.group}`, body: { name: 'VIP customers (KE)' }, expect: 200, check: has('name') },
    { op: 'POST /v1/contact-groups/{id}/send', auth: 'key', url: (c) => `/v1/contact-groups/${c.group}/send`, idem: true, body: { text: 'Hello from Acme' }, expect: 200, check: has('id', 'status'), partial: 'The group send is accepted as a batch, but every recipient is refused at admission because sandbox sending needs a verified email (email delivery is disabled on the docs stack), so the batch is `failed` with all rows invalid.' },
    { op: 'DELETE /v1/contact-groups/{id}', auth: 'key', url: (c) => `/v1/contact-groups/${c.group}`, expect: 204 },
    { op: 'DELETE /v1/contacts/{id}', auth: 'key', url: (c) => `/v1/contacts/${c.contact}`, expect: 204 },

    // Webhooks
    { op: 'POST /v1/webhooks', auth: 'key', url: '/v1/webhooks', idem: true, body: { url: 'https://hooks.example.com/opensms', events: ['message.delivered', 'message.failed'] }, expect: 201, check: has('id', 'secret'), save: (c, r) => { c.hook = r.body.id; } },
    { op: 'GET /v1/webhooks', auth: 'key', url: '/v1/webhooks', expect: 200, check: has('items') },
    { op: 'GET /v1/webhooks/{id}', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}`, expect: 200, check: has('id', 'url', 'events') },
    { op: 'PUT /v1/webhooks/{id}', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}`, body: { url: 'https://hooks.example.com/opensms/v2', events: ['message.delivered'], enabled: true }, expect: 200, check: has('url') },
    { op: 'PUT /v1/webhooks/{id}', title: 'enabled omitted', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}`, body: { url: 'https://hooks.example.com/opensms/v2', events: ['message.delivered'] }, expect: 400, note: 'The contract gives `enabled` a default of `true`, but the handler requires it on PUT.' },
    { op: 'PATCH /v1/webhooks/{id}', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}`, body: { url: 'https://hooks.example.com/opensms/v2', events: ['message.delivered', 'message.failed'], enabled: true }, expect: 200, check: has('events') },
    { op: 'POST /v1/webhooks/{id}/test', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}/test`, idem: true, expect: 202, check: has('status') },
    { op: 'GET /v1/webhooks/{id}/deliveries', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}/deliveries`, expect: 200, check: has('items'), save: (c, r) => { c.delivery = r.body.items[0]; } },
    { op: 'POST /v1/webhooks/{id}/deliveries/{delivery_id}/replay', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}/deliveries/${c.delivery.id}/replay`, idem: true, body: (c) => ({ generation: c.delivery.generation, reason: 'receiver was down' }), expect: 409, partial: 'Only terminal deliveries can be replayed. Webhook delivery is disabled on the docs stack, so the test delivery stays `pending` and the replay is refused with 409.' },
    { op: 'POST /v1/webhooks/{id}/deliveries/{delivery_id}', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}/deliveries/${c.delivery.id}`, idem: true, body: (c) => ({ generation: c.delivery.generation, reason: 'receiver was down' }), expect: 409, partial: 'Alias of the /replay route; same limitation.' },
    { op: 'DELETE /v1/webhooks/{id}', auth: 'key', url: (c) => `/v1/webhooks/${c.hook}`, expect: 204 },

    // Compliance
    { op: 'GET /v1/content-rules', auth: 'key', url: '/v1/content-rules', expect: 200 },
    { op: 'GET /v1/compliance/countries', auth: 'key', url: '/v1/compliance/countries', expect: 200 },
    { op: 'GET /v1/compliance/countries/{iso2}', auth: 'key', url: '/v1/compliance/countries/KE', expect: 200, check: has('iso2', 'stop_keywords') },
    { op: 'POST /v1/compliance/suppressions', auth: 'key', url: '/v1/compliance/suppressions', idem: true, body: { e164: '+254700000001', reason: 'manual' }, expect: 201, check: has('id', 'e164'), save: (c, r) => { c.sup = r.body.id; } },
    { op: 'POST /v1/compliance/suppressions/import', auth: 'key', url: '/v1/compliance/suppressions/import', idem: true, body: { items: [{ e164: '+254700000002', reason: 'complaint' }, { e164: '+254700000003', reason: 'manual' }] }, expect: 201, check: has('created', 'received') },
    { op: 'GET /v1/compliance/suppressions', auth: 'key', url: '/v1/compliance/suppressions', expect: 200, check: has('items') },
    { op: 'DELETE /v1/compliance/suppressions/{id}', auth: 'key', url: (c) => `/v1/compliance/suppressions/${c.sup}`, expect: 204 },

    // Sender IDs
    { op: 'GET /v1/sender-ids', auth: 'key', url: '/v1/sender-ids', expect: 200, check: has('items'), save: (c, r) => { c.sender = r.body.items[0]?.id; } },
    { op: 'GET /v1/sender-ids/{id}', auth: 'key', url: (c) => `/v1/sender-ids/${c.sender}`, expect: 200, check: has('id', 'value', 'status') },
    { op: 'GET /v1/sender-ids/check', auth: 'key', url: '/v1/sender-ids/check?value=ACMECO&country=KE', expect: 200, check: has('valid', 'available') },
    { op: 'GET /v1/sender-ids/quote', auth: 'key', url: '/v1/sender-ids/quote?countries=KE', expect: 200, check: has('quote_id', 'entries') },
    { op: 'POST /v1/sender-id-drafts', auth: 'key', url: '/v1/sender-id-drafts', body: { value: 'ACMECO', kind: 'alphanumeric', countries: ['KE'], use_case: 'transactional', sample_message: 'Your ACME order 1042 has shipped.' }, expect: [200, 201], check: has('id', 'version'), save: (c, r) => { c.draft = r.body; } },
    { op: 'GET /v1/sender-id-drafts', auth: 'key', url: '/v1/sender-id-drafts', expect: 200, check: has('items') },
    { op: 'GET /v1/sender-id-drafts/{id}', auth: 'key', url: (c) => `/v1/sender-id-drafts/${c.draft.id}`, expect: 200, check: has('id') },
    { op: 'PATCH /v1/sender-id-drafts/{id}', auth: 'key', url: (c) => `/v1/sender-id-drafts/${c.draft.id}`, body: (c) => ({ version: c.draft.version, sample_message: 'Your ACME code is 123456.' }), expect: 200, check: has('version') },
    // Registration needs three uploaded documents. The upload route is served but not in the contract, so these steps run unpublished.
    ...['certificate', 'signatory-id', 'authorization'].map((kind) => ({ op: 'POST /v1/sender-documents', offContract: true, method: 'POST', record: false, url: '/v1/sender-documents', form: [{ name: 'kind', value: kind }, { name: 'file', value: PNG, filename: `${kind}.png`, type: 'image/png' }], expect: 201, check: has('id', 'kind', 'scan_status'), save: (c, r) => { (c.senderDocs ??= []).push(r.body.id); } })),
    { op: 'POST /v1/sender-ids', auth: 'key', url: '/v1/sender-ids', idem: true, body: (c) => ({ value: 'ACMECO', kind: 'alphanumeric', countries: ['KE'], use_case: 'transactional', sample_message: 'Your ACME order 1042 has shipped.', documents: c.senderDocs }), expect: 201, check: has('id', 'status', 'registrations'), save: (c, r) => { c.registered = r.body.id; }, note: 'The three `documents` are IDs returned by `POST /v1/sender-documents` (see the note at the top of this page). The sender waits in `pending_admin` until an operator decides it.' },
    { op: 'POST /v1/sender-ids', title: 'missing documents', auth: 'key', url: '/v1/sender-ids', idem: true, body: { value: 'ACMECO', kind: 'alphanumeric', countries: ['KE'], use_case: 'transactional', documents: [] }, expect: 422 },
    { op: 'GET /v1/sender-ids/{id}', title: 'after registering', auth: 'key', url: (c) => `/v1/sender-ids/${c.registered}`, expect: 200, check: has('id', 'status', 'registrations') },
    { op: 'PATCH /v1/sender-ids/{id}', auth: 'key', url: (c) => `/v1/sender-ids/${c.registered}`, body: (c) => ({ use_case: 'otp', sample_message: 'Your ACME code is 123456.', countries: ['KE'], documents: c.senderDocs }), expect: 409, partial: 'Only a sender whose request or a registration was rejected can be amended. Rejecting one needs an operator with a fresh admin TOTP, which the docs stack\'s operator account does not have, so the sender is still `pending_admin` and the amendment is refused.' },
    { op: 'PATCH /v1/sender-ids/{id}', title: 'unknown ID', auth: 'key', url: `/v1/sender-ids/${ZERO}`, body: { use_case: 'transactional', countries: ['KE'], documents: [] }, expect: [404, 422] },
    { op: 'DELETE /v1/sender-ids/{id}', auth: 'key', url: (c) => `/v1/sender-ids/${c.registered}`, expect: 204 },
    { op: 'DELETE /v1/sender-id-drafts/{id}', auth: 'key', url: (c) => `/v1/sender-id-drafts/${c.draft.id}`, expect: 204 },

    // Numbers and inbound
    { op: 'GET /v1/numbers', auth: 'key', url: '/v1/numbers', expect: 200, check: has('items') },
    { op: 'GET /v1/numbers/available', auth: 'key', url: '/v1/numbers/available?country=KE&kind=long_code', expect: 200, note: 'The docs stack has no number inventory, so the list is empty.' },
    { op: 'POST /v1/numbers', auth: 'key', url: '/v1/numbers', idem: true, body: { country: 'KE', kind: 'long_code' }, expect: [422, 400], partial: LIVE_ONLY },
    { op: 'DELETE /v1/numbers/{id}', auth: 'key', url: `/v1/numbers/${ZERO}`, idem: true, expect: 422, partial: LIVE_ONLY },
    { op: 'GET /v1/numbers/{id}/rules', auth: 'key', url: `/v1/numbers/${ZERO}/rules`, expect: 422, partial: LIVE_ONLY },
    { op: 'POST /v1/numbers/{id}/rules', auth: 'key', url: `/v1/numbers/${ZERO}/rules`, idem: true, body: { keyword: 'STOP', action: 'auto_reply', reply_text: 'You are unsubscribed.' }, expect: [400, 422], partial: LIVE_ONLY },
    { op: 'PUT /v1/numbers/{id}/rules/{rule_id}', auth: 'key', url: `/v1/numbers/${ZERO}/rules/${ZERO}`, body: { keyword: 'STOP', action: 'auto_reply', reply_text: 'You are unsubscribed.' }, expect: [400, 422], partial: LIVE_ONLY },
    { op: 'DELETE /v1/numbers/{id}/rules/{rule_id}', auth: 'key', url: `/v1/numbers/${ZERO}/rules/${ZERO}`, expect: 422, partial: LIVE_ONLY },
    { op: 'GET /v1/inbound', auth: 'key', url: '/v1/inbound', expect: 200, check: has('items') },
    { op: 'POST /v1/inbound/{id}/reply', auth: 'key', url: `/v1/inbound/${ZERO}/reply`, idem: true, body: { text: 'Thanks, we got your message.' }, expect: 422, partial: LIVE_ONLY },

    // Lookup, pricing, analytics
    { op: 'POST /v1/lookup', auth: 'key', url: '/v1/lookup', idem: true, body: { to: '+254712345678' }, expect: [200, 202], check: has('id', 'state'), save: (c, r) => { c.lookup = r.body.id; }, note: 'In the sandbox the lookup is answered by the mock source at zero cost.' },
    { op: 'GET /v1/lookup/{id}', auth: 'key', url: (c) => `/v1/lookup/${c.lookup}`, expect: 200, check: has('id', 'state') },
    { op: 'GET /v1/pricing', auth: 'key', url: '/v1/pricing?country=KE', expect: 200, check: has('currency', 'entries') },
    { op: 'GET /v1/analytics/overview', auth: 'key', url: '/v1/analytics/overview', expect: 200, check: has('sent', 'delivered', 'spend') },
    { op: 'GET /v1/analytics/by-country', auth: 'key', url: '/v1/analytics/by-country', expect: 200 },
    { op: 'GET /v1/analytics/by-carrier', auth: 'key', url: '/v1/analytics/by-carrier', expect: 200 },
    { op: 'GET /v1/analytics/by-sender-id', auth: 'key', url: '/v1/analytics/by-sender-id', expect: 200 },
    { op: 'GET /v1/analytics/timeseries', auth: 'key', url: '/v1/analytics/timeseries?bucket=day', expect: 200 },

    // Wallet and billing
    { op: 'GET /v1/wallet', auth: 'key', url: '/v1/wallet', expect: 200, check: has('data') },
    { op: 'POST /v1/wallet/sandbox-credits', url: '/v1/wallet/sandbox-credits', idem: true, body: { amount: '500', currency: 'KES' }, expect: 201, check: has('balance', 'simulated') },
    { op: 'GET /v1/wallet/ledger', auth: 'key', url: '/v1/wallet/ledger', expect: 200, check: has('data') },
    { op: 'POST /v1/wallet/topups', url: '/v1/wallet/topups', idem: true, body: { amount: '1000', currency: 'KES', channel: 'card' }, expect: 422, partial: 'Top-ups go through Paystack in the live environment. Payments are disabled on the docs stack and the workspace is sandbox-only, so only the refusal is shown.' },
    { op: 'POST /v1/wallet/topups/manual', url: '/v1/wallet/topups/manual', idem: true, form: [{ name: 'amount', value: '1000.00' }, { name: 'currency', value: 'KES' }, { name: 'file', value: PNG, filename: 'transfer-proof.png', type: 'image/png' }], expect: 422, partial: LIVE_ONLY },
    { op: 'GET /v1/wallet/auto-topup', url: '/v1/wallet/auto-topup', expect: 200, check: has('enabled') },
    { op: 'PUT /v1/wallet/auto-topup', url: '/v1/wallet/auto-topup', body: { enabled: false }, expect: 422, partial: LIVE_ONLY },
    { op: 'GET /v1/payment-methods', url: '/v1/payment-methods', expect: 200, check: has('items') },
    { op: 'DELETE /v1/payment-methods/{id}', url: `/v1/payment-methods/${ZERO}`, expect: 422, partial: 'Saved cards exist only in the live environment after a Paystack payment, which the docs stack cannot make, so only the sandbox refusal is shown.' },
    { op: 'GET /v1/invoices', url: '/v1/invoices', expect: 200, check: has('items') },
    { op: 'GET /v1/invoices/{id}', url: `/v1/invoices/${ZERO}`, expect: 404, partial: 'Invoices are issued for live spend only, so none exist locally and an unknown ID is used.' },

    // Onboarding and legal
    { op: 'GET /v1/onboarding', url: '/v1/onboarding', expect: 200, check: has('steps', 'kyc_status') },
    { op: 'PUT /v1/onboarding/company', url: '/v1/onboarding/company', body: { name: 'Acme Ltd', country_iso2: 'KE', registration_number: 'PVT-2026-001' }, expect: 200, check: has('status', 'step') },
    { op: 'POST /v1/onboarding/documents', url: '/v1/onboarding/documents', idem: true, form: [{ name: 'kind', value: 'incorporation_certificate' }, { name: 'file', value: PNG, filename: 'certificate.png', type: 'image/png' }], expect: 201, check: has('id', 'scan_status'), save: (c, r) => { c.doc = r.body.id; } },
    { op: 'GET /v1/onboarding/documents/{id}/download', url: (c) => `/v1/onboarding/documents/${c.doc}/download`, expect: 404, partial: 'Only documents whose malware scan is `clean` can be downloaded. File scanning is disabled on the docs stack, so uploads stay `pending` and the download answers 404.' },
    { op: 'POST /v1/onboarding/phone/send', url: '/v1/onboarding/phone/send', body: { phone_e164: '+254712345678' }, expect: 503, partial: 'Phone codes are sent by SMS through the verification provider, which is unavailable on the docs stack, so the handler answers 503.' },
    { op: 'POST /v1/onboarding/phone/verify', url: '/v1/onboarding/phone/verify', body: { challenge_id: ZERO, code: '123456' }, expect: [400, 404, 422], partial: 'No challenge can be issued locally (see phone/send), so only an unknown challenge is shown.' },
    { op: 'POST /v1/onboarding/request-live', url: '/v1/onboarding/request-live', expect: 422, partial: 'Going live needs every onboarding step, including a verified email, which cannot be completed without email delivery.' },
    { op: 'GET /v1/legal/documents', url: '/v1/legal/documents', expect: 200, check: has('documents') },
    { op: 'POST /v1/legal/accept', url: '/v1/legal/accept', body: { document: 'terms', version: '1.0' }, expect: 200, check: has('accepted_at') },
    { op: 'GET /v1/legal/acceptances', url: '/v1/legal/acceptances', expect: 200, check: has('acceptances') },

    // Notifications and realtime
    { op: 'GET /v1/notifications', url: '/v1/notifications', expect: 200, check: has('items'), poll: (r) => r.body?.items?.length > 0, save: (c, r) => { c.notification = r.body.items[0]?.id; } },
    { op: 'POST /v1/notifications/{id}/read', url: (c) => `/v1/notifications/${c.notification}/read`, expect: 200, check: has('read_at') },
    { op: 'GET /v1/me/notifications', url: '/v1/me/notifications', expect: 200 },
    { op: 'PUT /v1/me/notifications', url: '/v1/me/notifications', body: (c) => ({ workspace_id: c.ws.workspace, event: 'wallet.low_balance', channel: 'email', enabled: false }), expect: 200, check: has('event', 'enabled') },
    { op: 'POST /v1/realtime/tickets', url: '/v1/realtime/tickets', headers: { Origin: 'http://localhost:5190' }, expect: 403, partial: 'Tickets are issued only over HTTPS from an allowed Origin; the docs stack serves plain HTTP, so the request is refused.' },

    // Provider callbacks
    { op: 'POST /callbacks/providers/{provider_id}/dlr', auth: 'none', url: `/callbacks/providers/${ZERO}/dlr`, body: { id: 'provider-msg-1', status: 'delivered' }, expect: 401, partial: 'Only an upstream provider holding that provider\'s receipt credential can post receipts; without one the endpoint answers 401.' },

    // Account export and deletion (last: deletion ends the account)
    { op: 'POST /v1/account/export', url: '/v1/account/export', idem: true, expect: 202, check: has('id', 'status_path'), save: (c, r) => { c.export = r.body.id; } },
    { op: 'GET /v1/account/export/{id}', url: (c) => `/v1/account/export/${c.export}`, expect: 200, check: has('id', 'status'), poll: (r) => r.body?.status === 'ready' },
    { op: 'GET /v1/account/export/{id}/download', url: (c) => `/v1/account/export/${c.export}/download`, binary: true, expect: 200 },
    { op: 'POST /v1/account/delete', url: '/v1/account/delete', body: (c) => ({ code: totp(c.totp) }), expect: 202, check: has('status') },
    { op: 'POST /v1/account/delete/cancel', url: '/v1/account/delete/cancel', expect: 200 },
    { op: 'POST /v1/auth/2fa/disable', auth: 'bare', url: '/v1/auth/2fa/disable', body: (c) => ({ code: totp(c.totp) }), expect: [200, 409], check: undefined },
    { op: 'POST /v1/auth/logout', auth: 'bare', url: '/v1/auth/logout', expect: 204 },
  ];
}

const NOT_EXERCISED = {
  'GET /metrics': 'Served only on the optional dedicated metrics listener (a separate port), which the docs stack does not enable. On the API port the path answers 404.',
};

/** Contract checks that are not examples: they only feed the drift list. */
async function driftProbes(ctx) {
  const out = [];
  const k = await mintKey(ctx.ws, { label: 'no template scope', scopes: ['messages:read'] });
  const r = await call('POST', '/v1/templates', { token: k.key, body: { name: 'scope_probe', body: 'x' }, headers: { 'idempotency-key': `probe-${randomUUID()}` } });
  if (r.status === 403) out.push(`POST /v1/templates (and the other /v1/templates operations) declare \`ApiKey: []\` (any scope) in their \`security\`, but the handler requires \`templates:manage\`: a key without it gets 403 "${r.body?.detail}" (${specLine('/v1/templates', 'post')}).`);
  const noEnv = await call('GET', '/v1/templates', { token: ctx.ws.token, workspace: ctx.ws.workspace });
  if (noEnv.status === 400) out.push(`\`X-Environment\` is declared \`required: false\` on every session operation (components.parameters.SessionEnvironment), but session calls without it are rejected with 400 "${noEnv.body?.detail}". The parameter description does say it is required with a session.`);
  // Operations whose handler demands Idempotency-Key although the contract does not declare it.
  const spec = loadSpec();
  for (const o of operations(spec)) {
    if (o.method !== 'POST' || o.path.startsWith('/callbacks/') || o.path.startsWith('/v1/auth/') || o.path === '/v1/account/delete') continue;
    const declared = [...o.pathParams, ...(o.op.parameters ?? [])].map((x) => deref(spec, x)).some((x) => x.in === 'header' && /^idempotency-key$/i.test(x.name));
    if (declared) continue;
    const url = o.path.replace(/\{[^}]+\}/g, (x) => (x === '{iso2}' ? 'KE' : ZERO));
    const res = await call('POST', url, { token: ctx.key, body: {} });
    const res2 = /Idempotency-Key/i.test(res.body?.detail ?? '') ? res : await call('POST', url, { token: ctx.ws.token, workspace: ctx.ws.workspace, headers: { 'X-Environment': 'sandbox' }, body: {} });
    const hit = [res, res2].find((r) => /Idempotency-Key/i.test(r.body?.detail ?? ''));
    if (hit) out.push(`${o.key} requires an \`Idempotency-Key\` header (${hit.status} "${hit.body.detail}") but the contract does not declare one (${specLine(o.path, o.method)}).`);
  }
  // Webhook PUT: the contract defaults enabled to true, the handler requires it.
  const hook = await call('POST', '/v1/webhooks', { token: ctx.key, body: { url: 'https://hooks.example.com/probe', events: ['message.delivered'] }, headers: { 'Idempotency-Key': `probe-${randomUUID()}` } });
  if (hook.status === 201) {
    const put = await call('PUT', `/v1/webhooks/${hook.body.id}`, { token: ctx.key, body: { url: 'https://hooks.example.com/probe', events: ['message.delivered'] } });
    if (put.status === 400) out.push(`PUT /v1/webhooks/{id}: the contract marks \`enabled\` optional with default \`true\`, but the handler rejects a body without it: 400 "${put.body?.detail}" (${specLine('/v1/webhooks/{id}', 'put')}).`);
    await call('DELETE', `/v1/webhooks/${hook.body.id}`, { token: ctx.key });
  }
  return out;
}

/** Drift visible from the contract text alone. */
export function staticDrift(spec = loadSpec()) {
  const out = [];
  const all = operations(spec);
  const untagged = all.filter((o) => !o.tag).length;
  const noId = all.filter((o) => !o.op.operationId).length;
  out.push(`${untagged} of ${all.length} operations have no \`tags\`, and ${noId} have no \`operationId\`. This reference groups untagged operations by path prefix; tooling that groups by tag (Swagger UI, generated SDKs) will put them under "default".`);
  const lines = readFileSync(SPEC_PATH, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (/pattern: '[^']*\\\\/.test(l)) out.push(`api/openapi/customer.yaml:${i + 1}: \`${l.trim()}\` is single-quoted YAML, so the regex really contains \`\\\\+\` (a literal backslash) and a schema validator would reject every valid E.164 number such as \`+254712345678\`. It should be \`'^\\+[1-9][0-9]{7,14}$'\`.`);
  });
  const noSec = all.filter((o) => o.op.security === undefined && !o.path.startsWith('/metrics'));
  if (noSec.length) out.push(`${noSec.length} operations have no \`security\` entry and the spec has no global default, so the contract does not say how to authenticate them: ${noSec.map((o) => `\`${o.key}\``).join(', ')}.`);
  return out;
}

export async function runScenarios({ log = () => {} } = {}) {
  const spec = loadSpec();
  const all = operations(spec);
  const opsByKey = new Map(all.map((o) => [o.key, o]));
  const examples = {};
  const failures = [];
  const partial = {};
  const drift = new Set();
  const results = [];
  const ctx = { ws: await freshWorkspace('ref') };
  const mate = await freshWorkspace('ref-mate');
  ctx.mate = { ...mate, userId: mate.session.user.id };

  for (const d of scenarioList()) {
    if (!d.offContract && !opsByKey.has(d.op)) { failures.push(`${d.op}: not in the contract`); continue; }
    const o = opsByKey.get(d.op) ?? {};
    const method = d.method ?? o.method;
    if (d.needs && !d.needs(ctx)) { results.push({ op: d.op, title: d.title, skipped: 'an earlier step was rate limited' }); continue; }
    let url;
    try { url = typeof d.url === 'function' ? d.url(ctx) : d.url; } catch (e) { failures.push(`${d.op}: setup failed (${e.message})`); continue; }
    if (!url) { failures.push(`${d.op}: no URL (an earlier step failed)`); continue; }
    const body = typeof d.body === 'function' ? d.body(ctx) : d.body;
    const auth = d.auth ?? 'session';
    const headers = {};
    const shown = {};
    let token;
    if (auth === 'session' || auth === 'bare') {
      token = d.token ? d.token(ctx) : ctx.ws.token;
      shown.Authorization = `Bearer ${token}`;
      if (auth === 'session') {
        headers['X-Workspace-ID'] = ctx.ws.workspace; headers['X-Environment'] = 'sandbox';
        shown['X-Workspace-ID'] = ctx.ws.workspace; shown['X-Environment'] = 'sandbox';
      }
    } else if (auth === 'key') {
      token = ctx.key;
      shown.Authorization = `Bearer ${token}`;
    }
    if (d.idem) { const k = typeof d.idem === 'string' ? (ctx.idem ??= {})[d.idem] ??= `docs-${randomUUID()}` : `docs-${randomUUID()}`; headers['Idempotency-Key'] = k; shown['Idempotency-Key'] = k; }
    for (const [h, v] of Object.entries(d.headers ?? {})) { headers[h] = v; shown[h] = v; }
    if (body !== undefined && !d.form) shown['Content-Type'] = 'application/json';

    const once = async () => {
      if (d.form || d.binary) {
        const h = { ...headers };
        if (token) h.Authorization = `Bearer ${token}`;
        let fbody;
        if (d.form) {
          fbody = new FormData();
          for (const f of d.form) {
            if (f.filename) fbody.append(f.name, new Blob([Buffer.from(f.value, 'base64')], { type: f.type }), f.filename);
            else fbody.append(f.name, f.value);
          }
        }
        const res = await fetch(API + url, { method, headers: h, body: fbody });
        const ct = (res.headers.get('content-type') ?? '').split(';')[0];
        const buf = Buffer.from(await res.arrayBuffer());
        let parsed;
        if (/json/.test(ct)) parsed = JSON.parse(buf.toString('utf8'));
        else if (d.binary) parsed = `(binary ${ct || 'body'}, ${buf.length} bytes${buf.subarray(0, 2).toString() === 'PK' ? ', a ZIP archive' : ''})`;
        else parsed = buf.toString('utf8');
        return { status: res.status, headers: res.headers, body: parsed, ct };
      }
      const res = await call(method, url, { token, body, headers });
      return { ...res, ct: (res.headers.get('content-type') ?? '').split(';')[0] };
    };
    let res = d.poll ? await poll(once, d.poll) : await once();
    if (d.limited && res.status === 429) {
      // In-memory per-client limits (for example 10 status subscriptions per hour) trip when the
      // suite runs repeatedly. That is the documented 429, not drift: note it and move on.
      results.push({ op: d.op, title: d.title, skipped: `rate limited (429 "${res.body?.detail}")` });
      log(`429 ${d.op} (rate limited, skipped)`);
      continue;
    }
    const expected = [].concat(d.expect);
    const problem = !expected.includes(res.status) ? `expected ${expected.join(' or ')}, got ${res.status} ${JSON.stringify(res.body).slice(0, 300)}` : d.check?.(res, ctx);
    if (problem) failures.push(`${d.op}${d.title ? ` (${d.title})` : ''}: ${problem}`);
    else if (d.save) { try { d.save(ctx, res); } catch (e) { failures.push(`${d.op}: save failed (${e.message})`); } }
    results.push({ op: d.op, title: d.title, status: res.status, keys: res.body && typeof res.body === 'object' && !Array.isArray(res.body) ? Object.keys(res.body) : [] });
    log(`${res.status} ${d.op}${d.title ? ` (${d.title})` : ''}`);
    if (!d.offContract) for (const m of shapeDrift(spec, opsByKey, d.op, res.status, res.ct, res.body)) drift.add(m.replace(/\[\d+\]/g, '[]'));
    if (d.record === false) continue;
    if (d.partial) partial[d.op] = d.partial;
    (examples[d.op] ??= []).push({
      ...(d.title ? { title: d.title } : {}),
      request: { method, url: redactString(url), headers: redact(shown), ...(body !== undefined && !d.form ? { body: redact(body) } : {}), ...(d.form ? { form: Object.fromEntries(d.form.map((f) => [f.name, f.filename ? `@${f.filename};type=${f.type}` : f.value])) } : {}) },
      response: { status: res.status, contentType: res.ct || null, body: redact(res.body) },
      keys: res.body && typeof res.body === 'object' && !Array.isArray(res.body) ? Object.keys(res.body) : [],
      ...(d.partial ? { note: `Why this is not the success path: ${d.partial}` } : d.note ? { note: d.note } : {}),
    });
  }

  const probeWs = await freshWorkspace('ref-probe');
  const probeKey = await mintKey(probeWs, { label: 'probe', scopes: ctx.scopes });
  for (const m of await driftProbes({ ws: probeWs, key: probeKey.key })) drift.add(m);
  // Route probe for every operation without an example: proves the route is mounted.
  const probe = {};
  for (const o of all) {
    if (examples[o.key]) continue;
    const url = o.path.replace(/\{[^}]+\}/g, (x) => (x === '{iso2}' ? 'KE' : ZERO));
    const r = await call(o.method, url, { token: probeWs.token, workspace: probeWs.workspace, headers: { 'X-Environment': 'sandbox' }, body: o.method === 'GET' || o.method === 'DELETE' ? undefined : {} });
    probe[o.key] = `probe ${r.status}`;
  }
  const notExercised = {};
  for (const o of all) if (!examples[o.key]) notExercised[o.key] = NOT_EXERCISED[o.key] ?? 'No scenario written for this operation.';

  const byKey = Object.fromEntries(Object.entries(examples).sort(([a], [b]) => a.localeCompare(b)));
  return { ...byKey, __drift: [...drift], __partial: partial, __notExercised: notExercised, __probe: probe, __failures: failures, __results: results };
}


if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--capture')) {
    const result = await runScenarios({ log: (l) => console.log(l) });
    if (result.__failures.length) {
      console.error(`\n${result.__failures.length} scenario failures:\n` + result.__failures.join('\n'));
      process.exit(1);
    }
    delete result.__results;
    delete result.__failures;
    writeFileSync(EXAMPLES_PATH, JSON.stringify(result, null, 2) + '\n');
    console.log(`captured ${Object.keys(result).filter((k) => !k.startsWith('__')).length} operations`);
  }
  console.log(render());
}
