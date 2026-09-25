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

The SDKs do steps 1 and 2 for you; see [retries in the SDKs](#retries-in-the-sdks).

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

Replaying a batch upload: run any tab twice and the second call returns the first batch. The SDKs send the `Idempotency-Key` you pass instead of generating one.

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/messages/batch -H "authorization: Bearer $OPENSMS_API_KEY" \
  -H 'content-type: application/json' -H 'idempotency-key: reminders-2026-09-25' \
  -d '{"items":[{"to":"+254712345678","text":"Reminder: your appointment is tomorrow"}]}'
```

```ts tab="TypeScript" logo="typescript" title="batch.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const batch = await opensms.batches.create(
  { items: [{ to: '+254712345678', text: 'Reminder: your appointment is tomorrow' }] },
  { idempotencyKey: 'reminders-2026-09-25' },
);

console.log(batch.id, batch.status);
```

```python tab="Python" logo="python" title="batch.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

batch = client.batches.create(
    items=[{"to": "+254712345678", "text": "Reminder: your appointment is tomorrow"}],
    idempotency_key="reminders-2026-09-25",
)

print(batch["id"], batch["status"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

batch, err := client.Batches.Create(context.Background(), opensms.CreateBatchParams{
	Items: []opensms.BatchItemInput{
		{To: "+254712345678", Text: "Reminder: your appointment is tomorrow"},
	},
}, opensms.WithIdempotencyKey("reminders-2026-09-25"))
if err != nil {
	log.Fatal(err)
}
log.Println(batch.ID, batch.Status)
```

```php tab="PHP" logo="php" title="batch.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$batch = $opensms->batches->create([
    'items' => [['to' => '+254712345678', 'text' => 'Reminder: your appointment is tomorrow']],
], ['idempotencyKey' => 'reminders-2026-09-25']);

echo $batch['id'], ' ', $batch['status'], PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Batch batch = opensms.batches().create(
    List.of(new BatchItemInput("+254712345678", "Reminder: your appointment is tomorrow")),
    null,
    RequestOptions.idempotencyKey("reminders-2026-09-25"));

System.out.println(batch.id + " " + batch.status);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var batch = await client.Batches.CreateAsync(new CreateBatchParams
{
    Items = new[] { new BatchItemInput { To = "+254712345678", Text = "Reminder: your appointment is tomorrow" } },
}, new RequestOptions { IdempotencyKey = "reminders-2026-09-25" });

Console.WriteLine($"{batch.Id} {batch.Status}");
```

```ruby tab="Ruby" logo="ruby" title="batch.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

batch = client.batches.create(
  items: [{ to: "+254712345678", text: "Reminder: your appointment is tomorrow" }],
  idempotency_key: "reminders-2026-09-25"
)

puts batch[:id], batch[:status]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let batch = client
    .batches()
    .create_with(
        &CreateBatch {
            items: vec![BatchItemInput::new("+254712345678", "Reminder: your appointment is tomorrow")],
            dedupe: None,
        },
        &RequestOptions::idempotency_key("reminders-2026-09-25"),
    )
    .await?;

println!("{} {}", batch.id, batch.status.as_deref().unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let batch = try await opensms.batches.create(
    .init(items: [.init(to: "+254712345678", text: "Reminder: your appointment is tomorrow")]),
    idempotencyKey: "reminders-2026-09-25"
)

print(batch.id, batch.status ?? "")
```
<!-- /tabs -->

Real responses, the first call and then the identical retry:

```json
{"id":"56c82496-116d-419e-8c3f-3aac2465fd96","status":"ready","total":1,"sent":0,"delivered":0,"failed":0,"invalid":0,"duplicates":0,"suppressed":0,"estimated_cost":null,"created_at":"2026-09-24T14:56:25.663733+03:00"}
{"id": "56c82496-116d-419e-8c3f-3aac2465fd96", "sent": 0, "total": 1, "failed": 0, "status": "ready", "invalid": 0, "delivered": 0, "created_at": "2026-09-24T14:56:25.663733+03:00", "duplicates": 0, "suppressed": 0, "estimated_cost": null}
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

## Retries in the SDKs

The [SDKs](sdk.md) do the retry loop above for you. Every client retries `429`, `500`, `502`, `503`, `504`, network errors and timeouts, with exponential backoff and full jitter capped at 8 seconds, and honours `Retry-After`. When `Retry-After` asks for more than 60 seconds the client does not wait: it raises the error with the retry-after value set (see [errors in the SDKs](errors.md#errors-in-the-sdks)).

A retry is only made when repeating the request is safe: `GET`, `PUT`, `PATCH` and `DELETE` always, a `POST` only when it carries an `Idempotency-Key`. Every method that takes a key generates a UUIDv4 once per call and sends it unchanged on every retry of that call. `messages.cancel`, `otp.verify`, sender ID creation (including drafts) and suppression creation and import are never retried.

A generated key protects only the retries inside one call. Pass your own key, derived from the business event, when a crash or a redeploy could run the same send again:

| Language | Retry count (default 2, so 3 attempts) | Your own `Idempotency-Key` |
| --- | --- | --- |
| TypeScript | `new Opensms({ apiKey, maxRetries })` | `{ idempotencyKey }` as the last argument |
| Python | `Opensms(api_key=..., max_retries=...)` | `idempotency_key=` keyword |
| Go | `opensms.WithMaxRetries(n)` option to `NewClient` | `opensms.WithIdempotencyKey(key)` call option |
| PHP | `new Client($key, ['maxRetries' => n])` | `['idempotencyKey' => $key]` as the last argument |
| Java | `OpensmsClient.builder().maxRetries(n)` | `RequestOptions.idempotencyKey(key)` as the last argument |
| C# | `new OpensmsClientOptions { MaxRetries = n }` | `new RequestOptions { IdempotencyKey = key }` |
| Ruby | `Opensms::Client.new(api_key: ..., max_retries: n)` | `idempotency_key:` keyword |
| Rust | `Client::builder(key).max_retries(n)` | the `_with` method variant and `RequestOptions::idempotency_key(key)` |
| Swift | `OpensmsClient(apiKey: ..., maxRetries: n)` | `idempotencyKey:` argument |

Four retries and a key derived from the order. With cURL, `--retry` repeats on `408`, `429`, `500`, `502`, `503` and `504`, honours `Retry-After`, and resends the same header:

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s --retry 4 -X POST $OPENSMS_API/v1/messages \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: order-1042-shipped' \
  -d '{"to":"+254712345678","text":"Your Acme order #1042 has shipped"}'
```

```ts tab="TypeScript" logo="typescript" title="send.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY!, maxRetries: 4 });

const message = await opensms.messages.send(
  { to: '+254712345678', text: 'Your Acme order #1042 has shipped' },
  { idempotencyKey: 'order-1042-shipped' },
);

console.log(message.id, message.status);
```

```python tab="Python" logo="python" title="send.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"], max_retries=4)

message = client.messages.send(
    to="+254712345678",
    text="Your Acme order #1042 has shipped",
    idempotency_key="order-1042-shipped",
)

print(message["id"], message["status"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"), opensms.WithMaxRetries(4))
if err != nil {
	log.Fatal(err)
}

msg, err := client.Messages.Send(context.Background(), opensms.SendMessageParams{
	To:   "+254712345678",
	Text: "Your Acme order #1042 has shipped",
}, opensms.WithIdempotencyKey("order-1042-shipped"))
if err != nil {
	log.Fatal(err)
}
log.Println(msg.ID, msg.Status)
```

```php tab="PHP" logo="php" title="send.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'), ['maxRetries' => 4]);

$message = $opensms->messages->send([
    'to' => '+254712345678',
    'text' => 'Your Acme order #1042 has shipped',
], ['idempotencyKey' => 'order-1042-shipped']);

echo $message['id'], ' ', $message['status'], PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = OpensmsClient.builder()
    .apiKey(System.getenv("OPENSMS_API_KEY"))
    .maxRetries(4)
    .build();

Message message = opensms.messages().send(
    new SendMessageParams("+254712345678", "Your Acme order #1042 has shipped"),
    RequestOptions.idempotencyKey("order-1042-shipped"));

System.out.println(message.id + " " + message.status);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!,
    new OpensmsClientOptions { MaxRetries = 4 });

var message = await client.Messages.SendAsync(
    new SendMessageParams { To = "+254712345678", Text = "Your Acme order #1042 has shipped" },
    new RequestOptions { IdempotencyKey = "order-1042-shipped" });

Console.WriteLine($"{message.Id} {message.Status}");
```

```ruby tab="Ruby" logo="ruby" title="send.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"), max_retries: 4)

message = client.messages.send(
  to: "+254712345678",
  text: "Your Acme order #1042 has shipped",
  idempotency_key: "order-1042-shipped"
)

puts message[:id], message[:status]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::builder(std::env::var("OPENSMS_API_KEY").unwrap())
    .max_retries(4)
    .build()?;

let message = client
    .messages()
    .send_with(
        &SendMessage::new("+254712345678", "Your Acme order #1042 has shipped"),
        &RequestOptions::idempotency_key("order-1042-shipped"),
    )
    .await?;

println!("{} {}", message.id, message.status.as_deref().unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey, maxRetries: 4)

let message = try await opensms.messages.send(
    .init(to: "+254712345678", text: "Your Acme order #1042 has shipped"),
    idempotencyKey: "order-1042-shipped"
)

print(message.id, message.status ?? "")
```
<!-- /tabs -->

## AI assistants (MCP)

Connections from AI assistants have their own limits on top of the ones above: 120 MCP requests a minute and, by default, 10 spending calls a minute per connection (5, 10, 30 or 60, chosen on the consent screen), plus an optional daily spend cap per connection. Their spending tools are idempotent too: a caller key is kept for 24 hours, and without one the same content to the same number from the same connection is sent once within 10 minutes. See [AI assistants (MCP)](mcp.md#limits).

## Related

- [Errors](errors.md) for which statuses are safe to retry.
- [OTP](otp.md#limits) for the OTP limits in context.
- [AI assistants (MCP)](mcp.md#idempotency) for idempotency in assistant tool calls.
