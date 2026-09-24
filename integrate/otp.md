# One-time passcodes (OTP)

The OTP API generates a numeric code, sends it by SMS, and later checks the code your user types in. opensms stores only a hash of the code, so you never handle or store it. This page is for developers adding phone verification or two-step login to their product.

> **Local stack limitation.** Sending an OTP creates an SMS, so on the local docs stack it hits the same email-verification gate as every sandbox send (email delivery is disabled there). The send example below shows that real refusal; the success shape is taken from the handler code (`api/internal/otp/http.go`). Verification errors are real responses.

## How it works

1. Your server calls `POST /v1/otp/send` with the user's phone number. opensms generates the code, sends it as an `otp` traffic message, and returns an `otp_id`.
2. You keep the `otp_id` with the user's pending session.
3. The user types the code. Your server calls `POST /v1/otp/verify` with `otp_id` and the code.
4. `{"valid": true}` means the code matched. Each OTP can succeed once.

Both calls need `messages:write` on an API key (or an owner, admin or developer session with `X-Workspace-ID` and `X-Environment`).

## Send a code

```sh
curl -s -X POST $OPENSMS_API/v1/otp/send \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: signup-7781-otp-1' \
  -d '{"to":"+254700000001","template":"Your Acme code is {{code}}","length":6,"ttl_seconds":300}'
```

| Field | Rules |
| --- | --- |
| `to` | Required. E.164, `^\+[1-9][0-9]{7,14}$`. |
| `template` | Optional. Must contain `{{code}}`. Default text: `Your OpenSMS verification code is <code>`. The rendered text must fit in 1600 characters. |
| `length` | Digits in the code, 4 to 10. Default 6. |
| `ttl_seconds` | Validity, 30 to 86400 seconds. Default 600. |
| `sender_id` | Optional approved sender, as for [messages](sending-messages.md#sender-ids). |

`Idempotency-Key` is required. A retry with the same key and body returns the original response without sending a second SMS or creating a second code.

On success the response is `201` with a single field, `otp_id` (a UUID).

The SMS itself is an ordinary message with `traffic_type` `otp`, so it appears in `GET /v1/messages`, has a status lifecycle, and emits [webhook events](delivery-reports-and-webhooks.md). Its `message.created` event carries only `{id, to}`, never the code.

Before the owner's email is verified (the local docs stack), the send is refused like any sandbox message:

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"email verification is required for sandbox sending"}
```

A template without the placeholder:

```json
{"type":"about:blank","title":"Bad Request","status":400,"detail":"template must contain {{code}}"}
```

## Verify a code

```sh
curl -s -X POST $OPENSMS_API/v1/otp/verify \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"otp_id":"00000000-0000-0000-0000-000000000000","code":"123456"}'
```

For a known OTP the response is always `200` with two fields, `valid` (boolean) and `attempts_left` (integer):

| Situation | Response |
| --- | --- |
| Correct code, first success | `{"valid": true, "attempts_left": <remaining>}` |
| Wrong code | `{"valid": false, "attempts_left": <remaining>}`; each check uses one attempt |
| Expired, out of attempts, or already verified | `{"valid": false, ...}` without using an attempt |
| Unknown `otp_id`, or one from another workspace or environment | `404` |
| `code` shorter than 4 or longer than 10 characters, or no `otp_id` | `400` `"otp_id and code are invalid"` |

Each OTP allows 5 checks. Real response for an unknown ID:

```json
{"type":"about:blank","title":"Not Found","status":404,"detail":"OTP not found"}
```

`/v1/otp/verify` does not take an `Idempotency-Key`.

## Limits

OTP messages use the `otp` per-recipient limit: by default 3 sends per number per 10 minutes, per workspace and environment. A fourth send returns `429` `"message rate limit exceeded"` with `Retry-After`. Retries with the same `Idempotency-Key` do not count again. Operators can set different limits per country or per workspace. See [rate limits and idempotency](rate-limits-and-idempotency.md).

In live, each OTP SMS is billed like any message, and all [admission checks](sending-messages.md#why-a-message-is-refused) apply.

## Good practice

- Show the user the number the code was sent to, and a "resend" option that calls `/v1/otp/send` again with a **new** idempotency key after a delay.
- Keep the `otp_id` server-side. Do not let the browser choose which `otp_id` to verify against.
- Treat `valid: false` with `attempts_left: 0` as "request a new code".
