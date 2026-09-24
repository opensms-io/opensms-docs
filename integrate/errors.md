# Errors

Every opensms error response uses the same JSON shape, `application/problem+json` (RFC 9457 problem details). This page describes that shape, what each HTTP status means, every machine-readable `code` the API emits, and which errors are safe to retry. It is for developers writing error handling around the API. All examples are real responses from the local stack.

## The problem shape

```json
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"missing or invalid API key"}
```

| Field | Always present | Meaning |
| --- | --- | --- |
| `type` | yes | `about:blank` for most errors, or `https://api.opensms.io/problems/<code>` when the error has a code. |
| `title` | yes | The HTTP status text, or a short title for typed problems. |
| `status` | yes | The HTTP status, repeated. |
| `detail` | yes | A human-readable explanation. It is stable enough to log and match on for the untyped errors below, but prefer `status` and `code` in logic. |
| `code` | no | A machine-readable code, listed [below](#error-codes). Most errors do not have one yet. |
| `errors` | no | Field-level messages, `{"field": ["message", ...]}`, on validation errors. |

`trace_id` is declared in the OpenAPI schema but no handler sets it. For message and OTP admission refusals, the `X-Request-Id` response header carries the ID of the recorded rejection; quote it when contacting support.

A typed problem with field errors:

```json
{"errors":{"password":["Use a password between 8 and 1024 bytes."]},"type":"about:blank","title":"Bad Request","status":400,"detail":"Correct the highlighted registration fields.","code":"validation_failed"}
```

A typed problem with its own `type` URL:

```json
{"type":"https://api.opensms.io/problems/invalid_message_id","title":"Bad Request","status":400,"detail":"Message ID must be a valid UUID.","code":"invalid_message_id"}
```

Handle errors in this order: check `status`; if `code` is present, branch on it; otherwise use `detail` for logs and user messages.

## Status codes

| Status | Meaning in opensms | Retry? |
| --- | --- | --- |
| `400` | Malformed request: bad JSON, unknown field, missing `Idempotency-Key`, invalid value, missing `X-Workspace-ID` for sessions. | No. Fix the request. |
| `401` | No credential, an invalid, revoked or expired key or session, or (on message, OTP and some session endpoints) a missing scope or header. | No. Fix the credential. |
| `402` | Live money: insufficient wallet funds or the spend cap would be exceeded. | After topping up or raising the cap. |
| `403` | Authenticated but not allowed: wrong role, missing scope, email not verified, workspace not live, key context mismatch. | No. |
| `404` | Unknown route, or an object that does not exist in your workspace and environment. Objects in other workspaces always look like `404`. | No. |
| `405` | Wrong method on some endpoints (for example analytics). | No. |
| `409` | Conflict: idempotency key reused with a different body, duplicate name or number, invalid state change (cancelling a sent message, rotating a rotated key). | No, unless you fix the conflict. |
| `410` | An idempotent replay whose original response is no longer available: a redacted webhook or workspace-creation response, or a group-send snapshot removed by data retention. The operation is not repeated. | No. Use a new `Idempotency-Key` if you really mean a new operation. |
| `413` | Upload too large. | No. |
| `422` | Understood but refused by a business rule: sender ID, suppression, quiet hours, content rule, routing, sandbox-only or live-only operations. | No. |
| `429` | Rate limited. `Retry-After` gives the seconds to wait. | Yes, after `Retry-After`. |
| `500` | Unexpected server error. | Yes, with the same `Idempotency-Key`. |
| `502` | A payment provider call failed. | Yes, with the same `Idempotency-Key`. |
| `503` | A dependency is unavailable (database, rate limiter, lookup provider, email delivery not configured). | Yes, with backoff and the same `Idempotency-Key`. |

Retrying a write with the **same** `Idempotency-Key` is always safe: a request that did complete returns its stored response instead of running twice. See [rate limits and idempotency](rate-limits-and-idempotency.md).

## Error codes

These are all the `code` values found in the customer API handlers.

| `code` | Status | Where | Meaning |
| --- | --- | --- | --- |
| `validation_failed` | 400 | Signup, workspace creation | One or more fields are invalid; see `errors`. |
| `unsupported_key_scope` | 400 | `POST /v1/keys` | A requested scope does not exist. |
| `key_scope_not_allowed` | 400 | `POST /v1/keys` | Your role cannot grant a requested scope. |
| `duplicate_key_scope` | 400 | `POST /v1/keys` | A scope is listed twice. |
| `bad_request` | 400 | Workspace selection, lookup | `"A valid X-Workspace-ID header is required."`, `"Expected {to}."` |
| `invalid_message_id` | 400 | `/v1/messages/{id}` | The ID is not a UUID. |
| `invalid_request` | 400 | Legal acceptance | The acceptance body is invalid. |
| `workspace_required` | 400 | Legal endpoints | `X-Workspace-ID` is missing. |
| `unauthorized` | 401 | Two-factor endpoints | `"Authentication is required."` |
| `authentication_required` | 401 | Legal endpoints | No valid session. |
| `spend_cap_reached` | 402 | Number purchase | The number fee would exceed the spend cap. |
| `forbidden` | 403 | Workspace selection | `"You do not have access to this workspace."` |
| `workspace_membership_required` | 403 | Legal endpoints | You are not an active member of the workspace. |
| `not_found` | 404 | Unknown routes, legal, many objects | `"The requested endpoint was not found."` |
| `legal_version_not_current` | 409 | `POST /v1/legal/accept` | The version is not the current published one. |
| `service_unavailable` | 503 | Legal endpoints | Temporary. |
| `temporarily_unavailable` | 503 | `GET /v1/messages/{id}` | Temporary. |
| `fee_spend_fx_unavailable` | 503 | Number purchase | No recent exchange rate for the fee currency; nothing was charged. |

The key scope codes, with their `errors` array:

```json
{"errors":{"scopes":["Duplicate scope: messages:read","Unsupported scope: sms:send"]},"type":"about:blank","title":"Bad Request","status":400,"detail":"Select supported scopes allowed for your role. See GET /v1/keys/scopes for available scopes.","code":"unsupported_key_scope"}
```

Workspace selection problems for session calls (missing header, then a workspace you do not belong to):

```json
{"type":"https://api.opensms.io/problems/bad_request","title":"Bad Request","status":400,"detail":"A valid X-Workspace-ID header is required.","code":"bad_request"}
```

```json
{"type":"https://api.opensms.io/problems/forbidden","title":"Forbidden","status":403,"detail":"You do not have access to this workspace.","code":"forbidden"}
```

The unknown-route problem:

```json
{"type":"https://api.opensms.io/problems/not_found","title":"Not Found","status":404,"detail":"The requested endpoint was not found.","code":"not_found"}
```

The legal version problem:

```json
{"type":"https://api.opensms.io/problems/legal_version_not_current","title":"Conflict","status":409,"detail":"This legal document version is no longer current. Review and accept the current published version.","code":"legal_version_not_current"}
```

### Codes carried in `detail`

The lookup API puts a machine-readable token in `detail` instead of `code`: `invalid_destination`, `idempotency_conflict`, `workspace_not_live`, `workspace_unavailable`, `insufficient_balance`, `insufficient_balance_or_spend_cap`, `unresolved_destination_country`, `lookup_price_unavailable`, `lookup_provider_unavailable`. See [lookup errors](lookup.md#errors).

```json
{"type":"about:blank","title":"Conflict","status":409,"detail":"idempotency_conflict"}
```

## Common errors by situation

| Situation | Status | `detail` |
| --- | --- | --- |
| No `Authorization` header on `/v1/messages` | 401 | `missing bearer credential` |
| Unknown, revoked or expired key | 401 | `missing or invalid API key` |
| Key lacks the scope (wallet) | 403 | `wallet access denied` |
| Session call without selection headers on `/v1/messages` | 401 | `session requests require X-Workspace-ID and X-Environment (sandbox or live)` |
| API key used on a session-only endpoint (`/v1/keys`) | 401 | `authentication required` |
| API key on sandbox credits or invoices | 401 | `Browser session required.` |
| Unknown field in a message body | 400 | `invalid JSON` |
| Bad phone number | 400 | `to must be an E.164 phone number` |
| Missing idempotency key on a send | 400 | `Idempotency-Key is required and must be at most 255 characters` |
| Owner email not verified, sandbox send | 403 | `email verification is required for sandbox sending` |
| Live key before approval | 403 | `workspace is not approved for live sending` |
| Message not in your workspace | 404 | `message not found` |
| Sandbox-only or live-only operation in the wrong environment | 422 | `This operation requires the live environment.` / `sandbox wallets cannot use payment providers` |
| Too many requests for one key | 429 | `API key rate limit exceeded` |

The full list of message admission refusals is in [sending messages](sending-messages.md#why-a-message-is-refused).

## Differences from the OpenAPI contract

Handle the statuses you actually receive, not only the ones the contract lists:

- `POST /v1/messages` is documented with `400`, `401` and `409`, but also returns `402`, `403`, `422`, `429` and `503` (see the refusal table).
- Missing scopes and missing session headers on the message and OTP endpoints return `401`, not `403` or `400`.
- `POST /v1/inbound/{id}/reply` is documented as `202`, but it forwards to the message endpoint and returns what that returns (`201` on success).
