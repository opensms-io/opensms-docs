// Markdown to HTML for the docs site: markdown-it with GitHub-style heading ids,
// build-time syntax highlighting, code blocks with copy buttons, callouts, method
// badges on API reference headings, wrapped tables and lazy images. Links and image
// sources are handed to the caller (env.link / env.image) so the build can rewrite
// them and fail on anything broken.
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import http from 'highlight.js/lib/languages/http';
import plaintext from 'highlight.js/lib/languages/plaintext';
import go from 'highlight.js/lib/languages/go';
import csharp from 'highlight.js/lib/languages/csharp';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';
import rust from 'highlight.js/lib/languages/rust';
import ruby from 'highlight.js/lib/languages/ruby';
import php from 'highlight.js/lib/languages/php';
import swift from 'highlight.js/lib/languages/swift';
import xml from 'highlight.js/lib/languages/xml';
import ini from 'highlight.js/lib/languages/ini';
import { SITE } from './config.mjs';

for (const [name, lang] of Object.entries({ bash, json, javascript, typescript, python, http, plaintext, go, csharp, java, kotlin, rust, ruby, php, swift, xml, ini })) hljs.registerLanguage(name, lang);

// Fence language -> [highlight.js language, label, mark]. The mark is a brand logo
// from ./languages (SVGL files, see its README) for programming languages, or a
// UI icon from ./icons for shells, data and output.
const L = (lang, label, mark) => [lang, label, mark];
export const LANG = {
  bash: L('bash', 'Shell', 'icon:terminal'), sh: L('bash', 'Shell', 'icon:terminal'), shell: L('bash', 'Shell', 'icon:terminal'),
  json: L('json', 'JSON', 'icon:code-brackets'), http: L('http', 'HTTP', 'icon:code-brackets'),
  text: L('plaintext', 'Output', 'icon:document-text'), csv: L('plaintext', 'CSV', 'icon:document-text'), '': L('plaintext', 'Text', 'icon:document-text'),
  js: L('javascript', 'JavaScript', 'javascript'), javascript: L('javascript', 'JavaScript', 'javascript'),
  ts: L('typescript', 'TypeScript', 'typescript'), typescript: L('typescript', 'TypeScript', 'typescript'),
  python: L('python', 'Python', 'python'), py: L('python', 'Python', 'python'),
  go: L('go', 'Go', 'golang'), csharp: L('csharp', 'C#', 'dotnet'), cs: L('csharp', 'C#', 'dotnet'),
  java: L('java', 'Java', 'java'), kotlin: L('kotlin', 'Kotlin', 'icon:code-brackets'),
  rust: L('rust', 'Rust', 'rust'), ruby: L('ruby', 'Ruby', 'ruby'), php: L('php', 'PHP', 'php'), swift: L('swift', 'Swift', 'swift'),
  xml: L('xml', 'XML', 'icon:code-brackets'), toml: L('ini', 'TOML', 'icon:code-brackets'),
};

// Marks with a separate SVGL variant for dark backgrounds.
const DARK_VARIANT = new Set(['golang', 'rust', 'php']);
// Wordmarks (much wider than tall) get a wider box so they stay legible.
const WIDE = new Set(['golang', 'php']);
// Languages whose blocks get line numbers once they are long enough to refer to.
const NUMBERED = new Set(['javascript', 'typescript', 'python', 'go', 'csharp', 'java', 'kotlin', 'rust', 'ruby', 'php', 'swift']);
const NUMBER_FROM = 6;

/**
 * A language mark as HTML. `surface` is 'dark' (code headers and tab bars, dark
 * in both themes) or 'theme' (follows the page theme, for light surfaces).
 */
export function langMark(mark, icon, { size = 16, surface = 'dark', cls = 'lang-mark' } = {}) {
  if (!mark) return '';
  if (mark.startsWith('icon:')) return icon(mark.slice(5), size, cls);
  const wide = WIDE.has(mark);
  const w = wide ? Math.round(size * 1.6) : size;
  const img = (file, extra = '') => `<img class="${cls}${wide ? ' is-wide' : ''}${extra}" src="${SITE.base}languages/${file}.svg" width="${w}" height="${size}" alt="" decoding="async">`;
  if (!DARK_VARIANT.has(mark)) return img(mark);
  if (surface === 'dark') return img(`${mark}_dark`);
  return img(mark, ' when-light') + img(`${mark}_dark`, ' when-dark');
}

/** key="value" or key=value pairs after the language in a fence info string. */
function fenceAttrs(info) {
  const attrs = {};
  for (const m of info.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)) attrs[m[1]] = m[2] ?? m[3];
  if (/(^|\s)nolines(\s|$)/.test(info)) attrs.nolines = true;
  return attrs;
}

/** Split highlighted HTML into lines, closing and reopening spans across line breaks. */
function splitLines(html) {
  const lines = [];
  const open = [];
  let cur = '';
  for (const m of html.matchAll(/(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+|<)/g)) {
    if (m[1]) { open.push(m[1]); cur += m[1]; } else if (m[2]) { open.pop(); cur += m[2]; } else if (m[3]) {
      lines.push(cur + '</span>'.repeat(open.length));
      cur = open.join('');
    } else cur += m[4];
  }
  lines.push(cur);
  return lines;
}

/** GitHub-style heading id, identical to scripts/gen-reference.mjs anchor(). */
export const slugify = (text) => text.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const METHOD = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) (\/\S*)$/;

/** An API path, escaped, with a <wbr> after every "/" so it wraps between segments. */
export const wbrPath = (path) => escapeHtml(path).replace(/\//g, '/<wbr>');

/** Plain text of an inline token's children (what GitHub slugs). */
function inlineText(token) {
  return (token.children ?? []).filter((t) => t.type === 'text' || t.type === 'code_inline').map((t) => t.content).join('');
}

export function createRenderer({ icon }) {
  const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

  // Heading ids, the page h1, and the table of contents.
  md.core.ruler.push('docs_headings', (state) => {
    const env = state.env;
    const seen = {};
    env.headings = [];
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t.type !== 'heading_open') continue;
      const level = Number(t.tag.slice(1));
      const text = inlineText(tokens[i + 1]);
      if (level === 1) {
        // The page template renders the one h1 itself, so it is taken out of the body.
        env.h1 = (env.h1 ?? []).concat(text);
        tokens.splice(i, 3);
        i -= 1;
        continue;
      }
      let id = slugify(text);
      if (seen[id] !== undefined) { seen[id] += 1; id = `${id}-${seen[id]}`; } else seen[id] = 0;
      t.attrSet('id', id);
      env.headings.push({ level, text, id });
    }
  });

  // Language tabs: consecutive fenced blocks after <!-- tabs label="..." --> become one
  // tabbed group, closed by <!-- /tabs --> (or by the first thing that is not a code
  // block or an HTML comment such as a test marker). Each block names its tab with
  // tab="..." (default: its language label), may set logo="..." (default: its
  // language mark) and title="..." (a file name, shown next to Copy). A tab's key,
  // which the page remembers across groups and visits, is its language mark
  // ("typescript", "golang") or, for shells and data, its label ("curl").
  // Without script every panel shows, stacked, each with its own header.
  md.core.ruler.push('docs_tabs', (state) => {
    const env = state.env;
    const tokens = state.tokens;
    let group = null;
    let autoClosed = false;
    const isComment = (t) => t.type === 'html_block' && /^<!--[\s\S]*-->\s*$/.test(t.content);
    const close = (t) => {
      if (group.items.length < 2) env.warnings?.push(`tab group "${group.label}" has fewer than two code blocks`);
      if (t) t.type = 'code_tabs_close';
      group = null;
    };
    // Close the open group with a new token inserted at position i.
    const closeBefore = (i) => {
      const end = new state.Token('code_tabs_close', '', 0);
      end.block = true;
      tokens.splice(i, 0, end);
      close(null);
    };
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t.type === 'html_block' && /^<!--\s*tabs\b/.test(t.content)) {
        if (group) { closeBefore(i); i += 1; }
        autoClosed = false;
        env.tabGroups = (env.tabGroups ?? 0) + 1;
        const label = t.content.match(/label="([^"]*)"/)?.[1] ?? 'Code example';
        group = { id: `tabs-${env.tabGroups}`, label, items: [] };
        t.type = 'code_tabs_open';
        t.meta = group;
      } else if (t.type === 'html_block' && /^<!--\s*\/tabs\s*-->/.test(t.content)) {
        if (group) close(t);
        else {
          if (!autoClosed) env.warnings?.push('<!-- /tabs --> without <!-- tabs -->');
          t.type = 'code_tabs_stray';
        }
        autoClosed = false;
      } else if (group && t.type === 'fence') {
        const info = (t.info || '').trim();
        const name = info.split(/\s+/)[0].toLowerCase();
        const attrs = fenceAttrs(info);
        const [, label, mark] = LANG[name] ?? ['plaintext', name, 'icon:document-text'];
        const tabLabel = attrs.tab ?? label;
        const logo = attrs.logo ?? mark;
        const key = attrs.key ?? (logo.startsWith('icon:') ? tabLabel : logo).toLowerCase().replace(/[^a-z0-9#+]+/g, '-').replace(/#/g, 'sharp').replace(/\+/g, 'plus');
        const item = { index: group.items.length, group: group.id, key, label: tabLabel, mark: logo, title: attrs.title ?? '' };
        group.items.push(item);
        t.meta = { ...(t.meta ?? {}), tab: item };
      } else if (group && !isComment(t)) {
        // Anything else ends the group; its <!-- /tabs -->, if any, is then ignored.
        closeBefore(i);
        autoClosed = true;
        i += 1;
      }
    }
    if (group) closeBefore(tokens.length);
    state.tokens = tokens.filter((t) => t.type !== 'code_tabs_stray');
  });

  // Drop HTML comments (generator banners, test markers) from the output.
  md.core.ruler.push('docs_comments', (state) => {
    state.tokens = state.tokens.filter((t) => !(t.type === 'html_block' && /^<!--[\s\S]*-->\s*$/.test(t.content)));
  });

  // Callouts: a blockquote that opens with a bold label.
  md.core.ruler.push('docs_callouts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i += 1) {
      if (tokens[i].type !== 'blockquote_open') continue;
      const inline = tokens[i + 2];
      if (!inline || inline.type !== 'inline') continue;
      const kids = (inline.children ?? []).filter((c) => !(c.type === 'text' && !c.content));
      if (kids[0]?.type !== 'strong_open') continue;
      const label = kids[1]?.content ?? '';
      const warn = /known issue|does not work|not work|warning|caution/i.test(label);
      tokens[i].meta = { callout: warn ? 'warn' : 'note' };
    }
  });

  const rules = md.renderer.rules;

  // One dark shell: the tab strip (logo and name per language) with the file name
  // of the active tab and a single Copy button, then the panels. With script only
  // the active panel is displayed, so the group follows its height (docs.css).
  rules.code_tabs_open = (tokens, idx) => {
    const g = tokens[idx].meta;
    const tabs = g.items.map((it) => `<button type="button" role="tab" class="code-tab" id="${g.id}-t${it.index}" aria-controls="${g.id}-p${it.index}" aria-selected="${it.index === 0}" tabindex="${it.index === 0 ? 0 : -1}" data-tab-key="${escapeHtml(it.key)}"${it.title ? ` data-title="${escapeHtml(it.title)}" title="${escapeHtml(it.title)}"` : ''}>${langMark(it.mark, icon, { size: 16 })}<span${WIDE.has(it.mark) ? ' class="vh"' : ''}>${escapeHtml(it.label)}</span></button>`).join('');
    // The file name only fits beside a short strip; with more tabs it would crowd them.
    const first = g.items.length <= 4 ? g.items[0]?.title ?? '' : '';
    return `<div class="code-tabs" data-tabs>`
      + `<div class="code-tabs-bar"><div class="code-tabs-list" role="tablist" aria-label="${escapeHtml(g.label)}">${tabs}</div>`
      + (g.items.length <= 4 ? `<span class="code-tabs-file" aria-hidden="true">${escapeHtml(first)}</span>` : '')
      + `<button type="button" class="code-copy" data-copy-tabs aria-label="Copy code">${icon('clipboard-close', 16, 'when-idle')}${icon('copy-success', 16, 'when-done')}<span class="code-copy-text">Copy</span></button></div>`
      + `<div class="code-tabs-panels">\n`;
  };
  rules.code_tabs_close = () => '</div></div>\n';

  rules.heading_open = (tokens, idx) => {
    const t = tokens[idx];
    const inline = tokens[idx + 1];
    const text = inline?.children?.length === 1 && inline.children[0].type === 'text' ? inline.children[0].content : '';
    return `<${t.tag} id="${t.attrGet('id')}"${METHOD.test(text) ? ' class="op"' : ''}>`;
  };
  rules.heading_close = (tokens, idx, opts, env) => {
    const open = tokens[idx - 2];
    const id = open.attrGet('id');
    return `<a class="anchor" href="#${id}" aria-label="Link to this section">${icon('hashtag', 16)}</a></${tokens[idx].tag}>\n`;
  };

  // Method badges for "## GET /v1/..." operation headings. A <wbr> after each "/"
  // lets a long path wrap at a segment boundary instead of mid-word.
  const defaultInline = md.renderer.renderInline.bind(md.renderer);
  md.renderer.renderInline = (tokens, opts, env) => {
    const text = tokens.length === 1 && tokens[0].type === 'text' ? tokens[0].content : null;
    const m = text && text.match(METHOD);
    if (m && env.__inHeading) {
      return `<span class="method method-${m[1].toLowerCase()}">${m[1]}</span><code class="op-path">${wbrPath(m[2])}</code>`;
    }
    return defaultInline(tokens, opts, env);
  };
  md.renderer.render = (tokens, opts, env) => {
    let out = '';
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t.type === 'inline') {
        env.__inHeading = tokens[i - 1]?.type === 'heading_open' && tokens[i - 1].tag !== 'h1';
        out += md.renderer.renderInline(t.children, opts, env);
        env.__inHeading = false;
      } else if (rules[t.type]) {
        out += rules[t.type](tokens, i, opts, env, md.renderer);
      } else {
        out += md.renderer.renderToken(tokens, i, opts);
      }
    }
    return out;
  };

  rules.blockquote_open = (tokens, idx) => {
    const kind = tokens[idx].meta?.callout;
    if (!kind) return '<blockquote>';
    return `<aside class="callout callout-${kind}">${icon(kind === 'warn' ? 'danger' : 'info-circle', 20, 'callout-icon')}<div class="callout-body">`;
  };
  rules.blockquote_close = (tokens, idx) => {
    let depth = 0;
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (tokens[i].type === 'blockquote_close') depth += 1;
      if (tokens[i].type === 'blockquote_open') {
        if (depth === 0) return tokens[i].meta?.callout ? '</div></aside>\n' : '</blockquote>\n';
        depth -= 1;
      }
    }
    return '</blockquote>\n';
  };

  // Tables: a labelled, focusable scroll region on wide screens; below 640px the
  // CSS stacks each row as a card, so every cell carries its column name.
  rules.table_open = (tokens, idx, opts, env) => {
    const heads = [];
    let n = 0;
    for (let i = idx + 1; i < tokens.length && tokens[i].type !== 'thead_close'; i += 1) {
      if (tokens[i].type === 'inline' && tokens[i - 1].type === 'th_open') heads.push(inlineText(tokens[i]));
    }
    for (let i = idx + 1; i < tokens.length && tokens[i].type !== 'table_close'; i += 1) {
      if (tokens[i].type === 'tr_open') n = 0;
      if (tokens[i].type === 'td_open') { tokens[i].meta = { label: heads[n] ?? '' }; n += 1; }
    }
    env.tables = (env.tables ?? 0) + 1;
    const label = heads.length ? `Table: ${heads.join(', ')}` : 'Table';
    return `<div class="table-wrap" role="region" tabindex="0" aria-label="${escapeHtml(label)}"><table>\n`;
  };
  rules.table_close = () => '</table></div>\n';
  const defaultTd = (tokens, idx, opts, env, self) => {
    const label = tokens[idx].meta?.label;
    if (label) tokens[idx].attrSet('data-label', label);
    return self.renderToken(tokens, idx, opts);
  };
  rules.td_open = (tokens, idx, opts, env, self) => {
    const inline = tokens[idx + 1];
    const text = inline?.type === 'inline' && inline.children?.length === 1 && inline.children[0].type === 'text' ? inline.children[0].content : '';
    if (/^(GET|POST|PUT|PATCH|DELETE)$/.test(text)) {
      inline.children[0].type = 'html_inline';
      inline.children[0].content = `<span class="method method-${text.toLowerCase()}">${text}</span>`;
    }
    return defaultTd(tokens, idx, opts, env, self);
  };

  rules.fence = (tokens, idx, opts, env) => {
    const t = tokens[idx];
    const info = (t.info || '').trim();
    const name = info.split(/\s+/)[0].toLowerCase();
    const attrs = fenceAttrs(info);
    const [lang, label, mark] = LANG[name] ?? ['plaintext', name || 'Text', 'icon:document-text'];
    if (!LANG[name]) env.warnings?.push(`unknown code language "${name}"`);
    const code = t.content.replace(/\n$/, '');
    let html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    const lines = code.split('\n').length;
    // Never inside a tab group: the gutter would come and go as the reader switches
    // between cURL and an SDK, moving the code sideways.
    const numbered = !attrs.nolines && !t.meta?.tab && (attrs.lines === 'true' || (NUMBERED.has(lang) && lines >= NUMBER_FROM));
    if (numbered) html = splitLines(html).map((l) => `<span class="ln">${l}</span>`).join('\n');
    env.codeBlocks = (env.codeBlocks ?? 0) + 1;
    const file = attrs.title ? `<span class="code-sep" aria-hidden="true">/</span><span class="code-file">${escapeHtml(attrs.title)}</span>` : '';
    const block = `<div class="code${numbered ? ' has-lines' : ''}"><div class="code-head"><span class="code-meta">${langMark(attrs.logo ?? mark, icon)}<span class="code-lang">${escapeHtml(label)}</span>${file}</span>`
      + `<button type="button" class="code-copy" data-copy aria-label="Copy code${attrs.title ? `: ${escapeHtml(attrs.title)}` : ''}">${icon('clipboard-close', 16, 'when-idle')}${icon('copy-success', 16, 'when-done')}<span class="code-copy-text">Copy</span></button></div>`
      + `<pre><code class="hljs language-${lang}">${html}</code></pre></div>`;
    const tab = t.meta?.tab;
    if (!tab) return `${block}\n`;
    return `<div class="code-panel${tab.index === 0 ? ' is-active' : ''}" role="tabpanel" id="${tab.group}-p${tab.index}" aria-labelledby="${tab.group}-t${tab.index}" data-tab-key="${escapeHtml(tab.key)}">${block.replace('<pre>', '<pre tabindex="0">')}</div>\n`;
  };
  rules.code_block = rules.fence;

  rules.link_open = (tokens, idx, opts, env, self) => {
    const t = tokens[idx];
    const r = env.link(t.attrGet('href'));
    t.attrSet('href', r.href);
    if (r.external) {
      t.attrSet('rel', 'noopener');
      t.attrJoin('class', 'ext');
    }
    return self.renderToken(tokens, idx, opts);
  };

  rules.image = (tokens, idx, opts, env) => {
    const t = tokens[idx];
    const alt = t.children?.map((c) => c.content).join('') ?? t.content;
    const img = env.image(t.attrGet('src'));
    const tag = `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(alt)}" width="${img.width}" height="${img.height}" loading="lazy" decoding="async">`;
    if (!img.webp?.length) return tag;
    const srcset = img.webp.map((v) => `${escapeHtml(v.src)} ${v.width}w`).join(', ');
    return `<picture><source type="image/webp" srcset="${srcset}" sizes="(max-width: 800px) calc(100vw - 32px), 780px">${tag}</picture>`;
  };

  // A paragraph holding only an image becomes a figure with a caption.
  rules.paragraph_open = (tokens, idx) => {
    const inline = tokens[idx + 1];
    const kids = inline?.children ?? [];
    if (kids.length === 1 && kids[0].type === 'image') { tokens[idx].meta = { figure: true }; return '<figure class="shot">'; }
    return tokens[idx].hidden ? '' : '<p>';
  };
  rules.paragraph_close = (tokens, idx) => {
    const open = tokens[idx - 2];
    if (open?.meta?.figure) {
      const img = open && tokens[idx - 1].children[0];
      const alt = img.children?.map((c) => c.content).join('') ?? '';
      return `<figcaption aria-hidden="true">${escapeHtml(alt)}</figcaption></figure>\n`;
    }
    return tokens[idx].hidden ? '' : '</p>\n';
  };

  return md;
}
