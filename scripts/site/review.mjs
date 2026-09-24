// Visual review of the built site: serves site/ under /docs/ and screenshots key
// pages at desktop and phone widths in light and dark, into site-review/.
// Also reports console errors, horizontal overflow and layout shift per page.
//
//   npm run build:site && node scripts/site/review.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'site-review');
const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;

const PAGES = [
  ['home', '/docs/', null],
  ['quickstart', '/docs/getting-started/quickstart/', '[id="4-send-your-first-message"]'],
  ['section-home', '/docs/getting-started/overview/', '.site-footer'],
  ['guide', '/docs/integrate/sending-messages/', '.code'],
  ['sdk', '/docs/integrate/sdk/', '#quick-example'],
  ['api-reference', '/docs/reference/api/messages/', '.doc-ref .prose h2'],
  ['console-guide', '/docs/console/sender-ids/', 'figure.shot'],
  ['not-found', '/docs/no-such-page/', null],
];
const WIDTHS = [[1440, 900], [390, 844]];
const THEMES = ['light', 'dark'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// Serve the landing's build at / when it is next to this repo, so shared favicons resolve.
const landing = process.env.LANDING_DIST ?? join(ROOT, '..', 'landing', 'dist');
const env = existsSync(landing) ? { ...process.env, LANDING_DIST: landing } : { ...process.env };
const server = spawn(process.execPath, [join(ROOT, 'scripts/site/serve.mjs'), String(PORT)], { env, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch();
const problems = [];
const shots = [];
try {
  for (const theme of THEMES) {
    for (const [w, h] of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: w < 500 ? 2 : 1 });
      if (theme === 'dark') await ctx.addCookies([{ name: 'opensms-theme', value: 'dark', url: BASE }]);
      for (const [name, path, focus] of PAGES) {
        const page = await ctx.newPage();
        const errs = [];
        page.on('console', (m) => {
          if (m.type() !== 'error') return;
          if (name === 'not-found' && /404/.test(m.text())) return; // the 404 page itself
          errs.push(m.text());
        });
        page.on('pageerror', (e) => errs.push(e.message));
        await page.addInitScript(() => {
          window.__cls = 0;
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        });
        await page.goto(BASE + path, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const cls = await page.evaluate(() => window.__cls);
        if (overflow > 0) problems.push(`${name} ${w} ${theme}: horizontal overflow ${overflow}px`);
        if (cls > 0.01) problems.push(`${name} ${w} ${theme}: layout shift ${cls.toFixed(3)}`);
        for (const e of errs) problems.push(`${name} ${w} ${theme}: console error ${e}`);
        const base = `${name}-${w}-${theme}`;
        await page.screenshot({ path: join(OUT, `${base}.png`), fullPage: name === 'home' });
        shots.push(`${base}.png`);
        if (focus) {
          await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 110);
          }, focus);
          await page.waitForTimeout(150);
          await page.screenshot({ path: join(OUT, `${base}-body.png`) });
          shots.push(`${base}-body.png`);
        }
        await page.close();
      }
      await ctx.close();
    }
  }

  // Interactive states: search dialog, mobile drawer, mobile TOC.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/docs/integrate/sending-messages/`, { waitUntil: 'networkidle' });
  await page.keyboard.press('/');
  await page.keyboard.type('webhook signature');
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'search-1440-light.png') });
  shots.push('search-1440-light.png');
  // The same results in dark, then the empty state (popular pages and sections).
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.screenshot({ path: join(OUT, 'search-1440-dark.png') });
  shots.push('search-1440-dark.png');
  await page.fill('#search-input', '');
  await page.dispatchEvent('#search-input', 'input');
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, 'search-empty-1440-dark.png') });
  shots.push('search-empty-1440-dark.png');
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await page.screenshot({ path: join(OUT, 'search-empty-1440-light.png') });
  shots.push('search-empty-1440-light.png');
  await page.type('#search-input', 'webhook signature');
  await page.waitForTimeout(300);
  const results = await page.locator('.sr-item').count();
  if (!results) problems.push('search: no results for "webhook signature"');
  await Promise.all([page.waitForURL(/delivery-reports-and-webhooks/, { timeout: 5000 }).catch(() => {}), page.keyboard.press('Enter')]);
  if (!page.url().includes('delivery-reports-and-webhooks/#verify-the-signature')) problems.push(`search: Enter went to ${page.url()}`);
  await ctx.close();

  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const m = await mctx.newPage();
  await m.goto(`${BASE}/docs/console/sender-ids/`, { waitUntil: 'networkidle' });
  await m.click('[data-drawer-open]');
  await m.waitForTimeout(350);
  await m.screenshot({ path: join(OUT, 'drawer-390-light.png') });
  shots.push('drawer-390-light.png');
  // The drawer foot ("Back to opensms.io" and the waitlist button), in both themes.
  await m.locator('.sidebar-foot').scrollIntoViewIfNeeded();
  await m.screenshot({ path: join(OUT, 'drawer-foot-390-light.png') });
  shots.push('drawer-foot-390-light.png');
  await m.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await m.waitForTimeout(100);
  await m.screenshot({ path: join(OUT, 'drawer-foot-390-dark.png') });
  shots.push('drawer-foot-390-dark.png');
  await m.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await m.keyboard.press('Escape');
  await m.waitForTimeout(300);
  await m.click('.toc-mobile summary');
  await m.waitForTimeout(200);
  await m.screenshot({ path: join(OUT, 'toc-390-light.png') });
  shots.push('toc-390-light.png');
  // Search on a phone, light and dark.
  await m.goto(`${BASE}/docs/`, { waitUntil: 'networkidle' });
  await m.click('.search-trigger');
  await m.keyboard.type('sender id');
  await m.waitForTimeout(300);
  await m.screenshot({ path: join(OUT, 'search-390-light.png') });
  shots.push('search-390-light.png');
  await m.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await m.screenshot({ path: join(OUT, 'search-390-dark.png') });
  shots.push('search-390-dark.png');
  await m.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await m.keyboard.press('Escape');
  // Language tabs: choosing Python switches both groups on the SDK page.
  await m.goto(`${BASE}/docs/integrate/sdk/`, { waitUntil: 'networkidle' });
  await m.locator('#tabs-2-t1').scrollIntoViewIfNeeded();
  await m.click('#tabs-2-t1');
  await m.waitForTimeout(100);
  const synced = await m.evaluate(() => document.getElementById('tabs-1-p1').classList.contains('is-active') && document.getElementById('tabs-2-p1').classList.contains('is-active'));
  if (!synced) problems.push('sdk tabs: choosing Python did not switch both groups');
  await m.screenshot({ path: join(OUT, 'sdk-tabs-390-light.png') });
  shots.push('sdk-tabs-390-light.png');
  await m.setViewportSize({ width: 360, height: 780 });
  await m.goto(`${BASE}/docs/reference/api/messages/`, { waitUntil: 'networkidle' });
  const o360 = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (o360 > 0) problems.push(`api-reference 360: horizontal overflow ${o360}px`);
  await m.screenshot({ path: join(OUT, 'api-reference-360-light.png') });
  shots.push('api-reference-360-light.png');
  await mctx.close();
} finally {
  await browser.close();
  server.kill();
}

console.log(`${shots.length} screenshots in site-review/:\n${shots.map((s) => `  ${s}`).join('\n')}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('\nno console errors, no horizontal overflow, no layout shift');
