// Brand-name normalisation for Markdown prose. The product is written "OpenSMS" in
// prose; the lowercase form stays in code, URLs, package names and identifiers.
// Used by scripts/normalise-brand.mjs (rewrites the sources) and by the site build
// (fails when a published page's prose still has the lowercase form).

const WORD = /(?<![\w@./\\:$-])(?:opensms|Opensms|OpenSms|openSMS)(?![\w/@-]|\.[A-Za-z0-9_])/g;

/** Replace the brand in one prose fragment (no code, no URLs). */
function fixProse(text, hits) {
  return text.replace(WORD, (m) => {
    if (m === 'OpenSMS') return m;
    hits.push(m);
    return 'OpenSMS';
  });
}

/**
 * Split an inline Markdown line into protected parts (inline code, link and image
 * targets, autolinks, bare URLs, HTML tags and comments) and prose parts, and run
 * fixProse over the prose parts only.
 */
function fixLine(line, hits) {
  const protectedRe = /(`+)[\s\S]*?\1|\]\([^)]*\)|<https?:[^>]*>|<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|https?:\/\/[^\s)>\]]+|\b[\w.+-]+@[\w-]+\.[\w.]+/g;
  let out = '';
  let last = 0;
  for (const m of line.matchAll(protectedRe)) {
    out += fixProse(line.slice(last, m.index), hits) + m[0];
    last = m.index + m[0].length;
  }
  return out + fixProse(line.slice(last), hits);
}

/** Normalise a whole Markdown document. Returns { text, hits }. */
export function normaliseBrand(md) {
  const hits = [];
  const lines = md.split('\n');
  let fence = null;
  const out = lines.map((line) => {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
      return line;
    }
    if (f) { fence = f[1]; return line; }
    if (/^( {4}|\t)/.test(line)) return line; // indented code
    return fixLine(line, hits);
  });
  return { text: out.join('\n'), hits };
}
