# opensms overview

opensms is a prepaid SMS platform with an HTTP API. You create an account and a workspace, get a sandbox API key, and send simulated messages right away. When you are ready for real traffic, you pass a verification review, fund a prepaid wallet, and switch to a live key. This page is for developers who are about to integrate opensms into a product. It explains the moving parts and the vocabulary used in the rest of these docs.

- New here? Go to the [quickstart](quickstart.md).
- Ready for production? Read [going live](going-live.md).

## What the API does

| Capability | Endpoint family | Guide |
| --- | --- | --- |
| Send single messages, schedule, cancel, read status and delivery attempts | `/v1/messages` | [Sending messages](../integrate/sending-messages.md) |
| Upload and start batches (JSON or CSV, up to 1000 rows) | `/v1/messages/batch`, `/v1/batches` | [Sending messages](../integrate/sending-messages.md#batches) |
| One-time passcodes | `/v1/otp/send`, `/v1/otp/verify` | [OTP](../integrate/otp.md) |
| Number lookup (country, carrier, validity) | `/v1/lookup` | [Lookup](../integrate/lookup.md) |
| Webhooks for status changes and other events | `/v1/webhooks` | [Delivery reports and webhooks](../integrate/delivery-reports-and-webhooks.md) |
| WebSocket event stream | `/v1/realtime` | [Realtime](../integrate/realtime.md) |
| Contacts, contact groups, templates | `/v1/contacts`, `/v1/contact-groups`, `/v1/templates` | [Contacts and templates](../integrate/contacts-and-templates.md) |
| Inbound messages and virtual numbers | `/v1/inbound`, `/v1/numbers` | [Inbound](../integrate/inbound.md) |
| Balances, ledger, prices, spend cap, invoices | `/v1/wallet`, `/v1/pricing`, `/v1/invoices` | [Billing and wallet](../integrate/billing-and-wallet.md) |
| Sending analytics: totals, breakdowns by country, carrier and sender ID, time series (key scope `analytics:read`) | `/v1/analytics/*` | [API reference: analytics](../reference/api/analytics.md) |

The OpenAPI 3.1 contract for every customer endpoint is `api/openapi/customer.yaml` in the opensms repository, and the [customer API reference](../reference/api/README.md) documents every operation with request and response examples. These guides cover the flows; team members, invitations, account export and deletion, notifications and password reset are in that reference. Official clients for nine languages are described in [SDKs](../integrate/sdk.md).

## Base URL

Every customer endpoint lives under one origin, with paths starting `/v1/`. The examples in these docs use the local development stack at `http://127.0.0.1:18180`. Replace it with the API origin you were given for your deployment.

`GET /healthz` answers `ok` when the process is up, and `GET /readyz` answers `ready` when its database, Redis and other dependencies respond. Neither needs credentials.

## Sandbox and live

Every workspace has two separate environments. They share the workspace, its members and its settings, but nothing else: messages, wallets, keys, webhooks, templates and contacts each belong to exactly one environment.

| | Sandbox | Live |
| --- | --- | --- |
| Available | Immediately after signup | After verification review and operator approval ([going live](going-live.md)) |
| API key prefix | `sk_test_` | `sk_live_` |
| Delivery | Simulated by a built-in mock provider. Nothing reaches a handset. | Real carriers through the platform's providers |
| Cost | Messages are priced at `0` | Charged from the prepaid live wallet at the price locked when the message is accepted |
| Wallet | Practice balance of 10,000.00 in your workspace currency, reset daily | Funded by card, mobile money or bank transfer |
| Requirement before the first send | The workspace owner's email address must be verified | Everything in [going live](going-live.md) |

The environment is never a request parameter for API keys: a `sk_test_` key always acts on sandbox data and a `sk_live_` key always acts on live data. Browser sessions choose the environment with the `X-Environment` header (see [authentication](../integrate/authentication.md)).

## Workspaces

A workspace is the unit that owns everything: members, API keys, wallets, messages and settings. Signing up creates your user and a first workspace in which you are the owner. One user can belong to several workspaces, with a different role in each.

| Role | Typical use | Can create API keys |
| --- | --- | --- |
| `owner` | Account holder. Accepts legal terms, requests go-live, manages billing | Sandbox and live keys, any scope |
| `admin` | Day-to-day administration | Sandbox and live keys, any scope |
| `developer` | Integration work | Sandbox keys only, from a restricted scope list |
| `finance` | Top-ups, invoices | No |
| `viewer` | Read-only console access | No |

The workspace's registration country fixes its currency. A workspace registered in Kenya (`KE`) uses `KES` for its wallets, prices and invoices.

## Wallets and money

opensms is prepaid. Each workspace has one wallet per environment in its currency.

- When a live message is accepted, its price is **reserved** from the live wallet. The reservation becomes a charge when the message is sent, or is released if you cancel it or it cannot be sent.
- `balance` is what the wallet holds. `reserved` is the part already set aside for accepted messages.
- A live message is refused with `402 Payment Required` when the wallet cannot cover it or when it would exceed the workspace's optional monthly spend cap.
- Money is always a decimal string such as `"1.000000"`, never a floating-point number.

Details are in [billing and wallet](../integrate/billing-and-wallet.md).

## Key concepts

| Term | Meaning |
| --- | --- |
| Workspace | The tenant that owns members, keys, wallets and data. Selected with `X-Workspace-ID` for browser sessions. |
| Environment | `sandbox` or `live`. Fixed by an API key's prefix; chosen with `X-Environment` for sessions. |
| API key | A secret starting `sk_test_` or `sk_live_`, shown once at creation, limited by scopes. Use it from servers only. |
| Session token | A secret starting `sess_`, returned by signup and login, used by the console and for account-level calls such as creating keys. |
| Scope | A permission attached to an API key, such as `messages:write`. See [authentication](../integrate/authentication.md#scopes). |
| Sender ID | The name or number a message appears to come from. It must be approved before use. The sandbox has a platform sender `OPENSMS`. |
| Message status | `queued`, `scheduled`, `held`, `sending`, `sent`, `delivered`, `failed`, `cancelled` or `expired`. See the [lifecycle](../integrate/sending-messages.md#status-lifecycle). |
| Attempt | One submission of a message to a provider route. A message can have several if a fallback route is used. |
| Segment (part) | One SMS unit. Long or non-GSM text is split into several parts and each part is billed. |
| Traffic type | `transactional` (default), `otp` or `marketing`. Affects rate limits, quiet hours and compliance rules. |
| Idempotency key | The `Idempotency-Key` header that makes a retry safe. Required on every create call. See [rate limits and idempotency](../integrate/rate-limits-and-idempotency.md). |
| Webhook | An HTTPS endpoint of yours that receives signed event deliveries. |
| Delivery report (DLR) | The carrier's confirmation that a message was delivered or failed. It moves a message from `sent` to a final status. |
| Spend cap | An optional monthly limit on live spending, set by the workspace owner. |
| Problem details | The JSON error format (`application/problem+json`) used by every error response. See [errors](../integrate/errors.md). |

## Where to go next

1. [Quickstart](quickstart.md): signup, sandbox key and first message in curl, Node and Python.
2. [Authentication](../integrate/authentication.md): sessions, keys, scopes and rotation.
3. [Sending messages](../integrate/sending-messages.md): the full message API.
4. [Going live](going-live.md): the path to real traffic.
