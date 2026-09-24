// Screenshot console pages for the guides, signed in through the real login form.
//
//   node scripts/shoot.mjs --login /login --email a@b.test --password '...' \
//     /app/messages=console/messages-list /app/keys=console/api-keys
//
// Each extra argument is <route>=<name>[=full]. Images land in assets/screens/<name>.png.
// Set OPENSMS_UI (default http://127.0.0.1:5190). --no-login shoots public pages as-is.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const [value] = args.splice(i, 2).slice(1);
  return value;
};
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};

const base = process.env.OPENSMS_UI ?? 'http://127.0.0.1:5190';
const loginPath = opt('--login') ?? '/login';
const email = opt('--email');
const password = opt('--password');
const width = Number(opt('--width') ?? 1440);
const noLogin = flag('--no-login');
const dark = flag('--dark');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: dark ? 'dark' : 'light' });

if (!noLogin) {
  await page.goto(base + loginPath, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.keyboard.press('Enter');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
}

for (const spec of args) {
  const [route, name, full] = spec.split('=');
  await page.goto(base + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const out = join('assets/screens', `${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: full === 'full' });
  console.log(`${route} -> ${out} (${page.url()})`);
}
await browser.close();
