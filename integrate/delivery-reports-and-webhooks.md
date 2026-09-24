# Delivery reports and webhooks

OpenSMS tells your system about message status changes and other events by POSTing signed JSON to HTTPS endpoints you register. This page covers registering endpoints, the event envelope and the events you will see, verifying signatures with working Node and Python code, retries, and replaying failed deliveries. It is for developers who want delivery reports without polling.

Carrier delivery reports (DLRs) reach OpenSMS from its providers; OpenSMS turns them into message status changes and then into `message.delivered`, `message.failed` and `message.expired` events for your webhooks. You never receive raw provider callbacks.

## Register an endpoint

`POST /v1/webhooks` with a key that has `webhooks:write` or `webhooks:manage` (or an owner, admin or developer session with `X-Workspace-ID` and `X-Environment`). `Idempotency-Key` is required.

```sh
curl -s -X POST $OPENSMS_API/v1/webhooks \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: wh-1' \
  -d '{"url":"https://example.com/hooks/opensms","events":["*"]}'
```

```json
{
  "id": "4da369a4-50a8-4638-8869-db30c3fed46a",
  "url": "https://example.com/hooks/opensms",
  "events": ["*"],
  "enabled": true,
  "consecutive_failures": 0,
  "created_at": "2026-09-24T07:27:25.863942+03:00",
  "secret": "whsec_QYgIvXD7..."
}
```

| Field | Rules |
| --- | --- |
| `url` | Required. `https` only, no credentials, no `#fragment`. At delivery time the host must resolve to public IP addresses only; private, loopback and link-local addresses are refused. |
| `events` | Required, non-empty, no duplicates. Exact event names, or `"*"` for every event. |
| `enabled` | Optional, default `true`. |

An `http://` URL is refused:

```json
{"type":"about:blank","title":"Bad Request","status":400,"detail":"url must be an HTTPS URL without credentials or fragment"}
```

**Save `secret` now.** It is returned only in this response (and in an identical idempotent replay of it) and signs every delivery. Endpoints are per environment: one registered with a sandbox key receives sandbox events only. An endpoint receives events created after it was registered.

Manage endpoints with `GET /v1/webhooks`, `GET`, `PUT`, `PATCH` or `DELETE /v1/webhooks/{id}`. `PUT` and `PATCH` take the same body as create (`url` and `events` required). Changes are refused with `409` while a delivery to the endpoint is in flight, and URL changes are refused while pending or failed deliveries remain. Deleting keeps the delivery history.

## Event envelope

Every delivery body has the same envelope:

| Field | Meaning |
| --- | --- |
| `id` | Event ID. The same event is never delivered with a different ID; use it to deduplicate. |
| `type` | Event name, for example `message.delivered`. |
| `workspace_id`, `environment` | Where the event happened. |
| `created_at` | When the event was recorded. |
| `data` | Event-specific object, see below. |

A real `message.rejected` delivery (a sandbox send refused before email verification):

```json
{
  "id": "ab2cbda0-6bac-4884-aec5-892b4ce15fb1",
  "data": {
    "reason": "email verification is required for sandbox sending",
    "api_key_id": "bca69d0d-e016-40df-afcd-87ba2e1145b0",
    "destination": "+254700000001",
    "environment": "sandbox",
    "http_status": 403,
    "request_key_sha256": "e86454256285103e7d6967ab8818386a9bce5e9ac9fb6b52af48c6f4a621230b",
    "requested_sender_id": ""
  },
  "type": "message.rejected",
  "created_at": "2026-09-24T07:38:39.186457+03:00",
  "environment": "sandbox",
  "workspace_id": "f98e3f20-d354-493d-b003-c39d945e29db"
}
```

A real `lookup.created` delivery:

```json
{"id":"4477b1eb-3428-468a-aba6-e292ecd528f9","data":{"id":"1da8da54-6b46-4a36-9693-1c891eb35ca9"},"type":"lookup.created","created_at":"2026-09-24T07:38:39.321502+03:00","environment":"sandbox","workspace_id":"f98e3f20-d354-493d-b003-c39d945e29db"}
```

The body is sent exactly as stored, with a space after each `:` and `,`. Verify the signature over the raw bytes you received, never over re-serialized JSON.

## Events

Subscribe to the names you need, or `"*"`. The message events you are most likely to use, with their `data`, as written by the API code:

| Event | When | `data` |
| --- | --- | --- |
| `message.created` | A message was accepted | Single sends: the full message object. OTP: `{id, to}`. Batch rows: `{id, batch_id, status}`. Route fallback: `{id, reason: "fallback_selected"}` |
| `message.rejected` | A send was refused at admission | `{reason, http_status, destination, requested_sender_id, api_key_id, environment, request_key_sha256}`. The refusal's `X-Request-Id` is not in the webhook body; it is the `aggregate_id` of the [realtime](realtime.md) event |
| `message.sent` | A provider accepted the submission (live) | `{id, status, reason}` |
| `message.delivered` | Delivered | Live: `{id, status, reason}`. Sandbox: `{id, status, error_code, provider_message_id, occurred_at}` |
| `message.failed` | Failed | Same shapes as `message.delivered` |
| `message.expired` | No delivery report in time | Same shapes as `message.delivered` |
| `message.cancelled` | Cancelled by you or by stopping its batch | The full message object |
| `message.held`, `message.scheduled`, `message.queued` | Compliance decisions during dispatch | `{id, status, reason, scheduled_at}` |
| `message.dlr_overdue`, `message.dlr_recovered` | A delivery report is late, or arrived after being flagged late | `{message_id, attempt_id, status, deadline}` |
| `batch.started`, `batch.completed`, `batch.stopped` | Batch lifecycle | `batch.started`: `{id, status, accepted, invalid}`. `batch.completed`: `{id, status, admitted, sent, delivered, failed}` |
| `lookup.created`, `lookup.completed`, `lookup.failed`, `lookup.unknown` | [Lookup](lookup.md) progress | `{id}`; read the lookup for its result |
| `api_key.created`, `api_key.rotated`, `api_key.revoked` | Key changes | `{key_id, label}` |
| `webhook.disabled` | An endpoint was disabled after 20 consecutive failures | `{webhook_id, reason: "consecutive_delivery_failures"}` |
| `workspace.live_status_changed` | Going live, suspension | `{workspace_id, live_status, reason}` |

Other events exist (wallet, payment, sender ID, number and onboarding changes); `"*"` delivers all of them. Treat unknown event names and unknown `data` fields as normal and ignore what you do not use.

The `message.*` events carry the message ID; read `GET /v1/messages/{id}` when you need the full current state.

## Verify the signature

Each delivery is a `POST` with `Content-Type: application/json` and this header:

```http
X-OpenSMS-Signature: t=1790224046,v1=e21445a9ff34fad1bb2c8daa767922de1f9fb0c2845dcd815f0a5ef72c1fc8dc
```

- `t` is the Unix time the attempt was signed. It is regenerated on every retry.
- `v1` is the lowercase hex HMAC-SHA256 of `t` + `.` + the raw body, keyed with the whole endpoint secret including the `whsec_` prefix.
- Reject timestamps more than 5 minutes from your clock, to stop replays.

These functions implement exactly the check OpenSMS applies when it signs: HMAC-SHA256 over `timestamp.body`, compared in constant time.

<!-- test:verify-node -->
```js
// verify.mjs
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyOpensmsSignature(secret, rawBody, header, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const parts = {};
  for (const item of String(header ?? '').split(',')) {
    const i = item.indexOf('=');
    const key = item.slice(0, i).trim();
    const value = item.slice(i + 1).trim();
    if (i < 1 || !value || key in parts) return false;
    parts[key] = value;
  }
  if (Object.keys(parts).length !== 2 || !parts.t || !parts.v1) return false;
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.`).update(rawBody).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

<!-- test:verify-python -->
```python
# verify.py
import hashlib, hmac, time

def verify_opensms_signature(secret, raw_body, header, tolerance=300, now=None):
    parts = {}
    for item in (header or "").split(","):
        key, sep, value = item.strip().partition("=")
        if not sep or not key or not value or key in parts:
            return False
        parts[key] = value
    if set(parts) != {"t", "v1"}:
        return False
    try:
        ts = int(parts["t"])
    except ValueError:
        return False
    now = time.time() if now is None else now
    if abs(now - ts) > tolerance:
        return False
    expected = hmac.new(secret.encode(), parts["t"].encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"].lower())
```

A minimal Node receiver that reads the raw body, verifies it, answers quickly and deduplicates by event ID:

<!-- test:receiver-node -->
```js
// receiver.mjs
import { createServer } from 'node:http';
import { verifyOpensmsSignature } from './verify.mjs';

const SECRET = process.env.OPENSMS_WEBHOOK_SECRET; // whsec_...
const seen = new Set(); // use a database table in production

export const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    if (!verifyOpensmsSignature(SECRET, raw, req.headers['x-opensms-signature'])) {
      res.writeHead(401).end();
      return;
    }
    const event = JSON.parse(raw);
    res.writeHead(204).end(); // acknowledge first, then process
    if (seen.has(event.id)) return;
    seen.add(event.id);
    console.log('event', event.type, event.data?.id ?? '');
  });
});

if (process.argv[1]?.endsWith('receiver.mjs')) server.listen(process.env.PORT ?? 8787);
```

## Delivery, retries and failures

| Rule | Value |
| --- | --- |
| Success | Any `2xx` response. Redirects are not followed and count as failures. |
| Timeout | 15 seconds per attempt (10 seconds to receive response headers). |
| Attempts | 1 initial attempt plus 7 retries, 8 in total. |
| Retry delays after each failure | 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours, 12 hours, 24 hours |
| After the last retry | The delivery becomes `dead`. |
| Order | Not guaranteed. Deliveries are at least once; deduplicate on `id`. |
| Endpoint auto-disable | After 20 consecutive failed attempts the endpoint is disabled (`enabled: false`, `disabled_at` set) and a `webhook.disabled` event is emitted. Re-enable it with `PATCH`. |

Delivery states: `pending` (waiting for its first attempt), `failed` (waiting for a retry), `delivered`, `dead`.

### The delivery log

`GET /v1/webhooks/{id}/deliveries` (`limit` 1 to 1000, default 100, and `cursor`) shows recent deliveries, newest first:

```json
{
  "items": [
    {
      "generation": 0,
      "id": 8,
      "event": "api_key.created",
      "payload": {
        "id": "1b3bfc11-0ae8-4018-bed1-220b2044e0ff",
        "data": { "label": "event trigger", "key_id": "0b6f099f-b446-45b9-84cd-24875cd44efa" },
        "type": "api_key.created",
        "created_at": "2026-09-24T07:27:26.414161+03:00",
        "environment": "sandbox",
        "workspace_id": "29ce64bb-8ec7-424f-8f44-9c0f22393323"
      },
      "attempts": 0,
      "next_retry_at": "2026-09-24T07:27:26.562003+03:00",
      "status": "pending",
      "created_at": "2026-09-24T07:27:26.562003+03:00"
    }
  ],
  "next_cursor": null
}
```

After attempts, `last_response_code`, `last_error` and `delivered_at` are filled in.

### Test an endpoint

`POST /v1/webhooks/{id}/test` with an `Idempotency-Key` returns `202` `{"status":"pending"}` and queues one delivery whose whole body is `{"type":"webhook.test"}` (no envelope). It is signed like any other delivery.

### Replay a dead delivery

`POST /v1/webhooks/{id}/deliveries/{delivery_id}/replay` with an `Idempotency-Key` and a body of `{"generation": <current generation>, "reason": "why, 5 to 1000 characters"}`. Only `dead` deliveries with no attempt in flight, on an enabled endpoint, whose payload is still retained, can be replayed. A failed delivery that still has automatic retries left cannot. The response is `202` `{"status":"pending"}`.

## Related

- [Realtime](realtime.md) streams the same events over a WebSocket, useful for dashboards.
- [Sending messages](sending-messages.md#status-lifecycle) explains each status.
