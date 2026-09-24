// What the public docs site publishes and how it is organised. Anything not listed
// here (admin/, operations/, known-issues.md, docs/, tests/, reference/api/COVERAGE.md
// and examples.json) stays in the repository only; links to it from published pages
// become links to the file on GitHub.

export const SITE = {
  origin: 'https://opensms.io',
  base: '/docs/',
  name: 'OpenSMS Docs',
  repo: 'https://github.com/opensms-io/opensms-docs',
  branch: 'main',
  themeColor: '#29158E',
  summary:
    'OpenSMS is a prepaid SMS platform for Africa. A workspace tops up a wallet and sends messages, batches and one-time passcodes through an HTTP API or a web app, and OpenSMS routes each message to an upstream provider in the destination country.',
  homeTitle: 'OpenSMS Docs: SMS API, SDKs and web app guides',
  homeDescription:
    'Guides, API reference and SDKs for OpenSMS, the prepaid SMS platform for Africa. Send your first sandbox message, handle delivery reports and go live.',
};

/**
 * Sidebar sections, in order. Each page is a Markdown path relative to the repo root.
 * `label` overrides the sidebar text (the page's h1 stays the page title).
 * `anchors` adds in-page links under a page in the sidebar.
 * `seoTitle` replaces the h1 in <title> where the h1 alone is too thin.
 */
export const SECTIONS = [
  {
    id: 'get-started', title: 'Get started', icon: 'flash',
    blurb: 'What OpenSMS is, your first sandbox message in minutes, and the path to live traffic.',
    pages: [
      { path: 'getting-started/overview.md', label: 'Overview' },
      { path: 'getting-started/quickstart.md', label: 'Quickstart' },
      { path: 'getting-started/going-live.md', label: 'Going live' },
    ],
  },
  {
    id: 'integrate', title: 'Integrate', icon: 'sms',
    blurb: 'Task guides for developers: authentication, sending, webhooks, OTP, lookup, billing and errors.',
    pages: [
      { path: 'integrate/authentication.md' },
      { path: 'integrate/sending-messages.md' },
      { path: 'integrate/delivery-reports-and-webhooks.md', label: 'Delivery reports and webhooks' },
      { path: 'integrate/otp.md', label: 'One-time passcodes' },
      { path: 'integrate/lookup.md' },
      { path: 'integrate/inbound.md', label: 'Inbound messages' },
      { path: 'integrate/contacts-and-templates.md' },
      { path: 'integrate/realtime.md', label: 'Realtime' },
      { path: 'integrate/billing-and-wallet.md' },
      { path: 'integrate/errors.md' },
      { path: 'integrate/rate-limits-and-idempotency.md', label: 'Rate limits and idempotency' },
    ],
  },
  {
    id: 'sdks', title: 'SDKs', icon: 'terminal',
    blurb: 'Official clients for TypeScript, Python, Go, .NET, Java, Rust, Ruby, PHP and Swift.',
    pages: [
      {
        path: 'integrate/sdk.md', label: 'All SDKs', seoTitle: 'OpenSMS SDKs for nine languages',
        anchors: [
          { id: 'clients', label: 'Packages and install' },
          { id: 'quick-example', label: 'Quick example' },
          { id: 'behaviour-shared-by-every-client', label: 'Shared behaviour' },
          { id: 'how-the-clients-are-tested', label: 'How they are tested' },
        ],
      },
    ],
  },
  {
    id: 'api-reference', title: 'API reference', icon: 'document-code',
    blurb: 'Every /v1 operation with auth, parameters, responses and example requests.',
    pages: [
      { path: 'reference/api/README.md', label: 'Overview' },
      { path: 'reference/api/authentication.md' },
      { path: 'reference/api/account.md' },
      { path: 'reference/api/workspaces.md' },
      { path: 'reference/api/members.md' },
      { path: 'reference/api/onboarding.md' },
      { path: 'reference/api/legal.md' },
      { path: 'reference/api/api-keys.md' },
      { path: 'reference/api/messages.md' },
      { path: 'reference/api/batches.md' },
      { path: 'reference/api/sandbox.md' },
      { path: 'reference/api/inbound.md' },
      { path: 'reference/api/otp.md' },
      { path: 'reference/api/templates.md' },
      { path: 'reference/api/contacts.md' },
      { path: 'reference/api/sender-ids.md' },
      { path: 'reference/api/numbers.md' },
      { path: 'reference/api/webhooks.md' },
      { path: 'reference/api/compliance.md' },
      { path: 'reference/api/catalogue.md' },
      { path: 'reference/api/pricing.md' },
      { path: 'reference/api/analytics.md' },
      { path: 'reference/api/lookup.md' },
      { path: 'reference/api/wallet.md' },
      { path: 'reference/api/notifications.md' },
      { path: 'reference/api/realtime.md' },
      { path: 'reference/api/status.md' },
      { path: 'reference/api/health.md' },
      { path: 'reference/api/provider-callbacks.md' },
      { path: 'reference/api/schemas.md' },
    ],
  },
  {
    id: 'web-app', title: 'Web app guides', icon: 'monitor',
    blurb: 'Step-by-step guides with screenshots for everyone who uses the OpenSMS web app.',
    pages: [
      { path: 'console/README.md', label: 'Introduction' },
      { path: 'console/signing-up-and-signing-in.md' },
      { path: 'console/onboarding.md', label: 'Onboarding' },
      { path: 'console/legal-acceptance.md' },
      { path: 'console/overview-dashboard.md' },
      { path: 'console/sandbox.md' },
      { path: 'console/messages.md' },
      { path: 'console/contacts-and-groups.md' },
      { path: 'console/templates.md' },
      { path: 'console/sender-ids.md' },
      { path: 'console/numbers.md' },
      { path: 'console/inbound.md' },
      { path: 'console/otp.md', label: 'Verification codes' },
      { path: 'console/webhooks.md' },
      { path: 'console/api-keys.md' },
      { path: 'console/routes.md' },
      { path: 'console/usage.md' },
      { path: 'console/billing.md' },
      { path: 'console/go-live.md' },
      { path: 'console/compliance-and-verification.md' },
      { path: 'console/notifications.md' },
      { path: 'console/settings.md' },
      { path: 'console/status-page.md', label: 'Status page' },
    ],
  },
];

/** Directory links with no README go to the first page of the matching section. */
export const DIRECTORY_TARGETS = {
  'getting-started': 'getting-started/overview.md',
  integrate: 'integrate/authentication.md',
};

/** Markdown files that exist only as the source of the docs home. */
export const HOME_SOURCE = 'README.md';

/** Files and folders that are never published, even if something links to them. */
export const PRIVATE = [/^admin\//, /^operations\//, /^known-issues\.md$/, /^docs\//, /^tests\//, /^reference\/api\/COVERAGE\.md$/, /^reference\/api\/examples\.json$/];
