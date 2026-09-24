# Number lookup

Number lookup tells you, for a phone number, its country, its current carrier, whether it was ported and whether it is valid, before you send to it. This page is for developers who want to clean lists, route by carrier or catch bad numbers at signup. Lookups are asynchronous operations: you request one, then read its result.

## Request a lookup

`POST /v1/lookup` with a key that has `lookup:request` (or an owner, admin or developer session with `X-Workspace-ID` and `X-Environment`). `Idempotency-Key` is required (up to 200 characters).

<!-- test:lookup-curl -->
```sh
curl -s -X POST $OPENSMS_API/v1/lookup \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: lookup-1' \
  -d '{"to":"+254700000001"}'
```

Real sandbox response (`200`):

```json
{
  "id": "db365f9f-89a4-439e-845b-2b41c83d3192",
  "state": "completed",
  "country": "KE",
  "carrier": null,
  "ported": null,
  "valid": null,
  "source": "mock",
  "price": "0.000000",
  "currency": "KES",
  "checked_at": "2026-09-24T07:27:19.372266+03:00"
}
```

The status code tells you whether you already have the answer:

| Status | Meaning |
| --- | --- |
| `200` | Completed immediately (always in the sandbox; in live when a fresh cached result exists). |
| `202` | Accepted; `state` is `queued`. Read it later with `GET /v1/lookup/{id}`. |

## Read a lookup

`GET /v1/lookup/{id}` with `lookup:read` (or any member's session). Operations from other workspaces or environments return `404`.

```sh
curl -s $OPENSMS_API/v1/lookup/db365f9f-89a4-439e-845b-2b41c83d3192 -H "authorization: Bearer $OPENSMS_API_KEY"
```

returns the same object as above. You can also subscribe to the `lookup.completed`, `lookup.failed` and `lookup.unknown` [webhook events](delivery-reports-and-webhooks.md#events), which carry the lookup `id`.

## Fields

| Field | Meaning |
| --- | --- |
| `id` | Lookup operation ID. |
| `state` | `queued`, `submitting`, `completed`, `failed` or `unknown`. |
| `country` | ISO2 country resolved from the number. |
| `carrier` | Carrier name, or null. |
| `ported` | `true` or `false` when known, otherwise null. |
| `valid` | `true` or `false` when the source is authoritative. **Null means no validity claim**, including every sandbox result. |
| `source` | `hlr` (network query), `prefix` (numbering plan), `mock` (sandbox), or null. |
| `price`, `currency` | The price fixed when you requested it, in the workspace currency. `0` in the sandbox. |
| `checked_at` | When the result was obtained, or null. |

`unknown` means the provider's outcome is uncertain. It stays readable, it is not retried automatically, and it does not by itself mean you are refunded; contact support if you need it resolved.

## Sandbox and live

| | Sandbox (`sk_test_`) | Live (`sk_live_`) |
| --- | --- | --- |
| Result | Country from the prefix, `source: "mock"`, no carrier, ported or validity claim | From the configured lookup provider or a fresh cache |
| Cost | `0` | The lookup price for the country (see `GET /v1/pricing?product=lookup`), reserved from the wallet and counted against the spend cap |
| Requirements | Any sandbox workspace | Live workspace, a configured lookup provider, a price for the country. An owner's session also needs two-factor authentication. |

## Idempotency

The key is scoped to the workspace and environment. The same key with the same number returns the original operation (same `id`, no second charge). The same key with a different number is refused:

```json
{"type":"about:blank","title":"Conflict","status":409,"detail":"idempotency_conflict"}
```

## Errors

| Status | `detail` | Meaning |
| --- | --- | --- |
| `400` | `Idempotency-Key is required and bounded to 200 characters` | Missing header. |
| `400` | `Expected {to}.` | Body is not `{"to": "..."}` (unknown fields are refused). |
| `401` | `missing or invalid API key` / `Authentication required.` | Bad credential: an unknown, revoked or expired `sk_` key is refused by the shared key check before the lookup handler runs; no credential, or a bearer value that is not a key or session, gets `Authentication required.` |
| `403` | `Lookup scope or context denied.` | Missing scope, or `X-Workspace-ID` / `X-Environment` differs from the key's own. |
| `403` | `workspace_not_live` | Live lookup before the workspace is live. |
| `403` | `Current lookup authorization or live two-factor verification required.` | Role changed, or a live owner without two-factor. |
| `402` | `insufficient_balance`, `insufficient_balance_or_spend_cap` | Live wallet or spend cap. |
| `409` | `idempotency_conflict` | Key reused with a different number. |
| `422` | `invalid_destination` | The number is not valid E.164. |
| `422` | `unresolved_destination_country`, `lookup_price_unavailable` | No country or no price for it. |
| `503` | `lookup_provider_unavailable` | No live lookup provider configured. |

Real responses for a bad number and for a key sent with a conflicting `X-Environment`:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"invalid_destination"}
```

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"Lookup scope or context denied."}
```
