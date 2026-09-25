// HTML templates for the docs site: shared head, header, sidebar, footer and search
// dialog, plus the article, docs home and 404 pages. Everything is static HTML; the
// only script is one small deferred file (theme, drawer, search, copy, scrollspy).
import { SITE, SECTIONS } from './config.mjs';
import { escapeHtml as esc, wbrPath, langMark } from './markdown.mjs';

const MARK = (h = 26, cls = '') => `<svg class="mark${cls ? ` ${cls}` : ''}" viewBox="0 0 286 368" height="${h}" aria-hidden="true" focusable="false"><g fill="var(--mark)"><rect width="120" height="275" rx="60"/><rect x="145" y="92" width="120" height="275" rx="60"/><path d="M264 292 285 351 250 346Z"/></g></svg>`;

// Same boot script as the landing: the theme cookie (or localStorage) set by either
// site decides the theme before first paint. It also swaps the no-js class for js
// (so controls that need the script are hidden without it) and keeps the one
// theme-color meta in step with the theme actually shown.
export const THEME_COLOR = { light: '#F4F4F6', dark: '#0B0A14' };
const THEME_BOOT = `(function(){var d=document.documentElement;d.className=d.className.replace(/\\bno-js\\b/,'js');try{var m=document.cookie.match(/(?:^|; )opensms-theme=(dark|light)/);var t=m?m[1]:localStorage.getItem('opensms-theme');if(!t&&window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)t='dark';if(t==='dark'){d.setAttribute('data-theme','dark');var c=document.querySelector('meta[name=theme-color]');if(c)c.setAttribute('content','${THEME_COLOR.dark}');}var l=localStorage.getItem('opensms-docs-lang');if(l&&/^[a-z0-9-]+$/.test(l))d.setAttribute('data-lang',l);}catch(e){}})();`;

export const abs = (path) => `${SITE.origin}${path}`;

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

export function head({ title, description, canonical, ogImage, ogAlt, ogUrl = canonical, markdownUrl, noindex, ld = [], assets, type = 'article', modified }) {
  const tags = [
    '<meta charset="utf-8">',
    `<meta name="theme-color" content="${THEME_COLOR.light}">`,
    `<script>${THEME_BOOT}</script>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${canonical}">`,
    `<link rel="preload" href="${assets.fontFigtree}" as="font" type="font/woff2" crossorigin>`,
    `<link rel="stylesheet" href="${assets.css}">`,
    `<script src="${assets.js}" defer></script>`,
    '<link rel="icon" href="/favicon.ico" sizes="32x32">',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    '<link rel="manifest" href="/manifest.json">',
  ];
  if (markdownUrl) tags.push(`<link rel="alternate" type="text/markdown" href="${markdownUrl}" title="Markdown">`);
  tags.push(`<link rel="alternate" type="text/plain" href="${SITE.base}llms.txt" title="llms.txt">`);
  // Noindex pages (the 404) still get social tags when they pass an image, so a
  // shared broken link previews like the landing 404 does.
  if (!noindex || ogImage) {
    tags.push(
      `<meta property="og:type" content="${type}">`,
      '<meta property="og:site_name" content="OpenSMS">',
      '<meta property="og:locale" content="en_US">',
      `<meta property="og:title" content="${esc(title)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      `<meta property="og:url" content="${ogUrl}">`,
      `<meta property="og:image" content="${ogImage}">`,
      '<meta property="og:image:type" content="image/png">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta property="og:image:alt" content="${esc(ogAlt)}">`,
    );
    if (modified && type === 'article') tags.push(`<meta property="article:modified_time" content="${modified}">`);
    tags.push(
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${esc(title)}">`,
      `<meta name="twitter:description" content="${esc(description)}">`,
      `<meta name="twitter:image" content="${ogImage}">`,
      `<meta name="twitter:image:alt" content="${esc(ogAlt)}">`,
    );
  }
  for (const obj of ld) tags.push(jsonLd(obj));
  return tags.join('\n');
}

function header({ icons, activeSection }) {
  const links = [
    ['get-started', 'Get started', `${SITE.base}getting-started/overview/`],
    ['integrate', 'Integrate', `${SITE.base}integrate/authentication/`],
    ['sdks', 'SDKs', `${SITE.base}integrate/sdk/`],
    ['api-reference', 'API reference', `${SITE.base}reference/api/`],
    ['web-app', 'Web app', `${SITE.base}console/`],
  ];
  return `<a class="skip" href="#content">Skip to content</a>
<header class="top">
  <div class="top-inner">
    <button type="button" class="icon-btn menu-btn" data-drawer-open aria-label="Open navigation" aria-controls="sidebar" aria-expanded="false">${icons.icon('menu')}<span class="sr-only">Open navigation</span></button>
    <div class="brand">
      <a href="/" class="brand-mark" aria-label="OpenSMS home">${MARK(26)}<span class="brand-word"><span class="w-open">open</span><span class="w-sms">sms</span></span></a>
      <a href="${SITE.base}" class="brand-docs">Docs</a>
    </div>
    <nav class="top-nav" aria-label="Sections">
      ${links.map(([id, label, href]) => `<a href="${href}"${id === activeSection ? ' aria-current="true"' : ''}>${label}</a>`).join(' ')}
    </nav>
    <div class="top-right">
      <button type="button" class="search-trigger" data-search-open aria-keyshortcuts="Meta+K Control+K /">${icons.icon('search', 17)}<span class="search-trigger-text">Search docs</span> <kbd class="kbd-cmd" aria-hidden="true">Ctrl K</kbd></button>
      <a class="icon-btn gh-btn" href="${SITE.repo}" aria-label="The docs on GitHub" rel="noopener">${icons.icon('github')}<span class="sr-only">The docs on GitHub</span></a>
      <button type="button" class="icon-btn" data-action="toggle-theme" aria-label="Toggle dark mode">${icons.icon('moon', 18, 'when-light')}${icons.icon('sun', 18, 'when-dark')}<span class="sr-only">Toggle dark mode</span></button>
      <a class="cta-btn" href="${SITE.origin}/signup">Get started</a>
    </div>
  </div>
</header>`;
}

function sidebar({ icons, pagesByPath, current, drawerOnly = false }) {
  const groups = SECTIONS.map((s) => {
    const isCurrent = s.pages.some((p) => p.path === current);
    const open = isCurrent || s.pages.length <= 12;
    const items = s.pages.map((p) => {
      const page = pagesByPath.get(p.path);
      const here = p.path === current;
      const sub = here && p.anchors
        ? `<ul class="side-anchors">${p.anchors.map((a) => `<li><a href="#${a.id}">${esc(a.label)}</a></li>`).join('')}</ul>`
        : '';
      return `<li><a href="${page.url}"${here ? ' aria-current="page"' : ''}>${esc(page.navLabel)}</a>${sub}</li>`;
    }).join('');
    return `<details class="side-group"${open ? ' open' : ''}>
  <summary>${icons.icon(s.icon, 16, 'side-icon')}<span>${esc(s.title)}</span>${icons.icon('arrow-down4', 14, 'side-chev')}</summary>
  <ul>${items}</ul>
</details>`;
  }).join('\n');
  return `<aside class="sidebar${drawerOnly ? ' drawer-only' : ''}" id="sidebar" aria-label="Docs navigation">
  <div class="sidebar-head">
    <span class="sidebar-title">Documentation</span>
    <button type="button" class="icon-btn" data-drawer-close aria-label="Close navigation">${icons.icon('close')}<span class="sr-only">Close navigation</span></button>
  </div>
  <nav class="side-nav">
    <a class="side-home" href="${SITE.base}"${current === null ? ' aria-current="page"' : ''}>${icons.icon('ai-book', 16, 'side-icon')}<span>Docs home</span></a>
${groups}
  </nav>
  <div class="sidebar-foot">
    <a class="back-link" href="/">${icons.icon('arrow-left4', 16)}<span>Back to opensms.io</span></a>
    <a class="cta-btn" href="${SITE.origin}/signup">Get started</a>
  </div>
</aside>
<div class="scrim" data-drawer-close hidden></div>`;
}

// Popular destinations shown before anything is typed: [path, section id, label, line].
const POPULAR = [
  ['getting-started/quickstart/', 'get-started', 'Quickstart', 'Your first sandbox message in five minutes'],
  ['integrate/sending-messages/', 'integrate', 'Sending messages', 'Single sends, batches, scheduling and statuses'],
  ['integrate/delivery-reports-and-webhooks/', 'integrate', 'Delivery reports and webhooks', 'Events, payloads and signature checks'],
  ['integrate/sdk/', 'sdks', 'SDKs', 'Official clients for nine languages'],
  ['reference/api/messages/', 'api-reference', 'Messages API', 'POST /v1/messages and friends'],
];

function searchDialog({ icons }) {
  const sectionOf = (id) => SECTIONS.find((s) => s.id === id);
  const popular = POPULAR.map(([path, sid, label, line]) => {
    const sec = sectionOf(sid);
    return `<li><a class="sp-item" href="${SITE.base}${path}"><span class="sr-icon">${icons.icon(sec.icon, 18)}</span><span class="sr-main"><span class="sr-title">${esc(label)}</span> <span class="sr-crumb">${esc(sec.title)} <span class="sr-crumb-sep" aria-hidden="true">${icons.icon('arrow-right4', 11)}</span> ${esc(line)}</span></span><span class="sr-go">${icons.icon('arrow-right4', 16)}</span></a></li>`;
  }).join('');
  const sections = SECTIONS.map((s) => `<li><a href="${SITE.base}${s.pages[0].path.replace(/(^|\/)README\.md$/, '$1').replace(/\.md$/, '/')}">${icons.icon(s.icon, 16)}<span>${esc(s.title)}</span></a></li>`).join('');
  return `<div class="search" id="search" role="dialog" aria-modal="true" aria-label="Search the docs" hidden>
  <div class="search-scrim" data-search-close></div>
  <div class="search-panel">
    <div class="search-bar">
      <span class="search-bar-icon">${icons.icon('search', 20)}</span>
      <input id="search-input" type="search" aria-label="Search the docs" placeholder="Search guides, endpoints and screens" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" role="combobox" aria-expanded="true" aria-controls="search-results" aria-autocomplete="list" aria-describedby="search-status">
      <button type="button" class="search-esc" data-search-close aria-label="Close search">Esc</button>
    </div>
    <div class="search-body">
      <ul id="search-results" role="listbox" aria-label="Results"></ul>
      <div class="search-empty" data-search-empty>
        <p class="sr-group"><span>Popular</span></p>
        <ul class="search-popular">${popular}</ul>
        <p class="sr-group"><span>Browse by section</span></p>
        <ul class="search-sections">${sections}</ul>
      </div>
    </div>
    <div class="search-foot">
      <span class="search-keys" aria-hidden="true">
        <span><kbd>${icons.icon('arrow-up3', 12)}</kbd><kbd>${icons.icon('arrow-down4', 12)}</kbd> to move</span>
        <span><kbd>Enter</kbd> to open</span>
        <span><kbd>Esc</kbd> to close</span>
      </span>
      <span class="search-status" id="search-status" role="status" aria-live="polite"></span>
    </div>
  </div>
</div>`;
}

// The same columns and links as the landing footer (landing/src/chrome/
// site-footer.html), so both halves of opensms.io end the same way.
const FOOTER_COLUMNS = [
  ['Product', [['Countries', '/countries/'], ['Pricing', '/pricing/'], ['SDKs', '/#sdks'], ['Status', 'https://opensms.io/status'], ['Console', 'https://opensms.io/app']]],
  ['Developers', [['Docs', SITE.base], ['API reference', `${SITE.base}reference/api/`], ['SDK guide', `${SITE.base}integrate/sdk/`], ['MCP server', `${SITE.base}integrate/mcp/`], ['llms.txt', `${SITE.base}llms.txt`]]],
  ['Company', [['About', '/about/'], ['Contact', '/contact/'], ['Brand', '/brand/']]],
  ['Legal', [['Privacy', '/privacy/'], ['Terms', '/terms/']]],
];
const FOOTER_SOCIAL = [
  ['GitHub', 'github', 'https://github.com/opensms-io'],
  ['Facebook', 'facebook', 'https://www.facebook.com/profile.php?id=61594556871099'],
  ['YouTube', 'youtube', 'https://www.youtube.com/@opensmsio'],
  ['TikTok', 'tiktok', 'https://www.tiktok.com/@opensms60'],
];
const FOOTER_REVIEWS = [
  ['Trustpilot', 'https://www.trustpilot.com/review/opensms.io'],
  ['G2', 'https://www.g2.com/products/opensms/reviews'],
  ['Google', 'https://www.google.com/maps/place/opensms.io/data=!4m2!3m1!1s0x0:0x65ae4635bbad2a10'],
];

function footer({ icons }) {
  const year = 2026;
  const cols = FOOTER_COLUMNS.map(([title, links]) => `<div class="footer-col"><h2 class="footer-heading">${title}</h2><ul>${links.map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ul></div>`).join('');
  const social = FOOTER_SOCIAL.map(([name, icon, href]) => `<li><a class="footer-icon" href="${href}" rel="me noopener" aria-label="OpenSMS on ${name}">${icons.icon(icon, 18)}</a></li>`).join('');
  const reviews = FOOTER_REVIEWS.map(([name, href]) => `<li><a class="footer-review" href="${href}" rel="me noopener">${name}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="footer-top">
    <div class="footer-brand">
      <a href="/" class="brand-mark" aria-label="OpenSMS home">${MARK(26)}<span class="brand-word"><span class="w-open">open</span><span class="w-sms">sms</span></span></a>
      <p class="footer-tagline">Prepaid SMS API for businesses sending across Africa. Based in Kenya.</p>
      <a class="back-link" href="/">${icons.icon('arrow-left4', 14)}<span>Back to opensms.io</span></a>
      <p class="footer-copy">&copy; ${year} OpenSMS. All rights reserved.</p>
    </div>
    <nav class="footer-nav" aria-label="Footer">${cols}</nav>
  </div>
  <div class="footer-bottom">
    <div class="footer-group"><span class="footer-label" id="footer-follow">Follow</span><ul class="footer-social" aria-labelledby="footer-follow">${social}</ul></div>
    <div class="footer-group"><span class="footer-label" id="footer-reviews">Reviews</span><ul class="footer-social" aria-labelledby="footer-reviews">${reviews}</ul></div>
  </div>
</footer>`;
}

function shell({ headHtml, body, icons, bodyClass }) {
  const sprite = icons.sprite();
  return `<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
${headHtml}
</head>
<body class="${bodyClass}">
${sprite}
${body}
</body>
</html>
`;
}

const SDK_LANGS = [['TypeScript', 'typescript', 'typescript'], ['Python', 'python', 'python'], ['Go', 'go', 'golang'], ['.NET', 'dotnet', 'dotnet'], ['Java', 'java', 'java'], ['Rust', 'rust', 'rust'], ['Ruby', 'ruby', 'ruby'], ['PHP', 'php', 'php'], ['Swift', 'swift', 'swift']];

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const OP = /^(GET|POST|PUT|PATCH|DELETE) (\/\S*)$/;

function tocHtml(headings) {
  const items = headings.filter((h) => h.level === 2 || h.level === 3);
  if (items.length < 2) return '';
  const top = Math.min(...items.map((h) => h.level));
  const label = (text) => {
    const m = text.match(OP);
    return m ? `<span class="toc-op"><span class="toc-m method-${m[1].toLowerCase()}">${m[1]}</span> <span class="toc-path">${wbrPath(m[2])}</span></span>` : esc(text);
  };
  return `<ul>${items.map((h) => `<li class="toc-l${h.level - top + 2}"><a href="#${h.id}" data-toc="${h.id}">${label(h.text)}</a></li>`).join('')}</ul>`;
}

export function articlePage({ page, prev, next, icons, pagesByPath, assets, headHtml }) {
  const toc = tocHtml(page.headings);
  const crumbs = page.crumbs.map((c, i) => (i < page.crumbs.length - 1
    ? `<li><a href="${c.url}">${esc(c.name)}</a>${icons.icon('arrow-right4', 12, 'crumb-chev')}</li>`
    : `<li><span aria-current="page">${esc(c.name)}</span></li>`)).join('');
  const pager = (p, dir) => {
    if (!p) return '<span></span>';
    const chev = dir === 'prev' ? icons.icon('arrow-left4', 18, 'pager-chev') : icons.icon('arrow-right4', 18, 'pager-chev');
    return `<a class="pager pager-${dir}" href="${p.url}" rel="${dir}">${dir === 'prev' ? chev : ''}<span class="pager-text"><span class="pager-label">${dir === 'prev' ? 'Previous' : 'Next'}<span class="pager-section"> / ${esc(p.section.title)}</span></span> <span class="pager-title">${esc(p.navLabel)}</span></span>${dir === 'next' ? chev : ''}</a>`;
  };
  const body = `${header({ icons, activeSection: page.section.id })}
<div class="shell">
${sidebar({ icons, pagesByPath, current: page.path })}
<main class="main" id="content">
  <article class="doc${page.section.id === 'api-reference' ? ' doc-ref' : ''}">
    <nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>
    <header class="doc-head">
      <p class="eyebrow">${icons.icon(page.section.icon, 15)}${esc(page.section.title)}</p>
      <h1>${esc(page.title)}</h1>
      <div class="doc-meta">
        <span>Updated <time datetime="${page.lastmod}">${fmtDate(page.lastmod)}</time></span>
        <span class="dot-sep" aria-hidden="true">/</span>
        <span>${page.minutes} min read</span>
        <span class="doc-actions">
          <button type="button" class="chip" data-copy-page="${page.mdUrl}">${icons.icon('clip-board', 15, 'when-idle')}${icons.icon('clipboard-tick', 15, 'when-done')}<span>Copy as Markdown</span></button>
          <a class="chip" href="${page.mdUrl}">${icons.icon('clipboard-close', 15)}<span>View .md</span></a>
        </span>
      </div>
    </header>
    ${toc ? `<details class="toc-mobile"><summary><span>On this page</span>${icons.icon('arrow-down4', 14, 'toc-chev')}</summary><nav aria-label="On this page (mobile)">${toc}</nav></details>` : ''}
    <div class="prose">
${page.html}
    </div>
    <footer class="doc-foot">
      <div class="doc-foot-row">
        <a class="edit-link" href="${page.editUrl}" rel="noopener">${icons.icon('edit', 16)}Edit this page on GitHub</a>
        <span class="muted">Last updated <time datetime="${page.lastmod}">${fmtDate(page.lastmod)}</time></span>
      </div>
      <nav class="pagers" aria-label="Previous and next pages">${pager(prev, 'prev')} ${pager(next, 'next')}</nav>
    </footer>
  </article>
  ${toc ? `<aside class="toc" aria-label="On this page"><p class="toc-title">On this page</p><nav>${toc}</nav><a class="toc-top" href="#content">${icons.icon('arrow-up3', 14)}Back to top</a></aside>` : '<aside class="toc toc-empty" aria-hidden="true"></aside>'}
</main>
</div>
${footer({ icons })}
${searchDialog({ icons })}`;
  return shell({ headHtml, body, icons, bodyClass: 'is-doc' });
}

export function homePage({ icons, pagesByPath, sections, headHtml, stats }) {
  const card = (s) => {
    const pages = s.pages.map((p) => pagesByPath.get(p.path));
    const first = pages[0];
    const picks = pages.slice(s.id === 'api-reference' || s.id === 'web-app' ? 1 : 0, (s.id === 'sdks' ? 1 : 5) + (s.id === 'api-reference' || s.id === 'web-app' ? 1 : 0));
    return `<article class="card card-${s.id}">
  <a class="card-link" href="${first.url}" aria-label="${esc(s.title)}"><span class="sr-only">${esc(s.title)}</span></a>
  <div class="card-top">
    <span class="card-icon">${icons.icon(s.icon, 22)}</span>
    <span class="card-count">${s.pages.length === 1 ? '9 languages' : `${s.pages.length} pages`}</span>
  </div>
  <h2 class="card-title">${esc(s.title)}</h2>
  <p class="card-blurb">${esc(s.blurb)}</p>
  ${s.id === 'sdks' ? `<ul class="card-langs">${SDK_LANGS.map(([l, id, mark]) => `<li><a href="${first.url}#sdk-${id}">${langMark(mark, (...a) => icons.icon(...a), { size: 15, surface: 'theme' })}${l}<span class="sr-only"> SDK</span></a></li>`).join('')}</ul>` : ''}
  <ul class="card-list">${picks.map((p) => `<li><a href="${p.url}">${esc(p.navLabel)}${icons.icon('arrow-right4', 14)}</a></li>`).join('')}</ul>
</article>`;
  };
  const quick = pagesByPath.get('getting-started/quickstart.md');
  const body = `${header({ icons, activeSection: null })}
${sidebar({ icons, pagesByPath, current: null, drawerOnly: true })}
<main id="content" class="home">
  <section class="hero">
    <svg class="hero-curves" viewBox="0 0 736 920" aria-hidden="true" focusable="false"><g fill="none" stroke="var(--curve)" stroke-width="74" stroke-linecap="round"><path d="M470 110 C 300 300, 250 470, 430 640 C 560 760, 640 720, 660 560"/><path d="M120 300 C 40 520, 120 760, 380 800"/></g><circle cx="498" cy="58" r="52" fill="var(--curve)"/></svg>
    <div class="hero-copy">
      <p class="eyebrow">${icons.icon('ai-book', 15)}OpenSMS documentation</p>
      <h1>Build with<br> OpenSMS</h1>
      <p class="hero-lead">How to send SMS with OpenSMS: a five-minute quickstart, task guides, official SDKs, the full API reference and step-by-step guides for the web app.</p>
      <button type="button" class="hero-search" data-search-open>${icons.icon('search', 20)}<span>Search the docs</span> <kbd class="kbd-cmd" aria-hidden="true">Ctrl K</kbd></button>
      <div class="hero-ctas">
        <a class="cta-btn cta-lg" href="${quick.url}">${icons.icon('flash', 17)}Start the quickstart</a>
        <a class="ghost-btn" href="${SITE.base}reference/api/">${icons.icon('document-code', 17)}Browse the API</a>
      </div>
    </div>
    <div class="hero-demo" aria-label="Example request">
      <div class="demo-pill demo-pill-a"><span class="demo-dot" aria-hidden="true"></span><span>POST /v1/messages</span></div>
      <div class="code demo-code">
        <div class="code-head"><span class="code-meta">${icons.icon('terminal', 16, 'lang-mark')}<span class="code-lang">Shell</span> <span class="code-sep" aria-hidden="true">/</span> <span class="code-file">Terminal</span></span><button type="button" class="code-copy" data-copy aria-label="Copy code">${icons.icon('clip-board', 16, 'when-idle')}${icons.icon('clipboard-tick', 16, 'when-done')}<span class="code-copy-text">Copy</span></button></div>
<pre><code class="hljs language-bash">${stats.demoHtml}</code></pre>
      </div>
      <div class="demo-pill demo-pill-b"><span class="mono">sk_test_</span> keys are free in sandbox</div>
    </div>
  </section>

  <section class="home-sections" aria-labelledby="sections-title">
    <div class="home-head">
      <p class="label">Explore</p>
      <h2 id="sections-title">Docs by section</h2>
    </div>
    <div class="cards">
${sections.map(card).join('\n')}
    </div>
  </section>

  <section class="home-path" aria-labelledby="path-title">
    <div class="home-head">
      <p class="label">Getting started</p>
      <h2 id="path-title">From first message to live traffic</h2>
    </div>
    <ol class="steps">
      ${stats.steps.map((st, i) => `<li><a href="${st.url}"><span class="step-top"><span class="step-icon">${icons.icon(st.icon, 20)}</span><span class="step-n">0${i + 1}</span></span> <span class="step-title">${esc(st.title)}${icons.icon('arrow-right4', 16)}</span> <span class="step-text">${esc(st.text)}</span></a></li>`).join('')}
    </ol>
  </section>

  <section class="home-ai" aria-labelledby="ai-title">
    <div>
      <p class="label">For AI tools and agents</p>
      <h2 id="ai-title">Every page is also Markdown</h2>
      <p>Point your assistant at <a href="${SITE.base}llms.txt"><code>/docs/llms.txt</code></a> for an index of every page, or <a href="${SITE.base}llms-full.txt"><code>/docs/llms-full.txt</code></a> for the full text in one file. Any page is available as Markdown by adding <code>.md</code> to its path.</p>
    </div>
    <div class="ai-links">
      <a class="chip" href="${SITE.base}llms.txt">${icons.icon('clipboard-close', 15)}llms.txt</a>
      <a class="chip" href="${SITE.base}llms-full.txt">${icons.icon('clipboard-close', 15)}llms-full.txt</a>
      <a class="chip" href="${SITE.repo}" rel="noopener">${icons.icon('github', 15)}Source on GitHub</a>
    </div>
  </section>
</main>
${footer({ icons })}
${searchDialog({ icons })}`;
  return shell({ headHtml, body, icons, bodyClass: 'is-home' });
}

export function notFoundPage({ icons, pagesByPath, headHtml }) {
  const links = [
    ['getting-started/quickstart.md', 'flash'],
    ['integrate/sending-messages.md', 'sms'],
    ['reference/api/README.md', 'document-code'],
    ['console/README.md', 'monitor'],
  ].map(([p, ic]) => {
    const page = pagesByPath.get(p);
    return `<li><a href="${page.url}">${icons.icon(ic, 18)}<span>${esc(page.section.title === 'API reference' ? 'API reference' : page.navLabel === 'Introduction' ? 'Web app guides' : page.navLabel)}</span>${icons.icon('arrow-right4', 14, 'nf-chev')}</a></li>`;
  }).join('');
  const body = `${header({ icons, activeSection: null })}
${sidebar({ icons, pagesByPath, current: null, drawerOnly: true })}
<main id="content" class="notfound">
  <svg class="hero-curves" viewBox="0 0 736 920" aria-hidden="true" focusable="false"><g fill="none" stroke="var(--curve)" stroke-width="74" stroke-linecap="round"><path d="M470 110 C 300 300, 250 470, 430 640 C 560 760, 640 720, 660 560"/><path d="M120 300 C 40 520, 120 760, 380 800"/></g><circle cx="498" cy="58" r="52" fill="var(--curve)"/></svg>
  <div class="nf-copy">
    <p class="eyebrow mono">404 / NOT FOUND</p>
    <h1>Page not found</h1>
    <p class="hero-lead">The link may be old, or the page moved when the docs were reorganised. Search for it, or start from one of these.</p>
    <button type="button" class="hero-search" data-search-open>${icons.icon('search', 20)}<span>Search the docs</span> <kbd class="kbd-cmd" aria-hidden="true">Ctrl K</kbd></button>
    <ul class="nf-links">${links}</ul>
    <a class="ghost-btn" href="${SITE.base}">${icons.icon('arrow-left4', 16)}Back to the docs home</a>
  </div>
</main>
${footer({ icons })}
${searchDialog({ icons })}`;
  return shell({ headHtml, body, icons, bodyClass: 'is-404' });
}
