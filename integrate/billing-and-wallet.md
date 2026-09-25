# Billing and wallet

OpenSMS is prepaid: live messages, lookups, virtual numbers and sender registrations are paid from a wallet you top up in advance. This page is the developer's view of money: reading balances and the ledger, looking up prices, how a message is priced and charged, spend caps, top-ups and invoices. It is for developers who need to show balances, estimate costs or handle `402` responses.

Money is always a decimal string (`"1.000000"`), never a float. Parse it with a decimal type.

## Balances

`GET /v1/wallet` with a key that has `wallet:read` (owner or admin keys only), or any member's session with `X-Workspace-ID` and `X-Environment`. A key returns the wallet of its own environment.

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s $OPENSMS_API/v1/wallet -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="wallet.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

for (const wallet of await opensms.wallet.balances()) {
  console.log(wallet.environment, wallet.currency, wallet.balance, wallet.reserved);
}
```

```python tab="Python" logo="python" title="wallet.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

for wallet in client.wallet.balances():
    print(wallet["environment"], wallet["currency"], wallet["balance"], wallet["reserved"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

balances, err := client.Wallet.Balances(context.Background())
if err != nil {
	log.Fatal(err)
}
for _, w := range balances {
	log.Println(w.Environment, w.Currency, w.Balance, w.Reserved)
}
```

```php tab="PHP" logo="php" title="wallet.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

foreach ($opensms->wallet->balances() as $wallet) {
    echo $wallet['environment'], ' ', $wallet['currency'], ' ', $wallet['balance'], ' ', $wallet['reserved'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

for (WalletBalance wallet : opensms.wallet().balances()) {
    System.out.println(wallet.environment + " " + wallet.currency + " " + wallet.balance + " " + wallet.reserved);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

foreach (var wallet in await client.Wallet.BalancesAsync())
{
    Console.WriteLine($"{wallet.Environment} {wallet.Currency} {wallet.Balance} {wallet.Reserved}");
}
```

```ruby tab="Ruby" logo="ruby" title="wallet.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

client.wallet.balances.each do |wallet|
  puts "#{wallet[:environment]} #{wallet[:currency]} #{wallet[:balance]} #{wallet[:reserved]}"
end
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

for wallet in client.wallet().balances().await? {
    println!(
        "{} {} {} {}",
        wallet.environment.unwrap_or_default(),
        wallet.currency.unwrap_or_default(),
        wallet.balance.unwrap_or_default(),
        wallet.reserved.unwrap_or_default(),
    );
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

for wallet in try await opensms.wallet.balances() {
    print(wallet.environment ?? "", wallet.currency ?? "", wallet.balance ?? "", wallet.reserved ?? "")
}
```
<!-- /tabs -->

```json
{"data":[{"id":"6dbc48b0-0f7f-4fd5-8dda-e67520577970","currency":"KES","balance":"10000.000000","reserved":"0.000000","environment":"sandbox"}]}
```

| Field | Meaning |
| --- | --- |
| `balance` | Money in the wallet. |
| `reserved` | Part of the balance set aside for accepted live messages and lookups that are not yet charged or released. |
| `currency` | The workspace currency, from its registration country. |

A key without `wallet:read` gets `403` `"wallet access denied"`.

## Ledger

`GET /v1/wallet/ledger` lists every posting, newest first. `limit` is 1 to 200 (default 50); `before=<id>` pages to older entries.

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s "$OPENSMS_API/v1/wallet/ledger?limit=5" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="ledger.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

for (const entry of await opensms.wallet.ledger({ limit: 5 })) {
  console.log(entry.id, entry.type, entry.amount, entry.balanceAfter);
}
```

```python tab="Python" logo="python" title="ledger.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

for entry in client.wallet.ledger(limit=5):
    print(entry["id"], entry["type"], entry["amount"], entry["balance_after"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

entries, err := client.Wallet.Ledger(context.Background(), opensms.LedgerParams{Limit: opensms.Int(5)})
if err != nil {
	log.Fatal(err)
}
for _, e := range entries {
	log.Println(e.ID, e.Type, e.Amount, e.BalanceAfter)
}
```

```php tab="PHP" logo="php" title="ledger.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

foreach ($opensms->wallet->ledger(['limit' => 5]) as $entry) {
    echo $entry['id'], ' ', $entry['type'], ' ', $entry['amount'], ' ', $entry['balance_after'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

for (LedgerEntry entry : opensms.wallet().ledger(5, null)) {
    System.out.println(entry.id + " " + entry.type + " " + entry.amount + " " + entry.balanceAfter);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

foreach (var entry in await client.Wallet.LedgerAsync(new LedgerParams { Limit = 5 }))
{
    Console.WriteLine($"{entry.Id} {entry.Type} {entry.Amount} {entry.BalanceAfter}");
}
```

```ruby tab="Ruby" logo="ruby" title="ledger.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

client.wallet.ledger(limit: 5).each do |entry|
  puts "#{entry[:id]} #{entry[:type]} #{entry[:amount]} #{entry[:balance_after]}"
end
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let entries = client
    .wallet()
    .ledger(LedgerParams { limit: Some(5), ..Default::default() })
    .await?;
for e in entries {
    println!("{} {} {} {}", e.id, e.r#type.as_deref().unwrap_or_default(), e.amount.as_deref().unwrap_or_default(), e.balance_after.as_deref().unwrap_or_default());
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

for entry in try await opensms.wallet.ledger(limit: 5) {
    print(entry.id, entry.type ?? "", entry.amount ?? "", entry.balanceAfter ?? "")
}
```
<!-- /tabs -->

```json
{"data":[{"id":56,"wallet_id":"6dbc48b0-0f7f-4fd5-8dda-e67520577970","type":"adjustment","amount":"10000.000000","balance_after":"10000.000000","reserved_delta":"0.000000","reserved_after":"0.000000","created_at":"2026-09-24T07:27:19.559329+03:00"}]}
```

`type` is one of `topup`, `reserve`, `charge`, `release`, `refund`, `fee` or `adjustment`. Entries can carry `reference`, `payment_id` and `message_id`. The ledger is append-only.

## Sandbox wallet

A background job funds a new sandbox wallet with 10,000.00 in the workspace currency (the `adjustment` above) within seconds of the workspace being created, so a read in the first moment can still show `0.000000`. The balance is reset to 10,000.00 daily. Sandbox messages and lookups cost `0`, so it only matters for testing balance displays. Owners, admins and finance members can add practice credit from a browser session. Session only: the SDKs authenticate with API keys and do not include this call, so it is shown with cURL.

```sh
curl -s -X POST $OPENSMS_API/v1/wallet/sandbox-credits \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" -H 'x-environment: sandbox' \
  -H 'idempotency-key: credit-1' -H 'content-type: application/json' \
  -d '{"amount":"500.00","currency":"KES"}'
```

```json
{"wallet_id":"6dbc48b0-0f7f-4fd5-8dda-e67520577970","ledger_id":"57","amount":"500.00","currency":"KES","balance":"10500.000000","environment":"sandbox","status":"credited","simulated":true}
```

Limits: 0.01 to 10,000.00 per call, 10,000.00 per workspace per UTC day, and a balance of at most 100,000.00. API keys get `401` `"Browser session required."`

## Prices

### Your price book

`GET /v1/pricing` (key scope `pricing:read`, or any member's session) returns the sell prices that apply to your workspace. Filter with `country=KE` and `product=sms|lookup|number_monthly` (default `sms`).

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s "$OPENSMS_API/v1/pricing?country=KE" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="pricing.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const prices = await opensms.pricing.get({ country: 'KE' });
for (const entry of prices.entries ?? []) {
  console.log(entry.minMonthlyVolume, entry.sellAmount, entry.sellCurrency);
}
```

```python tab="Python" logo="python" title="pricing.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

prices = client.pricing.get(country="KE")
for entry in prices["entries"]:
    print(entry["min_monthly_volume"], entry["sell_amount"], entry["sell_currency"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

prices, err := client.Pricing.Get(context.Background(), opensms.PricingParams{Country: "KE"})
if err != nil {
	log.Fatal(err)
}
for _, e := range prices.Entries {
	if e.SellAmount != nil { // null for markups on the provider cost
		log.Println(e.MinMonthlyVolume, *e.SellAmount, e.SellCurrency)
	}
}
```

```php tab="PHP" logo="php" title="pricing.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$prices = $opensms->pricing->get(['country' => 'KE']);
foreach ($prices['entries'] as $entry) {
    echo $entry['min_monthly_volume'], ' ', $entry['sell_amount'], ' ', $entry['sell_currency'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

PriceList prices = opensms.pricing().get("sms", "KE");
for (PriceList.Entry entry : prices.entries) {
    System.out.println(entry.minMonthlyVolume + " " + entry.sellAmount + " " + entry.sellCurrency);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var prices = await client.Pricing.GetAsync(new PricingParams { Country = "KE" });
foreach (var entry in prices.Entries ?? new())
{
    Console.WriteLine($"{entry.MinMonthlyVolume} {entry.SellAmount} {entry.SellCurrency}");
}
```

```ruby tab="Ruby" logo="ruby" title="pricing.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

prices = client.pricing.get(country: "KE")
prices[:entries].each do |entry|
  puts "#{entry[:min_monthly_volume]} #{entry[:sell_amount]} #{entry[:sell_currency]}"
end
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let prices = client
    .pricing()
    .get(PricingParams { country: Some("KE".into()), ..Default::default() })
    .await?;
for e in prices.entries.unwrap_or_default() {
    println!("{} {} {}", e.min_monthly_volume.unwrap_or_default(), e.sell_amount.as_deref().unwrap_or_default(), e.sell_currency.as_deref().unwrap_or_default());
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let prices = try await opensms.pricing.get(country: "KE")
for entry in prices.entries ?? [] {
    print(entry.minMonthlyVolume ?? 0, entry.sellAmount ?? "", entry.sellCurrency ?? "")
}
```
<!-- /tabs -->

```json
{
  "currency": "KES",
  "entries": [
    {"country_iso2":"KE","country_name":"Kenya","carrier_id":null,"carrier_name":null,"product":"sms","min_monthly_volume":0,"markup_type":"absolute_price","markup_value":"1.000000","sell_currency":"KES","sell_amount":"1.000000","converted_amount":"1.000000","converted_currency":"KES","workspace_override":false,"effective_from":"2026-09-24T07:08:21.163602+03:00","fx_rate":"1"},
    {"country_iso2":"KE","country_name":"Kenya","carrier_id":null,"carrier_name":null,"product":"sms","min_monthly_volume":100000,"markup_type":"absolute_price","markup_value":"0.800000","sell_currency":"KES","sell_amount":"0.800000","converted_amount":"0.800000","converted_currency":"KES","workspace_override":false,"effective_from":"2026-09-24T07:08:21.163602+03:00","fx_rate":"1"}
  ],
  "product": "sms",
  "workspace_id": "29ce64bb-8ec7-424f-8f44-9c0f22393323"
}
```

| Field | Meaning |
| --- | --- |
| `markup_type` | `absolute_price`: a fixed sell price in `sell_amount`. `fixed` or `percent`: a markup on the provider's current cost, so `sell_amount` is null and the price is only known at send time. |
| `min_monthly_volume` | The volume tier the row belongs to. |
| `workspace_override` | `true` when the row is a price negotiated for your workspace. |
| `converted_amount`, `converted_currency`, `fx_rate` | The sell price in your workspace currency, when an exchange rate is available. |
| `carrier_id`, `carrier_name` | Set for carrier-specific prices; null for the country default. |

Precedence is your workspace override, then country and carrier, then country. If a country has no `product=lookup` price, live lookups there are refused with `lookup_price_unavailable`.

**Volume tiers are listed but not applied.** At send time the API uses only the `min_monthly_volume: 0` row, so the 100,000-message tier above does not lower the price charged today.

### Public catalogue

No credentials needed:

| Call | Returns |
| --- | --- |
| `GET /v1/countries` | Active countries with the base `price_per_message` (your workspace's if you send a workspace credential). |
| `GET /v1/countries/{iso2}/routes` | Currently routable providers with `sell_price` and latency. |
| `GET /v1/countries/{iso2}/carriers` | Carriers and their prefixes. |
| `GET /v1/countries/{iso2}/compliance` | Quiet hours, stop keywords, content rules. |

Abridged to one country:

```json
{"iso2":"KE","name":"Kenya","dial_code":"+254","currency":"KES","status":"active","price_per_message":{"amount":"1.000000","currency":"KES"},"sender_kinds":[],"providers_available":0}
```

`GET /v1/countries/{iso2}/routes` returns `[]` for a country with no live provider configured.

## How a message is charged

1. **Admission.** The API picks the route and price for the destination, multiplies the per-part price by the message's `parts`, and reserves that amount. The price is locked on the message (`price`, `currency`) and does not change if prices change later.
2. **Checks at reservation.** Not enough available balance: `402` `"wallet has insufficient funds"`. Over the spend cap: `402` `"workspace spend cap reached"`. No route or no price: `422`.
3. **Submission.** When a provider accepts the message (`sent`), the reservation becomes a `charge`. If no provider accepts it, or you cancel it while `queued` or `scheduled`, the reservation is `release`d.
4. **After sending.** A later `failed` or `expired` delivery report does not refund automatically. Refunds are made by operators and appear as `refund` entries.

Each message's `billing` array shows `reserved_amount`, `charged_amount` and `refunded_amount` per currency. `GET /v1/messages/{id}/attempts` also shows a price per attempt, but that is the quote on the attempt, not an extra charge: do not add attempt prices together.

Analytics `spend` (`GET /v1/analytics/overview`) counts SMS charges, fees and refunds only, not lookups or other wallet activity.

## Spend cap

An owner can set a monthly limit on live spending (browser session, `X-Workspace-ID`). Session only: the SDKs authenticate with API keys and do not include this call, so it is shown with cURL.

```sh
curl -s -X PUT $OPENSMS_API/v1/settings/spend-cap \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -H 'content-type: application/json' -d '{"amount":"25000.00"}'
```

```json
{"amount":"25000.00"}
```

`GET /v1/settings/spend-cap` returns the same shape; `null` means no cap and `"0"` blocks all new spending. The amount is in the workspace currency, up to 2 decimal places.

- Cycles are calendar months anchored on the workspace's `spend_cycle_anchor` day (see `GET /v1/workspace`), in UTC.
- Messages count when they are accepted (including `scheduled` and `held` ones). Lookups, number purchases and renewals, and sender registration fees count too.
- Lowering the cap never cancels messages already accepted; it only blocks new ones.
- The sandbox never enforces a cap.

## Topping up

| Method | Who | Call | Notes |
| --- | --- | --- | --- |
| Card, mobile money or bank transfer through the payment provider | Owner, admin, finance session, or a key with `wallet:topup` | `POST /v1/wallet/topups` with `amount`, `currency`, `channel`, `email` and an `Idempotency-Key` | Returns `authorization_url` for the payer. The wallet is credited when the provider confirms. |
| Manual bank transfer | Owner, admin, finance session with two-factor | `POST /v1/wallet/topups/manual` (multipart: `amount`, `currency`, `file`) | Creates `awaiting_approval`; an operator credits the wallet after checking the proof. |
| Automatic top-up | Owner, admin, finance session | `GET`, `PUT /v1/wallet/auto-topup` | Charges a saved card when the balance falls to a threshold. Needs a saved card from an earlier card payment. |

Top-ups are live only. Real refusals:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"sandbox wallets cannot use payment providers"}
```

(sandbox `X-Environment`), and with `X-Environment: live` and an unverified payer email:

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"payer email must belong to a verified workspace member"}
```

Initializing a payment never credits the wallet. If a top-up call times out, retry with the same `Idempotency-Key`; a new key could start a second payment. See [going live](../getting-started/going-live.md#5-fund-the-live-wallet) for the manual transfer example.

## Invoices

`GET /v1/invoices` and `GET /v1/invoices/{id}` are for owners, admins and finance members with a browser session, `X-Workspace-ID` and `X-Environment`. API keys get `401` `"Browser session required."` Session only: the SDKs authenticate with API keys and do not include this call, so it is shown with cURL.

```sh
curl -s $OPENSMS_API/v1/invoices -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" -H 'x-environment: live'
```

```json
{"items":[],"next_cursor":null}
```

Invoice fields: `id`, `workspace_id`, `number`, `environment`, `currency`, `period_start`, `period_end`, `subtotal`, `vat_percent` (a number), `vat_amount`, `total`, `pdf_url` (null when there is no PDF) and `issued_at`.

**The list is always empty on the current build:** no code issues invoices yet. A monthly worker drafts statements for operator review, but those are not exposed to customers and are not invoices. Use the [ledger](#ledger) for your own reconciliation until invoicing ships.
