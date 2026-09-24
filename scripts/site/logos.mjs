// Brand logos for the docs site: programming languages (code block headers) and AI
// assistants (the MCP setup page). Each logo is a separate vendored SVGL file in
// ./logos (see ./logos/README.md). They are multi-colour brand marks, not icons, so
// they are served as content-hashed files and drawn with <img>, never inlined: their
// gradient ids would collide on a page with many code blocks.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { SITE } from './config.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'logos');
const LOGOS = new Map();
for (const kind of ['lang', 'ai']) {
  for (const f of readdirSync(join(DIR, kind)).filter((f) => f.endsWith('.svg'))) {
    const name = f.replace(/\.svg$/, '');
    const svg = readFileSync(join(DIR, kind, f), 'utf8');
    const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].trim().split(/[\s,]+/).map(Number);
    const hash = createHash('sha256').update(svg).digest('hex').slice(0, 10);
    const rel = `assets/logos/${kind}-${name}.${hash}.svg`;
    LOGOS.set(`${kind}/${name}`, { svg, rel, url: `${SITE.base}${rel}`, ratio: w / h });
  }
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * An <img> for one logo, `size` px tall. Wide wordmarks (Go, PHP) keep their
 * proportions up to twice the height. `alt` defaults to empty: every logo on the
 * site sits next to a visible name, so it is decorative.
 */
export function logo(kind, name, size = 16, { alt = '', cls = '' } = {}) {
  const l = LOGOS.get(`${kind}/${name}`);
  if (!l) throw new Error(`unknown logo ${kind}/${name} (vendor it into scripts/site/logos/${kind})`);
  const width = Math.round(size * Math.min(Math.max(l.ratio, 1), 2));
  const height = l.ratio > 2 ? Math.round(width / l.ratio) : size;
  return `<img class="logo${cls ? ` ${cls}` : ''}" src="${l.url}" alt="${esc(alt)}" width="${width}" height="${height}" decoding="async">`;
}

/**
 * A logo that follows the page theme: the light file in light mode and the
 * `-dark` file in dark mode, when one exists.
 */
export function themedLogo(kind, name, size = 16, opts = {}) {
  if (!LOGOS.has(`${kind}/${name}-dark`)) return logo(kind, name, size, opts);
  const cls = opts.cls ? `${opts.cls} ` : '';
  return logo(kind, name, size, { ...opts, cls: `${cls}when-light` }) + logo(kind, `${name}-dark`, size, { ...opts, cls: `${cls}when-dark` });
}

export const hasLogo = (kind, name) => LOGOS.has(`${kind}/${name}`);

/** Writes every vendored logo into the output folder. */
export function writeLogos(write) {
  for (const l of LOGOS.values()) write(l.rel, l.svg);
  return LOGOS.size;
}
