# Rate limits and idempotency

This page explains the limits the API enforces (per API key and per recipient) and how the `Idempotency-Key` header makes retries safe. It is for developers building send paths that must never double-send and must behave well under load or network failures.

## Rate limits

### Per API key

Every `/v1/` request made with an API key counts against a per-workspace request rate, **50 requests per second by default**, measured over a sliding one-second window per key and environment. Session (console) requests do not count. The limit applies before the endpoint runs, so rejected, invalid and idempotent-replay requests all count.

The workspace's current value is `key_rps_limit` in `GET /v1/workspace` (session only):

```json
{"id": "f98e3f20-d354-493d-b003-c39d945e29db", "name": "Acme Dev", "slug": "workspace-19c21ac8-2986-4694-9cca-78e1ea435f7c", "currency": "KES", "country_id": "a48b6a15-c567-4cd8-9c21-9936054b2c55", "created_at": "2026-09-24T04:13:30.053095+00:00", "deleted_at": null, "kyc_status": "pending", "live_status": "sandbox", "key_rps_limit": 50, "spend_cap_amount": null, "auto_topup_amount": null, "auto_topup_channel": null, "auto_topup_enabled": false, "pinned_provider_id": null, "spend_cycle_anchor": "2026-09-24", "data_retention_days": 30, "default_sender_id_id": null, "low_balance_threshold": null}
```

Only operators can change it. Over the limit you get `429` with `Retry-After` in whole seconds:

```json
{"type":"about:blank","title":"Too Many Requests","status":429,"detail":"API key rate limit exceeded"}
```

In one test, 80 concurrent `GET /v1/wallet` requests with one key gave 58 responses from the endpoint and 22 `429`s with `Retry-After: 1`. The key is verified (an Argon2id hash check) before the limit is applied, so on a heavily loaded server the same burst can spread over more than a second and see no `429` at all; do not rely on the limit as back-pressure, pace your own requests.

### Per recipient

Message admission (single sends, batch rows, OTP, group sends, inbound replies) also limits how often one workspace can message one number, per environment:

| Traffic type | Default limit per destination number |
| --- | --- |
| `transactional`, `marketing` | 5 per hour and 20 per day |
| `otp` | 3 per 10 minutes |

Operators can set other values per country or per workspace. Over the limit the send is refused with `429` `"message rate limit exceeded"` and `Retry-After`. A retry with the same `Idempotency-Key` is not counted twice within 24 hours. These limits are checked in Redis; if Redis is unreachable, sends fail closed with `503` `"rate limiter unavailable"`.

### Other limits

| Limit | Value |
| --- | --- |
| Password login | 8 failures in 30 minutes lock the email (`429`) until fewer than 8 remain in the last 30 minutes; attempts while locked also count |
| Email verification code | One request per minute (`429`, `Retry-After: 60`), 10-minute validity, 5 guesses |
| Email login code | One per 60 seconds, 5 per account per 30 minutes, 10 per IP per minute |
| Two-factor login challenge | 5 wrong codes, 5 minutes |
| OTP verification | 5 checks per OTP |
| Recovery codes | 5 issuances per 10 minutes |
| Batch upload | 1000 rows, 2 MiB |
| Message text | 1600 characters |
| Onboarding documents and payment proofs | 10 MiB |

### Handling 429

1. Read `Retry-After` and wait at least that many seconds.
2. Retry with the **same** `Idempotency-Key`.
3. Add jitter when many workers retry at once, and cap concurrency per key below the key limit.

## Idempotency

Network failures make it impossible to know whether a `POST` reached the server. The `Idempotency-Key` header lets you retry without risk: the first request with a given key does the work and stores its response; later requests with the same key and the same body get the stored response back and change nothing.

### Where it is required

| Endpoint | Max key length |
| --- | --- |
| `POST /v1/messages`, `POST /v1/otp/send`, `POST /v1/messages/batch`, `POST /v1/batches/{id}/start`, `/stop`, `POST /v1/inbound/{id}/reply` | 255 |
| `POST /v1/wallet/topups` | 255 |
| `POST /v1/lookup`, `POST /v1/templates`, `POST /v1/contacts`, `POST /v1/contact-groups`, `POST /v1/contact-groups/{id}/send` | 200 |
| `POST /v1/webhooks`, `/test`, `/replay` | 200 |
| `POST /v1/numbers`, `POST /v1/numbers/{id}/rules`, `POST /v1/workspaces`, `POST /v1/wallet/sandbox-credits`, `POST /v1/wallet/topups/manual` | 200 |

It is optional on `PUT`, `PATCH` and `DELETE /v1/webhooks/{id}`. `POST /v1/otp/verify` and `POST /v1/messages/{id}/cancel` do not use it.

### Rules

- Keys are scoped to the workspace and environment. The same key in sandbox and live are different keys.
- Same key, same body: the original status and body are returned. Same key, different body: `409`.
- The stored response is JSON-equivalent to the original, but key order and spacing can differ. Compare parsed values, not bytes.
- Message and OTP keys are kept for at least 24 hours. Treat every key as single-use forever: never reuse one for a different operation.
- A send **refused** at admission (any `4xx` from the rules in [sending messages](sending-messages.md#why-a-message-is-refused)) does not use up its key. Fix the cause and retry with the same key.

Replaying a batch upload (real responses: the first call, then the identical retry):

```sh
curl -s -X POST $OPENSMS_API/v1/messages/batch -H "authorization: Bearer $OPENSMS_API_KEY" \
  -H 'content-type: application/json' -H 'idempotency-key: idem-demo-batch' \
  -d '{"items":[{"to":"+254700000001","text":"Reminder: your appointment is tomorrow"}]}'
```

```json
{"id":"41014e36-f678-49ae-9132-a6a1c1361308","status":"ready","total":1,"sent":0,"delivered":0,"failed":0,"invalid":0,"duplicates":0,"suppressed":0,"estimated_cost":null,"created_at":"2026-09-24T07:46:26.388001+03:00"}
```

```json
{"id": "41014e36-f678-49ae-9132-a6a1c1361308", "sent": 0, "total": 1, "failed": 0, "status": "ready", "invalid": 0, "delivered": 0, "created_at": "2026-09-24T07:46:26.388001+03:00", "duplicates": 0, "suppressed": 0, "estimated_cost": null}
```

Same batch ID, no second batch. The same key with a different recipient:

```json
{"type":"about:blank","title":"Conflict","status":409,"detail":"Idempotency-Key was already used with a different request"}
```

The `409` detail wording differs by endpoint. Real examples: webhooks `"Idempotency-Key was used with different input."`, templates `"Idempotency key used with different template details."`, lookup `"idempotency_conflict"`.

### Choosing keys

Derive the key from the business event, not from the attempt:

| Operation | Good key |
| --- | --- |
| Shipping notification | `order-A-1001-shipped` |
| Signup OTP, first send | `signup-7781-otp-1` (use `-otp-2` for a deliberate resend) |
| Nightly batch | `digest-2026-09-24` |

A random UUID per request protects only against retries inside one process. A key derived from your data also protects against a crash and restart between sending and recording the result.

## AI assistants (MCP)

Connections from AI assistants have their own limits on top of the ones above: 120 MCP requests a minute and, by default, 10 spending calls a minute per connection (5, 10, 30 or 60, chosen on the consent screen), plus an optional daily spend cap per connection. Their spending tools are idempotent too: a caller key is kept for 24 hours, and without one the same content to the same number from the same connection is sent once within 10 minutes. Not in production yet; see [AI assistants (MCP)](mcp.md#limits).

## Related

- [Errors](errors.md) for which statuses are safe to retry.
- [OTP](otp.md#limits) for the OTP limits in context.
- [AI assistants (MCP)](mcp.md#idempotency) for idempotency in assistant tool calls.
