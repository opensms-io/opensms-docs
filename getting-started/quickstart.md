# Quickstart: your first sandbox message

This guide takes you from nothing to a sandbox message in about five minutes: create an account, verify your email, mint a sandbox API key, send a message and check its status. It is for developers trying OpenSMS for the first time.

> **About the example output.** Every response on this page was returned by a running OpenSMS API (secrets are shortened). The workspace used for them had not verified its owner's email, and an unverified workspace cannot send, so steps 4 and 5 show the `403` refusal and an empty message list. No successful send is reproduced here. The `201` response is described field by field in the API reference: the [`POST /v1/messages` responses](../reference/api/messages.md#post-v1messages) and the [Message schema](../reference/api/schemas.md#message).

You need `curl`, and optionally Node 18 or newer, or Python 3.9 or newer with `requests`.

> **Pre-launch.** OpenSMS is not publicly available yet. Sandbox access comes with an invitation from the [waitlist](https://opensms.io/#docs), and the invitation gives you the API origin to use below.

```sh
export OPENSMS_API=<the API origin from your sandbox invitation>
```

## 1. Create an account and workspace

`POST /v1/auth/signup` creates your user, a sandbox workspace in which you are the owner, and a session.

```sh
curl -s -X POST $OPENSMS_API/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"dev-quickstart-1@opensms.test","password":"Quickstart-Passw0rd-2026!","country_iso2":"KE","workspace_name":"Acme Dev"}'
```

```json
{
  "admin_role": null,
  "user": { "id": "d850fdf0-ccee-4ed2-971b-c4f28b40164e", "email": "dev-quickstart-1@opensms.test", "totp_enabled": false },
  "workspace": {
    "id": "f98e3f20-d354-493d-b003-c39d945e29db",
    "name": "Acme Dev",
    "live_status": "sandbox",
    "wallet_balance": "0.000000",
    "wallet_currency": "KES"
  },
  "role": "owner",
  "user_id": "d850fdf0-ccee-4ed2-971b-c4f28b40164e",
  "token": "sess_YXFMj1PC...",
  "expires_at": "2026-10-24T07:13:30.053095+03:00"
}
```

| Field | Rules |
| --- | --- |
| `email` | Required. An existing account returns `409` with `"detail":"account already exists"`. |
| `password` | Required, 8 to 1024 bytes. Otherwise `400` with `"code":"validation_failed"` and a field message under `errors.password`. |
| `country_iso2` | Required. An active registration country. It fixes the workspace currency (`KE` gives `KES`). |
| `workspace_name` | Optional, up to 120 bytes. Defaults to `My workspace`. |

Keep `token` (the session) and `workspace.id`:

```sh
export SESSION=sess_YXFMj1PC...        # token from the response
export WORKSPACE=f98e3f20-d354-493d-b003-c39d945e29db
```

The session expires after 30 minutes without use and 30 days after it was issued, whichever is first. See [authentication](../integrate/authentication.md#session-tokens).

## 2. Verify your email address

Sandbox sending is blocked until the workspace owner's email is verified. Ask for a code, then submit the six digits from the email:

```sh
curl -s -X POST $OPENSMS_API/v1/auth/email/send -H "authorization: Bearer $SESSION"
# {"sent":true} when email delivery is configured

curl -s -X POST $OPENSMS_API/v1/auth/verify-email -H "authorization: Bearer $SESSION" \
  -H 'content-type: application/json' -d '{"code":"123456"}'
# {"verified":true} with the right code
```

Codes expire after 10 minutes, allow five wrong guesses, and you can ask for a new one once a minute (`429` with `Retry-After: 60` before that).

## 3. Create a sandbox API key

API keys are created with your session and the workspace header. `test: true` makes a sandbox key (`sk_test_`). Without `scopes` the key gets `messages:read` and `messages:write`.

```sh
curl -s -X POST $OPENSMS_API/v1/keys \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -H 'content-type: application/json' \
  -d '{"label":"quickstart","test":true}'
```

```json
{
  "key": "sk_test_OHtA3aYT...",
  "key_info": {
    "id": "70c470cd-5e23-4b7f-8d3a-268ec9183a89",
    "prefix": "sk_test_",
    "label": "quickstart",
    "scopes": ["messages:read", "messages:write"],
    "created_at": "2026-09-24T07:13:35.871388+03:00",
    "last_used_at": null
  }
}
```

The full `key` is shown only in this response. Store it in your secret manager; `GET /v1/keys` never returns it again.

```sh
export OPENSMS_API_KEY=sk_test_OHtA3aYT...
```

You can also create keys in the console under **Developer > API keys**:

![API keys page in the console, listing four sandbox keys with their scopes and last use](../assets/screens/developer/api-keys.png)

## 4. Send your first message

`POST /v1/messages` with the key. `Idempotency-Key` is required: reuse the same value when you retry the same send, so a network retry never sends twice.

<!-- test:quickstart-curl -->
```sh
curl -s -X POST $OPENSMS_API/v1/messages \
  -H "authorization: Bearer $OPENSMS_API_KEY" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: quickstart-001' \
  -d '{"to":"+254700000001","text":"Hello from the OpenSMS sandbox"}'
```

With a verified email this returns `201 Created` and the message object, with `status` `queued` and `price` `0`. That response was not captured for this page (see the note at the top); its fields are in the [Message schema](../reference/api/schemas.md#message), and [sending messages](../integrate/sending-messages.md#response) explains each one.

If the owner's email is not verified yet, the same call is refused:

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"email verification is required for sandbox sending"}
```

The response also carries an `X-Request-Id` header. It identifies the recorded rejection; quote it to support.

### The same call from Node

<!-- test:quickstart-node -->
```js title="send.mjs"
// send.mjs: send one sandbox message and read it back (Node 18 or newer).
import { randomUUID } from 'node:crypto';

const API = process.env.OPENSMS_API; // the API origin from your sandbox invitation
const KEY = process.env.OPENSMS_API_KEY; // sk_test_...

async function opensms(method, path, { body, idempotencyKey } = {}) {
  const headers = { authorization: `Bearer ${KEY}` };
  if (body) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const res = await fetch(API + path, { method, headers, body: body && JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw Object.assign(new Error(data.detail), { status: res.status, problem: data });
  return data;
}

try {
  const message = await opensms('POST', '/v1/messages', {
    body: { to: '+254700000001', text: 'Hello from the OpenSMS sandbox' },
    idempotencyKey: randomUUID(),
  });
  console.log('accepted', message.id, message.status);
  const current = await opensms('GET', `/v1/messages/${message.id}`);
  console.log('status now', current.status);
} catch (err) {
  console.error('opensms error', err.status, JSON.stringify(err.problem));
  process.exitCode = 1;
}
```

If the owner's email is not verified yet, it prints the refusal:

```text
$ OPENSMS_API_KEY=sk_test_OHtA3aYT... node send.mjs
opensms error 403 {"type":"about:blank","title":"Forbidden","status":403,"detail":"email verification is required for sandbox sending"}
```

### The same call from Python

<!-- test:quickstart-python -->
```python title="send.py"
# send.py: send one sandbox message and read it back (Python 3.9+, requests).
import os, sys, uuid
import requests

API = os.environ["OPENSMS_API"]  # the API origin from your sandbox invitation
KEY = os.environ["OPENSMS_API_KEY"]  # sk_test_...
session = requests.Session()
session.headers["Authorization"] = f"Bearer {KEY}"

res = session.post(
    f"{API}/v1/messages",
    json={"to": "+254700000001", "text": "Hello from the OpenSMS sandbox"},
    headers={"Idempotency-Key": str(uuid.uuid4())},
    timeout=10,
)
if not res.ok:
    print("opensms error", res.status_code, res.text.strip())
    sys.exit(1)
message = res.json()
print("accepted", message["id"], message["status"])
current = session.get(f"{API}/v1/messages/{message['id']}", timeout=10).json()
print("status now", current["status"])
```

If the owner's email is not verified yet, it prints the refusal:

```text
$ OPENSMS_API_KEY=sk_test_OHtA3aYT... python3 send.py
opensms error 403 {"type":"about:blank","title":"Forbidden","status":403,"detail":"email verification is required for sandbox sending"}
```

In production code, derive the idempotency key from your own operation (for example `order-1001-shipped`) instead of a random UUID, so that a retry after a crash reuses it.

## 5. Check the status

Read one message with `GET /v1/messages/{id}`, or list recent ones:

<!-- test:quickstart-list -->
```sh
curl -s "$OPENSMS_API/v1/messages?limit=5" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```json
{"items":[],"next_cursor":null}
```

This list is empty because nothing had been sent from the workspace yet. Once a send is accepted, the message appears in `items`.

In the sandbox, a built-in mock provider settles each message moments after it is accepted, based on the destination number:

| Destination | Final status | `status_reason` |
| --- | --- | --- |
| `+2547000000` followed by any two digits (for example `+254700000001`) | `delivered` | none |
| `+2547000001` followed by any two digits (for example `+254700000101`) | `failed` | `carrier_rejected` |
| `+2547000002` followed by any two digits (for example `+254700000201`) | `expired` | `dlr_timeout` |
| Any other number | `delivered` | none |

Sandbox messages go straight from `queued` to their final status; they do not stop at `sent`.

To be told about status changes instead of polling, add a [webhook](../integrate/delivery-reports-and-webhooks.md) or open a [realtime](../integrate/realtime.md) connection.

## Next steps

- [Authentication](../integrate/authentication.md): scopes, rotation, live keys.
- [Sending messages](../integrate/sending-messages.md): scheduling, batches, encoding and statuses.
- [Errors](../integrate/errors.md): every error shape you can get back.
- [Going live](going-live.md): what it takes to send real messages.
