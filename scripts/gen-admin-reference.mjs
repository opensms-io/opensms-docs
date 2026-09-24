// Generates the operation tables in admin/api-reference.md from the admin
// OpenAPI contract (api/openapi/admin.yaml), the contract of record.
//
//   node scripts/gen-admin-reference.mjs [path/to/admin.yaml]
//
// Only the text between the GENERATED markers is replaced, so the hand-written
// introduction and live examples around it survive a regeneration. The parser
// is line based on purpose (no YAML dependency): it reads the path, method,
// summary, description and response codes, which the contract always writes in
// block style at fixed indentation.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2] ?? '../api/openapi/admin.yaml';
const out = 'admin/api-reference.md';
const lines = readFileSync(src, 'utf8').split('\n');

const ops = [];
const anchors = new Map();
let path = null;
let op = null;
let inPaths = false;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (/^paths:/.test(line)) { inPaths = true; continue; }
  if (/^\S/.test(line) && !/^paths:/.test(line)) inPaths = false;
  if (!inPaths) continue;
  let m;
  if ((m = line.match(/^ {2}(\/\S*):\s*$/))) { path = m[1]; op = null; continue; }
  if ((m = line.match(/^ {4}(get|post|put|patch|delete):\s*(?:&(\S+))?/))) {
    op = { method: m[1].toUpperCase(), path, summary: '', description: '', codes: [], public: false };
    if (m[2]) anchors.set(m[2], op);
    const rest = line.slice(line.indexOf(':') + 1).trim();
    if (rest.startsWith('*')) op.aliasOf = rest.slice(1); // whole operation is an alias
    if (rest.startsWith('{')) { // flow style on one line
      op.summary = rest.match(/summary:\s*([^,}]+)/)?.[1]?.trim() ?? '';
      op.codes = [...rest.matchAll(/'(\d{3})':/g)].map((x) => x[1]);
    }
    ops.push(op);
    continue;
  }
  if (!op) continue;
  // A merge key (<<: *anchor) reuses another operation's responses.
  if ((m = line.match(/^ {6}<<:\s*\*(\S+)/))) { op.mergeFrom = m[1]; continue; }
  if ((m = line.match(/^ {6}summary:\s*(.*)$/))) op.summary = unquote(m[1]);
  else if ((m = line.match(/^ {6}description:\s*(.*)$/))) op.description = block(m[1], i);
  else if (/^ {6}security:\s*\[\s*\]/.test(line)) op.public = true;
  else if ((m = line.match(/^ {8}'?(\d{3})'?:/))) op.codes.push(m[1]);
  else if (/^ {6}responses:\s*\{/.test(line)) op.codes.push(...[...line.matchAll(/'(\d{3})':/g)].map((x) => x[1]));
}

for (const o of ops) {
  const base = o.mergeFrom && anchors.get(o.mergeFrom);
  if (base && o.codes.length === 0) o.codes = [...base.codes];
  const alias = o.aliasOf && anchors.get(o.aliasOf);
  if (alias) { o.summary ||= alias.summary; o.description ||= alias.description; if (!o.codes.length) o.codes = [...alias.codes]; }
}

function unquote(s) {
  s = s.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) s = s.slice(1, -1);
  return s;
}
function block(first, i) {
  if (!/^[>|]/.test(first.trim())) return unquote(first);
  const parts = [];
  for (let j = i + 1; j < lines.length && (/^ {8}/.test(lines[j]) || lines[j].trim() === ''); j++) parts.push(lines[j].trim());
  return parts.join(' ').trim();
}
const firstSentence = (s) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();
const cell = (s) => s.replace(/\|/g, '\\|').replace(/\u2014/g, ', ');

// Group by the first segment after /admin/v1/ so the table reads by console area.
const groupOf = (p) => (p.match(/^\/admin\/v1\/([^/{]+)/)?.[1] ?? p.replace(/^\//, '').split('/')[0]) || 'other';
const groups = new Map();
for (const o of ops) {
  const g = groupOf(o.path);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(o);
}

const body = [];
body.push(`${ops.length} operations on ${new Set(ops.map((o) => o.path)).size} paths, generated from \`api/openapi/admin.yaml\`.`);
body.push('');
body.push('| Area | Operations |');
body.push('|---|---|');
for (const [g, list] of [...groups].sort()) body.push(`| [${g}](#${g}) | ${list.length} |`);
for (const [g, list] of [...groups].sort()) {
  body.push('', `### ${g}`, '', '| Method | Path | What it does | Documented responses |', '|---|---|---|---|');
  for (const o of list) {
    const what = o.summary || firstSentence(o.description) || '(no summary in contract)';
    const auth = o.public ? ' (no session required)' : '';
    body.push(`| ${o.method} | \`${o.path}\` | ${cell(what)}${auth} | ${o.codes.join(', ')} |`);
  }
}

const begin = '<!-- GENERATED:admin-operations BEGIN (scripts/gen-admin-reference.mjs) -->';
const end = '<!-- GENERATED:admin-operations END -->';
let doc = readFileSync(out, 'utf8');
const a = doc.indexOf(begin);
const b = doc.indexOf(end);
if (a === -1 || b === -1) throw new Error(`markers missing in ${out}`);
doc = doc.slice(0, a + begin.length) + '\n' + body.join('\n') + '\n' + doc.slice(b);
writeFileSync(out, doc);
console.log(`${out}: ${ops.length} operations, ${groups.size} areas`);
