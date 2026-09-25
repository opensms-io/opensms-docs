// Per-page Open Graph images (1200x630 PNG), rendered at build time with the
// landing's card template (scripts/og/card.mjs in opensms-landing): the official
// lockup top left, an indigo rule and an indigo mono label, a weight 600 Figtree
// title, the description, the hero curves with the mark on a white tile (the
// docs home gets the landing home's speech pills), and a footer rule with the
// URL and SMS / OTP / API. The fonts (./og/fonts) and the lockup (./og) are
// copies of the landing's, and satori and resvg are pinned to the landing's
// versions, so a docs card and a landing card are drawn the same way.
//
// Cards are cached in .cache/og/ under a key made of the template version, a hash
// of this file and the lockup, each font's name, weight, version string and
// bytes, the satori and resvg versions, and the card's own text.
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);
const HERE = new URL('./og/', import.meta.url);

// Bump when the card design changes, so every cached card is re-rendered even
// if nothing else in the key moved.
const TEMPLATE_VERSION = 'og-v7-landing-card';

const C = { bg: '#F4F4F6', surface: '#FFFFFF', ink: '#101116', ink2: '#4A4D55', muted: '#6B6E76', line: '#D6D4E3', indigo: '#29158E', relay: '#4B34D6', curve: '#E3E0F2', pill2: '#C7BFF4' };

/** The version string (name ID 5, e.g. "Version 1.240") of a TrueType font. */
function fontVersion(buf) {
  const numTables = buf.readUInt16BE(4);
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) !== 'name') continue;
    const table = buf.readUInt32BE(rec + 8);
    const count = buf.readUInt16BE(table + 2);
    const strings = table + buf.readUInt16BE(table + 4);
    for (let j = 0; j < count; j += 1) {
      const r = table + 6 + j * 12;
      const [platform, , , nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => buf.readUInt16BE(r + o));
      if (nameId !== 5) continue;
      const raw = buf.subarray(strings + offset, strings + offset + length);
      if (platform === 1) return raw.toString('latin1');
      let s = '';
      for (let k = 0; k + 1 < raw.length; k += 2) s += String.fromCharCode(raw.readUInt16BE(k));
      return s;
    }
  }
  return 'unknown';
}

const FONTS = [
  ['Figtree', 'Figtree-Regular.ttf', 400],
  ['Figtree', 'Figtree-SemiBold.ttf', 600],
  ['JetBrains Mono', 'JetBrainsMono-Medium.ttf', 500],
].map(([name, file, weight]) => {
  const data = readFileSync(new URL(`fonts/${file}`, HERE));
  return { name, weight, style: 'normal', data, file, version: fontVersion(data) };
});

const LOCKUP = readFileSync(new URL('opensms-lockup-h-light.svg', HERE), 'utf8');
const LIBS = { satori: require('satori/package.json').version, resvg: require('@resvg/resvg-js/package.json').version };

const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const lockup = svgUri(LOCKUP);
const mark = (fill) => svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 286 368"><g fill="${fill}"><rect width="120" height="275" rx="60"/><rect x="145" y="92" width="120" height="275" rx="60"/><path d="M264 292 285 351 250 346Z"/></g></svg>`);
const curves = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 736 920"><g fill="none" stroke="${C.curve}" stroke-width="74" stroke-linecap="round"><path d="M470 110 C 300 300, 250 470, 430 640 C 560 760, 640 720, 660 560"/><path d="M120 300 C 40 520, 120 760, 380 800"/></g><circle cx="498" cy="58" r="52" fill="${C.curve}"/></svg>`);
const smile = svgUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"><path d="M19.0702 4.95008C23.0402 8.92008 22.9702 15.4 18.8702 19.29C15.0802 22.88 8.93021 22.88 5.13021 19.29C1.02021 15.4 0.950194 8.92008 4.93019 4.95008C8.83019 1.04008 15.1702 1.04008 19.0702 4.95008Z" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path opacity="0.4" d="M15.8399 16.0703C13.7199 18.0703 10.2799 18.0703 8.16992 16.0703" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>');

// Minimal element factory in the shape satori expects (no JSX build step).
const h = (type, style, ...children) => ({ type, props: { style, children: children.flat().filter((c) => c !== null && c !== false) } });
const img = (src, width, height, style = {}) => ({ type: 'img', props: { src, width, height, style } });

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

function heroArt() {
  const pill = (bg, color, lines, icon, iconLeft, extra) => h('div', { position: 'absolute', display: 'flex', alignItems: 'center', gap: 16, background: bg, borderRadius: 999, padding: iconLeft ? '18px 34px 18px 14px' : '18px 14px 18px 34px', boxShadow: '0 22px 40px -24px rgba(41,21,142,.55)', ...extra },
    iconLeft ? icon : null,
    h('div', { display: 'flex', flexDirection: 'column', fontSize: 27, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.2, color }, ...lines.map((l) => h('div', { display: 'flex' }, l))),
    iconLeft ? null : icon);
  return [
    pill(C.indigo, '#FFFFFF', ['Send through', 'one API'], img(smile, 52, 52), true, { left: 770, top: 176 }),
    pill(C.pill2, C.ink, ['Routes ranked by', 'health and price'], h('div', { display: 'flex', width: 56, height: 56, borderRadius: 999, background: C.surface, alignItems: 'center', justifyContent: 'center' }, img(mark(C.indigo), 25, 32)), false, { left: 812, top: 318 }),
  ];
}

function markArt() {
  return [
    h('div', { position: 'absolute', left: 842, top: 170, width: 236, height: 236, borderRadius: 56, background: C.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 30px 60px -34px rgba(41,21,142,.55)' },
      img(mark(C.indigo), 104, 134)),
  ];
}

function card({ title, section, path, description }) {
  const size = title.length <= 26 ? 84 : title.length <= 40 ? 70 : 60;
  const kicker = section === 'Home' ? 'Docs' : `Docs / ${section}`;
  const url = `opensms.io${path}`.replace(/\/$/, '');
  const dot = () => h('div', { display: 'flex', width: 5, height: 5, borderRadius: 999, background: C.indigo });
  return h('div', { width: 1200, height: 630, display: 'flex', position: 'relative', background: C.bg, fontFamily: 'Figtree', color: C.ink },
    h('div', { position: 'absolute', left: 0, top: 0, width: 1200, height: 542, display: 'flex', overflow: 'hidden' },
      img(curves, 540, 675, { position: 'absolute', left: 700, top: -30 })),
    ...(section === 'Home' ? heroArt() : markArt()),
    h('div', { position: 'absolute', left: 72, top: 60, width: 660, height: 440, display: 'flex', flexDirection: 'column' },
      img(lockup, 218, 56),
      h('div', { display: 'flex', flexGrow: 1 }),
      h('div', { display: 'flex', width: 38, height: 3, background: C.indigo, marginBottom: 18 }),
      h('div', { display: 'flex', fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 18, letterSpacing: 2.6, textTransform: 'uppercase', color: C.indigo }, kicker),
      h('div', { display: 'flex', marginTop: 16, fontSize: size, fontWeight: 600, letterSpacing: -0.05 * size, lineHeight: 1.02 }, clip(title, 70)),
      description ? h('div', { display: 'flex', marginTop: 22, fontSize: 24, lineHeight: 1.45, color: C.ink2 }, clip(description, 118)) : null),
    h('div', { position: 'absolute', left: 0, right: 0, bottom: 0, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 72px', borderTop: `1px solid ${C.line}`, fontFamily: 'JetBrains Mono', fontWeight: 500, fontSize: 18, color: C.muted },
      h('div', { display: 'flex' }, url),
      h('div', { display: 'flex', alignItems: 'center', gap: 14, letterSpacing: 2, textTransform: 'uppercase' }, 'SMS', dot(), 'OTP', dot(), 'API')));
}

// Everything that changes the pixels, apart from the card's own text.
export const OG_KEY = {
  template: TEMPLATE_VERSION,
  source: createHash('sha256').update(readFileSync(new URL(import.meta.url))).update(LOCKUP).digest('hex').slice(0, 16),
  fonts: FONTS.map((f) => ({ name: f.name, weight: f.weight, file: f.file, version: f.version, sha: createHash('sha256').update(f.data).digest('hex').slice(0, 16) })),
  libs: LIBS,
};
const KEY_BASE = JSON.stringify(OG_KEY);

/**
 * Write the card for one page to outFile, from cache when possible.
 * Returns true when it had to render.
 */
export async function ogImage({ title, section, path, description }, outFile, cacheDir) {
  const key = createHash('sha256').update(JSON.stringify([KEY_BASE, title, section, path, description ?? ''])).digest('hex').slice(0, 20);
  const cached = join(cacheDir, `${key}.png`);
  mkdirSync(dirname(outFile), { recursive: true });
  if (existsSync(cached)) { copyFileSync(cached, outFile); return false; }
  const svg = await satori(card({ title, section, path, description }), { width: 1200, height: 630, fonts: FONTS.map(({ name, weight, style, data }) => ({ name, weight, style, data })) });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, font: { loadSystemFonts: false } }).render().asPng();
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, png);
  writeFileSync(outFile, png);
  return true;
}
