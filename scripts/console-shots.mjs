// Walks the customer web app for real and captures the screenshots used by the
// console/ guides. Every image in assets/screens/console/ comes from this file.
//
//   node scripts/console-shots.mjs            # every section
//   node scripts/console-shots.mjs auth keys  # only the named sections
//
// Needs the docs stack: API on OPENSMS_API (default http://127.0.0.1:18180) and
// UI on OPENSMS_UI (default http://127.0.0.1:5190). Accounts it creates end in
// @opensms.test. State (accounts, ids) is kept in CONSOLE_STATE so sections can
// be re-run on their own; delete that file to start over.
import { chromium } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const UI = process.env.OPENSMS_UI ?? 'http://127.0.0.1:5190';
const API = process.env.OPENSMS_API ?? 'http://127.0.0.1:18180';
const STATE = process.env.CONSOLE_STATE ?? join(tmpdir(), 'opensms-console-shots.json');
const OUT = 'assets/screens/console';
const PASSWORD = 'Docs-Console-Passw0rd-2026!';

const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));

// ---------------------------------------------------------------- API helpers

export async function api(method, path, { token, workspace, env, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (workspace) h['x-workspace-id'] = workspace;
  if (env) h['x-environment'] = env;
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: res.status, body: parsed };
}

/** Sign up through the API (so the workspace gets a name) or log in if the account exists. */
async function account(key, email, workspaceName, { acceptLegal = true } = {}) {
  let res = await api('POST', '/v1/auth/signup', { body: { email, password: PASSWORD, country_iso2: 'KE', workspace_name: workspaceName } });
  if (res.status === 409) res = await api('POST', '/v1/auth/login', { body: { email, password: PASSWORD } });
  if (res.status === 202) {
    const secret = state[key]?.totpSecret;
    if (!secret) throw new Error(`${email} has 2FA on and no stored secret`);
    res = await api('POST', '/v1/auth/login/2fa', { body: { challenge_token: res.body.challenge_token, code: totp(secret) } });
  }
  if (res.status !== 201) throw new Error(`account ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  let workspace = res.body.workspace?.id;
  if (!workspace) {
    const list = await api('GET', '/v1/workspaces', { token: res.body.token });
    workspace = list.body.items[0].id;
  }
  const acct = { email, password: PASSWORD, token: res.body.token, workspace };
  if (acceptLegal) await acceptAllLegal(acct);
  state[key] = { ...(state[key] ?? {}), ...acct };
  save();
  return state[key];
}

async function acceptAllLegal(a) {
  const docs = await api('GET', '/v1/legal/documents', { token: a.token, workspace: a.workspace });
  for (const d of docs.body.documents.filter((x) => x.document !== 'privacy')) {
    await api('POST', '/v1/legal/accept', { token: a.token, workspace: a.workspace, body: { document: d.document, version: d.version } });
  }
}

// RFC 6238 TOTP, so the walk can complete real 2FA prompts.
export function totp(secret, at = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1e6).padStart(6, '0');
}

// ---------------------------------------------------------------- UI helpers

let browser;
async function newPage({ width = 1440, height = 900 } = {}) {
  browser ??= await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));
  return page;
}

async function settle(page, ms = 1200) {
  // Some pages poll or hold a realtime socket open, so never wait long for idle.
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** Save a screenshot. `el` clips to one element; `full` captures the whole page. */
async function shot(page, name, { full = false, el, clip, hideToasts = false } = {}) {
  const out = join(OUT, `${name}.png`);
  mkdirSync(dirname(out), { recursive: true });
  // Hide leftover toasts from an earlier step so they do not look like this step's result.
  const style = hideToasts ? await page.addStyleTag({ content: '.toast-viewport{visibility:hidden !important}' }) : null;
  if (el) await page.locator(el).first().screenshot({ path: out });
  else await page.screenshot({ path: out, fullPage: full, clip });
  if (style) await style.evaluate((n) => n.remove());
  console.log(`  ${out}  (${page.url().replace(UI, '')})`);
}

/** Screenshot a long page by growing the window for one shot (the console scrolls inside a panel). */
async function tallShot(page, name, height, opts = {}) {
  const before = page.viewportSize();
  await page.setViewportSize({ width: before.width, height });
  await settle(page, 700);
  await shot(page, name, opts);
  await page.setViewportSize(before);
}

async function go(page, path, ms) {
  // The UI dev server occasionally stalls a navigation; one retry covers it.
  await page.goto(UI + path, { waitUntil: 'domcontentloaded' })
    .catch(() => page.goto(UI + path, { waitUntil: 'domcontentloaded' }));
  await settle(page, ms);
}

/** Log in through the real form. Handles a 2FA prompt when `secret` is given. */
async function uiLogin(page, email, password = PASSWORD, { secret, keepGate = false } = {}) {
  // The UI is a dev server that can reload mid-login, so try a few times.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await go(page, '/login', 300);
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', password);
    await page.click('button[type=submit]');
    // Logging in can take several seconds on the docs stack; wait for the redirect.
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
    await settle(page, 1500);
    if (secret && page.url().endsWith('/2fa')) {
      await typeCode(page, totp(secret));
      await settle(page, 1500);
    }
    if (!page.url().endsWith('/login')) break;
  }
  // A fresh browser meets the legal gate again (see console/legal-acceptance.md).
  if (!keepGate) await clearGate(page);
}

async function clearGate(page) {
  // The gate loads after the page, so give it a moment to appear.
  await page.locator('.legal-gate-overlay').waitFor({ timeout: 4000 }).catch(() => {});
  if (await page.locator('.legal-gate-overlay').count()) {
    const all = page.locator('.legal-gate-overlay button:has-text("Accept all")');
    if (await all.count()) await all.click();
    else await page.locator('.legal-gate-overlay button:has-text("Accept")').first().click();
    await settle(page, 1500);
  }
}

/** Type a 6-digit code into the first CodeInput on the page, clearing it first. */
async function typeCode(page, code, scope = '') {
  const cells = page.locator(`${scope} .code-input-cell`.trim());
  await cells.last().click();
  for (let i = 0; i < 7; i += 1) await page.keyboard.press('Backspace');
  await cells.first().click();
  await page.keyboard.type(code);
}

async function text(page) {
  return page.evaluate(() => document.body.innerText);
}

// ---------------------------------------------------------------- sections

const sections = {};

sections.auth = async () => {
  const page = await newPage();
  // Sign up, exactly as a new customer does.
  await go(page, '/signup');
  await shot(page, 'auth/signup');
  await page.click('button[type=submit]');
  await settle(page, 400);
  await shot(page, 'auth/signup-errors');
  const email = `new.customer.${Date.now().toString(36)}@opensms.test`;
  await page.click('button:has-text("Choose your country")');
  await page.click('text=Kenya (KES)');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await settle(page, 2500);
  await shot(page, 'auth/verify-email');
  state.signupDemo = { email };
  save();

  // Log in page, and the "email me a code" path.
  const p2 = await newPage();
  await go(p2, '/login');
  await shot(p2, 'auth/login');
  await p2.fill('input[type=email]', email);
  await p2.click('button:has-text("or email me a code")');
  await settle(p2, 1200);
  await shot(p2, 'auth/login-code-unavailable');
  await go(p2, `/login/code?email=${encodeURIComponent(email)}`);
  await shot(p2, 'auth/login-code');

  // Forgot and reset password.
  await go(p2, '/forgot-password');
  await shot(p2, 'auth/forgot-password');
  await p2.fill('input[type=email]', email);
  await p2.click('button[type=submit]');
  await settle(p2, 1200);
  await shot(p2, 'auth/forgot-password-unavailable');
  await go(p2, '/reset-password/example-token');
  await p2.fill('input[type=password] >> nth=0', 'short');
  await p2.fill('input[type=password] >> nth=1', 'different');
  await p2.click('button[type=submit]');
  await settle(p2, 400);
  await shot(p2, 'auth/reset-password-errors');
  await p2.fill('input[type=password] >> nth=0', 'A-New-Passw0rd-2026!');
  await p2.fill('input[type=password] >> nth=1', 'A-New-Passw0rd-2026!');
  await p2.click('button[type=submit]');
  await settle(p2, 1200);
  await shot(p2, 'auth/reset-password-bad-token');

  // Wrong password.
  await go(p2, '/login');
  await p2.fill('input[type=email]', email);
  await p2.fill('input[type=password]', 'not-the-password');
  await p2.click('button[type=submit]');
  await settle(p2, 800);
  await shot(p2, 'auth/login-wrong-password');

  // Two-factor sign in, with a separate account that has 2FA turned on.
  const kofi = await account('kofi', 'kofi@opensms.test', 'Kofi Test Lab');
  if (!state.kofi.totpSecret) {
    const setup = await api('POST', '/v1/auth/2fa/setup', { token: kofi.token });
    const en = await api('POST', '/v1/auth/2fa/enable', { token: kofi.token, body: { code: totp(setup.body.secret) } });
    if (en.status !== 200) throw new Error(`2fa enable ${en.status} ${JSON.stringify(en.body)}`);
    state.kofi.totpSecret = setup.body.secret;
    save();
  }
  const p3 = await newPage();
  await go(p3, '/login');
  await p3.fill('input[type=email]', 'kofi@opensms.test');
  await p3.fill('input[type=password]', PASSWORD);
  await p3.click('button[type=submit]');
  await settle(p3, 1200);
  await shot(p3, 'auth/two-factor');
  await typeCode(p3, '000000');
  await settle(p3, 1000);
  await shot(p3, 'auth/two-factor-wrong');
  await typeCode(p3, totp(state.kofi.totpSecret));
  await settle(p3, 1800);
  console.log('  after 2FA ->', p3.url());

  // Workspace chooser with two workspaces, reached from the switcher.
  await go(p3, '/workspaces');
  await shot(p3, 'auth/workspace-chooser');
  await p3.click('button:has-text("Create a workspace")');
  await settle(p3, 600);
  await shot(p3, 'auth/create-workspace');
};

sections.onboarding = async () => {
  // A brand-new UI signup, then the markets and sender ID steps.
  const page = await newPage();
  await go(page, '/signup');
  const email = `onboarding.${Date.now().toString(36)}@opensms.test`;
  await page.click('button:has-text("Choose your country")');
  await page.click('text=Kenya (KES)');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await settle(page, 2000);
  await go(page, '/onboarding/markets');
  await shot(page, 'onboarding/markets');
  await page.click('.markets-chips button:has-text("Kenya")');
  await page.click('.markets-chips button:has-text("Nigeria")');
  await settle(page, 300);
  await shot(page, 'onboarding/markets-selected');
  await page.click('button:has-text("Continue")');
  await settle(page, 1500);
  await shot(page, 'onboarding/sender-id');
  await page.fill('input[aria-label="Sender ID"]', 'acme clinic!');
  await settle(page, 1500);
  await shot(page, 'onboarding/sender-id-checked');
  await page.click('button:has-text("Save and view sender IDs")');
  await settle(page, 2500);
  // The first /app page shows the legal gate; clear it to see where onboarding lands.
  if (await page.locator('button:has-text("Accept all")').count()) {
    await page.click('button:has-text("Accept all")');
    await settle(page, 1500);
  }
  await shot(page, 'onboarding/after-sender-id');
  state.onboardingDemo = { email };
  save();
};

sections.legal = async () => {
  // A fresh account meets the acceptance gate on its first visit to /app.
  const email = `legal.${Date.now().toString(36)}@opensms.test`;
  await account('legalDemo', email, 'Legal Demo', { acceptLegal: false });
  const page = await newPage();
  await uiLogin(page, email, PASSWORD, { keepGate: true });
  await shot(page, 'legal/gate');
  await page.click('button[aria-label="Accept Terms of service"]');
  await settle(page, 700);
  await shot(page, 'legal/gate-one-left');
  await page.click('button[aria-label="Accept Data processing agreement"]');
  await settle(page, 600);
  await shot(page, 'legal/gate-cleared');
  await go(page, '/app/settings/legal', 2500);
  await shot(page, 'legal/settings-legal');
};

/** The main demo workspace every console guide uses. */
async function owner() {
  return account('amina', 'amina@opensms.test', 'Acme Clinics');
}

/** A signed-in browser page for the main demo owner. */
async function ownerPage(opts) {
  const a = await owner();
  const page = await newPage(opts);
  await uiLogin(page, a.email);
  return page;
}

const FIXTURES = join(tmpdir(), 'opensms-console-fixtures');
function fixture(name, body) {
  mkdirSync(FIXTURES, { recursive: true });
  const path = join(FIXTURES, name);
  writeFileSync(path, body);
  return path;
}

sections.messages = async () => {
  const page = await ownerPage();
  await go(page, '/app/messages');
  await shot(page, 'messages/list-empty');
  await go(page, '/app/messages/new');
  await page.fill('input[type=tel]', '+254 700 000001');
  await page.fill('textarea', 'Hi Wanjiru, your appointment at Acme Clinics is confirmed for Monday at 9:00.');
  await settle(page, 400);
  await shot(page, 'messages/compose-filled');
  await page.click('button:has-text("Send message")');
  await settle(page, 1200);
  await shot(page, 'messages/compose-blocked');
  await go(page, '/app/messages/00000000-0000-4000-8000-000000000000');
  await shot(page, 'messages/detail-not-found');
  await go(page, '/app/messages/batch');
  await shot(page, 'messages/batch-empty');
  const csv = fixture('appointments.csv', 'to,text\n+254700000001,Your appointment is confirmed for Monday 9am.\n+254700000002,Your appointment is confirmed for Monday 10am.\n');
  await page.setInputFiles('input[type=file]', csv);
  await settle(page, 400);
  await shot(page, 'messages/batch-picked');
  await page.click('button:has-text("Upload and validate")');
  await settle(page, 1500);
  await shot(page, 'messages/batch-upload-error');
};

const CONTACTS = [
  ['Wanjiru Kamau', '+254700000001', 'vip, monday'],
  ['Otieno Ouma', '+254700000002', 'monday'],
  ['Achieng Njeri', '+254700000003', ''],
];

sections.contacts = async () => {
  const page = await ownerPage();
  await go(page, '/app/contacts');
  await shot(page, 'contacts/empty');
  const existing = await text(page);
  for (const [name, phone, tags] of CONTACTS) {
    if (existing.includes(name)) continue;
    await page.click('button:has-text("New contact")');
    await settle(page, 300);
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Phone').fill(phone);
    await page.getByLabel('Tags').fill(tags);
    if (name === 'Wanjiru Kamau') await shot(page, 'contacts/new-contact');
    await page.locator('.modal button[type=submit], [role=dialog] button[type=submit]').click();
    await settle(page, 800);
  }
  await shot(page, 'contacts/list');
  await go(page, '/app/contacts?tab=groups');
  if (!(await text(page)).includes('Monday reminders')) {
    await page.click('button:has-text("New group")');
    await settle(page, 300);
    await page.getByLabel('Group name').fill('Monday reminders');
    await shot(page, 'contacts/new-group');
    await page.locator('[role=dialog] button[type=submit]').click();
    await settle(page, 800);
  }
  await shot(page, 'contacts/groups');
  await page.click('a:has-text("Open")');
  await settle(page, 1200);
  for (const who of ['Wanjiru Kamau', 'Otieno Ouma']) {
    if ((await page.locator('.cgd-main').innerText()).includes(who)) continue;
    await page.click('button:has-text("Add member")');
    await settle(page, 300);
    await page.locator('[role=dialog] button:has-text("Choose a contact"), [role=dialog] .select-trigger').first().click();
    await page.locator(`[role=option]:has-text("${who}")`).click();
    if (who === 'Wanjiru Kamau') await shot(page, 'contacts/add-member');
    await page.locator('[role=dialog] button[type=submit]').click();
    await settle(page, 900);
  }
  await page.locator('textarea').fill('Reminder: Acme Clinics is open 8am to 6pm this Monday.');
  await settle(page, 300);
  await shot(page, 'contacts/group-detail', { full: true });
  await page.click('button:has-text("Send to group")');
  await settle(page, 1200);
  await shot(page, 'contacts/group-send-blocked');
};

sections.templates = async () => {
  const page = await ownerPage({ width: 1440, height: 1180 });
  await go(page, '/app/templates');
  await shot(page, 'templates/empty');
  const haveReminder = (await text(page)).includes('Appointment reminder');
  await page.click('button:has-text("New template")');
  await settle(page, 300);
  await page.getByLabel('Name').fill('Appointment reminder');
  await page.getByLabel('Body').fill('Hi {{name}}, your appointment at Acme Clinics is on {{day}} at {{time}}.');
  await settle(page, 300);
  await page.getByLabel('name', { exact: true }).fill('Wanjiru');
  await page.getByLabel('day', { exact: true }).fill('Monday');
  await page.getByLabel('time', { exact: true }).fill('9:00');
  await settle(page, 300);
  await shot(page, 'templates/new-template');
  await page.locator('.tpl-preview').scrollIntoViewIfNeeded();
  await shot(page, 'templates/preview', { el: '.tpl-preview' });
  if (haveReminder) await page.locator('[role=dialog] button:has-text("Cancel")').click();
  else await page.locator('[role=dialog] button[type=submit]').click();
  await settle(page, 900);
  if (!(await text(page)).includes('Login code')) {
    await page.click('button:has-text("New template")');
    await settle(page, 300);
    await page.getByLabel('Name').fill('Login code');
    await page.locator('[role=dialog] input[type=radio][value=otp]').check({ force: true });
    await page.getByLabel('Body').fill('Your Acme Clinics login code is {{code}}. It expires in 10 minutes.');
    await page.locator('[role=dialog] button[type=submit]').click();
    await settle(page, 900);
  }
  await shot(page, 'templates/list');
};

/** Real PDFs rendered by Chromium, so the API's file checks accept them. */
async function samplePdfs() {
  const out = {};
  const page = await newPage();
  for (const [key, title] of [
    ['certificate', 'Certificate of incorporation'], ['signatory', 'Signatory ID'], ['authorization', 'Letter of authorization'],
    ['address', 'Proof of business address'], ['director', "Director's ID"],
  ]) {
    await page.setContent(`<h1>${title}</h1><p>SAMPLE document for the OpenSMS guides. Acme Clinics Ltd.</p>`);
    mkdirSync(FIXTURES, { recursive: true });
    out[key] = join(FIXTURES, `${key}.pdf`);
    await page.pdf({ path: out[key], format: 'A4' });
  }
  await page.close();
  return out;
}

async function eyebrow(page) {
  return (await page.locator('.sid-eyebrow').first().innerText().catch(() => '')).trim().toUpperCase();
}

sections.senderids = async () => {
  const pdfs = await samplePdfs();
  const page = await ownerPage();
  await go(page, '/app/sender-ids');
  await shot(page, 'sender-ids/list-before');
  // A bad file first, to show the error the API gives for a fake document.
  const fake = fixture('not-really.pdf', '%PDF-1.4\nnot a real pdf\n');

  await go(page, '/app/sender-ids/new');
  const next = async () => { await page.click('.sid-footer button:last-child'); await settle(page, 1500); };
  for (let guard = 0; guard < 12; guard += 1) {
    const step = await eyebrow(page);
    if (step === 'SENDER ID SETUP') {
      await shot(page, 'sender-ids/wizard-1-kind');
      await page.click('.sid-card');
      await next();
    } else if (step === 'YOUR SENDER ID') {
      const input = page.locator('input[placeholder="YOURBRAND"]');
      if (!(await input.inputValue())) await input.fill('ACMECLINIC');
      await settle(page, 1500);
      await page.getByLabel('I own this brand or have permission to use it').check({ force: true });
      await shot(page, 'sender-ids/wizard-2-name');
      await next();
    } else if (step === 'MARKETS AND CARRIERS') {
      const kenya = page.locator('.sid-market-row:has-text("Kenya")');
      if (!(await kenya.getAttribute('class')).includes('selected')) await kenya.click();
      await settle(page, 1500);
      await shot(page, 'sender-ids/wizard-3-markets');
      await next();
    } else if (step === 'TRAFFIC TYPE') {
      await page.locator('input[type=radio][value=transactional]').check({ force: true });
      await page.getByLabel('Sample message').fill('Acme Clinics: your appointment is confirmed for Monday at 9:00. Reply STOP to opt out.');
      await settle(page, 300);
      await shot(page, 'sender-ids/wizard-4-traffic', { full: true });
      await next();
    } else if (step === 'DOCUMENTS') {
      const inputs = page.locator('input[type=file]');
      await inputs.nth(0).setInputFiles(fake);
      await settle(page, 1500);
      await shot(page, 'sender-ids/wizard-5-bad-file');
      const files = [pdfs.certificate, pdfs.signatory, pdfs.authorization];
      for (let i = 0; i < 3; i += 1) {
        await page.locator('input[type=file]').nth(i).setInputFiles(files[i]);
        await settle(page, 2000);
      }
      await shot(page, 'sender-ids/wizard-5-documents');
      await next();
    } else if (step === 'REVIEW') {
      await settle(page, 1500);
      await shot(page, 'sender-ids/wizard-6-review', { full: true });
      const fee = page.getByLabel('I have reviewed these filing fees and authorize submission');
      if (await fee.count()) await fee.check({ force: true });
      await settle(page, 300);
      await next();
      await settle(page, 1500);
      await shot(page, 'sender-ids/wizard-7-filed', { full: true });
      break;
    } else {
      await shot(page, 'sender-ids/wizard-unknown');
      console.log('  wizard stopped at', JSON.stringify(step), page.url());
      break;
    }
  }
  await go(page, '/app/sender-ids');
  await shot(page, 'sender-ids/list-after');
};

sections.senderdetail = async () => {
  const a = await owner();
  const list = await api('GET', '/v1/sender-ids', { token: a.token, workspace: a.workspace, env: 'sandbox' });
  const mine = list.body.items.find((x) => x.value === 'ACMECLINIC');
  const shared = list.body.items.find((x) => x.value === 'OPENSMS');
  const page = await ownerPage();
  if (mine) {
    await go(page, `/app/sender-ids/${mine.id}`, 1800);
    await shot(page, 'sender-ids/detail-pending', { full: true });
    const withdraw = page.locator('button:has-text("Withdraw")').first();
    if (await withdraw.count()) {
      await withdraw.click();
      await settle(page, 400);
      await shot(page, 'sender-ids/withdraw-confirm');
      await page.locator('[role=dialog] button:has-text("Cancel")').click();
    }
  }
  if (shared) {
    await go(page, `/app/sender-ids/${shared.id}`, 1800);
    await shot(page, 'sender-ids/detail-approved');
  }
};

/** Pick an option from the console's Select component by its visible label. */
async function pick(page, label, option) {
  await page.getByRole('combobox', { name: label }).first().click();
  await settle(page, 300);
  await page.locator(`[role=option]:has-text("${option}")`).first().click();
  await settle(page, 300);
}

sections.numbers = async () => {
  const page = await ownerPage();
  await go(page, '/app/numbers');
  await shot(page, 'numbers/owned-empty');
  await go(page, '/app/numbers?view=available');
  await shot(page, 'numbers/available-start');
  await pick(page, 'Country', 'Kenya');
  await page.click('button:has-text("Search available numbers")');
  await settle(page, 1500);
  await shot(page, 'numbers/available-results');
};

sections.inbound = async () => {
  const page = await ownerPage();
  await go(page, '/app/inbound');
  await shot(page, 'inbound/messages-empty');
  await go(page, '/app/inbound?view=rules');
  await shot(page, 'inbound/rules-empty');
};

sections.otp = async () => {
  const page = await ownerPage();
  await go(page, '/app/otp');
  await shot(page, 'otp/start');
  await page.fill('input[type=tel]', '+254 700 000001');
  await settle(page, 300);
  await page.click('button:has-text("Send code")');
  await settle(page, 1500);
  await shot(page, 'otp/send-blocked');
};

sections.sandbox = async () => {
  const page = await ownerPage();
  await go(page, '/app/sandbox');
  await shot(page, 'sandbox/magic-numbers');
  await go(page, '/app/sandbox?view=inbox');
  await shot(page, 'sandbox/inbox');
};

/** Show only the first 11 characters of any secret on screen before a screenshot. */
async function maskSecrets(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[role=dialog] code, .sec-secret')) {
      const t = el.textContent ?? '';
      if (/^(sk_(test|live)_|whsec_|rc_)/.test(t) || el.classList.contains('sec-secret')) {
        el.textContent = `${t.slice(0, 11)}... (hidden in this guide)`;
      }
    }
  });
}

sections.keys = async () => {
  const fresh = await account(`keysDemo`, `keys.${Date.now().toString(36)}@opensms.test`, 'Acme Clinics');
  const page = await newPage({ width: 1440, height: 1000 });
  await uiLogin(page, fresh.email);
  await go(page, '/app/api-keys');
  await shot(page, 'api-keys/empty');
  await page.click('button:has-text("Create key")');
  await settle(page, 400);
  await page.getByLabel('Label').fill('Clinic booking app');
  await page.getByLabel(/Read analytics/).check({ force: true });
  await settle(page, 200);
  await shot(page, 'api-keys/create');
  await page.locator('[role=dialog] button[type=submit]').click();
  await settle(page, 1500);
  await maskSecrets(page);
  await shot(page, 'api-keys/show-once');
  await page.locator('[role=dialog] button:has-text("Done")').click();
  await settle(page, 800);
  await shot(page, 'api-keys/list');
  await page.locator('button[aria-label^="Actions for"]').first().click();
  await settle(page, 300);
  await shot(page, 'api-keys/row-menu');
  await page.locator('[role=menuitem]:has-text("Rotate key")').click();
  await settle(page, 1500);
  await maskSecrets(page);
  await shot(page, 'api-keys/rotated');
  await page.locator('[role=dialog] button:has-text("Done")').click();
  await settle(page, 800);
  await shot(page, 'api-keys/after-rotate');
  // Revoke the old key (the second row) once the app uses the new one.
  await page.locator('button[aria-label^="Actions for"]').nth(1).click();
  await settle(page, 300);
  await page.locator('[role=menuitem]:has-text("Revoke key")').click();
  await settle(page, 400);
  await shot(page, 'api-keys/revoke-confirm');
  await page.locator('[role=dialog] button:has-text("Revoke key")').click();
  await settle(page, 1200);
  await shot(page, 'api-keys/after-revoke');
};

sections.webhooks = async () => {
  const page = await ownerPage({ width: 1440, height: 1000 });
  await go(page, '/app/webhooks');
  await shot(page, 'webhooks/empty');
  if (!(await text(page)).includes('hooks.acme-clinics.example')) {
    await page.click('button:has-text("Create webhook")');
    await settle(page, 400);
    await page.getByLabel('Endpoint URL').fill('https://hooks.acme-clinics.example/opensms');
    for (const ev of ['message.delivered', 'message.failed', 'sender_id.approved']) {
      await page.locator(`[role=dialog] label:has-text("${ev}") input`).check({ force: true });
    }
    await settle(page, 200);
    await shot(page, 'webhooks/create');
    await page.locator('[role=dialog] button[type=submit]').click();
    await settle(page, 1500);
  }
  await shot(page, 'webhooks/list');
  await page.locator('button[aria-label^="Actions for"]').first().click();
  await settle(page, 300);
  await shot(page, 'webhooks/row-menu');
  await page.locator('[role=menuitem]:has-text("Open details")').click();
  await settle(page, 1500);
  await shot(page, 'webhooks/details');
  await page.locator('[role=dialog] button:has-text("Send test")').click();
  await settle(page, 2500);
  await shot(page, 'webhooks/details-after-test');
  await page.keyboard.press('Escape');
  await settle(page, 400);
  await page.locator('button[aria-label^="Actions for"]').first().click();
  await page.locator('[role=menuitem]:has-text("Edit endpoint")').click();
  await settle(page, 500);
  await shot(page, 'webhooks/edit');
  await page.keyboard.press('Escape');
  await settle(page, 400);
  await page.locator('button[aria-label^="Actions for"]').first().click();
  await page.locator('[role=menuitem]:has-text("Delete endpoint")').click();
  await settle(page, 500);
  await shot(page, 'webhooks/delete-confirm');
  await page.keyboard.press('Escape');
};

/** Wait for a toast and return its text, so the guides quote what really appeared. */
async function toastText(page) {
  const t = page.locator('.toast-message').last();
  await t.waitFor({ timeout: 5000 }).catch(() => {});
  const msg = (await t.innerText().catch(() => '')).trim();
  if (msg) console.log('  toast:', msg);
  return msg;
}

async function operator() {
  const res = await api('POST', '/admin/v1/login', {
    body: { email: process.env.OPENSMS_ADMIN_EMAIL, password: process.env.OPENSMS_ADMIN_PASSWORD },
  });
  if (res.status !== 200) throw new Error(`operator login ${res.status}`);
  return res.body.token;
}

sections.overview = async () => {
  // The console scrolls inside its own panel, so long pages use a tall window.
  const page = await ownerPage({ width: 1440, height: 1500 });
  await go(page, '/app', 2500);
  await shot(page, 'overview/overview');
  await page.locator('.ws-switcher-trigger').click();
  await settle(page, 800);
  await shot(page, 'overview/workspace-switcher', { clip: { x: 0, y: 0, width: 760, height: 260 } });
  await page.keyboard.press('Escape');
  await settle(page, 300);
  await page.locator('button[aria-label^="Account menu for"]').click();
  await settle(page, 500);
  await shot(page, 'overview/account-menu', { clip: { x: 900, y: 0, width: 540, height: 320 } });
};

sections.usage = async () => {
  const page = await ownerPage({ width: 1440, height: 1100 });
  await go(page, '/app/usage', 2000);
  await shot(page, 'usage/usage');
};

sections.billing = async () => {
  const page = await ownerPage({ width: 1440, height: 1000 });
  await go(page, '/app/billing', 2000);
  await shot(page, 'billing/sandbox-overview', { full: true });
  await page.click('button:has-text("Add sandbox credits")');
  await settle(page, 400);
  await page.locator('[role=dialog] input').first().fill('250');
  await shot(page, 'billing/add-sandbox-credits');
  await page.locator('[role=dialog] button[type=submit]').click();
  await toastText(page);
  await settle(page, 1500);
  await page.getByRole('tab', { name: /Transactions/ }).click();
  await settle(page, 800);
  await shot(page, 'billing/transactions', { full: true });
  // Live funding: card checkout, then bank transfer.
  await page.click('button:has-text("Fund live wallet")');
  await settle(page, 400);
  await page.locator('[role=dialog] input').first().fill('1000');
  await page.locator('[role=dialog] button[type=submit]').click();
  await toastText(page);
  await settle(page, 300);
  await shot(page, 'billing/fund-live-card-error');
  await pick(page, 'How you want to pay', 'Bank transfer');
  await page.locator('[role=dialog] input[type=file]').setInputFiles(fixture('bank-slip.pdf', '%PDF-1.4\n% placeholder\n'));
  await settle(page, 500);
  await shot(page, 'billing/fund-live-bank', { hideToasts: true });
  // Submitting needs 2FA (see console/billing.md); the tests check that answer through the API.
};

sections.routes = async () => {
  const page = await ownerPage();
  await go(page, '/app/routes', 2500);
  await shot(page, 'routes/routes', { full: true });
};

sections.compliance = async () => {
  const page = await ownerPage();
  await go(page, '/app/compliance', 1800);
  if (!(await text(page)).includes('+254700000009')) {
    await page.getByLabel('Number').fill('+254 700 000009');
    await pick(page, 'Reason', 'Stop keyword');
    await shot(page, 'compliance/suppression-add');
    await page.click('button:has-text("Add suppression")');
    await toastText(page);
    await settle(page, 1200);
  }
  await page.getByLabel('Number').fill('0700 12');
  await page.click('button:has-text("Add suppression")');
  await settle(page, 400);
  await shot(page, 'compliance/suppression-invalid', { hideToasts: true });
  await go(page, '/app/compliance', 1500);
  await shot(page, 'compliance/suppressions-list');
  await page.locator('button[aria-label^="Actions for"]').first().click();
  await settle(page, 300);
  await page.locator('[role=menuitem]:has-text("Remove from list")').click();
  await settle(page, 400);
  await shot(page, 'compliance/suppression-remove', { hideToasts: true });
  await page.locator('[role=dialog] button:has-text("Cancel")').click();
  await go(page, '/app/compliance?section=quiet-hours', 1500);
  await shot(page, 'compliance/quiet-hours');
  await go(page, '/app/compliance?section=content-rules', 1500);
  await shot(page, 'compliance/content-rules');
};

sections.verification = async () => {
  const pdfs = await samplePdfs();
  const email = `verify.${Date.now().toString(36)}@opensms.test`;
  const a = await account('verifyDemo', email, 'Acme Clinics');
  const page = await newPage({ width: 1440, height: 1000 });
  await uiLogin(page, email);
  await go(page, '/app/go-live', 2000);
  await tallShot(page, 'go-live/sandbox', 2250);

  await go(page, '/app/verification/company', 1500);
  await page.click('button:has-text("Save and continue")');
  await settle(page, 400);
  await shot(page, 'verification/company-errors');
  // Reload so the validation messages from the empty submit do not linger in the filled shot.
  await go(page, '/app/verification/company', 1500);
  await page.getByLabel('Company name').fill('Acme Clinics Ltd');
  await pick(page, 'Country of registration', 'Kenya');
  await page.getByLabel('Registration number').fill('PVT-2026-0042');
  await shot(page, 'verification/company-filled');
  await page.click('button:has-text("Save and continue")');
  await settle(page, 2000);
  await shot(page, 'verification/documents-empty');
  const fake = fixture('not-really.pdf', '%PDF-1.4\nnot a real pdf\n');
  await page.locator('input[type=file]').nth(0).setInputFiles(fake);
  await settle(page, 1500);
  await shot(page, 'verification/documents-bad-file');
  await toastText(page);
  for (const [i, f] of [pdfs.certificate, pdfs.address, pdfs.director].entries()) {
    await page.locator('input[type=file]').nth(i).setInputFiles(f);
    await settle(page, 2000);
  }
  await go(page, '/app/verification/documents', 2000);
  await tallShot(page, 'verification/documents-uploaded', 1000);

  await go(page, '/app/go-live', 2000);
  await tallShot(page, 'go-live/submitted', 2250);
  await page.getByLabel('Mobile number').fill('+254 700 000001');
  await page.click('button:has-text("Send code")');
  await settle(page, 1500);
  await page.locator('#gl-phone').scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, 'go-live/phone-error', { hideToasts: true });
  const req = page.locator('button:has-text("Request to go live")');
  console.log('  request button disabled:', await req.isDisabled());
  await req.scrollIntoViewIfNeeded();
  await shot(page, 'go-live/request-blocked', { el: '.gl-action' });

  // An operator sends the KYC back, then approves the corrected submission.
  const op = await operator();
  const rej = await api('POST', `/admin/v1/workspaces/${a.workspace}/kyc/reject`, {
    token: op, body: { reason: 'The registration number does not match the certificate. Please correct it.' },
  });
  console.log('  kyc reject', rej.status, JSON.stringify(rej.body));
  await go(page, '/app/verification/company', 2000);
  await shot(page, 'verification/company-rejected');
  await go(page, '/app/go-live', 2000);
  await tallShot(page, 'go-live/rejected', 2250);
  await go(page, '/app/verification/company', 1500);
  await page.getByLabel('Registration number').fill('PVT-2026-0043');
  await page.click('button:has-text("Save and continue")');
  await toastText(page);
  await settle(page, 2000);
  await page.locator('input[type=file]').nth(0).setInputFiles(pdfs.certificate);
  await settle(page, 2000);
  // Approval cannot be shown locally: the API requires every current document to pass a
  // virus scan and a human review first, and scanning is switched off on the docs stack.
  const ok = await api('POST', `/admin/v1/workspaces/${a.workspace}/kyc/approve`, { token: op, body: {} });
  console.log('  kyc approve', ok.status, JSON.stringify(ok.body));
  await go(page, '/app/go-live', 2000);
  await tallShot(page, 'go-live/resubmitted', 2250);

  // The inbox now holds the whole story.
  await go(page, '/app/notifications', 2000);
  await tallShot(page, 'notifications/inbox', 1500);
  await page.locator('button:has-text("Mark read")').first().click();
  await settle(page, 1200);
  await page.getByLabel('Unread only').check({ force: true });
  await settle(page, 1200);
  await shot(page, 'notifications/unread-only');
};

sections.notifprefs = async () => {
  const page = await ownerPage({ width: 1440, height: 1100 });
  await go(page, '/app/settings/notifications', 2000);
  await page.getByRole('switch', { name: 'Email notifications for Route health changed' }).click({ force: true });
  await settle(page, 300);
  await shot(page, 'notifications/preferences', { full: true });
  await page.click('button:has-text("Save 1 change")');
  await toastText(page);
  await settle(page, 800);
  // Put it back so re-runs start from the same place.
  await page.getByRole('switch', { name: 'Email notifications for Route health changed' }).click({ force: true });
  await page.click('button:has-text("Save 1 change")');
  await settle(page, 800);
};

sections.settings = async () => {
  const page = await ownerPage({ width: 1440, height: 1000 });
  await go(page, '/app/settings', 1500);
  await shot(page, 'settings/index');
  await go(page, '/app/settings/workspace', 2000);
  await shot(page, 'settings/workspace', { full: true });
  await page.getByLabel('Data retention (days)').fill('0');
  await page.click('button:has-text("Save changes")');
  await toastText(page);
  await settle(page, 300);
  await shot(page, 'settings/workspace-retention-error');
  await go(page, '/app/settings/workspace', 1500);
  await page.click('button:has-text("Delete workspace")');
  await settle(page, 400);
  await page.locator('[role=dialog] input').first().fill('Acme Clinics');
  await shot(page, 'settings/delete-workspace');
  await page.locator('[role=dialog] button:has-text("Cancel")').click();
  await settle(page, 300);
  await page.click('button:has-text("Request export")');
  await toastText(page);
  await settle(page, 6000);
  await page.locator('.ws-export-status').scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, 'settings/export-ready');

  await go(page, '/app/settings/team', 2000);
  const mate = `wanjiru.${Date.now().toString(36)}@opensms.test`;
  await page.getByLabel('Email').fill(mate);
  await pick(page, 'Role', 'Developer');
  await shot(page, 'settings/team-invite');
  await page.click('form button:has-text("Invite")');
  await toastText(page);
  await settle(page, 1500);
  const link = await page.locator('input[readonly]').first().inputValue();
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('input[readonly]')) el.value = el.value.replace(/(\/invite\/.{6}).*/, '$1... (hidden in this guide)');
  });
  await shot(page, 'settings/team-invited');

  // What the invited person sees when they open the link without being signed in.
  const guest = await newPage();
  await guest.goto(link, { waitUntil: 'domcontentloaded' });
  await settle(guest, 2000);
  await shot(guest, 'settings/invite-link');
};

sections.security = async () => {
  const email = `security.${Date.now().toString(36)}@opensms.test`;
  await account('securityDemo', email, 'Acme Clinics');
  const page = await newPage({ width: 1440, height: 1000 });
  await uiLogin(page, email);
  await go(page, '/app/settings/security', 1800);
  await shot(page, 'settings/security', { full: true });
  await page.click('button:has-text("Set up 2FA")');
  await settle(page, 1200);
  const secret = (await page.locator('.sec-secret').innerText()).trim();
  await maskSecrets(page);
  await shot(page, 'settings/2fa-setup');
  await typeCode(page, '000000');
  await settle(page, 1200);
  await toastText(page);
  await shot(page, 'settings/2fa-wrong');
  await typeCode(page, totp(secret));
  await toastText(page);
  await settle(page, 1500);
  await shot(page, 'settings/2fa-enabled');
  await page.click('button:has-text("Recovery codes")');
  await settle(page, 400);
  await typeCode(page, totp(secret), '[role=dialog]');
  await settle(page, 1500);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('.sec-codes code')) el.textContent = `${el.textContent.slice(0, 3)}...`;
  });
  await shot(page, 'settings/recovery-codes');
  await page.locator('[role=dialog] button:has-text("Done")').click();
  await settle(page, 300);
  await page.locator('button:has-text("Sign out")').first().click();
  await settle(page, 400);
  await shot(page, 'settings/revoke-session', { hideToasts: true });
  await page.locator('[role=dialog] button:has-text("Cancel")').click();
};

// ---------------------------------------------------------------- main

const wanted = process.argv.slice(2);
const order = Object.keys(sections);
for (const name of wanted.length ? wanted : order) {
  if (!sections[name]) throw new Error(`unknown section ${name}; have ${order.join(', ')}`);
  console.log(`# ${name}`);
  await sections[name]();
}
await browser?.close();
