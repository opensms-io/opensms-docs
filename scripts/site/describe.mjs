// Meta descriptions for the docs pages. A description is built from whole sentences
// of the page's opening prose so it reads like it was written by hand: 120 to 160
// characters, never cut mid-word or mid-sentence. Pages whose opening does not fit
// get an entry in OVERRIDES (checked by the build to stay in range).

export const MIN = 120;
export const MAX = 160;

/** Hand-written descriptions for pages whose opening sentences do not fit. */
export const OVERRIDES = {
  'reference/api/legal.md': 'Read the current OpenSMS legal documents (terms, privacy policy and DPA), accept a version and list the recorded acceptances. Session tokens only.',
  'reference/api/notifications.md': 'The signed-in user\'s notification inbox and preferences: list notifications, mark them read, and read or update preferences. Session tokens only.',
  'console/README.md': 'Task-by-task guides to the OpenSMS web app: signing in, setting up a workspace, sending messages, managing sender IDs and keys, paying and going live.',
  'console/billing.md': 'OpenSMS is prepaid. The Billing page shows your wallet balance, lets you add credits and lists every movement, plus payments and invoices once you are live.',
  'console/compliance-and-verification.md': 'Keep your messaging legal: manage the numbers you must not message, read quiet hours and content rules, and verify your business before going live.',
  'console/contacts-and-groups.md': 'Contacts is your address book inside OpenSMS: names, phone numbers and tags. Groups are saved lists of contacts you can message in a single step.',
  'console/go-live.md': 'Every workspace starts in sandbox. The Go live page is the checklist for sending real messages to real phones and the button to ask for a review.',
  'console/inbound.md': 'Read the texts people send to your numbers, such as replies and STOP keywords, and set rules that call your webhook, auto-reply or forward by email.',
  'console/legal-acceptance.md': 'The screen that asks you to accept the OpenSMS Terms of service and Data processing agreement, when it appears, and where to see what you accepted.',
  'console/notifications.md': 'OpenSMS alerts you when your workspace needs a look, such as a low balance or a rejected sender ID. Read the inbox and choose which alerts reach you.',
  'console/numbers.md': 'Rent dedicated phone numbers (long codes, short codes and toll-free numbers) for a live workspace, send from them, receive replies and release them.',
  'console/onboarding.md': 'The short path after signing up: pick the countries you want to send to, then the name your messages come from. Both steps only save a draft.',
  'console/overview-dashboard.md': 'The Overview shows your workspace at a glance: sandbox or live, setup left to do, 30-day volume and delivery, wallet balance and sender IDs.',
  'console/routes.md': 'See which carriers OpenSMS reaches in every country, through which provider, at what cost and how healthy each route is, and choose route fallback.',
  'console/sandbox.md': 'Sandbox is the free practice mode every workspace starts in. Messages are simulated, never reach a real phone and never cost real money.',
  'console/sender-ids.md': 'A sender ID is the name recipients see instead of a phone number. Apply for one in the web app and track its registration market by market.',
  'console/settings.md': 'Manage the workspace (name, spending limit, history retention, team, export or deletion) and your own account, sign-ins, alerts and two-factor login.',
  'console/signing-up-and-signing-in.md': 'Get into OpenSMS: create an account, verify your email, log in with a password or emailed code, use two-factor login and join a team you were invited to.',
  'console/templates.md': 'Templates are saved message texts with blanks to fill in, so everyone in the workspace, and your developers\' code, uses the same approved wording.',
  'console/usage.md': 'See how many messages your workspace sent, delivered and failed over 7, 30 or 90 days, by country, carrier or sender ID and day by day.',
  'console/webhooks.md': 'A webhook is a URL on your own system that OpenSMS calls when something happens. Add, test, edit and delete webhook endpoints in the web app.',
  'getting-started/going-live.md': 'Everything between a working sandbox integration and real messages reaching handsets: identity checks, legal acceptance, funding, sender ID and live keys.',
  'getting-started/quickstart.md': 'Go from nothing to a sandbox SMS in about five minutes: create an account, verify your email, mint a sandbox API key, send a message and check its status.',
  'integrate/errors.md': 'Every OpenSMS error uses one JSON shape, RFC 9457 problem details. What each HTTP status means, every error code the API emits and which errors to retry.',
  'integrate/otp.md': 'The OTP API generates a numeric code, sends it by SMS and checks the code your user types in. OpenSMS stores only a hash, so you never handle the code.',
  'integrate/sending-messages.md': 'Outbound SMS through the OpenSMS API: single sends, scheduling and cancellation, batches, sender IDs, encoding and segments, statuses and delivery attempts.',
  'reference/api/README.md': 'The exact contract of the OpenSMS customer API: every /v1 operation with its auth, parameters, request fields, responses, errors and live-tested examples.',
  'reference/api/batches.md': 'Bulk sending API: submit a batch of recipients, read its validation report and items, then start or stop it. For sending one message to many recipients.',
  'reference/api/compliance.md': 'Per-country compliance rules (stop keywords, quiet hours, content rules) and the workspace suppression list, for managing opt-outs through the API.',
  'reference/api/contacts.md': 'Store contacts and contact groups and send a message to a whole group. API keys need the contacts:manage scope. For syncing an address book into OpenSMS.',
  'reference/api/messages.md': 'The core sending API: send a single SMS, list and read messages, read delivery attempts and cancel scheduled messages, with messages:write and messages:read.',
  'reference/api/otp.md': 'One-time passcodes: OpenSMS generates, sends and verifies a code for you. API keys only. For adding phone verification or step-up login to your product.',
  'reference/api/provider-callbacks.md': 'Inbound delivery-receipt callbacks from upstream SMS providers. Providers call these, not customers; they are listed because they are part of the contract.',
  'reference/api/sandbox.md': 'The sandbox message log: messages sent with a sk_test_ key are accepted and recorded but never handed to a carrier, and this endpoint reads them back.',
  'reference/api/schemas.md': 'Every named request and response schema in the OpenSMS customer API contract, with nested objects flattened into dotted field names for exact shapes.',
  'reference/api/status.md': 'The public OpenSMS service status data and status-update email subscriptions. No authentication. For surfacing OpenSMS health in your own tooling.',
  'reference/api/webhooks.md': 'Register HTTPS endpoints for signed event callbacks such as delivery receipts and inbound messages, inspect delivery history, send test events and replay.',
  'reference/api/workspaces.md': 'Read and update the current workspace, list and create workspaces, and manage settings such as retention, spend cap and routing preferences. Session only.',
};

/** Markdown inline syntax to plain text. */
export function plain(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prose paragraphs of a Markdown body, in order, skipping code, tables, lists and quotes. */
export function paragraphs(md) {
  const out = [];
  let buf = [];
  let fence = false;
  const flush = () => { if (buf.length) out.push(plain(buf.join(' '))); buf = []; };
  for (const line of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { flush(); fence = !fence; continue; }
    if (fence) continue;
    if (/^#{2,6} /.test(line)) break; // only the introduction, before the first section
    if (!line.trim() || /^(#|\||>|\s*[-*+] |\s*\d+\. |<!--|!\[)/.test(line)) { flush(); continue; }
    buf.push(line.trim());
  }
  flush();
  return out.filter(Boolean);
}

// Navigation sentences the reference generator puts at the top of every page.
const BOILERPLATE = /^(Back to the API reference index|Shared shapes are in Schemas)/;

const sentences = (p) => p.split(/(?<=[.!?])\s+(?=[A-Z0-9"(`])/).map((s) => s.trim()).filter(Boolean);

/** Whole-sentence description from the opening prose, or null when none fits. */
export function autoDescription(md) {
  const all = paragraphs(md).slice(0, 3).flatMap(sentences).filter((s) => !BOILERPLATE.test(s));
  let text = '';
  for (const s of all) {
    const next = text ? `${text} ${s}` : s;
    if (next.length > MAX) break;
    text = next;
    if (text.length >= MIN) return text;
  }
  return null;
}

export function describe(path, md) {
  const d = OVERRIDES[path] ?? autoDescription(md);
  if (!d) return { error: `${path}: no whole-sentence description fits ${MIN}-${MAX} characters; add one to OVERRIDES in scripts/site/describe.mjs` };
  if (d.length < MIN || d.length > MAX) return { error: `${path}: description is ${d.length} characters (want ${MIN}-${MAX}): ${d}` };
  if (!/[.!?]$/.test(d)) return { error: `${path}: description does not end a sentence: ${d}` };
  return { description: d };
}
