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

<!-- tabs label="List available numbers" -->
```sh tab="cURL" title="Terminal"
curl -s "$OPENSMS_API/v1/numbers/available?country=KE&kind=long_code" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="available-numbers.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const numbers = await opensms.numbers.available({ country: 'KE', kind: 'long_code' });

for (const n of numbers) console.log(n.number, n.monthlyFee, n.feeCurrency);
```

```python tab="Python" logo="python" title="available_numbers.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

numbers = client.numbers.available(country="KE", kind="long_code")

for n in numbers:
    print(n["number"], n["monthly_fee"], n["fee_currency"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

numbers, err := client.Numbers.Available(context.Background(),
	opensms.AvailableNumbersParams{Country: "KE", Kind: "long_code"})
if err != nil {
	log.Fatal(err)
}
for _, n := range numbers {
	log.Println(n.Number, n.MonthlyFee, n.FeeCurrency)
}
```

```php tab="PHP" logo="php" title="available-numbers.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$numbers = $opensms->numbers->available(['country' => 'KE', 'kind' => 'long_code']);

foreach ($numbers as $n) {
    echo $n['number'], ' ', $n['monthly_fee'], ' ', $n['fee_currency'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="AvailableNumbers.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

List<VirtualNumber> numbers = opensms.numbers().available("KE", "long_code");

for (VirtualNumber n : numbers) {
    System.out.println(n.number + " " + n.monthlyFee + " " + n.feeCurrency);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var numbers = await client.Numbers.AvailableAsync(
    new NumberSearchParams { Country = "KE", Kind = "long_code" });

foreach (var n in numbers)
{
    Console.WriteLine($"{n.Number} {n.MonthlyFee} {n.FeeCurrency}");
}
```

```ruby tab="Ruby" logo="ruby" title="available_numbers.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

numbers = client.numbers.available(country: "KE", kind: "long_code")

numbers.each { |n| puts n.values_at(:number, :monthly_fee, :fee_currency).join(" ") }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let numbers = client
    .numbers()
    .available(&NumberQuery { country: "KE".into(), kind: "long_code".into() })
    .await?;

for n in numbers {
    let (fee, currency) = (n.monthly_fee.unwrap_or_default(), n.fee_currency.unwrap_or_default());
    println!("{} {} {}", n.number.unwrap_or_default(), fee, currency);
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let numbers = try await opensms.numbers.available(country: "KE", kind: "long_code")

for n in numbers {
    print(n.number ?? "", n.monthlyFee ?? "", n.feeCurrency ?? "")
}
```
<!-- /tabs -->

```json
[]
```

<!-- tabs label="List inbound rules" -->
```sh tab="cURL" title="Terminal"
curl -s "$OPENSMS_API/v1/numbers/b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36/rules" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="list-rules.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const rules = await opensms.numbers.listRules('b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36');

for (const r of rules.items) console.log(r.position, r.match, r.pattern, r.action);
```

```python tab="Python" logo="python" title="list_rules.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

rules = client.numbers.list_rules("b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36")

for r in rules.items:
    print(r["position"], r["match"], r.get("pattern"), r["action"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

rules, err := client.Numbers.ListRules(context.Background(),
	"b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36", opensms.ListParams{})
if err != nil {
	log.Fatal(err)
}
for _, r := range rules.Items {
	log.Println(r.Position, r.Match, r.Pattern, r.Action)
}
```

```php tab="PHP" logo="php" title="list-rules.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$rules = $opensms->numbers->listRules('b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36');

foreach ($rules->items as $r) {
    echo $r['position'], ' ', $r['match'], ' ', $r['pattern'] ?? '', ' ', $r['action'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="ListRules.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Page<NumberRule> rules = opensms.numbers().listRules("b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36");

for (NumberRule r : rules.items) {
    System.out.println(r.position + " " + r.match + " " + r.pattern + " " + r.action);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var rules = await client.Numbers.ListRulesAsync("b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36");

foreach (var r in rules.Items)
{
    Console.WriteLine($"{r.Position} {r.Match} {r.Pattern} {r.Action}");
}
```

```ruby tab="Ruby" logo="ruby" title="list_rules.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

rules = client.numbers.list_rules("b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36")

rules.items.each { |r| puts r.values_at(:position, :match, :pattern, :action).join(" ") }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let rules = client
    .numbers()
    .list_rules("b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36", ListParams::default())
    .await?;

for r in rules.items {
    let (pattern, action) = (r.pattern.unwrap_or_default(), r.action.unwrap_or_default());
    println!("{} {} {} {}", r.position.unwrap_or(0), r.r#match.unwrap_or_default(), pattern, action);
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let rules = try await opensms.numbers.listRules("b8e2c4d1-6f3a-4a9e-8c7b-2d5f1e0a9c36")

for r in rules.items {
    print(r.position ?? 0, r.match ?? "", r.pattern ?? "", r.action ?? "")
}
```
<!-- /tabs -->

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"This operation requires the live environment."}
```

### Inbound rules

A rule has `match` (`keyword`, `prefix`, `regex` or `any`), a `pattern` (required unless `match` is `any`), an `action` (`webhook`, `auto_reply` or `forward_email`), a `target` (URL, reply text or email address, up to 2048 characters) and a `position` (0 to 10000, lower first). Rule creation needs an `Idempotency-Key`. As noted above, rules are stored but not executed by the current build.

## Received messages

`GET /v1/inbound` with `messages:read`:

<!-- tabs label="List received messages" -->
```sh tab="cURL" title="Terminal"
curl -s "$OPENSMS_API/v1/inbound?limit=50" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="inbound.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const inbox = await opensms.inbound.list({ limit: 50 });

for (const m of inbox.items) console.log(m.id, m.from, m.text);
```

```python tab="Python" logo="python" title="inbound.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

inbox = client.inbound.list(limit=50)

for m in inbox.items:
    print(m["id"], m["from"], m.get("text"))
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

inbox, err := client.Inbound.List(context.Background(), opensms.ListParams{Limit: 50})
if err != nil {
	log.Fatal(err)
}
for _, m := range inbox.Items {
	log.Println(m.ID, m.From, m.Text)
}
```

```php tab="PHP" logo="php" title="inbound.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$inbox = $opensms->inbound->list(['limit' => 50]);

foreach ($inbox->items as $m) {
    echo $m['id'], ' ', $m['from'], ' ', $m['text'] ?? '', PHP_EOL;
}
```

```java tab="Java" logo="java" title="ListInbound.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Page<InboundMessage> inbox = opensms.inbound().list(ListParams.ofLimit(50));

for (InboundMessage m : inbox.items) {
    System.out.println(m.id + " " + m.from + " " + m.text);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var inbox = await client.Inbound.ListAsync(new ListParams { Limit = 50 });

foreach (var m in inbox.Items)
{
    Console.WriteLine($"{m.Id} {m.From} {m.Text}");
}
```

```ruby tab="Ruby" logo="ruby" title="inbound.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

inbox = client.inbound.list(limit: 50)

inbox.items.each { |m| puts m.values_at(:id, :from, :text).join(" ") }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let inbox = client.inbound().list(ListParams::limit(50)).await?;

for m in inbox.items {
    let (from, text) = (m.from.unwrap_or_default(), m.text.unwrap_or_default());
    println!("{} {} {}", m.id, from, text);
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let inbox = try await opensms.inbound.list(ListParams(limit: 50))

for m in inbox.items {
    print(m.id, m.from ?? "", m.text ?? "")
}
```
<!-- /tabs -->

```json
{"items":[],"next_cursor":null}
```

Each item has `id`, `from`, `to`, `text`, `received_at` and `virtual_number_id`. Paging uses `limit` (1 to 200, default 50) and `cursor`. With a sandbox key the list is always empty.

## Replying

`POST /v1/inbound/{id}/reply` with `messages:write`, an `Idempotency-Key` and `{"text": "..."}` (1 to 1600 characters). The reply is sent from the number the message was received on, back to its sender, through the normal message endpoint: it gets the usual admission checks, billing and a message ID, and returns what `POST /v1/messages` returns.

<!-- tabs label="Reply to a received message" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/inbound/e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84/reply \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: reply-e41d7a2c-1' \
  -d '{"text":"Thanks, your order ships today."}'
```

```ts tab="TypeScript" logo="typescript" title="reply.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const reply = await opensms.inbound.reply(
  'e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84',
  { text: 'Thanks, your order ships today.' },
  { idempotencyKey: 'reply-e41d7a2c-1' },
);

console.log(reply.id, reply.status);
```

```python tab="Python" logo="python" title="reply.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

reply = client.inbound.reply(
    "e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84",
    text="Thanks, your order ships today.",
    idempotency_key="reply-e41d7a2c-1",
)

print(reply["id"], reply["status"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

reply, err := client.Inbound.Reply(context.Background(), "e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84",
	opensms.InboundReplyParams{Text: "Thanks, your order ships today."},
	opensms.WithIdempotencyKey("reply-e41d7a2c-1"))
if err != nil {
	log.Fatal(err)
}
log.Println(reply.ID, reply.Status)
```

```php tab="PHP" logo="php" title="reply.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$reply = $opensms->inbound->reply(
    'e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84',
    ['text' => 'Thanks, your order ships today.'],
    ['idempotencyKey' => 'reply-e41d7a2c-1'],
);

echo $reply['id'], ' ', $reply['status'], PHP_EOL;
```

```java tab="Java" logo="java" title="ReplyInbound.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Message reply = opensms.inbound().reply(
    "e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84",
    "Thanks, your order ships today.",
    RequestOptions.idempotencyKey("reply-e41d7a2c-1"));

System.out.println(reply.id + " " + reply.status);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var reply = await client.Inbound.ReplyAsync(
    "e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84",
    new InboundReplyParams { Text = "Thanks, your order ships today." },
    new RequestOptions { IdempotencyKey = "reply-e41d7a2c-1" });

Console.WriteLine($"{reply.Id} {reply.Status}");
```

```ruby tab="Ruby" logo="ruby" title="reply.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

reply = client.inbound.reply(
  "e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84",
  text: "Thanks, your order ships today.",
  idempotency_key: "reply-e41d7a2c-1"
)

puts reply[:id], reply[:status]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let reply = client
    .inbound()
    .reply_with(
        "e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84",
        &ReplyInbound { text: "Thanks, your order ships today.".into() },
        &RequestOptions::idempotency_key("reply-e41d7a2c-1"),
    )
    .await?;

println!("{} {}", reply.id, reply.status.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let reply = try await opensms.inbound.reply(
    "e41d7a2c-3b9f-4c6e-8a1d-7f2b5c0e9d84",
    text: "Thanks, your order ships today.",
    idempotencyKey: "reply-e41d7a2c-1"
)

print(reply.id, reply.status ?? "")
```
<!-- /tabs -->

In the sandbox:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"This operation requires the live environment."}
```

## Opt-outs

Recipients who reply with a country's stop keyword should stop receiving your messages. Because inbound receipt is not implemented yet, keep your own opt-out list and add numbers to the suppression list, which every send checks:

<!-- tabs label="Add a suppression" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/compliance/suppressions \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"e164":"+254712345678","reason":"stop_keyword"}'
```

```ts tab="TypeScript" logo="typescript" title="suppress.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const suppression = await opensms.suppressions.create({ e164: '+254712345678', reason: 'stop_keyword' });

console.log(suppression.id, suppression.createdAt);
```

```python tab="Python" logo="python" title="suppress.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

suppression = client.suppressions.create(e164="+254712345678", reason="stop_keyword")

print(suppression["id"], suppression["created_at"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

suppression, err := client.Suppressions.Create(context.Background(),
	opensms.CreateSuppressionParams{E164: "+254712345678", Reason: "stop_keyword"})
if err != nil {
	log.Fatal(err)
}
log.Println(suppression.ID, suppression.CreatedAt)
```

```php tab="PHP" logo="php" title="suppress.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$suppression = $opensms->suppressions->create(['e164' => '+254712345678', 'reason' => 'stop_keyword']);

echo $suppression['id'], ' ', $suppression['created_at'], PHP_EOL;
```

```java tab="Java" logo="java" title="SuppressNumber.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Suppression suppression = opensms.suppressions().create("+254712345678", "stop_keyword");

System.out.println(suppression.id + " " + suppression.createdAt);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var suppression = await client.Suppressions.CreateAsync(
    new SuppressionParams { E164 = "+254712345678", Reason = "stop_keyword" });

Console.WriteLine($"{suppression.Id} {suppression.CreatedAt}");
```

```ruby tab="Ruby" logo="ruby" title="suppress.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

suppression = client.suppressions.create(e164: "+254712345678", reason: "stop_keyword")

puts suppression[:id], suppression[:created_at]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let suppression = client
    .suppressions()
    .create(&CreateSuppression {
        e164: "+254712345678".into(),
        reason: "stop_keyword".into(),
    })
    .await?;

println!("{} {}", suppression.id, suppression.created_at.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let suppression = try await opensms.suppressions.create(e164: "+254712345678", reason: "stop_keyword")

print(suppression.id, suppression.createdAt as Any)
```
<!-- /tabs -->

```json
{"id":179,"e164":"+254712345678","reason":"stop_keyword","created_at":"2026-09-24T14:56:43.929475+03:00"}
```

This needs `compliance:manage` (owner or admin keys only). `reason` is `stop_keyword`, `manual`, `complaint` or `invalid_number`. Adding a number that is already on the list returns `409` `"destination is already suppressed"`, and the SDKs never retry this call. A send to a suppressed number returns `422` `"destination is suppressed"`. `GET /v1/countries/{iso2}/compliance` (no credentials) lists each country's stop keywords; for Kenya they are `STOP`, `UNSUBSCRIBE` and `END`.
