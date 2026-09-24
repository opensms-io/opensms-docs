# Number lookup

Number lookup tells you, for a phone number, its country, its current carrier, whether it was ported and whether it is valid, before you send to it. This page is for developers who want to clean lists, route by carrier or catch bad numbers at signup. Lookups are asynchronous operations: you request one, then read its result.

## Request a lookup

`POST /v1/lookup` with a key that has `lookup:request` (or an owner, admin or developer session with `X-Workspace-ID` and `X-Environment`). `Idempotency-Key` is required (up to 200 characters).

<!-- tabs label="Request a lookup" -->
<!-- test:lookup-curl -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/lookup \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: lookup-1' \
  -d '{"to":"+254700000001"}'
```

```ts tab="TypeScript" logo="typescript" title="lookup.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const lookup = await opensms.lookups.create({ to: '+254700000001' }, { idempotencyKey: 'lookup-1' });

console.log(lookup.id, lookup.state, lookup.country, lookup.source);
```

```python tab="Python" logo="python" title="lookup.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

lookup = client.lookups.create(to="+254700000001", idempotency_key="lookup-1")

print(lookup["id"], lookup["state"], lookup["country"], lookup["source"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

lookup, err := client.Lookups.Create(context.Background(),
	opensms.CreateLookupParams{To: "+254700000001"}, opensms.WithIdempotencyKey("lookup-1"))
if err != nil {
	log.Fatal(err)
}
log.Println(lookup.ID, lookup.State, lookup.Country, lookup.Source)
```

```php tab="PHP" logo="php" title="lookup.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$lookup = $opensms->lookups->create(['to' => '+254700000001'], ['idempotencyKey' => 'lookup-1']);

echo $lookup['id'], ' ', $lookup['state'], ' ', $lookup['country'], ' ', $lookup['source'], PHP_EOL;
```

```java tab="Java" logo="java" title="CreateLookup.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Lookup lookup = opensms.lookups().create("+254700000001", RequestOptions.idempotencyKey("lookup-1"));

System.out.println(lookup.id + " " + lookup.state + " " + lookup.country + " " + lookup.source);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var lookup = await client.Lookups.CreateAsync(
    new CreateLookupParams { To = "+254700000001" },
    new RequestOptions { IdempotencyKey = "lookup-1" });

Console.WriteLine($"{lookup.Id} {lookup.State} {lookup.Country} {lookup.Source}");
```

```ruby tab="Ruby" logo="ruby" title="lookup.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

lookup = client.lookups.create(to: "+254700000001", idempotency_key: "lookup-1")

puts lookup.values_at(:id, :state, :country, :source).join(" ")
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let lookup = client
    .lookups()
    .create_with(
        &CreateLookup { to: "+254700000001".into() },
        &RequestOptions::idempotency_key("lookup-1"),
    )
    .await?;

let (state, country) = (lookup.state.unwrap_or_default(), lookup.country.unwrap_or_default());
println!("{} {} {} {}", lookup.id, state, country, lookup.source.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let lookup = try await opensms.lookups.create(to: "+254700000001", idempotencyKey: "lookup-1")

print(lookup.id, lookup.state ?? "", lookup.country ?? "", lookup.source ?? "")
```
<!-- /tabs -->

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

<!-- tabs label="Read a lookup" -->
```sh tab="cURL" title="Terminal"
curl -s $OPENSMS_API/v1/lookup/db365f9f-89a4-439e-845b-2b41c83d3192 -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="get-lookup.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const lookup = await opensms.lookups.get('db365f9f-89a4-439e-845b-2b41c83d3192');

console.log(lookup.state, lookup.country, lookup.ported, lookup.valid);
```

```python tab="Python" logo="python" title="get_lookup.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

lookup = client.lookups.get("db365f9f-89a4-439e-845b-2b41c83d3192")

print(lookup["state"], lookup["country"], lookup["ported"], lookup["valid"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

lookup, err := client.Lookups.Get(context.Background(), "db365f9f-89a4-439e-845b-2b41c83d3192")
if err != nil {
	log.Fatal(err)
}
log.Println(lookup.State, lookup.Country)
if lookup.Valid != nil {
	log.Println("valid:", *lookup.Valid) // nil means no validity claim
}
```

```php tab="PHP" logo="php" title="get-lookup.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$lookup = $opensms->lookups->get('db365f9f-89a4-439e-845b-2b41c83d3192');

var_dump($lookup['state'], $lookup['country'], $lookup['ported'], $lookup['valid']);
```

```java tab="Java" logo="java" title="GetLookup.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Lookup lookup = opensms.lookups().get("db365f9f-89a4-439e-845b-2b41c83d3192");

System.out.println(lookup.state + " " + lookup.country + " " + lookup.ported + " " + lookup.valid);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var lookup = await client.Lookups.GetAsync("db365f9f-89a4-439e-845b-2b41c83d3192");

Console.WriteLine($"{lookup.State} {lookup.Country} {lookup.Ported} {lookup.Valid}");
```

```ruby tab="Ruby" logo="ruby" title="get_lookup.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

lookup = client.lookups.get("db365f9f-89a4-439e-845b-2b41c83d3192")

p lookup.values_at(:state, :country, :ported, :valid)
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let lookup = client
    .lookups()
    .get("db365f9f-89a4-439e-845b-2b41c83d3192")
    .await?;

// None for ported or valid means no claim either way; it prints as "none".
let claim = |v: Option<bool>| v.map_or("none".to_string(), |b| b.to_string());
println!(
    "{} {} {} {}",
    lookup.state.as_deref().unwrap_or_default(),
    lookup.country.as_deref().unwrap_or_default(),
    claim(lookup.ported),
    claim(lookup.valid),
);
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let lookup = try await opensms.lookups.get("db365f9f-89a4-439e-845b-2b41c83d3192")

// nil for ported or valid means no claim either way.
print(lookup.state ?? "", lookup.country ?? "", lookup.ported as Any, lookup.valid as Any)
```
<!-- /tabs -->

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
