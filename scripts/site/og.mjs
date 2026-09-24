// Per-page Open Graph images (1200x630 PNG), rendered at build time: satori lays out
// the card as SVG with the brand fonts, resvg rasterises it. Results are cached in
// .cache/og/ by a hash of everything that affects the pixels (this file, fonts,
// renderer versions, the card's text), so a rebuild only renders what changed.
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const font = (pkg, file) => readFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), 'files', file));

const FONTS = [
  { name: 'Figtree', weight: 400, style: 'normal', data: font('@fontsource/figtree', 'figtree-latin-400-normal.woff') },
  { name: 'Figtree', weight: 500, style: 'normal', data: font('@fontsource/figtree', 'figtree-latin-500-normal.woff') },
  { name: 'Figtree', weight: 600, style: 'normal', data: font('@fontsource/figtree', 'figtree-latin-600-normal.woff') },
  { name: 'Figtree', weight: 700, style: 'normal', data: font('@fontsource/figtree', 'figtree-latin-700-normal.woff') },
  { name: 'JetBrains Mono', weight: 500, style: 'normal', data: font('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff') },
];

// Bump when the card design changes so every cached image is re-rendered.
const TEMPLATE_VERSION = 'og-v5';

const INK = '#101116';
const INDIGO = '#29158E';
const RELAY = '#4B34D6';
const MUTED = '#6B6E76';
const INK_2 = '#4A4D55';
const LINE = '#D6D4E3';
const BG = '#F4F4F6';
const CURVE = '#E3E0F2';
const PILL = '#C7BFF4';

const h = (type, style, children) => ({ type, props: { style, children } });

const MARK_SVG = (fill) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 286 368"><g fill="${fill}"><rect width="120" height="275" rx="60"/><rect x="145" y="92" width="120" height="275" rx="60"/><path d="M264 292 285 351 250 346Z"/></g></svg>`)}`;

// The ring-and-smile glyph from the landing hero's first pill.
const SMILE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M19.0702 4.95008C23.0402 8.92008 22.9702 15.4 18.8702 19.29C15.0802 22.88 8.93021 22.88 5.13021 19.29C1.02021 15.4 0.950194 8.92008 4.93019 4.95008C8.83019 1.04008 15.1702 1.04008 19.0702 4.95008Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path opacity="0.4" d="M15.8399 16.0703C13.7199 18.0703 10.2799 18.0703 8.16992 16.0703" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}`;

// The landing hero's curve, reused as the card's backdrop.
const CURVES_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 736 920"><g fill="none" stroke="${CURVE}" stroke-width="74" stroke-linecap="round"><path d="M470 110 C 300 300, 250 470, 430 640 C 560 760, 640 720, 660 560"/><path d="M120 300 C 40 520, 120 760, 380 800"/></g><circle cx="498" cy="58" r="52" fill="${CURVE}"/></svg>`)}`;

// Fit text into a line budget: whole sentences when they fit, otherwise cut at a
// word boundary with an ellipsis (the same rule as the landing's cards).
function clip(text, max) {
  if (text.length <= max) return text;
  let out = '';
  for (const sentence of text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || []) {
    if ((out + sentence).trim().length > max) break;
    out += sentence;
  }
  if (out.trim()) return out.trim();
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,.;:]+$/, '')}...`;
}

// The same layout as the landing's cards (scripts/og/card.mjs in opensms-landing):
// lockup top left, an indigo rule and mono kicker, a semibold title, the page's
// description, the hero curves and pills on the right, and a footer bar with the
// URL and SMS / OTP / API. Only the kicker ("Docs / section") and the second
// pill ("OpenSMS Docs") say that this is the docs.
function card({ title, section, path, description }) {
  const img = (src, style) => ({ type: 'img', props: { src, style } });
  const size = title.length <= 26 ? 84 : title.length <= 40 ? 70 : 60;
  const dot = () => h('div', { display: 'flex', width: 5, height: 5, borderRadius: 999, background: INDIGO }, []);
  const url = `opensms.io${path}`.replace(/\/$/, '');
  return h('div', {
    width: 1200, height: 630, display: 'flex', position: 'relative', background: BG, fontFamily: 'Figtree', color: INK,
  }, [
    h('div', { position: 'absolute', left: 0, top: 0, width: 1200, height: 542, display: 'flex', overflow: 'hidden' }, [
      img(CURVES_SVG, { position: 'absolute', left: 700, top: -30, width: 540, height: 675 }),
    ]),
    h('div', {
      position: 'absolute', left: 770, top: 176, display: 'flex', alignItems: 'center', gap: 16, background: INDIGO, color: '#fff',
      borderRadius: 999, padding: '18px 34px 18px 14px', fontSize: 27, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.2,
      boxShadow: '0 22px 40px -24px rgba(41,21,142,.55)',
    }, [
      img(SMILE_SVG, { width: 52, height: 52 }),
      h('div', { display: 'flex', flexDirection: 'column' }, [h('div', { display: 'flex' }, 'Send once,'), h('div', { display: 'flex' }, 'any carrier')]),
    ]),
    h('div', {
      position: 'absolute', left: 812, top: 318, display: 'flex', alignItems: 'center', gap: 16, background: PILL, color: INK,
      borderRadius: 999, padding: '18px 14px 18px 34px', fontSize: 27, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.2,
      boxShadow: '0 22px 40px -24px rgba(41,21,142,.55)',
    }, [
      h('div', { display: 'flex', flexDirection: 'column' }, [h('div', { display: 'flex' }, 'OpenSMS'), h('div', { display: 'flex' }, 'Docs')]),
      h('div', { width: 56, height: 56, borderRadius: 999, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }, [
        img(MARK_SVG(INDIGO), { width: 25, height: 32 }),
      ]),
    ]),
    h('div', { position: 'absolute', left: 72, top: 60, width: 660, height: 440, display: 'flex', flexDirection: 'column' }, [
      h('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
        img(MARK_SVG(INDIGO), { width: 34, height: 44 }),
        h('div', { display: 'flex', fontSize: 40, fontWeight: 600, letterSpacing: -1.6 }, [
          h('span', { color: INDIGO }, 'open'),
          h('span', { color: RELAY }, 'sms'),
        ]),
      ]),
      h('div', { display: 'flex', flexGrow: 1 }, []),
      h('div', { display: 'flex', width: 38, height: 3, background: INDIGO, marginBottom: 18 }, []),
      h('div', { display: 'flex', fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 18, letterSpacing: 2.6, textTransform: 'uppercase', color: INDIGO }, section === 'Home' ? 'Docs' : `Docs / ${section}`),
      h('div', { display: 'flex', marginTop: 16, fontSize: size, fontWeight: 600, letterSpacing: -0.05 * size, lineHeight: 1.02 }, clip(title, 70)),
      ...(description ? [h('div', { display: 'flex', marginTop: 22, fontSize: 24, lineHeight: 1.45, color: INK_2 }, clip(description, 118))] : []),
    ]),
    h('div', {
      position: 'absolute', left: 0, right: 0, bottom: 0, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 72px', borderTop: `1px solid ${LINE}`, fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 18, color: MUTED,
    }, [
      h('div', { display: 'flex' }, url),
      h('div', { display: 'flex', alignItems: 'center', gap: 14, letterSpacing: 2, textTransform: 'uppercase' }, ['SMS', dot(), 'OTP', dot(), 'API']),
    ]),
  ]);
}

// Everything that changes the pixels goes into the cache key: this file, the
// fonts, the renderer versions and the card's own text.
const SOURCE_HASH = createHash('sha256')
  .update(readFileSync(new URL(import.meta.url)))
  .update(JSON.stringify([require('satori/package.json').version, require('@resvg/resvg-js/package.json').version]))
  .update(Buffer.concat(FONTS.map((f) => f.data)))
  .digest('hex');

/**
 * Write the card for one page to outFile, from cache when possible.
 * Returns true when it had to render.
 */
export async function ogImage({ title, section, path, description }, outFile, cacheDir) {
  const key = createHash('sha256').update(JSON.stringify([TEMPLATE_VERSION, SOURCE_HASH, title, section, path, description ?? ''])).digest('hex').slice(0, 20);
  const cached = join(cacheDir, `${key}.png`);
  mkdirSync(dirname(outFile), { recursive: true });
  if (existsSync(cached)) { copyFileSync(cached, outFile); return false; }
  const svg = await satori(card({ title, section, path, description }), { width: 1200, height: 630, fonts: FONTS });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: false } }).render().asPng();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, png);
  writeFileSync(outFile, png);
  return true;
}
