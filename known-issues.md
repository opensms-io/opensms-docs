# Known issues

Everything in these docs was checked against the running code, and where the code, the console, the
OpenAPI contracts and older internal notes disagreed, the docs describe what the code actually does.
This page collects those disagreements in one place, for the engineers who will fix them and for
readers who hit one. Each entry names where the behaviour comes from. Entries with an issue link are
tracked on GitHub; when one is fixed, the matching guide is updated and the entry is removed.

## Customer web app

| Issue | What happens | Where |
|---|---|---|
| Phone verification on Go live always fails | The console posts `{phone}` and `{code}`; the API requires `phone_e164`, and `challenge_id` with the code, and rejects unknown fields. Every attempt answers `invalid verification request`. | `frontend/src/lib/api/endpoints.ts:344-349`, `api/internal/onboarding/phone.go:64-80` |
| Batch send upload always fails | Uploading any CSV on **Messages > Batch send** answers "The requested endpoint was not found."; the console posts to a route the API does not serve. `POST /v1/messages/batch` works. | console batch upload (found while writing the Messages guide) |
| Suppression list import always fails | The console uploads a multipart file; the API accepts only JSON `{items: [...]}`. ([frontend#41](https://github.com/opensms-io/frontend/issues/41)) | `frontend/src/lib/api/endpoints.ts:1013-1016` |
| Sandbox magic numbers are described wrongly | The Sandbox page says `+254700000002` fails, `003` expires and `004` stays sent. The mock provider actually delivers `+2547000000NN`, fails `+2547000001NN` (carrier_rejected) and expires `+2547000002NN` (dlr_timeout). ([frontend#74](https://github.com/opensms-io/frontend/issues/74)) | `frontend/src/routes/app/Sandbox.tsx:30-40`, `api/internal/providers/mock/mock.go:62-64` |
| Compliance rules show the wrong country | Quiet hours and Content rules show the first active country (United Kingdom locally), not the workspace's markets, so Kenya's rules are invisible. | `frontend/src/routes/app/Compliance.tsx` |
| Workspace country shows a UUID | `/v1/workspace` returns `country_id`; `/v1/countries` has no `id` to match it. | `frontend/src/routes/app/settings/Workspace.tsx` |
| Export expiry reads "Download it before just now" | A future expiry is rendered with a past-tense relative time. | `frontend/src/routes/app/settings/Workspace.tsx` |
| "Cancel deletion" disappears after a reload | Deletion-pending is local state, while the server-side deletion stays scheduled for 30 days. | `frontend/src/routes/app/settings/Workspace.tsx`, `api/internal/account/deletion.go` |
| Sandbox owners without 2FA cannot delete a workspace | The server always requires 2FA for deletion; the console only expects it for live workspaces. | `api/internal/account/deletion.go`, `frontend/src/lib/auth/can.ts` |
| Legal acceptance is asked again in every new browser | The console keeps acceptance in browser storage and discards its read of the server's acceptance history, so a new browser, device or cleared site data shows the gate again, and Settings > Legal shows **Not accepted**, for versions already accepted. Re-accepting is idempotent on the server. | `frontend/src/components/auth/LegalGate.tsx` |
| Sandbox inbox tab lists inbound messages, not sandbox traffic | The tab reads received (inbound) messages, which only exist for live numbers, so in sandbox it always shows **No inbound messages yet**. | console Sandbox page |
| Legal gate stayed up after acceptance through the API | Observed once: the gate cleared only after Accept all in the browser. Not root-caused. | `frontend/src/components/auth/LegalGate.tsx` |
| Keys labelled "Full access" without owner scopes | The label compares scope counts, not the scopes themselves. | `frontend/src/routes/app/ApiKeys.tsx:69` |
| Several finished pages are hidden from the menu | OTP, Inbound, Contacts, Templates, Numbers and Usage are `hidden: true` in the rail; the guides give their addresses. | `frontend/src/components/ui/Rail.tsx:98-119` |
| Verification documents render raw HTML | Status lines and preview buttons are unstyled; "Previous versions" shows with no versions. | `frontend/src/routes/app/verification/Documents.tsx` |
| Developer text on the Notifications page | "Live connection: closed (0 events)" is shown to customers. | `frontend/src/routes/app/settings/Notifications.tsx` |
| Sandbox wallet shows 0 right after signup | The reset worker funds the 10,000 KES sandbox balance asynchronously. | wallet reset worker |

## Operator console

| Issue | What happens | Where |
|---|---|---|
| No manual wallet credit | The workspace Wallet adjustment form posts to `/admin/v1/workspaces/{id}/wallet/adjust`, which does not exist (404). ([frontend#109](https://github.com/opensms-io/frontend/issues/109)) | `frontend/src/lib/api/endpoints.ts:1348-1349` |
| Add country fails | The form omits the required IANA timezone (400). ([frontend#86](https://github.com/opensms-io/frontend/issues/86)) | `frontend/src/routes/admin/Countries.tsx:82` |
| Invite and remove operator fail | Both omit the required reason (422). ([frontend#99](https://github.com/opensms-io/frontend/issues/99)) | `frontend/src/lib/api/endpoints.ts:1500-1505`, `api/internal/admin/admins.go:173` |
| Publishing a legal document fails | The form sends no reason (400). ([frontend#95](https://github.com/opensms-io/frontend/issues/95)) | `frontend/src/routes/admin/Legal.tsx:61-66` |
| Incidents are effectively read-only | Create, status change and update send fields the API rejects: "Provide bounded incident fields, reason and Idempotency-Key." ([frontend#97](https://github.com/opensms-io/frontend/issues/97)) | `frontend/src/routes/admin/Incidents.tsx:31-35,127-134,165` |
| Saving a provider fails | The form sends `base_url: null` and credentials as a string (400). ([frontend#106](https://github.com/opensms-io/frontend/issues/106)) | `frontend/src/routes/admin/provider/Detail.tsx:70-78` |
| Pricing CSV import needs a reason column | The form sends no reason field; a random Idempotency-Key per upload also stops re-uploads being treated as replays. | `frontend/src/lib/api/endpoints.ts:1287-1290` |
| Actions needing a fresh code force a sign-out | The console has no step-up prompt; only the login page calls `/admin/v1/auth/2fa/verify`. | `frontend/src/routes/admin/Login.tsx` |
| Support sees Sender IDs but cannot use them | The page is listed for support; the API refuses support on every `/admin/v1/sender-*` call (403). | `frontend/src/lib/auth/adminCan.ts`, `api/internal/admin/http.go:89` |
| Provider test-send never sends | Always answers 501 `test_send_not_implemented`. | `api/internal/admin/provider_testsend.go` |
| Invitation links cannot be completed | There are no `/admin/invitations/accept` or `/decline` pages. | `frontend/src/router.tsx:192-215` |
| Audit search by email does nothing | The API matches only actor type or an exact actor id. ([frontend#92](https://github.com/opensms-io/frontend/issues/92)) | `api/internal/admin/audit.go:88` |
| Users show "No workspace" | `GET /admin/v1/users` returns no memberships. | `api/internal/admin/users.go:241` |
| Workspace search does nothing | The console sends `search`, but the list API ignores it and returns every workspace. ([frontend#108](https://github.com/opensms-io/frontend/issues/108)) | `api/internal/admin/http.go:526-553` |
| The carrier MCC/MNC example is rejected | The placeholder `639-02` answers `400 invalid operator code`. ([frontend#87](https://github.com/opensms-io/frontend/issues/87)) | `frontend/src/routes/admin/Carriers.tsx` |
| The rail shows every page to every role | Gating is per page ("Not authorized"), not in the menu. | `frontend/src/components/auth/AdminProtected.tsx` |

## API behaviour not in the contract

| Issue | Where |
|---|---|
| `POST /v1/messages` also returns 402, 403, 422, 429 and 503; missing scope answers 401, not 403. `POST /v1/otp/send` also returns 403. | `api/internal/messages/http.go:203`, `customer.yaml:2306,2526` |
| Insufficient scope is 401 on messages and OTP but 403 on every other resource. | messages and otp handlers |
| `PUT /v1/webhooks/{id}` requires `enabled` (the contract says optional). | `customer.yaml:3083` |
| `POST /v1/inbound/{id}/reply` returns 201 with a Message, not 202. | `customer.yaml:4905` |
| `/v1/templates` requires the `templates:manage` scope; the contract says any key. | `customer.yaml:820` |
| `CreateMessageRequest.to` has a regex with a literal backslash, so a spec-generated validator rejects every valid number. | `customer.yaml:6446` |
| 116 of 173 customer operations have no tag and 37 have no operationId; 7 have no `security` entry. | `api/openapi/customer.yaml` |
| Signup 400, batch stop 409, sender ID PATCH 422, invitation status fields and a nullable `company_details` are undocumented. | `customer.yaml:3324,2486,4632,4062,5563` |
| KYC approval also requires every document to pass scanning and human review (409); `admin.yaml` does not say so. | `admin.yaml:839-866` |
| `/v1/realtime`, `/v1/payments/paystack/webhook` and the admin sender-document routes are served but missing from the contracts. | `api/cmd/opensms/main.go:860,921`, `api/internal/admin/sender_documents.go` |
| Problem `trace_id` is declared but never set; `X-Request-Id` is only sent on message and OTP refusals. | `api/internal/httpx/problempb/problem.go:16` |
| Old API keys keep working for 24 hours after rotation; the contract does not say so. | `api/internal/keys/http.go:190` |

## Features that are advertised but not implemented

| Gap | Where |
|---|---|
| Inbound SMS is never received: nothing writes `inbound_messages`, inbound rules never run and `message.received` is never emitted. | `api/internal/providers/smpp/transport.go:247` |
| A message's `callback_url` is stored but never called. | `api/internal/messages/admission.go:135` |
| Volume price tiers are listed, but billing only uses the base tier. | `api/internal/messages/billing.go:47` |
| The `keys:admin` scope can be issued, but no endpoint accepts it. | `api/internal/keys/http.go:263` |
| Invoices can be listed, but nothing issues them. | no `insert into invoices` in `api/internal` |
| There are no customer statements; statements are operator monthly drafts only. | `api/internal/admin/statements.go` |
| Support "impersonation" is described in the permissions notes but does not exist. | `api/docs/permissions.md`, `frontend/src/routes/admin/Users.tsx:131-136` |
| The console's realtime connection is refused (403) because the WebSocket upgrader has no origin check for token connections. | `api/internal/realtime/hub.go:122` |

## Configuration and operations

| Issue | Where |
|---|---|
| `api/.env.example` lists 44 variables; the code reads 74. `OPENSMS_CORS_ORIGINS`, which deploy requires, is among the missing. See [configuration](operations/configuration.md). | `api/internal/config/config.go` |
| `OPENSMS_ADMIN_PORT` is parsed but unused: there is no admin listener, although the example env, compose file and Dockerfile advertise one. | `api/internal/config/config.go:259` |
| Operator sessions last a fixed 12 hours, not the configured customer policy. | `api/internal/admin/login.go:67` |
| The login lockout comment says ten minutes; the query counts 30, and each locked attempt extends it. | `api/internal/auth/session.go:284-286` |
| `deploy.sh` migrates while the old API is still running; the hosted and staging notes say to stop it first. | `api/deploy/deploy.sh:96-98` |
| The generated TypeScript client in `api/sdk/typescript` is stale against the contracts. ([api#35](https://github.com/opensms-io/api/issues/35)) | `api/sdk/typescript/generate.mjs --check` |
| Several internal notes are stale: migrations described as future work, schema and seed applied "in one transaction", every provider "pending integration", the hosted Dockerfile path. | `api/README.md:58`, `api/database/README.md:3`, `api/database/seed.sql`, `api/ops/hosted/README.md:3` |
