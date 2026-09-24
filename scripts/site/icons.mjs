// Icon wrapper for the docs site. Each icon is a separate vendored file in ./icons
// (Iconsax, rounded/two-tone). Pages reference icons with icon(name); the page
// template then inlines one <symbol> per icon actually used, so nothing points at
// the icon library at runtime.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'icons');
const SYMBOLS = new Map();
for (const f of readdirSync(DIR).filter((f) => f.endsWith('.svg'))) {
  const name = f.replace(/\.svg$/, '');
  const svg = readFileSync(join(DIR, f), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/\n/g, '');
  SYMBOLS.set(name, `<symbol id="i-${name}" viewBox="${viewBox}" fill="none">${inner}</symbol>`);
}

/** Collects the icons one page uses. */
export class IconSet {
  constructor() { this.used = new Set(); }

  /** Inline reference to an icon. */
  icon(name, size = 18, cls = '') {
    if (!SYMBOLS.has(name)) throw new Error(`unknown icon ${name} (vendor it into scripts/site/icons)`);
    this.used.add(name);
    return `<svg class="i${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  }

  /** The hidden sprite with every icon used so far. */
  sprite(extra = []) {
    for (const n of extra) this.used.add(n);
    const body = [...this.used].sort().map((n) => SYMBOLS.get(n)).join('');
    return `<svg class="sprite" width="0" height="0" aria-hidden="true">${body}</svg>`;
  }
}

export const hasIcon = (name) => SYMBOLS.has(name);
