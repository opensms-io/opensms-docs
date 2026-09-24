# Realtime (WebSocket)

The realtime endpoint pushes workspace events (message status changes, lookups, key changes and more) over a WebSocket as they happen. It is for developers building live dashboards or internal tools, and for server processes that prefer a stream to [webhooks](delivery-reports-and-webhooks.md). It is not a delivery guarantee: events sent while you are disconnected are not replayed, so use webhooks or the REST API as the source of truth.

## Connect

```text
GET /v1/realtime   (WebSocket upgrade over wss://)
```

A connection is bound to one workspace and one environment for its whole life. There are three ways to authenticate.

| Method | For | How |
| --- | --- | --- |
| API key | Server processes | `Authorization: Bearer sk_...` on the upgrade request. The key needs the `realtime:read` scope; its workspace and environment are used. |
| Session token | Tools acting as a user | `Authorization: Bearer sess_...`, or `?access_token=sess_...` for clients that cannot set headers. Add `?workspace_id=<uuid>&environment=sandbox\|live`. Without `workspace_id` the user's oldest membership is used; without `environment`, `sandbox`. |
| One-time ticket | Browsers | `POST /v1/realtime/tickets` then connect with `?ticket=...`. See [tickets](#browser-tickets). |

A missing or bad credential, or a key without `realtime:read`, gets `401` before the upgrade. While connected, the server re-checks the credential every 15 seconds and before each message, and closes the socket with code `1008` (`authorization expired`) if the key was revoked, the session ended or the membership was removed. Realtime traffic does not keep a session alive.

## Subscribe

After connecting, send JSON commands. Nothing is delivered until you subscribe.

```json
{"action": "subscribe", "channels": ["message", "lookup"]}
```

A channel is the part of the event name before the first dot: `message` receives `message.delivered`, `message.failed` and every other `message.*` event. `"*"` subscribes to everything. `{"action":"unsubscribe","channels":[...]}` removes channels. The server confirms each command:

```json
{"channels":["message","lookup"],"type":"subscribed"}
```

Mistakes get an error frame instead of a disconnect. Real frames for a non-JSON command, a `publish`, an unknown action and an `unsubscribe`:

```text
recv {"detail":"invalid command","type":"error"}
recv {"detail":"client publishing is not allowed","type":"error"}
recv {"detail":"unknown action","type":"error"}
recv {"channels":["message"],"type":"unsubscribed"}
```

## Events

Each event is a JSON text frame. This one was captured by subscribing to `"*"` with a sandbox key and then creating another key in the same workspace:

```json
{"id":"6bfc8b80-243b-4088-8dc2-893240ea4265","type":"api_key.created","aggregate_id":"edfb5888-87a3-44f4-86ae-9deaa654b8bf","workspace_id":"f98e3f20-d354-493d-b003-c39d945e29db","environment":"sandbox","data":{"label":"realtime demo","key_id":"edfb5888-87a3-44f4-86ae-9deaa654b8bf"},"created_at":"2026-09-24T07:17:07.026692+03:00"}
```

| Field | Meaning |
| --- | --- |
| `id` | Event ID, the same one webhooks use. Deduplicate on it after reconnecting. |
| `type` | Event name. The list is in [webhook events](delivery-reports-and-webhooks.md#events). |
| `aggregate_id` | The object the event is about (message ID, key ID, ...). |
| `workspace_id`, `environment` | Scope. You only receive your connection's workspace and environment. |
| `data` | Same `data` as the webhook payload. |
| `created_at` | When the event was recorded. |

Browser (session or ticket) connections subscribed to `notification` also receive `notification.changed` signals telling the console to refresh its inbox.

The server pings every 54 seconds and expects a pong within 60; standard WebSocket clients do this for you. A client that falls behind (32 queued frames) is disconnected. Reconnect with a backoff and re-subscribe.

## Example: Node

The [SDKs](sdk.md) do not include a WebSocket client, so connect with your language's WebSocket library; this example uses the one built into Node. This script needs a key that has `realtime:read`. It subscribes to everything, creates a key through the API to cause an event, and prints what arrives.

<!-- test:realtime-node -->
```js
// realtime.mjs (Node 22 or newer: global WebSocket)
const API = process.env.OPENSMS_API; // the API origin from your sandbox invitation
const ws = new WebSocket(API.replace(/^http/, 'ws') + '/v1/realtime', {
  headers: { authorization: `Bearer ${process.env.OPENSMS_API_KEY}` },
});
ws.onopen = () => ws.send(JSON.stringify({ action: 'subscribe', channels: ['*'] }));
ws.onmessage = (e) => console.log('recv', e.data);
ws.onclose = (e) => console.log('closed', e.code);
setTimeout(() => ws.close(), Number(process.env.LISTEN_MS ?? 60000));
```

```text
recv {"channels":["*"],"type":"subscribed"}
recv {"id":"6bfc8b80-243b-4088-8dc2-893240ea4265","type":"api_key.created",...}
```

A key without `realtime:read` fails the upgrade (Node reports `Received network error or non-101 status code`). The HTTP response behind that is:

```json
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"authentication required"}
```

## Browser tickets

Browsers cannot put an `Authorization` header on a WebSocket, and putting a session token in a URL is best avoided. The ticket flow exists for that:

1. `POST /v1/realtime/tickets` over HTTPS from the console's origin, with the session (bearer or cookie; cookie mode also needs `X-CSRF-Token`) and body `{"workspace_id":"...","environment":"sandbox"}`.
2. The response is `{"ticket":"...","expires_at":"..."}`. The ticket lasts at most 60 seconds and works once.
3. Connect to `wss://<api>/v1/realtime?ticket=<ticket>` from the same origin.

Tickets need the API to be served over TLS and the browser origin to be listed in `OPENSMS_CUSTOMER_COOKIE_ORIGINS`, which is only read when customer cookie mode is enabled (`OPENSMS_CUSTOMER_COOKIES_ENABLED=true`, which in turn requires TLS).

## When you get 403

Two different `403` responses come from how the endpoint protects browsers. Neither is a bug in your client.

**1. Ticket requests.** Tickets are issued only over HTTPS, and only to a browser origin the deployment allows. A ticket request over plain HTTP, or from another origin, is refused. Tickets need a browser session and are not in the SDKs, so this is shown with cURL:

```sh
curl -s -X POST $OPENSMS_API/v1/realtime/tickets \
  -H "authorization: Bearer $SESSION" -H 'origin: https://app.example.com' \
  -H 'content-type: application/json' -d '{"workspace_id":"f98e3f20-d354-493d-b003-c39d945e29db","environment":"sandbox"}'
```

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"ticket requires HTTPS and an allowed Origin"}
```

**2. Browser connections from another origin.** For session connections the `Origin` header's host must equal the API's host. A page on another origin that connects with `?access_token=` is refused with a plain-text `403 Forbidden` after authentication succeeds. The same session connects when the origin matches, and server clients that send no `Origin` (like the Node example) connect normally:

| Upgrade request with a valid session | Result |
| --- | --- |
| `Origin` on a different host from the API | `HTTP/1.1 403 Forbidden` |
| `Origin` equal to the API's own origin | `HTTP/1.1 101 Switching Protocols` |
| No `Origin` header (Node, server clients) | Connected |

From a browser, use a ticket over HTTPS, or serve the page from the API's origin.
