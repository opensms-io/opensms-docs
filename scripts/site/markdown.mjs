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
import php from 'highlight.js/lib/languages/php';
import ruby from 'highlight.js/lib/languages/ruby';
import java from 'highlight.js/lib/languages/java';
import csharp from 'highlight.js/lib/languages/csharp';
import swift from 'highlight.js/lib/languages/swift';
import kotlin from 'highlight.js/lib/languages/kotlin';
import rust from 'highlight.js/lib/languages/rust';
import { logo, themedLogo } from './logos.mjs';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('http', http);
hljs.registerLanguage('plaintext', plaintext);
for (const [name, def] of Object.entries({ go, php, ruby, java, csharp, swift, kotlin, rust })) hljs.registerLanguage(name, def);

// Fence info string to [highlight.js language, visible label, badge]. The badge is
// a vendored SVGL language logo (`lang:<file>`) or an Iconsax icon (`icon:<name>`)
// for formats with no brand mark. Code blocks are dark in both themes, so the
// language logos are the dark-surface variants (see logos/README.md).
const LANG = {
  bash: ['bash', 'Shell', 'lang:bash'], sh: ['bash', 'Shell', 'lang:bash'], shell: ['bash', 'Shell', 'lang:bash'],
  json: ['json', 'JSON', 'lang:json'],
  js: ['javascript', 'JavaScript', 'lang:javascript'], javascript: ['javascript', 'JavaScript', 'lang:javascript'],
  ts: ['typescript', 'TypeScript', 'lang:typescript'], typescript: ['typescript', 'TypeScript', 'lang:typescript'],
  python: ['python', 'Python', 'lang:python'], py: ['python', 'Python', 'lang:python'],
  go: ['go', 'Go', 'lang:go'], php: ['php', 'PHP', 'lang:php'], ruby: ['ruby', 'Ruby', 'lang:ruby'],
  java: ['java', 'Java', 'lang:java'], csharp: ['csharp', 'C#', 'lang:csharp'], cs: ['csharp', 'C#', 'lang:csharp'],
  swift: ['swift', 'Swift', 'lang:swift'], kotlin: ['kotlin', 'Kotlin', 'lang:kotlin'], rust: ['rust', 'Rust', 'lang:rust'],
  http: ['http', 'HTTP', 'icon:document-code'], text: ['plaintext', 'Text', 'icon:document-code'],
  csv: ['plaintext', 'CSV', 'icon:document-code'], '': ['plaintext', 'Text', 'icon:document-code'],
};

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

  // A page can give headings a leading mark (config.mjs `marks`): an AI assistant
  // logo (`ai:<name>`) or an Iconsax icon (`icon:<name>`), keyed by heading text.
  const headingMark = (spec, size) => {
    const [kind, name] = spec.split(':');
    return kind === 'ai' ? themedLogo('ai', name, size) : icon(name, size);
  };

  rules.heading_open = (tokens, idx, opts, env) => {
    const t = tokens[idx];
    const inline = tokens[idx + 1];
    const text = inline?.children?.length === 1 && inline.children[0].type === 'text' ? inline.children[0].content : '';
    const mark = env.marks?.[inlineText(inline)];
    if (mark) (env.marksUsed ??= new Set()).add(inlineText(inline));
    const cls = [METHOD.test(text) && 'op', mark && 'has-mark'].filter(Boolean).join(' ');
    return `<${t.tag} id="${t.attrGet('id')}"${cls ? ` class="${cls}"` : ''}>${mark ? `<span class="h-mark">${headingMark(mark, t.tag === 'h2' ? 22 : 20)}</span>` : ''}`;
  };

  // `<div data-client-grid></div>` in a page becomes a grid of cards, one per
  // heading marked with an AI assistant logo, each linking to its section.
  rules.html_block = (tokens, idx, opts, env) => {
    const content = tokens[idx].content;
    if (!/^<div data-client-grid><\/div>\s*$/.test(content)) return content;
    const cards = (env.headings ?? []).filter((h) => env.marks?.[h.text]?.startsWith('ai:') || env.marks?.[h.text] === 'icon:ai-chatbot');
    if (!cards.length) env.warnings?.push('client grid with no marked headings');
    return `<nav class="client-grid" aria-label="Choose your assistant">${cards.map((h) => `<a class="client-card" href="#${h.id}"><span class="client-logo">${headingMark(env.marks[h.text], 28)}</span><span class="client-name">${escapeHtml(h.text)}</span></a>`).join('')}</nav>\n`;
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

  const codeLang = (label, badge) => {
    const [kind, name] = badge.split(':');
    const mark = kind === 'lang' ? logo('lang', name, 16) : icon(name, 16, 'code-lang-icon');
    return `<span class="code-lang">${mark}<span>${escapeHtml(label)}</span></span>`;
  };

  rules.fence = (tokens, idx, opts, env) => {
    const t = tokens[idx];
    const info = (t.info || '').trim().split(/\s+/)[0].toLowerCase();
    const [lang, label, badge] = LANG[info] ?? ['plaintext', info || 'Text', 'icon:document-code'];
    if (!LANG[info]) env.warnings?.push(`unknown code language "${info}"`);
    const code = t.content.replace(/\n$/, '');
    const html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    env.codeBlocks = (env.codeBlocks ?? 0) + 1;
    return `<div class="code"><div class="code-head">${codeLang(label, badge)}`
      + `<button type="button" class="code-copy" data-copy aria-label="Copy code">${icon('copy', 16, 'when-idle')}${icon('copy-success', 16, 'when-done')}<span class="code-copy-text">Copy</span></button></div>`
      + `<pre><code class="hljs language-${lang}">${html}</code></pre></div>\n`;
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
    return `<picture><source type="image/webp" srcset="${srcset}" sizes="(max-width: 800px) 100vw, 760px">${tag}</picture>`;
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
