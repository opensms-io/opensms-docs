// Rewrites the brand name to "OpenSMS" in the prose of the published docs sections
// (code blocks, inline code, URLs, package names and identifiers are left alone).
//
//   node scripts/normalise-brand.mjs          rewrite the files in place
//   node scripts/normalise-brand.mjs --check  exit 1 if any file would change
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseBrand } from './site/brand.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['getting-started', 'integrate', 'console', 'reference/api'];
const check = process.argv.includes('--check');

function mdFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return mdFiles(p);
    return f.endsWith('.md') ? [p] : [];
  });
}

const files = [join(ROOT, 'README.md'), ...DIRS.flatMap((d) => mdFiles(join(ROOT, d)))];
let changed = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const { text, hits } = normaliseBrand(src);
  if (!hits.length) continue;
  changed += 1;
  console.log(`${relative(ROOT, file)}: ${hits.length}`);
  if (!check) writeFileSync(file, text);
}
if (check && changed) {
  console.error(`${changed} file(s) have the brand name in lowercase prose; run node scripts/normalise-brand.mjs`);
  process.exit(1);
}
console.log(check ? 'brand check passed' : `${changed} file(s) rewritten`);
