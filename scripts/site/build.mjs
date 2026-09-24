// Builds the public docs website into site/, served at https://opensms.io/docs/.
//
//   npm run build:site
//
// Renders the published Markdown (see config.mjs) with clean URLs, rewrites links
// and images, and writes the sidebar, table of contents, breadcrumbs, prev/next,
// search index, per-page Open Graph images, llms.txt, llms-full.txt, raw Markdown
// copies, sitemap.xml, WebP screenshots and a 404 page. Any broken internal link,
// missing image, missing anchor, skipped heading level, out-of-range description,
// duplicate title or internal detail (development hosts, source paths, authoring
// notes) in the published output fails the build.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync, readdirSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname, posix, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import hljs from 'highlight.js/lib/core';
import sharp from 'sharp';
import { SITE, SECTIONS, DIRECTORY_TARGETS, HOME_SOURCE, PRIVATE } from './config.mjs';
import { createRenderer, escapeHtml, langMark } from './markdown.mjs';
import { IconSet } from './icons.mjs';
import { describe, MIN, MAX } from './describe.mjs';
import { normaliseBrand } from './brand.mjs';
import { ogImage, OG_KEY } from './og.mjs';
import { head, articlePage, homePage, notFoundPage, abs } from './templates.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'site');
const CACHE = join(ROOT, '.cache');
const started = Date.now();

const errors = [];
const fail = (msg) => errors.push(msg);
const write = (rel, data) => {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
};
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

/* ------------------------------------------------------------------ pages */

const slugOf = (path) => path.replace(/(^|\/)README\.md$/, '').replace(/\.md$/, '');
const pages = [];
const pagesByPath = new Map();
for (const section of SECTIONS) {
  for (const p of section.pages) {
    if (PRIVATE.some((re) => re.test(p.path))) fail(`${p.path} is private and cannot be published`);
    if (!existsSync(join(ROOT, p.path))) { fail(`${p.path} is listed in config.mjs but does not exist`); continue; }
    const slug = slugOf(p.path);
    const page = {
      path: p.path, slug, section, anchors: p.anchors,
      url: `${SITE.base}${slug}/`,
      mdUrl: `${SITE.base}${slug}.md`,
      ogUrl: `${SITE.base}og/${slug}.png`,
      editUrl: `${SITE.repo}/blob/${SITE.branch}/${p.path}`,
      labelOverride: p.label,
      seoTitleOverride: p.seoTitle,
    };
    pages.push(page);
    pagesByPath.set(p.path, page);
  }
}

// Every Markdown file in a published folder must be either published or private.
for (const dir of ['getting-started', 'integrate', 'console', 'reference/api']) {
  for (const f of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.md'))) {
    const p = `${dir}/${f}`;
    if (!pagesByPath.has(p) && !PRIVATE.some((re) => re.test(p))) fail(`${p} is neither in the sidebar (config.mjs) nor private`);
  }
}

/* ------------------------------------------------------------ git history */

function gitDates(path) {
  try {
    const out = execFileSync('git', ['log', '--format=%cI', '--', path], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (out) {
      const lines = out.split('\n');
      return { modified: lines[0], created: lines[lines.length - 1] };
    }
  } catch { /* not a git checkout */ }
  const m = statSync(join(ROOT, path)).mtime.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return { modified: m, created: m };
}

/* ------------------------------------------------------------ link mapping */

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const github = (rel, hashPart, kind = 'blob') => `${SITE.repo}/${kind}/${SITE.branch}/${rel}${hashPart}`;
const anchorChecks = [];

/**
 * Resolve a relative Markdown link from `from` (a repo path). Returns
 * { href, external, page?, anchor? } or records an error.
 */
function resolveLink(from, href, { absolute = false } = {}) {
  if (/^(https?:|mailto:|tel:)/.test(href)) return { href, external: !href.startsWith(SITE.origin) };
  const page = pagesByPath.get(from);
  if (href.startsWith('#')) {
    anchorChecks.push({ from, target: from, anchor: href.slice(1) });
    return { href: absolute ? `${abs(page.url)}${href}` : href };
  }
  const [target, anchor] = href.split('#');
  const hashPart = anchor ? `#${anchor}` : '';
  let rel = posix.normalize(posix.join(posix.dirname(from), target.replace(/\/$/, '')));
  if (rel.startsWith('..')) { fail(`${from}: link ${href} leaves the docs repository`); return { href }; }
  const fsPath = join(ROOT, rel);
  if (!existsSync(fsPath)) { fail(`${from}: broken link ${href} (${rel} does not exist)`); return { href }; }
  if (isDir(fsPath)) {
    if (existsSync(join(fsPath, 'README.md'))) rel = rel === '.' ? 'README.md' : `${rel}/README.md`;
    else if (DIRECTORY_TARGETS[rel]) rel = DIRECTORY_TARGETS[rel];
    else return { href: github(rel, hashPart, 'tree'), external: true };
  }
  const targetPage = pagesByPath.get(rel);
  if (targetPage) {
    if (anchor) anchorChecks.push({ from, target: rel, anchor });
    return { href: `${absolute ? abs(targetPage.url) : targetPage.url}${hashPart}` };
  }
  if (rel === HOME_SOURCE) {
    if (anchor) fail(`${from}: link ${href} points at an anchor of the README, which is not published as a page`);
    return { href: absolute ? abs(SITE.base) : SITE.base };
  }
  // Exists in the repository but is not published: link to it on GitHub.
  return { href: github(rel, hashPart), external: true };
}

/* ------------------------------------------------------------------ images */

const copiedImages = new Map();
function imageSize(file) {
  const fd = openSync(file, 'r');
  const buf = Buffer.alloc(64 * 1024);
  readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  if (buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}

function resolveImage(from, src, { absolute = false } = {}) {
  if (/^https?:/.test(src)) { fail(`${from}: remote image ${src} (images must be in the repository)`); return { src, width: 1, height: 1 }; }
  const rel = posix.normalize(posix.join(posix.dirname(from), src));
  const fsPath = join(ROOT, rel);
  if (rel.startsWith('..') || !existsSync(fsPath)) { fail(`${from}: missing image ${src}`); return { src, width: 1, height: 1 }; }
  if (PRIVATE.some((re) => re.test(rel))) fail(`${from}: image ${src} is in a private folder`);
  if (!copiedImages.has(rel)) {
    const size = imageSize(fsPath);
    if (!size) fail(`${from}: cannot read the size of ${src}`);
    copiedImages.set(rel, size ?? { width: 1, height: 1 });
  }
  const url = `${SITE.base}${rel}`;
  const { width, height } = copiedImages.get(rel);
  return { src: absolute ? abs(url) : url, width, height, webp: absolute ? [] : webpVariants(rel, width) };
}

// Screenshots are 1440px PNGs. Each also ships as WebP at 720px (phones, 1x
// column) and at its full width up to 1440px (2x column), served with srcset.
// The PNG stays as the <img> fallback and is what the .md copies link to.
const WEBP_WIDTHS = [720, 1440];
function webpVariants(rel, width) {
  if (!/\.(png|jpe?g)$/i.test(rel) || width <= WEBP_WIDTHS[0]) return [];
  const widths = [...new Set(WEBP_WIDTHS.map((w) => Math.min(w, width)))];
  return widths.map((w) => ({ width: w, rel: rel.replace(/\.(png|jpe?g)$/i, `-${w}.webp`), src: `${SITE.base}${rel.replace(/\.(png|jpe?g)$/i, `-${w}.webp`)}` }));
}

/* -------------------------------------------------------------- rendering */

let currentIcons = new IconSet();
const SDK_MARKS = { typescript: 'typescript', python: 'python', go: 'golang', dotnet: 'dotnet', java: 'java', rust: 'rust', ruby: 'ruby', php: 'php', swift: 'swift' };
const md = createRenderer({ icon: (...a) => currentIcons.icon(...a) });

function inlineText(tok) {
  return (tok.children ?? []).map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : c.type === 'softbreak' ? ' ' : '')).join('');
}

/** Search entries for one page: its intro plus one per h2/h3 section. */
const ENDPOINT = /^(GET|POST|PUT|PATCH|DELETE) \//;
function searchEntries(tokens, pageIndex) {
  const entries = [[pageIndex, '', '', '']];
  let cur = entries[0];
  let endpoint = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === 'heading_open' && (t.tag === 'h2' || t.tag === 'h3')) {
      const title = inlineText(tokens[i + 1]);
      cur = [pageIndex, title, t.attrGet('id'), ''];
      endpoint = ENDPOINT.test(title);
      entries.push(cur);
      i += 1;
      continue;
    }
    if (t.type !== 'inline' || tokens[i - 1]?.type === 'heading_open') continue;
    const text = inlineText(t);
    if (endpoint) {
      // Endpoint sections: the excerpt is the summary line alone. The operation ID
      // and tag stay searchable as keywords (e[4]) but are never shown.
      const meta = text.match(/^Operation ID: (.*?)\. Tag: (.*?)\./);
      if (meta) cur[4] = [meta[1], meta[2]].filter((v) => !/none in contract/.test(v)).join(' ');
      else if (!cur[3]) cur[3] = text;
      continue;
    }
    if (cur[3].length < 600) cur[3] = `${cur[3]} ${text}`.trim();
  }
  // Keep up to 600 characters per entry, ending on a whole word, with an ellipsis
  // so a snippet taken from the end of a cut entry still reads as cut.
  for (const e of entries) if (e[3].length > 600) e[3] = `${e[3].slice(0, e[3].lastIndexOf(' ', 600)).replace(/[\s,;:.(-]+$/, '')}\u2026`;
  return entries;
}

const searchIndex = { pages: [], entries: [] };

for (const page of pages) {
  const src = readFileSync(join(ROOT, page.path), 'utf8');
  const brand = normaliseBrand(src);
  if (brand.hits.length) fail(`${page.path}: brand name in lowercase prose (${brand.hits.length}x); run node scripts/normalise-brand.mjs`);
  if (src.includes('\u2014')) fail(`${page.path}: contains an em dash`);
  currentIcons = new IconSet();
  const env = {
    warnings: [],
    link: (href) => resolveLink(page.path, href),
    image: (s) => resolveImage(page.path, s),
  };
  const tokens = md.parse(src, env);
  page.html = md.renderer.render(tokens, md.options, env)
    // SDK anchors (<span id="sdk-go">Go</span>) carry the language's mark.
    .replace(/<span id="sdk-([a-z]+)">/g, (m, id) => `<span id="sdk-${id}" class="sdk-lang">${langMark(SDK_MARKS[id], (...a) => currentIcons.icon(...a), { size: 20, surface: 'theme', cls: 'sdk-mark' })}`);
  page.icons = currentIcons;
  for (const w of env.warnings) fail(`${page.path}: ${w}`);
  if (!env.h1 || env.h1.length !== 1) fail(`${page.path}: needs exactly one h1, found ${env.h1?.length ?? 0}`);
  page.title = env.h1?.[0] ?? page.path;
  page.navLabel = page.labelOverride ?? page.title;
  page.headings = env.headings;
  let prevLevel = 1;
  for (const h of env.headings) {
    if (h.level > prevLevel + 1) fail(`${page.path}: heading "${h.text}" is h${h.level} right after h${prevLevel} (skipped level)`);
    prevLevel = h.level;
  }
  page.ids = new Set(env.headings.map((h) => h.id));
  for (const a of page.anchors ?? []) if (!page.ids.has(a.id)) fail(`${page.path}: sidebar anchor #${a.id} does not exist`);
  const d = describe(page.path, src);
  if (d.error) fail(d.error);
  page.description = d.description ?? '';
  const dates = gitDates(page.path);
  page.lastmod = dates.modified;
  page.created = dates.created;
  const words = src.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  page.minutes = Math.max(1, Math.round(words / 230));
  page.src = src;
  const pageIndex = searchIndex.pages.length;
  searchIndex.pages.push({ t: page.title, u: page.url, s: page.section.title, i: page.section.icon, r: page.section.id === 'api-reference' ? 1 : undefined });
  searchIndex.entries.push(...searchEntries(tokens, pageIndex));
}

for (const c of anchorChecks) {
  const target = pagesByPath.get(c.target);
  if (target?.ids && !target.ids.has(c.anchor)) fail(`${c.from}: link to missing anchor #${c.anchor} in ${c.target}`);
}

// SEO titles: the h1, or a config override, disambiguated where a page's name
// collides with another page's name, sidebar label or parenthesised short name
// (so the OTP reference page does not compete with "One-time passcodes (OTP)").
const namesOf = (p) => {
  const names = [p.title, p.navLabel];
  for (const m of p.title.matchAll(/\(([^)]+)\)/g)) names.push(m[1]);
  return names.map((n) => n.toLowerCase());
};
const nameCount = new Map();
for (const p of pages) for (const n of new Set(namesOf(p))) nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
for (const p of pages) {
  let t = p.seoTitleOverride ?? p.title;
  if (!p.seoTitleOverride && (nameCount.get(p.title.toLowerCase()) ?? 0) > 1) {
    if (p.section.id === 'api-reference') t = `${p.title} API`;
    else if (p.section.id === 'web-app') t = `${p.title} in the web app`;
  }
  p.seoTitle = `${t} | ${SITE.name}`;
}
const seen = new Map();
for (const p of pages) {
  if (seen.has(p.seoTitle)) fail(`duplicate title "${p.seoTitle}" (${seen.get(p.seoTitle)} and ${p.path})`);
  seen.set(p.seoTitle, p.path);
}
const seenDesc = new Map();
for (const p of pages) {
  if (seenDesc.has(p.description)) fail(`duplicate description (${seenDesc.get(p.description)} and ${p.path})`);
  seenDesc.set(p.description, p.path);
}

if (errors.length) {
  console.error(`build:site failed with ${errors.length} error(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ output */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Fonts, self-hosted: byte-for-byte copies of the landing's public/assets/fonts/
// (variable Figtree and JetBrains Mono, latin + latin-ext, with their SIL Open
// Font License texts), vendored in ./fonts so both halves of opensms.io render
// the same glyphs. Refresh them from the landing when it updates its fonts.
mkdirSync(join(OUT, 'fonts'), { recursive: true });
for (const f of readdirSync(join(HERE, 'fonts'))) copyFileSync(join(HERE, 'fonts', f), join(OUT, 'fonts', f));

// Programming language marks (SVGL files, one per language; see languages/README.md),
// loaded by code block headers, language tabs and the SDK pages as <img>.
mkdirSync(join(OUT, 'languages'), { recursive: true });
for (const f of readdirSync(join(HERE, 'languages')).filter((f) => f.endsWith('.svg'))) copyFileSync(join(HERE, 'languages', f), join(OUT, 'languages', f));

// One CSS file and one deferred script, content-hashed.
const css = readFileSync(join(HERE, 'assets', 'docs.css'), 'utf8').replace(/\n\s*\/\*[\s\S]*?\*\//g, '\n').replace(/\n{2,}/g, '\n');
const js = readFileSync(join(HERE, 'assets', 'docs.js'), 'utf8');
const assets = {
  css: `${SITE.base}assets/docs.${hash(css)}.css`,
  js: `${SITE.base}assets/docs.${hash(js)}.js`,
  // Preloaded so body text never swaps late; docs.css points at the same file.
  fontFigtree: `${SITE.base}fonts/figtree-latin.woff2`,
};
write(assets.css.slice(SITE.base.length), css);
write(assets.js.slice(SITE.base.length), js);

// Images referenced by published pages, plus their WebP variants (cached in
// .cache/img/ by a hash of the source file, width and encoder settings).
const WEBP = { quality: 80, effort: 5 };
let webpEncoded = 0;
let webpCount = 0;
for (const [rel, size] of copiedImages) {
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });
  copyFileSync(join(ROOT, rel), join(OUT, rel));
  const source = readFileSync(join(ROOT, rel));
  for (const v of webpVariants(rel, size.width)) {
    const key = createHash('sha256').update(source).update(JSON.stringify([v.width, WEBP, sharp.versions.sharp])).digest('hex').slice(0, 24);
    const cached = join(CACHE, 'img', `${key}.webp`);
    if (!existsSync(cached)) {
      mkdirSync(dirname(cached), { recursive: true });
      await sharp(source).resize({ width: v.width, withoutEnlargement: true }).webp(WEBP).toFile(cached);
      webpEncoded += 1;
    }
    copyFileSync(cached, join(OUT, v.rel));
    webpCount += 1;
  }
}

// Open Graph cards.
let rendered = 0;
const ogCache = join(CACHE, 'og');
const ogJobs = [
  ...pages.map((p) => ({ title: p.title, section: p.section.title, path: p.url, description: p.description, file: p.ogUrl })),
  { title: 'Build with OpenSMS', section: 'Home', path: SITE.base, description: 'Guides, API reference and SDKs for sending SMS across Africa.', file: `${SITE.base}og/index.png` },
];
for (const job of ogJobs) {
  if (await ogImage(job, join(OUT, job.file.slice(SITE.base.length)), ogCache)) rendered += 1;
}

const ORG = { '@type': 'Organization', '@id': `${SITE.origin}/#organization`, name: 'OpenSMS', url: `${SITE.origin}/`, logo: `${SITE.origin}/icon-512.png` };
const WEBSITE_ID = `${abs(SITE.base)}#website`;

// Article pages.
pages.forEach((page, i) => {
  const prev = pages[i - 1];
  const next = pages[i + 1];
  // Docs > section > page, where the section crumb links to the section's first
  // page. On that first page (and in a one-page section such as SDKs) the section
  // crumb would point at the page itself, repeating its URL in the BreadcrumbList,
  // so the trail is Docs > page instead; the eyebrow above the h1 still names the
  // section.
  const sectionHome = pagesByPath.get(page.section.pages[0].path);
  page.crumbs = sectionHome === page
    ? [{ name: 'Docs', url: SITE.base }, { name: page.title, url: page.url }]
    : [
      { name: 'Docs', url: SITE.base },
      { name: page.section.title, url: sectionHome.url },
      { name: page.navLabel, url: page.url },
    ];
  const urls = page.crumbs.map((c) => c.url);
  if (new Set(urls).size !== urls.length) fail(`${page.path}: breadcrumb trail repeats a URL (${urls.join(', ')})`);
  const canonical = abs(page.url);
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'TechArticle', headline: page.title, description: page.description,
      url: canonical, mainEntityOfPage: canonical, image: abs(page.ogUrl), inLanguage: 'en',
      datePublished: page.created, dateModified: page.lastmod, articleSection: page.section.title,
      isPartOf: { '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE.name, url: abs(SITE.base) },
      author: ORG, publisher: ORG,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: page.crumbs.map((c, n) => ({ '@type': 'ListItem', position: n + 1, name: c.name, item: abs(c.url) })),
    },
  ];
  const headHtml = head({
    title: page.seoTitle, description: page.description, canonical, ogImage: abs(page.ogUrl),
    ogAlt: page.section.title === page.title ? `${page.title}, OpenSMS Docs` : `${page.title}: ${page.section.title}, OpenSMS Docs`, markdownUrl: page.mdUrl, ld, assets, modified: page.lastmod,
  });
  const html = articlePage({ page, prev, next, icons: page.icons, pagesByPath, assets, headHtml });
  write(`${page.slug}/index.html`, html);
});

// Docs home.
{
  const icons = new IconSet();
  const demo = `curl -s -X POST $OPENSMS_API/v1/messages \\\n  -H "authorization: Bearer $OPENSMS_API_KEY" \\\n  -H 'content-type: application/json' \\\n  -H 'idempotency-key: quickstart-001' \\\n  -d '{"to":"+254700000001","text":"Hello from OpenSMS"}'`;
  const stats = {
    demoHtml: hljs.highlight(demo, { language: 'bash' }).value,
    steps: [
      { icon: 'flash', title: 'Send a sandbox message', text: 'Create an account, mint a sk_test_ key and send your first message in about five minutes.', url: pagesByPath.get('getting-started/quickstart.md').url },
      { icon: 'key', title: 'Authenticate your servers', text: 'Scoped API keys for servers, session tokens for people, and how to rotate them safely.', url: pagesByPath.get('integrate/authentication.md').url },
      { icon: 'sms-tracking', title: 'Track every delivery', text: 'Signed webhooks for delivered, failed and expired messages, with retries you can replay.', url: pagesByPath.get('integrate/delivery-reports-and-webhooks.md').url },
      { icon: 'rocket', title: 'Go live', text: 'Verification, legal acceptance, a funded wallet and a sender ID, then switch to a live key.', url: pagesByPath.get('getting-started/going-live.md').url },
    ],
  };
  const lastmod = pages.map((p) => p.lastmod).sort().pop();
  const ld = [{
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': WEBSITE_ID, name: SITE.name, url: abs(SITE.base),
    description: SITE.homeDescription, inLanguage: 'en', publisher: ORG,
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${abs(SITE.base)}?q={search_term_string}` }, 'query-input': 'required name=search_term_string' },
  }];
  const headHtml = head({
    title: SITE.homeTitle, description: SITE.homeDescription, canonical: abs(SITE.base), ogImage: abs(`${SITE.base}og/index.png`),
    ogAlt: 'OpenSMS Docs: guides, API reference and SDKs', markdownUrl: null, ld, assets, type: 'website',
  });
  write('index.html', homePage({ icons, pagesByPath, sections: SECTIONS, headHtml, stats }));
  searchIndex.lastmod = lastmod;
}

// 404.
{
  const icons = new IconSet();
  const headHtml = head({ title: `Page not found | ${SITE.name}`, description: 'This page does not exist in the OpenSMS docs. Search the docs or start from the quickstart, the integration guides or the API reference.', noindex: true, assets });
  write('404.html', notFoundPage({ icons, pagesByPath, headHtml }));
}

// Search index.
write('search-index.json', JSON.stringify({ pages: searchIndex.pages, entries: searchIndex.entries }));

/* ------------------------------------------------------- Markdown for LLMs */

/** A page's Markdown with every link and image made absolute and comments removed. */
function portableMarkdown(page) {
  let fence = false;
  return page.src.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    return line
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (m, bang, text, target) => {
        if (bang) return `![${text}](${resolveImage(page.path, target, { absolute: true }).src})`;
        return `[${text}](${resolveLink(page.path, target, { absolute: true }).href})`;
      });
  }).join('\n').replace(/^\s*\n/, '').replace(/\n{3,}/g, '\n\n').trim();
}

for (const page of pages) {
  page.portable = portableMarkdown(page);
  write(`${page.slug}.md`, `${page.portable}\n`);
}

const llms = [
  `# ${SITE.name}`,
  '',
  `> ${SITE.summary}`,
  '',
  'These docs cover the OpenSMS customer API and web app. Every page below is plain Markdown. OpenSMS is pre-launch: sandbox access, and the API origin that the examples write as `$OPENSMS_API`, come with an invitation from the waitlist at ' + `${SITE.origin}/` + '. Sandbox keys start with `sk_test_` and live keys with `sk_live_`. Request and response examples were captured from a running OpenSMS API, with secrets shortened. The sandbox workspaces used had not verified the owner\'s email, so the examples for `POST /v1/messages` and `POST /v1/otp/send` show the `403` refusal and no page shows a captured successful send; the success responses of those operations are described by their fields in the API reference instead. The full text of every page is in one file at ' + abs(`${SITE.base}llms-full.txt`) + '.',
  '',
];
for (const section of SECTIONS) {
  llms.push(`## ${section.title}`, '');
  for (const p of section.pages) {
    const page = pagesByPath.get(p.path);
    llms.push(`- [${page.title}](${abs(page.mdUrl)}): ${page.description}`);
  }
  llms.push('');
}
write('llms.txt', llms.join('\n'));

const full = [`# ${SITE.name}`, '', `> ${SITE.summary}`, ''];
for (const page of pages) {
  full.push('---', '', `Source: ${abs(page.url)}`, `Section: ${page.section.title}`, '', page.portable, '');
}
write('llms-full.txt', full.join('\n'));

/* ------------------------------------------------------------- sitemap etc */

const urls = [{ loc: abs(SITE.base), lastmod: searchIndex.lastmod }, ...pages.map((p) => ({ loc: abs(p.url), lastmod: p.lastmod }))];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join('\n')}
</urlset>
`);

// Folders with no page of their own. A section folder (integrate/) redirects to
// its first page; anything else (og/, assets/, fonts/) is a 404, not a listing.
function dirsWithoutIndex(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) dirsWithoutIndex(p, out);
  }
  if (dir !== OUT && !existsSync(join(dir, 'index.html'))) out.push(relative(OUT, dir).split('\\').join('/'));
  return out;
}
const sectionRedirects = [];
const hiddenDirs = [];
for (const rel of dirsWithoutIndex(OUT).sort()) {
  const first = pages.find((p) => p.slug.startsWith(`${rel}/`));
  if (first && !['og', 'assets', 'fonts', 'languages'].includes(rel.split('/')[0])) sectionRedirects.push([rel, first.url]);
  else hiddenDirs.push(rel);
}
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const topHidden = [...new Set(hiddenDirs.map((d) => d.split('/')[0]))];

write('.htaccess', `# OpenSMS Docs on the landing's php:apache container. That image allows
# overrides for /var/www/ (AllowOverride All in conf-enabled/docker-php.conf),
# and has mod_alias, mod_dir, mod_mime and mod_setenvif enabled, so everything
# outside the IfModule block below takes effect. mod_headers is NOT enabled in
# the stock image, so that block is skipped there: until the image runs
# "a2enmod headers", the proxy in front of it (opensms.nginx.conf in the landing
# repo) must add "X-Robots-Tag: noindex" for /docs/*.md and /docs/*.txt.

Options -Indexes
DirectorySlash On
ErrorDocument 404 /docs/404.html
AddType text/markdown .md
AddCharset utf-8 .md .txt .xml .json

# First match wins, so the specific rules come first.

# Dot files (the landing build writes a .release stamp here) are not public.
RedirectMatch 404 "^/docs/(.*/)?\\.[^/]+$"

# Section folders without a page of their own go to the section's first page.
${sectionRedirects.map(([rel, url]) => `RedirectMatch 301 "^/docs/${reEsc(rel)}/?$" "${abs(url)}"`).join('\n')}

# Asset folders are never listed.
RedirectMatch 404 "^/docs/(${topHidden.map(reEsc).join('|')})(/.*)?/$"

# A page URL typed without its trailing slash goes straight to the https URL,
# instead of through mod_dir's redirect, which would use the backend's http.
RedirectMatch 301 "^(/docs/[^.]*[^/.])$" "${SITE.origin}$1/"

# Raw Markdown and the llms files are for tools, not search results.
SetEnvIf Request_URI "^(/docs/.+)\\.md$" DOCS_MD_PAGE=$1/
<IfModule mod_headers.c>
  <FilesMatch "\\.(md|txt)$">
    Header set X-Robots-Tag "noindex"
  </FilesMatch>
  Header set Link "<${SITE.origin}%{DOCS_MD_PAGE}e>; rel=\\"canonical\\"" env=DOCS_MD_PAGE
</IfModule>
`);

/* ---------------------------------------------------------------- checks */

// Things that must never reach a reader: authoring notes about the stack the docs
// were written against, development hosts, private source paths, test-harness labels.
const INTERNAL = [
  [/\blocal (docs )?stack\b|\bdocs stack\b|\btest copy of OpenSMS\b/i, 'authoring note about the docs stack'],
  [/\b127\.0\.0\.1\b|\blocalhost(:\d+)?\b/i, 'development host'],
  [/\b(api\/(internal|cmd)|frontend\/src)\/[\w./-]+/, 'private source path'],
  [/\berror path only\b|\bcaptured live\b/i, 'test-harness label'],
];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const files = walk(OUT);
const idCache = new Map();
const idsOf = (file) => {
  if (!idCache.has(file)) idCache.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idCache.get(file);
};
for (const file of files) {
  const ext = extname(file);
  if (!['.html', '.md', '.txt', '.xml', '.json', '.css', '.js'].includes(ext) && !file.endsWith('.htaccess')) continue;
  const text = readFileSync(file, 'utf8');
  const rel = relative(OUT, file);
  if (text.includes('\u2014')) fail(`${rel}: contains an em dash`);
  if (!['.css', '.js'].includes(ext) && !file.endsWith('.htaccess')) {
    for (const [re, why] of INTERNAL) {
      const m = text.match(re);
      if (m) fail(`${rel}: ${why}: "${text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ')}"`);
    }
  }
  if (ext !== '.html') continue;
  const h1s = (text.match(/<h1[\s>]/g) ?? []).length;
  if (!text.includes('http-equiv="refresh"') && h1s !== 1) fail(`${rel}: ${h1s} h1 elements`);
  for (const m of text.matchAll(/\s(?:href|src)="(\/docs\/[^"]*)"/g)) {
    const [pathPart, frag] = m[1].split('#');
    const clean = pathPart.split('?')[0];
    let target = join(OUT, clean.slice(SITE.base.length));
    if (clean.endsWith('/')) target = join(target, 'index.html');
    if (!existsSync(target)) { fail(`${rel}: broken link ${m[1]}`); continue; }
    if (frag && target.endsWith('.html') && !idsOf(target).has(frag)) fail(`${rel}: link to missing anchor ${m[1]}`);
  }
}

if (errors.length) {
  console.error(`build:site failed with ${errors.length} error(s):\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`build:site wrote ${pages.length} pages + home + 404 to site/ in ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`  images ${copiedImages.size}, OG cards ${ogJobs.length} (${rendered} rendered, ${ogJobs.length - rendered} from cache)`);
console.log(`  OG cache key: ${OG_KEY.template}, satori ${OG_KEY.libs.satori}, resvg ${OG_KEY.libs.resvg}, ${OG_KEY.fonts.map((f) => `${f.name} ${f.weight} (${f.version})`).join(', ')}`);
console.log(`  css ${kb(css.length)}, js ${kb(js.length)}, search index ${kb(statSync(join(OUT, 'search-index.json')).size)}, llms-full.txt ${kb(statSync(join(OUT, 'llms-full.txt')).size)}`);
console.log(`  descriptions ${MIN}-${MAX} chars: all ${pages.length} in range; titles unique`);
