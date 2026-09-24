# Inbound messages and numbers

This page describes the API surface for receiving SMS: renting a virtual number, attaching inbound rules to it, listing received messages and replying to them. It is for developers planning two-way messaging. Read the status note first: parts of this surface are not yet connected to a working receive path.

## Current status

| Piece | State in the current API code |
| --- | --- |
| Listing available numbers, buying and releasing a number | Implemented, live only |
| Inbound rules on a number (CRUD) | Implemented, live only |
| `GET /v1/inbound` (list received messages) | Implemented, live only |
| `POST /v1/inbound/{id}/reply` | Implemented, live only |
| **Receiving an SMS into `/v1/inbound`** | **Not implemented.** No provider adapter or callback writes received messages; the SMPP adapter states that only delivery receipts are supported. |
| **Executing inbound rules** (`webhook`, `auto_reply`, `forward_email`) | **Not implemented.** Rules are stored and listed, but no code evaluates them. |
| `message.received` event | Not emitted by any code path. |

So on the current build, `GET /v1/inbound` returns an empty list unless an operator inserts records by other means, and inbound rules have no effect. Plan two-way features with that in mind, and check with your OpenSMS contact before relying on them.

## Numbers

All number endpoints accept API keys (`numbers:read`, `numbers:manage`) or sessions with `X-Workspace-ID` and `X-Environment`. Every member can read; only owners and admins with two-factor authentication (or `numbers:manage` keys) can buy, release or change rules. In the sandbox, reads return empty collections and changes return `422`.

| Call | Purpose |
| --- | --- |
| `GET /v1/numbers/available?country=KE&kind=long_code` | Up to 200 numbers for sale, cheapest first. `kind` is `long_code`, `short_code` or `toll_free`. |
| `POST /v1/numbers` `{country, kind}` | Buy (assign) a number. `Idempotency-Key` required. The monthly fee is charged to the live wallet and counts against the spend cap (`402` if it would exceed it). |
| `GET /v1/numbers` | Your numbers, with `monthly_fee`, `fee_currency`, `status` (`assigned`, `releasing`), `inbound`, `outbound`, `assigned_at`, `renews_at`. |
| `DELETE /v1/numbers/{id}` | Request release. The number stays `releasing` until the provider confirms. Repeating is safe. |
| `GET`, `POST /v1/numbers/{id}/rules` | List or create inbound rules. |
| `PUT`, `DELETE /v1/numbers/{id}/rules/{rule_id}` | Replace or delete a rule. |

Real sandbox responses:

```sh
curl -s "$OPENSMS_API/v1/numbers/available?country=KE&kind=long_code" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```json
[]
```

```sh
curl -s "$OPENSMS_API/v1/numbers/00000000-0000-0000-0000-000000000000/rules" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"This operation requires the live environment."}
```

### Inbound rules

A rule has `match` (`keyword`, `prefix`, `regex` or `any`), a `pattern` (required unless `match` is `any`), an `action` (`webhook`, `auto_reply` or `forward_email`), a `target` (URL, reply text or email address, up to 2048 characters) and a `position` (0 to 10000, lower first). Rule creation needs an `Idempotency-Key`. As noted above, rules are stored but not executed by the current build.

## Received messages

`GET /v1/inbound` with `messages:read`:

```sh
curl -s $OPENSMS_API/v1/inbound -H "authorization: Bearer $OPENSMS_API_KEY"
```

```json
{"items":[],"next_cursor":null}
```

Each item has `id`, `from`, `to`, `text`, `received_at` and `virtual_number_id`. Paging uses `limit` (1 to 200, default 50) and `cursor`. With a sandbox key the list is always empty.

## Replying

`POST /v1/inbound/{id}/reply` with `messages:write`, an `Idempotency-Key` and `{"text": "..."}` (1 to 1600 characters). The reply is sent from the number the message was received on, back to its sender, through the normal message endpoint: it gets the usual admission checks, billing and a message ID, and returns what `POST /v1/messages` returns. In the sandbox:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"This operation requires the live environment."}
```

## Opt-outs

Recipients who reply with a country's stop keyword should stop receiving your messages. Because inbound receipt is not implemented yet, keep your own opt-out list and add numbers to the suppression list, which every send checks:

```sh
curl -s -X POST $OPENSMS_API/v1/compliance/suppressions \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"e164":"+254700000009","reason":"stop_keyword"}'
```

```json
{"id":40,"e164":"+254700000009","reason":"stop_keyword","created_at":"2026-09-24T07:41:36.890166+03:00"}
```

This needs `compliance:manage` (owner or admin keys only). `reason` is `stop_keyword`, `manual`, `complaint` or `invalid_number`. A send to a suppressed number returns `422` `"destination is suppressed"`. `GET /v1/countries/{iso2}/compliance` (no credentials) lists each country's stop keywords; for Kenya they are `STOP`, `UNSUBSCRIBE` and `END`.
