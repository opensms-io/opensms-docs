# Sending messages

This page covers outbound SMS through the API: single sends, scheduling and cancellation, batches, sender IDs, encoding and segments, the status lifecycle and delivery attempts. It is for developers building the sending side of an integration. Authentication is covered in [authentication](authentication.md); status notifications in [delivery reports and webhooks](delivery-reports-and-webhooks.md).

## Send one message

`POST /v1/messages` with a key that has `messages:write` (or an owner, admin or developer session with `X-Workspace-ID` and `X-Environment`).

<!-- tabs label="Send one message" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/messages \
  -H "authorization: Bearer $OPENSMS_API_KEY" \
  -H 'content-type: application/json' \
  -H 'idempotency-key: order-1001-shipped' \
  -d '{"to":"+254700000001","text":"Your order A-1001 has shipped.","traffic_type":"transactional","metadata":{"order_id":"A-1001"}}'
```

```ts tab="TypeScript" logo="typescript" title="send-order-update.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const message = await opensms.messages.send(
  {
    to: '+254700000001',
    text: 'Your order A-1001 has shipped.',
    trafficType: 'transactional',
    metadata: { order_id: 'A-1001' },
  },
  { idempotencyKey: 'order-1001-shipped' },
);

console.log(message.id, message.status);
```

```python tab="Python" logo="python" title="send_order_update.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

message = client.messages.send(
    to="+254700000001",
    text="Your order A-1001 has shipped.",
    traffic_type="transactional",
    metadata={"order_id": "A-1001"},
    idempotency_key="order-1001-shipped",
)

print(message["id"], message["status"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

msg, err := client.Messages.Send(context.Background(), opensms.SendMessageParams{
	To:          "+254700000001",
	Text:        "Your order A-1001 has shipped.",
	TrafficType: "transactional",
	Metadata:    map[string]any{"order_id": "A-1001"},
}, opensms.WithIdempotencyKey("order-1001-shipped"))
if err != nil {
	log.Fatal(err)
}
fmt.Println(msg.ID, msg.Status)
```

```php tab="PHP" logo="php" title="send-order-update.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$message = $opensms->messages->send([
    'to' => '+254700000001',
    'text' => 'Your order A-1001 has shipped.',
    'traffic_type' => 'transactional',
    'metadata' => ['order_id' => 'A-1001'],
], ['idempotencyKey' => 'order-1001-shipped']);

echo $message['id'], ' ', $message['status'], PHP_EOL;
```

```java tab="Java" logo="java" title="SendOrderUpdate.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Message message = opensms.messages().send(
    new SendMessageParams("+254700000001", "Your order A-1001 has shipped.")
        .trafficType("transactional")
        .metadata(Map.of("order_id", "A-1001")),
    RequestOptions.idempotencyKey("order-1001-shipped"));

System.out.println(message.id + " " + message.status);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var message = await client.Messages.SendAsync(new SendMessageParams
{
    To = "+254700000001",
    Text = "Your order A-1001 has shipped.",
    TrafficType = "transactional",
    Metadata = new Dictionary<string, object?> { ["order_id"] = "A-1001" },
}, new RequestOptions { IdempotencyKey = "order-1001-shipped" });

Console.WriteLine($"{message.Id} {message.Status}");
```

```ruby tab="Ruby" logo="ruby" title="send_order_update.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

message = client.messages.send(
  to: "+254700000001",
  text: "Your order A-1001 has shipped.",
  traffic_type: "transactional",
  metadata: { order_id: "A-1001" },
  idempotency_key: "order-1001-shipped"
)

puts "#{message[:id]} #{message[:status]}"
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let params = SendMessage {
    traffic_type: Some("transactional".into()),
    metadata: Some(serde_json::json!({ "order_id": "A-1001" })),
    ..SendMessage::new("+254700000001", "Your order A-1001 has shipped.")
};
let message = client
    .messages()
    .send_with(&params, &RequestOptions::idempotency_key("order-1001-shipped"))
    .await?;

println!("{} {}", message.id, message.status.as_deref().unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let message = try await opensms.messages.send(
    .init(
        to: "+254700000001", text: "Your order A-1001 has shipped.",
        trafficType: "transactional", metadata: ["order_id": "A-1001"]
    ),
    idempotencyKey: "order-1001-shipped"
)

print(message.id, message.status ?? "")
```
<!-- /tabs -->

Every SDK tab passes the same `Idempotency-Key` as the cURL tab. Leave it out and the SDK generates one per call and reuses it on its own retries; pass your own, derived from your operation, to make retries safe across processes.

Once the workspace owner has verified their email, this returns `201 Created` with the message ([response fields](#response)). Before that, every send is refused (the SDKs raise their error type with this `status`, `detail` and the `X-Request-Id` value):

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

<!-- tabs label="List messages" -->
```sh tab="cURL" title="Terminal"
curl -s "$OPENSMS_API/v1/messages?status=delivered&country=KE&limit=10" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="delivered-in-kenya.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const page = await opensms.messages.list({ status: 'delivered', country: 'KE', limit: 10 });

for (const message of page.items) console.log(message.id, message.to, message.deliveredAt);
```

```python tab="Python" logo="python" title="delivered_in_kenya.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

page = client.messages.list(status="delivered", country="KE", limit=10)

for message in page.items:
    print(message["id"], message["to"], message.get("delivered_at"))
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

page, err := client.Messages.List(context.Background(), opensms.ListMessagesParams{
	Status:  "delivered",
	Country: "KE",
	Limit:   10,
})
if err != nil {
	log.Fatal(err)
}
for _, msg := range page.Items {
	fmt.Println(msg.ID, msg.To, msg.DeliveredAt)
}
```

```php tab="PHP" logo="php" title="delivered-in-kenya.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$page = $opensms->messages->list(['status' => 'delivered', 'country' => 'KE', 'limit' => 10]);

foreach ($page->items as $message) {
    echo $message['id'], ' ', $message['to'], ' ', $message['delivered_at'] ?? '', PHP_EOL;
}
```

```java tab="Java" logo="java" title="DeliveredInKenya.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Page<Message> page = opensms.messages().list(
    new MessageListParams().status("delivered").country("KE").limit(10));

for (Message message : page.items) {
    System.out.println(message.id + " " + message.to + " " + message.deliveredAt);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var page = await client.Messages.ListAsync(new MessageListParams
{
    Status = "delivered",
    Country = "KE",
    Limit = 10,
});

foreach (var message in page.Items)
    Console.WriteLine($"{message.Id} {message.To} {message.DeliveredAt}");
```

```ruby tab="Ruby" logo="ruby" title="delivered_in_kenya.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

page = client.messages.list(status: "delivered", country: "KE", limit: 10)

page.items.each { |message| puts "#{message[:id]} #{message[:to]} #{message[:delivered_at]}" }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let page = client
    .messages()
    .list(ListMessages {
        status: Some("delivered".into()),
        country: Some("KE".into()),
        limit: Some(10),
        ..Default::default()
    })
    .await?;

for message in &page.items {
    println!("{} {} {}", message.id, message.to.as_deref().unwrap_or_default(), message.delivered_at.as_deref().unwrap_or_default());
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let page = try await opensms.messages.list(.init(limit: 10, status: "delivered", country: "KE"))

for message in page.items {
    print(message.id, message.to ?? "", message.deliveredAt.map { "\($0)" } ?? "")
}
```
<!-- /tabs -->

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

<!-- tabs label="List sender IDs" -->
```sh tab="cURL" title="Terminal"
curl -s $OPENSMS_API/v1/sender-ids -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="sender-ids.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const page = await opensms.senderIds.list();

for (const sender of page.items) console.log(sender.value, sender.status);
```

```python tab="Python" logo="python" title="sender_ids.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

page = client.sender_ids.list()

for sender in page.items:
    print(sender["value"], sender["status"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

page, err := client.SenderIDs.List(context.Background(), opensms.ListParams{})
if err != nil {
	log.Fatal(err)
}
for _, sender := range page.Items {
	fmt.Println(sender.Value, sender.Status)
}
```

```php tab="PHP" logo="php" title="sender-ids.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$page = $opensms->senderIds->list();

foreach ($page->items as $sender) {
    echo $sender['value'], ' ', $sender['status'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="ListSenderIds.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Page<SenderId> page = opensms.senderIds().list();

for (SenderId sender : page.items) {
    System.out.println(sender.value + " " + sender.status);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var page = await client.SenderIds.ListAsync();

foreach (var sender in page.Items)
    Console.WriteLine($"{sender.Value} {sender.Status}");
```

```ruby tab="Ruby" logo="ruby" title="sender_ids.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

page = client.sender_ids.list

page.items.each { |sender| puts "#{sender[:value]} #{sender[:status]}" }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let page = client.sender_ids().list(ListParams::default()).await?;

for sender in &page.items {
    println!("{} {}", sender.value.as_deref().unwrap_or_default(), sender.status.as_deref().unwrap_or_default());
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let page = try await opensms.senderIds.list()

for sender in page.items {
    print(sender.value ?? "", sender.status ?? "")
}
```
<!-- /tabs -->

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

Content rules can apply to specific traffic types. `GET /v1/content-rules` (key scope `compliance:read`) lists the enabled rules; `GET /v1/countries/{iso2}/compliance` (no credentials) shows a country's quiet hours, stop keywords and rules. For Kenya (the SDKs send your key with it anyway):

<!-- tabs label="Country rules" -->
```sh tab="cURL" title="Terminal"
curl -s $OPENSMS_API/v1/countries/KE/compliance
```

```ts tab="TypeScript" logo="typescript" title="kenya-rules.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const kenya = await opensms.countries.compliance('KE');

for (const q of kenya.quietHours ?? []) console.log(q.trafficType, q.startLocal, q.endLocal, q.enforce);
```

```python tab="Python" logo="python" title="kenya_rules.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

kenya = client.countries.compliance("KE")

for q in kenya["quiet_hours"]:
    print(q["traffic_type"], q["start_local"], q["end_local"], q["enforce"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

kenya, err := client.Countries.Compliance(context.Background(), "KE")
if err != nil {
	log.Fatal(err)
}
for _, q := range kenya.QuietHours {
	fmt.Println(q.TrafficType, q.StartLocal, q.EndLocal, q.Enforce)
}
```

```php tab="PHP" logo="php" title="kenya-rules.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$kenya = $opensms->countries->compliance('KE');

foreach ($kenya['quiet_hours'] as $q) {
    echo $q['traffic_type'], ' ', $q['start_local'], ' ', $q['end_local'], ' ', $q['enforce'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="KenyaRules.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

CountryRules kenya = opensms.countries().compliance("KE");

for (CountryRules.QuietHours q : kenya.quietHours) {
    System.out.println(q.trafficType + " " + q.startLocal + " " + q.endLocal + " " + q.enforce);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var kenya = await client.Countries.ComplianceAsync("KE");

foreach (var q in kenya.QuietHours ?? [])
    Console.WriteLine($"{q.TrafficType} {q.StartLocal} {q.EndLocal} {q.Enforce}");
```

```ruby tab="Ruby" logo="ruby" title="kenya_rules.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

kenya = client.countries.compliance("KE")

kenya[:quiet_hours].each { |q| puts q.values_at(:traffic_type, :start_local, :end_local, :enforce).join(" ") }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let kenya = client.countries().compliance("KE").await?;

for q in kenya.quiet_hours.unwrap_or_default() {
    println!("{} {} {} {}", q.traffic_type.as_deref().unwrap_or_default(), q.start_local.as_deref().unwrap_or_default(), q.end_local.as_deref().unwrap_or_default(), q.enforce.as_deref().unwrap_or_default());
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let kenya = try await opensms.countries.compliance("KE")

for q in kenya.quietHours ?? [] {
    print(q.trafficType ?? "", q.startLocal ?? "", q.endLocal ?? "", q.enforce ?? "")
}
```
<!-- /tabs -->

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

<!-- tabs label="Upload a batch" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/messages/batch \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: sale-2026-09-24' \
  -d '{"items":[{"to":"+254700000001","text":"Sale starts now"},{"to":"+254700000101","text":"Sale starts now"},{"to":"+254700000001","text":"Sale starts now"},{"to":"0712","text":"x"}]}'
```

```ts tab="TypeScript" logo="typescript" title="upload-batch.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const batch = await opensms.batches.create(
  {
    items: [
      { to: '+254700000001', text: 'Sale starts now' },
      { to: '+254700000101', text: 'Sale starts now' },
      { to: '+254700000001', text: 'Sale starts now' },
      { to: '0712', text: 'x' },
    ],
  },
  { idempotencyKey: 'sale-2026-09-24' },
);

console.log(batch.id, batch.status, batch.total, batch.invalid, batch.duplicates);
```

```python tab="Python" logo="python" title="upload_batch.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

batch = client.batches.create(
    items=[
        {"to": "+254700000001", "text": "Sale starts now"},
        {"to": "+254700000101", "text": "Sale starts now"},
        {"to": "+254700000001", "text": "Sale starts now"},
        {"to": "0712", "text": "x"},
    ],
    idempotency_key="sale-2026-09-24",
)

print(batch["id"], batch["status"], batch["total"], batch["invalid"], batch["duplicates"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

batch, err := client.Batches.Create(context.Background(), opensms.CreateBatchParams{
	Items: []opensms.BatchItemInput{
		{To: "+254700000001", Text: "Sale starts now"},
		{To: "+254700000101", Text: "Sale starts now"},
		{To: "+254700000001", Text: "Sale starts now"},
		{To: "0712", Text: "x"},
	},
}, opensms.WithIdempotencyKey("sale-2026-09-24"))
if err != nil {
	log.Fatal(err)
}
fmt.Println(batch.ID, batch.Status, batch.Total, batch.Invalid, batch.Duplicates)
```

```php tab="PHP" logo="php" title="upload-batch.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$batch = $opensms->batches->create([
    'items' => [
        ['to' => '+254700000001', 'text' => 'Sale starts now'],
        ['to' => '+254700000101', 'text' => 'Sale starts now'],
        ['to' => '+254700000001', 'text' => 'Sale starts now'],
        ['to' => '0712', 'text' => 'x'],
    ],
], ['idempotencyKey' => 'sale-2026-09-24']);

echo $batch['id'], ' ', $batch['status'], ' ', $batch['total'], ' ', $batch['invalid'], ' ', $batch['duplicates'], PHP_EOL;
```

```java tab="Java" logo="java" title="UploadBatch.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Batch batch = opensms.batches().create(List.of(
        new BatchItemInput("+254700000001", "Sale starts now"),
        new BatchItemInput("+254700000101", "Sale starts now"),
        new BatchItemInput("+254700000001", "Sale starts now"),
        new BatchItemInput("0712", "x")),
    null, RequestOptions.idempotencyKey("sale-2026-09-24"));

System.out.println(batch.id + " " + batch.status + " " + batch.total + " " + batch.invalid + " " + batch.duplicates);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var batch = await client.Batches.CreateAsync(new CreateBatchParams
{
    Items = new[]
    {
        new BatchItemInput { To = "+254700000001", Text = "Sale starts now" },
        new BatchItemInput { To = "+254700000101", Text = "Sale starts now" },
        new BatchItemInput { To = "+254700000001", Text = "Sale starts now" },
        new BatchItemInput { To = "0712", Text = "x" },
    },
}, new RequestOptions { IdempotencyKey = "sale-2026-09-24" });

Console.WriteLine($"{batch.Id} {batch.Status} {batch.Total} {batch.Invalid} {batch.Duplicates}");
```

```ruby tab="Ruby" logo="ruby" title="upload_batch.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

batch = client.batches.create(
  items: [
    { to: "+254700000001", text: "Sale starts now" },
    { to: "+254700000101", text: "Sale starts now" },
    { to: "+254700000001", text: "Sale starts now" },
    { to: "0712", text: "x" }
  ],
  idempotency_key: "sale-2026-09-24"
)

puts batch.values_at(:id, :status, :total, :invalid, :duplicates).join(" ")
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let params = CreateBatch {
    items: vec![
        BatchItemInput::new("+254700000001", "Sale starts now"),
        BatchItemInput::new("+254700000101", "Sale starts now"),
        BatchItemInput::new("+254700000001", "Sale starts now"),
        BatchItemInput::new("0712", "x"),
    ],
    dedupe: None,
};
let batch = client
    .batches()
    .create_with(&params, &RequestOptions::idempotency_key("sale-2026-09-24"))
    .await?;

println!("{} {} {} {} {}", batch.id, batch.status.as_deref().unwrap_or_default(), batch.total.unwrap_or_default(), batch.invalid.unwrap_or_default(), batch.duplicates.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let batch = try await opensms.batches.create(
    .init(items: [
        .init(to: "+254700000001", text: "Sale starts now"),
        .init(to: "+254700000101", text: "Sale starts now"),
        .init(to: "+254700000001", text: "Sale starts now"),
        .init(to: "0712", text: "x"),
    ]),
    idempotencyKey: "sale-2026-09-24"
)

print(batch.id, batch.status ?? "", batch.total ?? 0, batch.invalid ?? 0, batch.duplicates ?? 0)
```
<!-- /tabs -->

`202 Accepted`:

```json
{"id":"21553ee4-fa11-42cb-b085-0b86c208deaf","status":"ready","total":4,"sent":0,"delivered":0,"failed":0,"invalid":2,"duplicates":1,"suppressed":0,"estimated_cost":null,"created_at":"2026-09-24T07:27:23.965346+03:00"}
```

The same kind of upload as CSV. The first line of the cURL tab writes `sale.csv`; the SDK tabs read that file and send it as `text/csv`:

<!-- tabs label="Upload a CSV batch" -->
```sh tab="cURL" title="Terminal"
printf 'to,text,traffic_type\n+254700000001,Flash sale today,marketing\n+254700000002,Flash sale today,marketing\n' > sale.csv
curl -s -X POST $OPENSMS_API/v1/messages/batch -H "authorization: Bearer $OPENSMS_API_KEY" \
  -H 'content-type: text/csv' -H 'idempotency-key: sale-csv-2026-09-24' --data-binary @sale.csv
```

```ts tab="TypeScript" logo="typescript" title="upload-csv.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const csv = readFileSync('sale.csv', 'utf8');
const batch = await opensms.batches.createFromCsv(csv, {}, { idempotencyKey: 'sale-csv-2026-09-24' });

console.log(batch.id, batch.status, batch.total);
```

```python tab="Python" logo="python" title="upload_csv.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

with open("sale.csv", encoding="utf-8") as f:
    batch = client.batches.create_from_csv(f.read(), idempotency_key="sale-csv-2026-09-24")

print(batch["id"], batch["status"], batch["total"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

csv, err := os.ReadFile("sale.csv")
if err != nil {
	log.Fatal(err)
}
batch, err := client.Batches.CreateFromCSV(context.Background(), csv,
	opensms.CreateBatchFromCSVParams{}, opensms.WithIdempotencyKey("sale-csv-2026-09-24"))
if err != nil {
	log.Fatal(err)
}
fmt.Println(batch.ID, batch.Status, batch.Total)
```

```php tab="PHP" logo="php" title="upload-csv.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$batch = $opensms->batches->createFromCsv(
    file_get_contents('sale.csv'),
    [],
    ['idempotencyKey' => 'sale-csv-2026-09-24'],
);

echo $batch['id'], ' ', $batch['status'], ' ', $batch['total'], PHP_EOL;
```

```java tab="Java" logo="java" title="UploadCsvBatch.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

String csv = Files.readString(Path.of("sale.csv"));
Batch batch = opensms.batches().createFromCsv(csv, RequestOptions.idempotencyKey("sale-csv-2026-09-24"));

System.out.println(batch.id + " " + batch.status + " " + batch.total);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var csv = await File.ReadAllTextAsync("sale.csv");
var batch = await client.Batches.CreateFromCsvAsync(csv, options: new RequestOptions { IdempotencyKey = "sale-csv-2026-09-24" });

Console.WriteLine($"{batch.Id} {batch.Status} {batch.Total}");
```

```ruby tab="Ruby" logo="ruby" title="upload_csv.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

batch = client.batches.create_from_csv(File.read("sale.csv"), idempotency_key: "sale-csv-2026-09-24")

puts batch.values_at(:id, :status, :total).join(" ")
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let csv = std::fs::read("sale.csv")?;
let batch = client
    .batches()
    .create_from_csv_with(csv, None, &RequestOptions::idempotency_key("sale-csv-2026-09-24"))
    .await?;

println!("{} {} {}", batch.id, batch.status.as_deref().unwrap_or_default(), batch.total.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let csv = try String(contentsOfFile: "sale.csv", encoding: .utf8)
let batch = try await opensms.batches.createFromCsv(csv, idempotencyKey: "sale-csv-2026-09-24")

print(batch.id, batch.status ?? "", batch.total ?? 0)
```
<!-- /tabs -->

```json
{"id":"17869103-e8e0-49b0-beea-ebaac26f19ac","status":"ready","total":2,"sent":0,"delivered":0,"failed":0,"invalid":0,"duplicates":0,"suppressed":0,"estimated_cost":null,"created_at":"2026-09-24T07:36:46.582909+03:00"}
```

### 2. Check validation

`GET /v1/batches/{id}/validation`:

<!-- tabs label="Batch validation" -->
```sh tab="cURL" title="Terminal"
curl -s $OPENSMS_API/v1/batches/21553ee4-fa11-42cb-b085-0b86c208deaf/validation \
  -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="check-batch.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const report = await opensms.batches.validation('21553ee4-fa11-42cb-b085-0b86c208deaf');

for (const row of report.rows ?? []) console.log(row.row, row.valid, row.error ?? '');
```

```python tab="Python" logo="python" title="check_batch.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

report = client.batches.validation("21553ee4-fa11-42cb-b085-0b86c208deaf")

for row in report["rows"]:
    print(row["row"], row["valid"], row.get("error", ""))
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

report, err := client.Batches.Validation(context.Background(), "21553ee4-fa11-42cb-b085-0b86c208deaf")
if err != nil {
	log.Fatal(err)
}
for _, row := range report.Rows {
	fmt.Println(row.Row, row.Valid, row.Error)
}
```

```php tab="PHP" logo="php" title="check-batch.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$report = $opensms->batches->validation('21553ee4-fa11-42cb-b085-0b86c208deaf');

foreach ($report['rows'] as $row) {
    echo $row['row'], ' ', $row['valid'] ? 'valid' : 'invalid', ' ', $row['error'] ?? '', PHP_EOL;
}
```

```java tab="Java" logo="java" title="CheckBatch.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

BatchValidationReport report = opensms.batches().validation("21553ee4-fa11-42cb-b085-0b86c208deaf");

for (BatchValidationReport.Row row : report.rows) {
    System.out.println(row.row + " " + row.valid + " " + row.error);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var report = await client.Batches.ValidationAsync("21553ee4-fa11-42cb-b085-0b86c208deaf");

foreach (var row in report.Rows)
    Console.WriteLine($"{row.Row} {row.Valid} {row.Error}");
```

```ruby tab="Ruby" logo="ruby" title="check_batch.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

report = client.batches.validation("21553ee4-fa11-42cb-b085-0b86c208deaf")

report[:rows].each { |row| puts "#{row[:row]} #{row[:valid]} #{row[:error]}" }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let report = client
    .batches()
    .validation("21553ee4-fa11-42cb-b085-0b86c208deaf")
    .await?;

for row in &report.rows {
    println!("{} {} {}", row.row.unwrap_or_default(), row.valid.unwrap_or_default(), row.error.as_deref().unwrap_or_default());
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let report = try await opensms.batches.validation("21553ee4-fa11-42cb-b085-0b86c208deaf")

for row in report.rows ?? [] {
    print(row.row ?? 0, row.valid ?? false, row.error ?? "")
}
```
<!-- /tabs -->

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

`POST /v1/batches/{id}/start` with an `Idempotency-Key`:

<!-- tabs label="Start a batch" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/batches/21553ee4-fa11-42cb-b085-0b86c208deaf/start \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'idempotency-key: sale-2026-09-24-start'
```

```ts tab="TypeScript" logo="typescript" title="start-batch.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const batch = await opensms.batches.start('21553ee4-fa11-42cb-b085-0b86c208deaf', {
  idempotencyKey: 'sale-2026-09-24-start',
});

console.log(batch.status, batch.invalid);
```

```python tab="Python" logo="python" title="start_batch.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

batch = client.batches.start(
    "21553ee4-fa11-42cb-b085-0b86c208deaf",
    idempotency_key="sale-2026-09-24-start",
)

print(batch["status"], batch["invalid"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

batch, err := client.Batches.Start(context.Background(), "21553ee4-fa11-42cb-b085-0b86c208deaf",
	opensms.WithIdempotencyKey("sale-2026-09-24-start"))
if err != nil {
	log.Fatal(err)
}
fmt.Println(batch.Status, batch.Invalid)
```

```php tab="PHP" logo="php" title="start-batch.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$batch = $opensms->batches->start('21553ee4-fa11-42cb-b085-0b86c208deaf', [
    'idempotencyKey' => 'sale-2026-09-24-start',
]);

echo $batch['status'], ' ', $batch['invalid'], PHP_EOL;
```

```java tab="Java" logo="java" title="StartBatch.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Batch batch = opensms.batches().start("21553ee4-fa11-42cb-b085-0b86c208deaf",
    RequestOptions.idempotencyKey("sale-2026-09-24-start"));

System.out.println(batch.status + " " + batch.invalid);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var batch = await client.Batches.StartAsync("21553ee4-fa11-42cb-b085-0b86c208deaf",
    new RequestOptions { IdempotencyKey = "sale-2026-09-24-start" });

Console.WriteLine($"{batch.Status} {batch.Invalid}");
```

```ruby tab="Ruby" logo="ruby" title="start_batch.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

batch = client.batches.start("21553ee4-fa11-42cb-b085-0b86c208deaf", idempotency_key: "sale-2026-09-24-start")

puts "#{batch[:status]} #{batch[:invalid]}"
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let batch = client
    .batches()
    .start_with(
        "21553ee4-fa11-42cb-b085-0b86c208deaf",
        &RequestOptions::idempotency_key("sale-2026-09-24-start"),
    )
    .await?;

println!("{} {}", batch.status.as_deref().unwrap_or_default(), batch.invalid.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let batch = try await opensms.batches.start(
    "21553ee4-fa11-42cb-b085-0b86c208deaf",
    idempotencyKey: "sale-2026-09-24-start"
)

print(batch.status ?? "", batch.invalid ?? 0)
```
<!-- /tabs -->

Each valid row goes through the same admission checks as a single send. Rows that pass become messages and the batch becomes `running`. Rows refused at this point are marked invalid in the validation report with `error` and `rejection_status`; if none pass, the batch becomes `failed`. If the workspace owner has not verified their email yet, every row is refused by the email gate:

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

Stopping a batch:

<!-- tabs label="Stop a batch" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/batches/514b2212-134d-4d52-b862-adfe45ecb353/stop \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'idempotency-key: sale-2026-09-24-stop'
```

```ts tab="TypeScript" logo="typescript" title="stop-batch.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const result = await opensms.batches.stop('514b2212-134d-4d52-b862-adfe45ecb353', {
  idempotencyKey: 'sale-2026-09-24-stop',
});

console.log(result.status, result.cancelled);
```

```python tab="Python" logo="python" title="stop_batch.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

result = client.batches.stop(
    "514b2212-134d-4d52-b862-adfe45ecb353",
    idempotency_key="sale-2026-09-24-stop",
)

print(result["status"], result["cancelled"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

result, err := client.Batches.Stop(context.Background(), "514b2212-134d-4d52-b862-adfe45ecb353",
	opensms.WithIdempotencyKey("sale-2026-09-24-stop"))
if err != nil {
	log.Fatal(err)
}
fmt.Println(result.Status, result.Cancelled)
```

```php tab="PHP" logo="php" title="stop-batch.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$result = $opensms->batches->stop('514b2212-134d-4d52-b862-adfe45ecb353', [
    'idempotencyKey' => 'sale-2026-09-24-stop',
]);

echo $result['status'], ' ', $result['cancelled'], PHP_EOL;
```

```java tab="Java" logo="java" title="StopBatch.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

BatchStopResult result = opensms.batches().stop("514b2212-134d-4d52-b862-adfe45ecb353",
    RequestOptions.idempotencyKey("sale-2026-09-24-stop"));

System.out.println(result.status + " " + result.cancelled);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var result = await client.Batches.StopAsync("514b2212-134d-4d52-b862-adfe45ecb353",
    new RequestOptions { IdempotencyKey = "sale-2026-09-24-stop" });

Console.WriteLine($"{result.Status} {result.Cancelled}");
```

```ruby tab="Ruby" logo="ruby" title="stop_batch.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

result = client.batches.stop("514b2212-134d-4d52-b862-adfe45ecb353", idempotency_key: "sale-2026-09-24-stop")

puts "#{result[:status]} #{result[:cancelled]}"
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let result = client
    .batches()
    .stop_with(
        "514b2212-134d-4d52-b862-adfe45ecb353",
        &RequestOptions::idempotency_key("sale-2026-09-24-stop"),
    )
    .await?;

println!("{} {}", result.status.as_deref().unwrap_or_default(), result.cancelled.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let result = try await opensms.batches.stop(
    "514b2212-134d-4d52-b862-adfe45ecb353",
    idempotencyKey: "sale-2026-09-24-stop"
)

print(result.status ?? "", result.cancelled ?? 0)
```
<!-- /tabs -->

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
