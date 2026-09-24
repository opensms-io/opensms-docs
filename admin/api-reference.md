# Admin API reference

This page lists every operation in the admin API contract, `api/openapi/admin.yaml`, which is the contract of record for `/admin/v1`. It is for engineers and operators who script console tasks or need exact endpoints. The console pages call these same endpoints. Task-by-task explanations, with real request and response examples, are in the guides linked from [the console overview](README.md).

## Basics

- **Base URL:** the same host and port as the customer API (for example `http://127.0.0.1:18180` locally). Admin routes start with `/admin/v1`.
- **Authentication:** `Authorization: Bearer <session token>` from `POST /admin/v1/login` (and `/admin/v1/auth/2fa/verify` for operators with an authenticator). See [Getting access](getting-access.md). A customer session gets `403 active admin role required`.
- **Roles:** checked on every request. See the [roles table](README.md#roles-and-what-each-can-do). Some writes also need a code entered in the last ten minutes.
- **Errors:** problem JSON, for example `{"type":"about:blank","title":"Forbidden","status":403,"detail":"Operations access required."}`.
- **Idempotency:** payment decisions, refunds, imports, incidents, registrations and several finance writes require an `Idempotency-Key` header. The same key and body returns the original result; the same key with a different body returns `409`.
- **Pagination:** most lists return `{items, next_cursor}`. Pass `cursor` and `limit`. Some older lists return a bare array.

## Where the live examples are

Every example in the admin guides comes from a real call against the local docs stack, made by `tests/admin.test.mjs`.

| Flow | Guide |
|---|---|
| Login, TOTP challenge, re-verification | [Getting access](getting-access.md) |
| Sender ID queue, document review, platform decision, protected names | [Sender IDs](sender-ids.md) |
| KYC documents, KYC rejection, live-status transitions | [Workspaces](workspaces.md) |
| Force logout, ban, unban, access history | [Users](users.md) |
| Margin preview, workspace price import and replay | [Pricing](pricing.md) |
| Manual payment decision errors | [Payments](payments.md) |
| Carrier create and edit | [Carriers](carriers.md) |
| Provider create, edit, account, test send | [Providers](providers.md) |
| Route create, cost version, edit, health override and history | [Routes](routes.md) |
| Provider invoice evidence, realized margin | [Settlement](settlement.md) |
| Incident publish, resolve, reopen refusal | [Incidents](incidents.md) |
| Alert catalog, rules, inbox acknowledgement | [Notifications](notifications.md) |
| Audit search | [Audit log](audit-log.md) |
| Operator list, invite, revoke, remove | [Admins](admins.md) |
| Legal version list and publish validation | [Legal](legal.md) |

## Operations

The tables below are generated. Regenerate them after the contract changes with `node scripts/gen-admin-reference.mjs` (run from the docs folder, with the `api/` checkout next to it). Only the part between the markers is rewritten.

<!-- GENERATED:admin-operations BEGIN (scripts/gen-admin-reference.mjs) -->
144 operations on 121 paths, generated from `api/openapi/admin.yaml`.

| Area | Operations |
|---|---|
| [admins](#admins) | 6 |
| [alerts](#alerts) | 11 |
| [audit](#audit) | 1 |
| [auth](#auth) | 1 |
| [auto-topup-intents](#auto-topup-intents) | 2 |
| [broker](#broker) | 2 |
| [carriers](#carriers) | 4 |
| [compliance](#compliance) | 4 |
| [countries](#countries) | 4 |
| [healthz](#healthz) | 1 |
| [incidents](#incidents) | 4 |
| [legal](#legal) | 2 |
| [login](#login) | 2 |
| [messages](#messages) | 4 |
| [numbers](#numbers) | 4 |
| [operations](#operations) | 1 |
| [operators](#operators) | 4 |
| [payment-reviews](#payment-reviews) | 6 |
| [payments](#payments) | 5 |
| [pricing](#pricing) | 3 |
| [provider-invoices](#provider-invoices) | 2 |
| [provider-postings](#provider-postings) | 2 |
| [provider-settlement](#provider-settlement) | 1 |
| [providers](#providers) | 8 |
| [readyz](#readyz) | 1 |
| [reconciliation](#reconciliation) | 8 |
| [reserved-sender-ids](#reserved-sender-ids) | 4 |
| [routes](#routes) | 10 |
| [sender-ids](#sender-ids) | 4 |
| [sender-registrations](#sender-registrations) | 2 |
| [settlement](#settlement) | 4 |
| [statements](#statements) | 4 |
| [users](#users) | 8 |
| [workspaces](#workspaces) | 15 |

### admins

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/admins` | List safe administrator identities | 200, 403, 422 |
| POST | `/admin/v1/admins/invite` | Queue an expiring administrative invitation | 201, 403, 409, 422 |
| DELETE | `/admin/v1/admins/{id}` | Soft revoke administrator and associated sessions | 204, 403, 404, 409, 422 |
| DELETE | `/admin/v1/admins/invitations/{id}` | Revoke an unaccepted invitation | 204, 403, 404 |
| POST | `/admin/v1/admins/invitations/accept` | Accept using verified invited customer identity and current TOTP | 200, 401, 403, 409, 410, 422 |
| POST | `/admin/v1/admins/invitations/decline` | Decline using matching verified customer identity | 204, 401, 403, 410 |

### alerts

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/alerts/slack-destinations` | List encrypted Slack destination settings without secrets | 200, 400, 401, 403, 503 |
| POST | `/admin/v1/alerts/slack-destinations` | Create an encrypted Slack destination | 201, 400, 401, 403, 422, 503 |
| PATCH | `/admin/v1/alerts/slack-destinations/{id}` | Version-check and update a Slack destination | 200, 400, 401, 403, 404, 409, 422, 503 |
| DELETE | `/admin/v1/alerts/slack-destinations/{id}` | Disable and tombstone a Slack destination | 204, 400, 401, 403, 404, 409, 503 |
| GET | `/admin/v1/alerts` | List up to 500 undeleted rules, including disabled rules | 200, 422, 400, 403, 503 |
| POST | `/admin/v1/alerts` | Create supported in-app operator alert rule | 201, 422, 400, 403, 503 |
| PATCH | `/admin/v1/alerts/{id}` | Replace rule configuration and reset source eligibility cutoff | 200, 400, 403, 503 |
| DELETE | `/admin/v1/alerts/{id}` | Soft-delete rule while preserving historical deliveries | 204, 400, 403, 503 |
| GET | `/admin/v1/alerts/catalog` | (no summary in contract) | 200, 400, 403, 503 |
| GET | `/admin/v1/alerts/inbox` | (no summary in contract) | 200, 400, 403, 503 |
| POST | `/admin/v1/alerts/inbox/{id}/ack` | (no summary in contract) | 200, 404, 400, 403, 503 |

### audit

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/audit` | Read safe audit metadata (superadmin) | 200, 400, 403, 503 |

### auth

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| POST | `/admin/v1/auth/2fa/verify` | Complete administrator authenticator and receive a fresh admin token | 200, 401, 429 |

### auto-topup-intents

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/auto-topup-intents` | List automatic topup intents for finance investigation | 200, 400, 401, 403, 503 |
| GET | `/admin/v1/auto-topup-intents/{id}` | Inspect one automatic topup intent | 200, 400, 401, 403, 404, 503 |

### broker

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/broker/dead-letters` | List current dead deliveries for the configured broker consumer | 200, 400, 401, 403, 503 |
| POST | `/admin/v1/broker/dead-letters/{id}/replay` | Request an audited replay of one dead delivery generation | 202, 200, 400, 401, 403, 404, 409, 503 |

### carriers

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/carriers` | List carriers as a bare array | 200, 400, 403, 409 |
| POST | `/admin/v1/carriers` | Create carriers entry (ops/superadmin) | 201, 400, 403, 409 |
| GET | `/admin/v1/carriers/{id}` | Get carriers entry | 200, 400, 403, 409, 404 |
| PATCH | `/admin/v1/carriers/{id}` | Update carriers entry (ops/superadmin) | 200, 400, 403, 409, 404 |

### compliance

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/compliance/content-rules` | Operations policy catalog, bounded at 1000 records | 200, 403, 422 |
| GET | `/admin/v1/compliance/quiet-hours` | Operations policy catalog, bounded at 1000 records | 200, 403, 422 |
| GET | `/admin/v1/compliance/held-messages` | List held messages (ops or superadmin) | 200, 400, 401, 403, 404, 409, 422, 503 |
| POST | `/admin/v1/compliance/dnd/import` | Atomically add country DND entries globally, operations access required | 200, 400, 403, 409, 422, 503 |

### countries

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/countries` | List countries as a bare array | 200, 400, 403, 409 |
| POST | `/admin/v1/countries` | Create countries entry (ops/superadmin) | 201, 400, 403, 409 |
| GET | `/admin/v1/countries/{id}` | Get countries entry | 200, 400, 403, 409, 404 |
| PATCH | `/admin/v1/countries/{id}` | Update countries entry (ops/superadmin) | 200, 400, 403, 409, 404 |

### healthz

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/healthz` | Check service health (no session required) | 200, 503 |

### incidents

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/incidents` | List incidents, bounded at 200 with latest 100 updates each | 200, 422 |
| POST | `/admin/v1/incidents` | Publish incident | 201, 400, 403, 409, 422 |
| GET | `/admin/v1/incidents/{id}` | (no summary in contract) | 200, 404 |
| PATCH | `/admin/v1/incidents/{id}` | Append public update or change incident | 200, 400, 403, 409, 422 |

### legal

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/legal` | List the newest 200 immutable legal document versions (superadmin) | 200, 403 |
| POST | `/admin/v1/legal` | Publish an immutable legal document version (superadmin) | 201, 400, 403, 409, 503 |

### login

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| POST | `/admin/v1/login` | Authenticate an active administrator (no session required) | 200, 202, 400, 401, 429, 503 |
| POST | `/admin/v1/login/2fa` | Complete an administrator's underlying account TOTP challenge (no session required) | 200, 202, 400, 401, 429 |

### messages

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/messages/held` | List held messages (ops or superadmin) | 200, 400, 401, 403, 404, 409, 422, 503 |
| GET | `/admin/v1/messages/held/{id}` | Inspect a held or reviewed message (ops or superadmin) | 200, 400, 401, 403, 404, 409, 422, 503 |
| POST | `/admin/v1/messages/held/{id}/release` | Release a held message (ops or superadmin) | 200, 400, 401, 403, 404, 409, 422, 503 |
| POST | `/admin/v1/messages/held/{id}/reject` | Reject a held message (ops or superadmin) | 200, 400, 401, 403, 404, 409, 422, 503 |

### numbers

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/numbers` | List provider number inventory (ops, finance or superadmin) | 200, 403 |
| GET | `/admin/v1/numbers/{id}` | Read provider number assignment and generation | 200, 403, 404 |
| POST | `/admin/v1/numbers/{id}/confirm-release` | Record operator-verified provider deprovisioning without making inventory available | 200, 403, 409 |
| POST | `/admin/v1/numbers/{id}/confirm-provision` | Record fresh provider inventory and capability evidence (ops or superadmin) | 200, 403, 409 |

### operations

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/operations/file-scanning` | Inspect scanner health and quarantine backlog | 200, 401, 403, 503 |

### operators

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/operators` | List operators | 200 |
| POST | `/admin/v1/operators` | Create a country operator | 201, 400, 403 |
| GET | `/admin/v1/operators/{id}` | Read operator | 200, 404 |
| PATCH | `/admin/v1/operators/{id}` | Edit operator | 200, 400, 403, 409 |

### payment-reviews

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/payment-reviews` | List verified payment reversal reviews (finance or superadmin) | 200, 403 |
| GET | `/admin/v1/payment-reviews/{id}` | Read a payment reversal review (finance or superadmin) | 200, 403, 404 |
| POST | `/admin/v1/payment-reviews/{id}/resolve` | Record an audited finance finding without automatically debiting a wallet | 200, 400, 403, 404, 409 |
| POST | `/admin/v1/payment-reviews/{id}/attribute` | Attribute an unmatched review using consistent signed payment identifiers (finance or superadmin) | 200, 400, 403, 409 |
| GET | `/admin/v1/payment-reviews/{id}/evidence` | Read immutable evidence versions (finance or superadmin) | 200, 403 |
| POST | `/admin/v1/payment-reviews/{id}/reversal` | Post an operator-confirmed payment loss using available funds (finance or superadmin) | 201, 200, 400, 402, 403, 409 |

### payments

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/payments/{id}/proof` | Download a private manual-transfer proof | 200, 403, 404 |
| GET | `/admin/v1/payments` | List pending live manual bank transfers | 200, 403 |
| GET | `/admin/v1/payments/{id}` | Read a live manual bank transfer | 200, 403, 404 |
| POST | `/admin/v1/payments/{id}/approve` | Approve a pending manual bank transfer | 200, 400, 403, 409, 422 |
| POST | `/admin/v1/payments/{id}/reject` | Reject a pending manual bank transfer | 200, 400, 403, 409, 422 |

### pricing

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/pricing` | List immutable price versions | 200, 400, 403 |
| POST | `/admin/v1/pricing/import` | Atomically append price versions from CSV | 200, 400, 403, 409, 422 |
| POST | `/admin/v1/pricing/preview-margin` | Preview same-currency quoted margin using exact decimal arithmetic | 200, 400, 403, 422 |

### provider-invoices

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| POST | `/admin/v1/provider-invoices` | Record immutable provider invoice evidence | 201, 400, 403, 404, 409, 422, 503 |
| GET | `/admin/v1/provider-invoices` | List recorded provider invoices for one month | 200, 400, 403, 503 |

### provider-postings

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| POST | `/admin/v1/provider-postings` | Record a provider topup or adjustment | 201, 400, 403, 404, 409, 422, 503 |
| GET | `/admin/v1/provider-postings` | Read immutable provider ledger postings | 200, 400, 403, 503 |

### provider-settlement

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/provider-settlement` | Compare provider invoices and recorded ledger costs | 200, 400, 403, 404, 503 |

### providers

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/providers` | List providers | 200, 401, 403 |
| POST | `/admin/v1/providers` | Create a provider pending integration | 201, 400, 403, 409 |
| GET | `/admin/v1/providers/{id}` | Read sanitized provider | 200, 404 |
| PATCH | `/admin/v1/providers/{id}` | Edit provider configuration | 200, 400, 403, 404 |
| GET | `/admin/v1/providers/{id}/account` | Read provider balance and threshold | 200, 401, 403, 404, 503 |
| PUT | `/admin/v1/providers/{id}/account` | Configure provider account currency and balance threshold | 200, 400, 401, 403, 404, 409, 422, 503 |
| GET | `/admin/v1/providers/{id}/balance` | Read reported provider balance with low-threshold flag | 200, 401, 403, 404, 503 |
| POST | `/admin/v1/providers/{id}/test-send` | Validate a direct provider test request (sending not implemented) | 400, 401, 403, 404, 422, 501, 503 |

### readyz

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/readyz` | Check service readiness (no session required) | 200, 503 |

### reconciliation

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/reconciliation/dlr-reviews` | List pending delivery receipt timeout reviews (ops or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/reconciliation/dlr-reviews/{id}` | Read a delivery receipt timeout review (ops or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/reconciliation/attempts` | List unresolved attempts (ops or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/reconciliation/attempts/{id}` | Read an unresolved item (ops or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/reconciliation/receipts` | List unresolved receipts (ops or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/reconciliation/receipts/{id}` | Read an unresolved item (ops or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/reconciliation/lookups` | Read uncertain lookup operations without destination PII | 200, 400, 403 |
| POST | `/admin/v1/reconciliation/lookups/{id}` | Resolve an uncertain lookup using reviewed provider evidence | 200, 403, 404, 409, 422, 503 |

### reserved-sender-ids

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/reserved-sender-ids` | List exact protected sender identities | 200, 403 |
| POST | `/admin/v1/reserved-sender-ids` | Protect an exact sender identity | 201, 400, 403, 409 |
| PATCH | `/admin/v1/reserved-sender-ids/{id}` | Update a protected sender identity | 200, 400, 403, 404, 409 |
| DELETE | `/admin/v1/reserved-sender-ids/{id}` | Remove a protected sender identity | 204, 403, 404 |

### routes

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| POST | `/admin/v1/routes` | Link a provider to a country and optional operator | 201, 400, 403, 409 |
| GET | `/admin/v1/routes` | List route configuration and current per-part provider cost | 200 |
| PATCH | `/admin/v1/routes/{id}` | Update route settings (ops or superadmin) | 200, 422 |
| PUT | `/admin/v1/routes/{id}/health-override` | Pin route health or restore automatic health (ops or superadmin) | 200, 400, 401, 403, 404 |
| GET | `/admin/v1/routes/{id}/sender-options` | List eligible shared default senders for this provider and country | 200 |
| GET | `/admin/v1/routes/{id}/health-history` | List recorded automatic and manual health transitions for an authenticated admin | 200, 400, 401, 404 |
| GET | `/admin/v1/routes/{id}/cost-history` | List immutable provider per-part cost versions, newest effective date first | 200 |
| POST | `/admin/v1/routes/{id}/costs` | Append a provider per-part cost version (ops, finance or superadmin) | 201 |
| GET | `/admin/v1/routes/{id}/probe` | Read controlled submission recovery probe configuration (superadmin) | 200, 403, 404 |
| PUT | `/admin/v1/routes/{id}/probe` | Configure a funded controlled recovery probe (superadmin) | 200, 400, 403, 409, 422 |

### sender-ids

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/sender-ids/queue` | List sender IDs awaiting review or provider submission | 200, 401, 403 |
| GET | `/admin/v1/sender-ids/{id}` | Get a sender ID review record | 200, 404 |
| POST | `/admin/v1/sender-ids/{id}/submit` | Charge registration fees and durably queue provider submission | 202, 402, 503, 400, 500, 403, 409 |
| POST | `/admin/v1/sender-ids/{id}/decision` | Approve or reject the platform sender only | 200, 400, 500, 403, 409 |

### sender-registrations

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/sender-registrations` | List provider registration state and quoted fees | 200, 403, 503 |
| POST | `/admin/v1/sender-registrations/{id}` | Record evidenced provider registration outcome | 200, 403, 404, 409, 422, 503 |

### settlement

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/settlement/provider-ledger` | Read immutable provider postings across providers | 200, 400, 403 |
| GET | `/admin/v1/settlement/invoices` | Read provider invoices with evidence-derived reconciliation state | 200, 400, 403, 422 |
| POST | `/admin/v1/settlement/reconcile` | Record complete finance-attested actual provider usage costs | 200, 403, 404, 409, 422, 503 |
| GET | `/admin/v1/settlement/realized-margin` | Review realized margin for a closed UTC charge month | 200, 400, 403, 503 |

### statements

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/statements` | List immutable financial drafts (finance or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/statements/{id}` | Read an immutable financial draft (finance or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/statements/{id}/lines` | List statement source postings (finance or superadmin) | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/statements/{id}/late-entries` | List postings requiring adjustment review (finance or superadmin) | 200, 400, 401, 403, 404, 503 |

### users

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| GET | `/admin/v1/users` | List customer user metadata (superadmin or support) | 200, 400, 403 |
| GET | `/admin/v1/users/{id}` | Get safe customer user detail and workspace memberships (superadmin or support) | 200, 400, 403, 404, 503 |
| POST | `/admin/v1/users/{id}/lock` | Apply a reasoned customer user security action (fresh superadmin TOTP) | 204, 400, 403, 404, 409, 503 |
| POST | `/admin/v1/users/{id}/force-logout` | Apply a reasoned customer user security action (fresh superadmin TOTP) | 204, 400, 403, 404, 409, 503 |
| POST | `/admin/v1/users/{id}/reset-2fa` | Apply a reasoned customer user security action (fresh superadmin TOTP) | 204, 400, 403, 404, 409, 503 |
| POST | `/admin/v1/users/{id}/ban` | Ban a customer with a customer-visible reason | 204, 400, 403, 404, 409, 503 |
| POST | `/admin/v1/users/{id}/unban` | Lift a customer ban after review | 204, 400, 403, 404, 409, 503 |
| GET | `/admin/v1/users/{id}/access-history` | List immutable customer ban decisions (superadmin or support) | 200, 403 |

### workspaces

| Method | Path | What it does | Documented responses |
|---|---|---|---|
| POST | `/admin/v1/workspaces/{id}/number-refunds` | Refund a typed number purchase or renewal charge | 201, 400, 401, 403, 404, 409, 503 |
| POST | `/admin/v1/workspaces/{id}/sender-registration-refunds` | Refund an original rejected provider registration fee | 201, 400, 401, 403, 404, 409, 503 |
| POST | `/admin/v1/workspaces/{id}/lookup-refunds` | Refund an original paid lookup capture | 201, 400, 401, 403, 404, 409, 410, 503 |
| POST | `/admin/v1/workspaces/{id}/refunds` | Refund a linked message charge (finance or superadmin) | 201, 400, 401, 403, 404, 409, 503 |
| GET | `/admin/v1/workspaces` | List workspaces | 200, 400, 401, 403 |
| GET | `/admin/v1/workspaces/{id}/messages` | List a workspace's messages | 200, 400, 401, 403, 404 |
| GET | `/admin/v1/workspaces/{id}/ledger` | List a workspace's wallet ledger | 200, 400, 401, 403, 404 |
| GET | `/admin/v1/workspaces/{id}` | Get a workspace by id | 200, 400, 401, 403, 404 |
| PUT | `/admin/v1/workspaces/{id}` | Activate, suspend or reject a workspace live request | 200, 400, 401, 403, 404, 409, 422, 503 |
| POST | `/admin/v1/workspaces/{id}/kyc/approve` | Approve submitted KYC and its onboarding steps | 204, 400, 401, 403, 404, 409, 422, 503 |
| POST | `/admin/v1/workspaces/{id}/kyc/reject` | Reject submitted KYC with a reason | 204, 400, 401, 403, 404, 409, 422, 503 |
| GET | `/admin/v1/workspaces/{id}/documents` | List private KYC document metadata | 200, 400, 401, 403, 404, 503 |
| GET | `/admin/v1/workspaces/{id}/documents/{document_id}` | Download a private KYC document | 200, 400, 401, 403, 404, 503 |
| POST | `/admin/v1/workspaces/{workspace_id}/documents/{document_id}/review` | Record a human decision for the current immutable document version | 204, 400, 403, 404, 409, 422, 503 |
| POST | `/admin/v1/workspaces/{workspace_id}/sender-documents/{document_id}/review` | Record a human decision for the current immutable document version | 204, 400, 403, 404, 409, 422, 503 |
<!-- GENERATED:admin-operations END -->

## Operations the console uses that are not in the contract

The console calls `POST /admin/v1/workspaces/{id}/wallet/adjust`, which the API does not implement (`404`). See [Workspaces](workspaces.md#wallet-adjustment-not-available). The API serves `GET /admin/v1/workspaces/{id}/sender-documents` and `GET /admin/v1/workspaces/{id}/sender-documents/{document_id}` (used by the console for sender evidence), but they are not in `admin.yaml`.
