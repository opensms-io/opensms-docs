# Sending messages

This page covers everything about outbound SMS through the API: single sends, scheduling and cancellation, batches, sender IDs, encoding and segments, the status lifecycle and delivery attempts. It is for developers building the sending side of an integration. Authentication is covered in [authentication](authentication.md); status notifications in [delivery reports and webhooks](delivery-reports-and-webhooks.md).

## Send one message

`POST /v1/messages` with a key that has `messages:write` (or an owner, admin or developer session with `X-Workspace-ID` and `X-Environment`).

```sh
curl -s -X POST $OPENSMS_API/v1/messages \
  -H "authorization: Bearer $OPENSMS_API_KEY" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: order-1001-shipped' \
  -d '{"to":"+254700000001","text":"Your order A-1001 has shipped.","traffic_type":"transactional","metadata":{"order_id":"A-1001"}}'
```

Once the workspace owner has verified their email, this returns `201 Created` with the message ([response fields](#response)). Before that, every send is refused:

```http
HTTP/1.1 403 Forbidden
X-Request-Id: ff1b164b-66dc-42c9-ab6d-16ef10a733b5

{"type":"about:blank","title":"Forbidden","status":403,"detail":"email verification is required for sandbox sending"}
```

### Request

| Field | Type | Rules |
| --- | --- | --- |
| `to` | string | Required. E.164 with a leading `+`, 8 to 15 digits: `^\+[1-9][0-9]{7,14}$`. |
| `text` | string | Required, 1 to 1600 characters. |
| `sender_id` | string | Optional. An approved sender value: up to 11 characters, or up to 15 digits if numeric. Omit it to use the default sender (see [sender IDs](#sender-ids)). |
| `traffic_type` | string | `transactional` (default), `otp` or `marketing`. |
| `scheduled_at` | string | Optional RFC 3339 time. The message is held as `scheduled` until then. |
| `metadata` | object | Optional JSON object, stored and returned with the message. Not sent to the handset. |
| `callback_url` | string | Accepted and stored, but **not called** by the current API: no code delivers to a per-message callback URL. Use [webhooks](delivery-reports-and-webhooks.md). |

Unknown fields are rejected with `400` `"invalid JSON"`. The `Idempotency-Key` header is required (1 to 255 characters); see [rate limits and idempotency](rate-limits-and-idempotency.md).

### Response

`201 Created` with the message. Fields:

| Field | Meaning |
| --- | --- |
| `id` | Message UUID. |
| `status` | `queued`, or `scheduled` when `scheduled_at` is set, or `held` when a content rule needs review. |
| `status_reason` | Why the status is what it is, when relevant (for example `cancelled_by_client`, `carrier_rejected`). Omitted when empty. |
| `to`, `text`, `sender_id`, `traffic_type`, `metadata`, `scheduled_at` | As stored. `sender_id` is the resolved sender even if you omitted it. |
| `encoding` | `gsm7` or `ucs2`. |
| `parts` | Number of billed segments. |
| `price`, `currency` | The locked customer price for all parts. `0` in the sandbox. |
| `country_iso2`, `country_name`, `country_id` | Destination country resolved from the number prefix, or null. |
| `carrier_id`, `carrier_name` | Carrier when it can be inferred, or null. In countries with number portability the sandbox never claims a carrier. |
| `destination_source` | How the destination was resolved: `prefix`, `hlr` or `unknown`. |
| `created_at`, `sent_at`, `delivered_at`, `failed_at`, `cancelled_at` | Timestamps; the ones that do not apply are omitted or null. |
| `billing` | On reads: per-currency `reserved_amount`, `charged_amount`, `refunded_amount`. Empty in the sandbox. |

Retrying with the same `Idempotency-Key` and the same body returns the stored response with its original status code. The same key with a different body returns `409` `"Idempotency-Key was already used with a different request"`.

## Read, list and cancel

| Call | Scope | Notes |
| --- | --- | --- |
| `GET /v1/messages/{id}` | `messages:read` | `404` `"message not found"`; a malformed ID returns `400` with `"code":"invalid_message_id"`. |
| `GET /v1/messages` | `messages:read` | Newest first. Filters below. |
| `GET /v1/messages/{id}/attempts` | `messages:read` | Delivery attempts, see [attempts](#delivery-attempts). |
| `POST /v1/messages/{id}/cancel` | `messages:write` | Only `queued` or `scheduled` messages. Otherwise `409` `"message cannot be cancelled in its current state"`. |

List filters (each at most once):

| Query | Meaning |
| --- | --- |
| `limit` | 1 to 100, default 20. |
| `cursor` | The previous page's `next_cursor`. Keep the other filters unchanged while paging. |
| `status` | One status value. An unknown value returns `400` `"invalid status"`. |
| `to` | Digits (optionally starting with `+`) contained in the recipient number. |
| `country` | Uppercase ISO2 code, for example `KE`. |
| `date_from`, `date_to` | `YYYY-MM-DD` or RFC 3339. A date in `date_to` includes that whole UTC day; a timestamp is exclusive. |

```sh
curl -s "$OPENSMS_API/v1/messages?status=delivered&country=KE&limit=10" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```json
{"items":[],"next_cursor":null}
```

`GET /v1/sandbox/messages` lists the sandbox outbox with rendered text, for debugging. It returns the same `{items, next_cursor}` page.

## Scheduling

Set `scheduled_at` to a future RFC 3339 time. The message is accepted immediately with `status` `scheduled` (and, in live, its price is reserved now). It is dispatched when the time passes. Until then you can cancel it with `POST /v1/messages/{id}/cancel`, which releases any reservation and records `status_reason` `cancelled_by_client`.

Quiet hours can also schedule a message for you: if a country has quiet hours for the traffic type in `defer` mode, a message sent during them is accepted as `scheduled` for the end of the quiet period.

## Encoding and segments

The server picks the encoding from the text and counts billed parts:

| Encoding | When | One part | Each part of a long message |
| --- | --- | --- | --- |
| `gsm7` | Every character is in the GSM 03.38 basic set or its extension | 160 characters | 153 characters |
| `ucs2` | Any other character (accents outside GSM, emoji, non-Latin scripts) | 70 characters | 67 characters |

- GSM extension characters `^ { } \ [ ~ ] | €` and form feed count as two.
- In UCS-2, characters outside the Basic Multilingual Plane (most emoji) count as two.
- A two-unit character is never split across parts.
- `text` can be up to 1600 characters, and each part is billed. One emoji switches the whole message to UCS-2, cutting a part from 160 to 70 characters.

## Sender IDs

A sender ID is what the recipient sees as the sender. It must be approved. `GET /v1/sender-ids` lists them (keys need `senders:manage` or `sender-ids:read`); a new sandbox workspace has only the platform sender:

```json
{"items":[{"id":"222ff8e6-1629-48a9-9181-ee110d2e6ad5","value":"OPENSMS","kind":"alphanumeric","countries":[],"use_case":"transactional","status":"approved","restricted":false,"created_at":"2026-09-24T07:08:21.163602+03:00"}],"next_cursor":null}
```

When you omit `sender_id`, the server uses, in order: the workspace's approved default sender; the approved default sender of a healthy route for the destination; in the sandbox only, the platform sender `OPENSMS`. If none applies the send fails with `422` `"no approved default sender_id is configured"`. A `sender_id` that is not approved for your workspace fails with `422` `"sender_id is not approved for this workspace"`.

Requesting your own sender ID is part of [going live](../getting-started/going-live.md#10-get-a-sender-id-approved).

## Traffic types

| Type | Use for | Differences |
| --- | --- | --- |
| `transactional` | Receipts, alerts, notifications | Default. Per-recipient limit 5 per hour and 20 per day by default. |
| `otp` | Passcodes | Per-recipient limit 3 per 10 minutes by default. Set automatically by the [OTP API](otp.md). |
| `marketing` | Promotions | Checked against the country's do-not-disturb registry. Usually stricter quiet hours. |

Content rules can apply to specific traffic types. `GET /v1/content-rules` (key scope `compliance:read`) lists the enabled rules; `GET /v1/countries/{iso2}/compliance` (no credentials) shows a country's quiet hours, stop keywords and rules. For Kenya:

```sh
curl -s $OPENSMS_API/v1/countries/KE/compliance
```

```json
{"iso2":"KE","name":"Kenya","status":"active","dial_code":"+254","stop_keywords":["STOP","UNSUBSCRIBE","END"],"quiet_hours":[{"traffic_type":"marketing","start_local":"21:00:00","end_local":"08:00:00","enforce":"defer"}],"content_rules":[{"kind":"blocked_keyword","pattern":"loan","action":"hold_for_review","traffic_types":["marketing","transactional"],"enabled":true},{"kind":"blocked_keyword","pattern":"betting","action":"hold_for_review","traffic_types":["marketing","transactional"],"enabled":true},{"kind":"blocked_keyword","pattern":"casino","action":"hold_for_review","traffic_types":["marketing","transactional"],"enabled":true},{"kind":"blocked_keyword","pattern":"mkopo","action":"hold_for_review","traffic_types":["marketing","transactional"],"enabled":true}]}
```

So a marketing message to Kenya sent at 22:00 Nairobi time is accepted as `scheduled` for 08:00, and any message containing "loan" is `held` for review.

## Status lifecycle

| Status | Meaning | Final |
| --- | --- | --- |
| `queued` | Accepted and waiting for dispatch | no |
| `scheduled` | Waiting for `scheduled_at` or the end of quiet hours | no |
| `held` | Matched a `hold_for_review` content rule; an operator must release or reject it | no |
| `sending` | Being submitted to a provider | no |
| `sent` | Accepted by a provider; waiting for the delivery report | no |
| `delivered` | The carrier confirmed delivery | yes |
| `failed` | Rejected by the provider or the carrier reported failure | yes |
| `expired` | No delivery report arrived in time, or held too long | yes |
| `cancelled` | Cancelled by you, by stopping its batch, or by an operator rejecting a held message | yes |

Allowed transitions:

```text
queued    -> sending | scheduled | held | cancelled
scheduled -> queued | sending | held | cancelled
held      -> queued | cancelled | expired
sending   -> sent | failed | expired
sent      -> delivered | failed | expired
```

In the **sandbox**, the mock provider moves a message straight from `queued` to `delivered`, `failed` or `expired` depending on the number; see the table in the [quickstart](../getting-started/quickstart.md#5-check-the-status).

In **live**, the price is reserved when the message is accepted. It becomes a charge when a provider accepts the submission (`sent`), and is released if the message is cancelled or no provider accepts it. A message that fails after `sent` has already been charged.

To contest a `held` message, contact support with the message ID; there is no customer release endpoint.

## Delivery attempts

`GET /v1/messages/{id}/attempts` returns a bare array ordered by `sequence`, empty until the first submission. Each attempt:

| Field | Meaning |
| --- | --- |
| `id`, `sequence` | Attempt identity and order. |
| `route_id`, `route_name` | The route used; the name reads `provider / country ISO2 / carrier` (or `All carriers`). |
| `provider`, `provider_message_id` | The provider and its reference. |
| `status` | `submitting`, `submission_unknown`, `submitted`, `not_accepted`, `delivered`, `failed` or `expired`. |
| `error_code` | Safe classification, see below. |
| `price`, `currency` | The customer price quoted on this attempt. Do not add attempt prices together; use the message's `billing`. |
| `submitted_at`, `dlr_at`, `submit_latency_ms`, `dlr_latency_ms` | Timing. |

Submission error codes: `recipient_opted_out`, `provider_risk_hold`, `provider_invalid_sender`, `invalid_recipient`, `unsupported_destination`, `provider_insufficient_balance`, `provider_no_route`, `provider_gateway_rejected`, `provider_unauthorized`, `provider_invalid_request`, `provider_rejected`. Opt-out, risk hold, invalid recipient and invalid request never retry or fall back. Other rejections try another route only if the workspace has allowed route fallback (owners and admins set this with `PUT /v1/settings/routing`). A `submission_unknown` attempt is never retried automatically, to avoid double sends. After a delivery report the code is `delivery_failed` or `delivery_expired`. Sandbox attempts carry the mock's codes `carrier_rejected` and `dlr_timeout`.

## Batches

Batches send up to 1000 messages from one upload. Uploading only stages and validates; nothing is sent until you start the batch.

### 1. Upload

`POST /v1/messages/batch` with `messages:write` and an `Idempotency-Key`. Three body formats are accepted, up to 2 MiB:

| Content type | Body |
| --- | --- |
| `application/json` | `{"items":[{"to":"...","text":"...","sender_id":"...","traffic_type":"...","metadata":{}}],"dedupe":true}` |
| `text/csv` | UTF-8 CSV with a header row. `to` and `text` columns are required; `sender_id`, `traffic_type`, `callback_url` and `metadata` are optional. |
| `multipart/form-data` | A CSV file in any file field, plus optional `dedupe=false`. |

`dedupe` (default `true`) marks repeated rows as duplicates.

```sh
curl -s -X POST $OPENSMS_API/v1/messages/batch \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: b-1' \
  -d '{"items":[{"to":"+254700000001","text":"Sale starts now"},{"to":"+254700000101","text":"Sale starts now"},{"to":"+254700000001","text":"Sale starts now"},{"to":"0712","text":"x"}]}'
```

`202 Accepted`:

```json
{"id":"21553ee4-fa11-42cb-b085-0b86c208deaf","status":"ready","total":4,"sent":0,"delivered":0,"failed":0,"invalid":2,"duplicates":1,"suppressed":0,"estimated_cost":null,"created_at":"2026-09-24T07:27:23.965346+03:00"}
```

The same CSV upload:

```sh
printf 'to,text,traffic_type\n+254700000001,Flash sale today,marketing\n+254700000002,Flash sale today,marketing\n' > sale.csv
curl -s -X POST $OPENSMS_API/v1/messages/batch -H "authorization: Bearer $OPENSMS_API_KEY" \
  -H 'content-type: text/csv' -H 'idempotency-key: csv-1' --data-binary @sale.csv
```

```json
{"id":"17869103-e8e0-49b0-beea-ebaac26f19ac","status":"ready","total":2,"sent":0,"delivered":0,"failed":0,"invalid":0,"duplicates":0,"suppressed":0,"estimated_cost":null,"created_at":"2026-09-24T07:36:46.582909+03:00"}
```

### 2. Check validation

`GET /v1/batches/{id}/validation`:

```json
{
  "rows": [
    {"row": 1, "item": {"to": "+254700000001", "text": "Sale starts now"}, "valid": true},
    {"row": 2, "item": {"to": "+254700000101", "text": "Sale starts now"}, "valid": true},
    {"row": 3, "item": {"to": "+254700000001", "text": "Sale starts now"}, "error": "duplicate item", "valid": false, "duplicate": true},
    {"row": 4, "item": {"to": "0712", "text": "x"}, "error": "to must be an E.164 phone number", "valid": false}
  ],
  "total": 4, "valid": 2, "invalid": 2, "duplicates": 1, "suppressed": 0
}
```

### 3. Start

`POST /v1/batches/{id}/start` with an `Idempotency-Key`. Each valid row goes through the same admission checks as a single send. Rows that pass become messages and the batch becomes `running`. Rows refused at this point are marked invalid in the validation report with `error` and `rejection_status`; if none pass, the batch becomes `failed`. If the workspace owner has not verified their email yet, every row is refused by the email gate:

```json
{"id":"21553ee4-fa11-42cb-b085-0b86c208deaf","status":"failed","total":4,"sent":0,"delivered":0,"failed":0,"invalid":4,"duplicates":1,"suppressed":0,"estimated_cost":0,"created_at":"2026-09-24T07:27:23.965346+03:00"}
```

and the validation report now shows why:

```json
{"row": 1, "item": {"to": "+254700000001", "text": "hi"}, "error": "email verification is required for sandbox sending", "valid": false, "rejection_status": 403}
```

### 4. Follow and stop

| Call | Notes |
| --- | --- |
| `GET /v1/batches/{id}` | Status and counters. `404` for batches of other workspaces or environments. |
| `GET /v1/batches/{id}/items` | The batch's messages. `status` filter, `limit` 1 to 1000 (default 100), `cursor`. |
| `POST /v1/batches/{id}/stop` | Needs an `Idempotency-Key`. Cancels messages still `queued`, `scheduled` or `held` (`status_reason` `batch_stopped`). Works on `ready` or `running` batches, otherwise `409`. |

```json
{"cancelled":0,"id":"514b2212-134d-4d52-b862-adfe45ecb353","status":"stopped"}
```

Batch statuses: `ready` (uploaded), `running`, `completed` (every admitted message is final), `stopped`, `failed` (nothing admitted). Counters count messages, not segments: `sent` includes delivered, and `failed` includes failed, expired and cancelled. A `batch.completed` event is emitted once when the batch settles.

To send one template to a saved list of contacts, see [contacts and templates](contacts-and-templates.md#sending-to-a-group).

## Why a message is refused

Admission checks run in this order. The status and `detail` are exactly what the API returns.

| Status | `detail` | Cause |
| --- | --- | --- |
| `400` | `to must be an E.164 phone number` | Bad `to`. |
| `400` | `text is required and must be at most 1600 characters` | Empty or too long. |
| `400` | `sender_id must be at most 11 characters or 15 numeric digits` | Bad `sender_id` format. |
| `400` | `invalid traffic_type`, `metadata must be a JSON object`, `invalid JSON` | Bad field or unknown field. |
| `400` | `Idempotency-Key is required and must be at most 255 characters` | Missing header. |
| `401` | `missing or invalid API key`, `insufficient scope`, `missing bearer credential` | Credential problems. |
| `403` | `email verification is required for sandbox sending` | Sandbox, owner email unverified. |
| `403` | `workspace is not approved for live sending` | Live key, workspace not `live`. |
| `403` | `live onboarding requirements are incomplete` | Live, a required onboarding step was reopened. |
| `403` | `live sending is paused pending payment review` | Live, payment review hold. |
| `409` | `Idempotency-Key was already used with a different request` | Key reuse with a new body. |
| `422` | `no approved default sender_id is configured`, `sender_id is not approved for this workspace` | Sender ID. |
| `422` | `destination is suppressed` | The number is on your or the platform suppression list. |
| `422` | `destination is on the do-not-disturb registry` | Marketing to a DND number. |
| `422` | `content rejected by compliance rule <id>` | A `reject` content rule matched. |
| `422` | `message falls within destination quiet hours` | Quiet hours in `reject` mode. |
| `422` | `no eligible live route`, `no verified live price`, `a fresh verified portability lookup is required` | Live routing and pricing. |
| `402` | `wallet has insufficient funds`, `workspace spend cap reached`, `wallet for message currency not found` | Live billing. |
| `429` | `message rate limit exceeded` | Per-recipient limits, with `Retry-After`. |
| `503` | `rate limiter unavailable`, `compliance checks are unavailable` | Temporary; retry with the same key. |

Every admission refusal is recorded, and the response carries its ID in `X-Request-Id`. See [errors](errors.md) for the error format.
