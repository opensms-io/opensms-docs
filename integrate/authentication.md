# Authentication

OpenSMS has two kinds of bearer credential: **session tokens** for people (the console, account setup, key management) and **API keys** for your servers. This page explains when to use each, how workspace and environment are selected, what each key scope unlocks, and how to rotate and revoke keys. It is for developers wiring OpenSMS into a backend.

Both credentials go in the same header:

```http
Authorization: Bearer sk_test_OHtA3aYT...
```

## Which credential to use

| Task | Session (`sess_`) | API key (`sk_test_` / `sk_live_`) |
| --- | --- | --- |
| Send and read messages, batches, OTP | Yes (owner, admin, developer can send) | Yes, with scopes |
| Lookup, templates, contacts, webhooks, wallet balance, pricing, analytics | Yes | Yes, with scopes |
| Realtime WebSocket | Yes | Yes, with `realtime:read` |
| Create, list, rotate or revoke API keys | **Only** | No |
| Team members, invitations, legal acceptance, onboarding, go-live | **Only** | No |
| Spend cap, retention, routing settings, invoices, sandbox practice credits, bank-transfer top-ups | **Only** | No |

Use API keys from servers only. Never ship one in a browser or mobile app: anyone who has it can send messages billed to your wallet.

## Session tokens

A session is created by:

| Call | Result |
| --- | --- |
| `POST /v1/auth/signup` | `201` and a session (see the [quickstart](../getting-started/quickstart.md#1-create-an-account-and-workspace)) |
| `POST /v1/auth/login` `{email, password}` | `201` and a session, or `202` with a two-factor challenge |
| `POST /v1/auth/login/2fa` `{challenge_token, code}` | `201` and a session |
| `POST /v1/auth/login/code` then `/v1/auth/login/code/verify` | Passwordless login by emailed code (needs email delivery) |

The `token` field (`sess_...`) is the bearer credential. A session expires after **30 minutes without an authenticated request** or **30 days after it was issued**, whichever comes first. Every authenticated HTTP request pushes the idle deadline forward; the absolute deadline never moves. `expires_at` in the response is the absolute deadline.

Eight failed password attempts within 30 minutes lock the email (`429` `"login temporarily locked"`) until fewer than eight failures fall inside the last 30 minutes. Attempts made while locked count as failures too, so keep retrying and the lock keeps extending. A wrong password returns `401` `"invalid email or password"`.

Other session endpoints: `GET /v1/me` (who am I, plus the workspace named in `X-Workspace-ID`), `GET /v1/workspaces` (your memberships), `GET /v1/auth/sessions`, `DELETE /v1/auth/sessions/{id}`, and `POST /v1/auth/logout` (revokes the current session, `204`). Password reset (`POST /v1/auth/password/forgot`, `POST /v1/auth/password/reset`) emails a link, so it needs email delivery; see the [authentication reference](../reference/api/authentication.md) for it and for authenticator replacement (`/v1/auth/2fa/recovery-enrollment`).

### Selecting workspace and environment

A session belongs to a user, not to a workspace, so workspace-scoped calls must name the workspace, and most also name the environment:

```http
Authorization: Bearer sess_YXFMj1PC...
X-Workspace-ID: f98e3f20-d354-493d-b003-c39d945e29db
X-Environment: sandbox
```

`X-Workspace-ID` must be a workspace where you are an active member. `X-Environment` is `sandbox` or `live`. Some workspace-wide settings (keys, legal, onboarding, spend cap) need only `X-Workspace-ID`.

What you get without them depends on the endpoint. Real responses:

```sh
curl -s $OPENSMS_API/v1/messages -H "authorization: Bearer $SESSION"
```

```json
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"session requests require X-Workspace-ID and X-Environment (sandbox or live)"}
```

Other endpoints answer `400` `"A valid X-Workspace-ID header is required."` for a missing or malformed header and `403` `"You do not have access to this workspace."` for a workspace you do not belong to.

## API keys

An API key looks like `sk_test_` or `sk_live_` followed by 32 random characters. It belongs to one workspace and one environment, both fixed when the key is created:

- `sk_test_` keys act on sandbox data only. Any workspace member who can create keys can create them.
- `sk_live_` keys act on live data only. Only owners and admins can create them.

Because the key already carries its workspace and environment, **do not send `X-Workspace-ID` or `X-Environment` with a key**. Most endpoints ignore them. Batches, lookup and inbound reject a value that differs from the key's own, for example:

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"Lookup scope or context denied."}
```

The server stores only an Argon2id hash of the key. The secret is shown once, in the create or rotate response. `GET /v1/keys` returns metadata only:

```json
{
  "items": [
    {
      "id": "71428789-fac6-4d24-bc50-fcf47fad2828",
      "prefix": "sk_test_",
      "label": "rotate me",
      "scopes": ["messages:read", "messages:write"],
      "created_at": "2026-09-24T07:27:28.535943+03:00",
      "last_used_at": null
    }
  ],
  "next_cursor": "eyJpZCI6ImY1ODUw..."
}
```

`last_used_at` is updated every time the key authenticates, even if the call is then refused. Owners and admins see all keys; developers see sandbox keys only.

### Creating a key

```sh
curl -s -X POST $OPENSMS_API/v1/keys \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -H 'content-type: application/json' \
  -d '{"label":"orders service","test":true,"scopes":["messages:read","messages:write","webhooks:manage"]}'
```

| Field | Rules |
| --- | --- |
| `label` | Required, 1 to 128 characters. |
| `test` | `true` for a sandbox key. Defaults to `false` (live). Developers must send `true`, or get `403` `"Developers can create sandbox keys only."` |
| `scopes` | Optional. Defaults to `["messages:read","messages:write"]`. Wildcards are not accepted. |

The response is `201` with `key` (the secret) and `key_info` (the metadata above):

```json
{"key":"sk_test_8Dn2PayU...","key_info":{"id":"6466cef1-bbfd-4590-8c9c-ab521b9ae39d","prefix":"sk_test_","label":"orders service","scopes":["messages:read","messages:write","webhooks:manage"],"created_at":"2026-09-24T07:43:21.289773+03:00","last_used_at":null}}
```

## Scopes

Ask the server which scopes you may grant, instead of hardcoding the list. `GET /v1/keys/scopes` (session and `X-Workspace-ID`) returns, for an owner:

```json
{
  "environments": ["sandbox", "live"],
  "scopes": [
    "analytics:read", "compliance:manage", "compliance:read", "contacts:manage", "keys:admin",
    "lookup:read", "lookup:request", "messages:read", "messages:write", "numbers:manage",
    "numbers:read", "pricing:read", "realtime:read", "sender-ids:read", "sender-ids:write",
    "senders:manage", "templates:manage", "wallet:read", "wallet:topup", "wallet:write",
    "webhooks:manage", "webhooks:read", "webhooks:write"
  ]
}
```

A developer gets `"environments": ["sandbox"]` and only the scopes marked "yes" in the developer column below. Finance members and viewers cannot manage keys (`403`).

| Scope | Unlocks | Developer may grant |
| --- | --- | --- |
| `messages:read` | `GET /v1/messages`, `/v1/messages/{id}`, `/attempts`, batch reads, `GET /v1/sandbox/messages`, `GET /v1/inbound` | yes |
| `messages:write` | `POST /v1/messages`, cancel, batch create, start and stop, OTP send and verify, inbound reply | yes |
| `lookup:request` | `POST /v1/lookup` | yes |
| `lookup:read` | `GET /v1/lookup/{id}` | yes |
| `templates:manage` | `/v1/templates` (all methods); also needed to send a contact group with `template_id` | yes |
| `contacts:manage` | `/v1/contacts`, `/v1/contact-groups`; sending to a group also needs `messages:write` | yes |
| `webhooks:read` | Read webhook endpoints and deliveries | yes |
| `webhooks:write` | Create, change, delete, test and replay webhooks (also allows reads) | yes |
| `webhooks:manage` | Legacy: everything `webhooks:read` and `webhooks:write` allow | yes |
| `analytics:read` | `/v1/analytics/*` | yes |
| `pricing:read` | `GET /v1/pricing` | yes |
| `realtime:read` | The `/v1/realtime` WebSocket | yes |
| `sender-ids:read` | Sender ID drafts and fee quotes | yes |
| `sender-ids:write` | Create and change sender ID drafts (also allows reads) | no |
| `senders:manage` | Legacy: list, request, amend and delete sender IDs | no |
| `wallet:read` | `GET /v1/wallet`, `GET /v1/wallet/ledger` | no |
| `wallet:topup` | `POST /v1/wallet/topups` | no |
| `wallet:write` | Legacy alias accepted for top-ups | no |
| `numbers:read` | `GET /v1/numbers`, available numbers, number rules | no |
| `numbers:manage` | Buy and release numbers, change number rules | no |
| `compliance:read` | `GET /v1/compliance/suppressions`, `GET /v1/content-rules` | no |
| `compliance:manage` | Add suppressions | no |
| `keys:admin` | Accepted when creating a key, but no endpoint currently accepts it: key management is session only | no |

A key without the needed scope is refused. The status is `403` on most endpoints (for example `"wallet access denied"`), but the message and OTP endpoints answer `401` with `"insufficient scope"`.

Invalid scope requests fail with `400` and a code:

```json
{
  "errors": { "scopes": ["Duplicate scope: messages:read", "Unsupported scope: sms:send"] },
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Select supported scopes allowed for your role. See GET /v1/keys/scopes for available scopes.",
  "code": "unsupported_key_scope"
}
```

`code` is `unsupported_key_scope` if any scope is unknown, otherwise `key_scope_not_allowed` if your role cannot grant one, otherwise `duplicate_key_scope`.

## Rotating a key

`POST /v1/keys/{id}/rotate` (owner or admin session) issues a new secret with the same label, scopes and environment, and schedules the old key to expire in 24 hours. Deploy the new secret within that window.

```sh
curl -s -X POST $OPENSMS_API/v1/keys/f5850170-a747-4f76-b91f-31531ab2d34d/rotate \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE"
```

```json
{
  "key": "sk_test_94a2ou40...",
  "key_info": {
    "id": "71428789-fac6-4d24-bc50-fcf47fad2828",
    "prefix": "sk_test_",
    "label": "rotate me",
    "scopes": ["messages:read", "messages:write"],
    "created_at": "2026-09-24T07:27:28.535943+03:00",
    "last_used_at": null
  }
}
```

The old key now lists `"expires_at": "2026-09-25T07:27:28.535943+03:00"` and keeps working until then. A key can be rotated once; rotating it again returns `409` `"This key has already been rotated."` Rotate the new key instead.

## Revoking a key

`DELETE /v1/keys/{id}` (owner or admin session) returns `204` and the key stops working immediately. Revoking it again also returns `204`; an unknown ID returns `404`. A request with a revoked, expired or made-up key gets:

```json
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"missing or invalid API key"}
```

Developers cannot rotate or revoke keys (`403`). Deleting a workspace or banning its only owner revokes its keys.

## Two-factor authentication

Any user can add an authenticator app (TOTP, 6 digits, 30-second steps):

1. `POST /v1/auth/2fa/setup` returns `secret` and an `otpauth_uri` for a QR code:

   ```json
   {"otpauth_uri":"otpauth://totp/OpenSMS:capture-57700-1-36@opensms.test?secret=EZ5V5LVE...&issuer=OpenSMS","secret":"EZ5V5LVE..."}
   ```

2. `POST /v1/auth/2fa/enable` with `{"code":"123456"}` from the app returns `{"enabled":true}`.
3. `POST /v1/auth/2fa/recovery-codes` with a current `{"code":"..."}` returns ten recovery codes (`rc_` followed by 32 hex characters) once. Store them for when the device is lost; a new set invalidates the old one.

After that, `POST /v1/auth/login` returns `202` and no session:

```json
{"challenge_token":"challenge_B6qP2obF...","expires_at":"2026-09-24T04:32:29.316774Z","two_factor_required":true}
```

Complete it with `POST /v1/auth/login/2fa` and `{"challenge_token":"...","code":"123456"}` (or `"recovery_code"`) to get the normal `201` session. The challenge lasts five minutes, allows five wrong codes, works once, and cannot be used as a bearer token.

What two-factor changes:

| Area | Effect |
| --- | --- |
| API keys | None. Keys keep working and are never asked for a code. |
| Login | Password or email code is followed by the authenticator challenge. |
| Going live | Every active owner and finance member must have it before an operator can activate the workspace. |
| Live owner and finance members | Cannot turn it off (`POST /v1/auth/2fa/disable` returns `409`). |
| Session-only money actions | Bank-transfer top-ups, auto top-up settings, number purchases and releases, number rules, and live lookups by owners need it. |

## AI assistants

AI assistants do not use either credential. They connect to the OpenSMS MCP server with OAuth: you approve each one on a consent screen, choose one workspace and one environment, and pick from seven of the API key scopes (`messages:read`, `messages:write`, `pricing:read`, `sender-ids:read`, `lookup:read`, `lookup:request`, `wallet:read`). The assistant's access token (`osm_at_...`) only works on the MCP server, and the REST API rejects it. Tool calls are checked against the same scopes as an API key. Not in production yet; see [AI assistants (MCP)](mcp.md).

## Related

- [AI assistants (MCP)](mcp.md) for OAuth access for Claude, ChatGPT, Cursor and other assistants.
- [Errors](errors.md) for every `401` and `403` shape.
- [Rate limits and idempotency](rate-limits-and-idempotency.md) for per-key limits.
- [Realtime](realtime.md) for WebSocket authentication.
