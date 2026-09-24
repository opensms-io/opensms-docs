# Going live

This page walks through everything between a working sandbox integration and real messages reaching handsets: identity checks, legal acceptance, funding, a sender ID and live keys. It is for the developer or workspace owner preparing a production launch. Several steps are done by OpenSMS operators, not by you; each step says who acts.

The server enforces every requirement again when the workspace is activated, so the order below is the order that works.

Most calls on this page need a console session with `X-Workspace-ID`, not an API key, so they are not in the SDKs and are shown with cURL only. The two an API key can make, a card or mobile money top-up (step 5) and a sender ID fee quote (step 10), are shown for every SDK.

![The console's Go live page, showing the five required checks, the sandbox workspace status and the Request to go live button](../assets/screens/developer/go-live.png)

## Summary

| # | Step | Who | API |
| --- | --- | --- | --- |
| 1 | Verify the owner's email | Owner | `POST /v1/auth/email/send`, `POST /v1/auth/verify-email` |
| 2 | Submit company details | Owner | `PUT /v1/onboarding/company` |
| 3 | Upload three verification documents | Owner | `POST /v1/onboarding/documents` |
| 4 | Review documents and approve KYC | **Operator** | `/admin/v1/workspaces/{id}/kyc/approve` |
| 5 | Fund the live wallet | Owner, admin or finance (plus **operator** for bank transfers) | `POST /v1/wallet/topups`, `POST /v1/wallet/topups/manual` |
| 6 | Accept the terms of service and the DPA | Owner | `POST /v1/legal/accept` |
| 7 | Turn on two-factor authentication for every owner and finance member | Each of those users | `POST /v1/auth/2fa/setup`, `POST /v1/auth/2fa/enable` |
| 8 | Request live review | Owner | `POST /v1/onboarding/request-live` |
| 9 | Activate the workspace | **Operator** | `PUT /admin/v1/workspaces/{id}` |
| 10 | Get a sender ID approved | Owner or admin, then **operator** | `POST /v1/sender-ids` |
| 11 | Create live keys and switch your integration | Owner or admin | `POST /v1/keys` with `"test": false` |

Track progress with `GET /v1/onboarding` (owner session, `X-Workspace-ID`). A new workspace returns:

```json
{
  "company_details": null,
  "documents": [],
  "kyc_status": "pending",
  "live_status": "sandbox",
  "steps": [
    { "step": "admin_approved", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" },
    { "step": "company_details", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" },
    { "step": "documents_uploaded", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" },
    { "step": "email_verified", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" },
    { "step": "payment_method_added", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" },
    { "step": "phone_verified", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" },
    { "step": "sender_id_approved", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" },
    { "step": "wallet_funded", "status": "pending", "updated_at": "2026-09-24T07:13:30.053095+03:00" }
  ],
  "workspace_id": "f98e3f20-d354-493d-b003-c39d945e29db"
}
```

Only five steps gate going live: `email_verified`, `company_details`, `documents_uploaded`, `admin_approved` and `wallet_funded`, all `approved`, plus the owner's acceptance of the current terms and DPA. `phone_verified`, `payment_method_added` and `sender_id_approved` are tracked but not required by the server.

`live_status` moves `sandbox` to `pending_review` (after step 8) to `live` (after step 9). An operator can later move a live workspace to `suspended` and back.

## 1. Verify the owner's email

Covered in the [quickstart](quickstart.md#2-verify-your-email-address). It also unlocks sandbox sending.

## 2. Submit company details

```sh
curl -s -X PUT $OPENSMS_API/v1/onboarding/company \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -H 'content-type: application/json' \
  -d '{"name":"Acme Logistics Ltd","country_iso2":"KE","registration_number":"PVT-2026-0042"}'
```

```json
{"payload":{"name":"Acme Logistics Ltd","country_iso2":"KE","registration_number":"PVT-2026-0042"},"status":"submitted","step":"company_details","workspace_id":"29ce64bb-8ec7-424f-8f44-9c0f22393323"}
```

Owner only. `name` (1 to 200 characters), `country_iso2` and `registration_number` (1 to 100 characters) are required. Approved details cannot be edited.

## 3. Upload the verification documents

Upload one file per request as `multipart/form-data`, with `kind` set to `incorporation_certificate`, `proof_of_address` or `director_id`. Files must be real PDF, PNG or JPEG content, at most 10 MiB.

```sh
curl -s -X POST $OPENSMS_API/v1/onboarding/documents \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -F kind=director_id -F file=@director_id.png
```

```json
{"content_type":"image/png","filename":"director_id.png","id":"c3003eac-cdc6-4de3-a5d2-e44a91626995","is_current":true,"kind":"director_id","review_status":"pending","scan_status":"pending","size":70,"status":"submitted","version":1}
```

When all three kinds exist, `documents_uploaded` becomes `submitted`. A file whose content is not a valid PDF, PNG or JPEG is refused:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"document must be a valid PDF, PNG or JPEG"}
```

## 4. KYC review (operator)

Each document is malware scanned (`scan_status` goes from `pending` to `clean`) and then reviewed by an operator. When every current document is clean and approved, the operator approves KYC, which marks `company_details`, `documents_uploaded` and `admin_approved` as `approved`. Approval does not make the workspace live. If a document is rejected, `GET /v1/onboarding` shows the reason on the step or document; upload a corrected file and it is reviewed again.

Until every current document has passed its scan and human review, the operator's approval call is refused:

```json
{"type":"about:blank","title":"Conflict","status":409,"detail":"each current required document must pass scanning and human review before KYC approval"}
```

## 5. Fund the live wallet

Live traffic is prepaid. Either method sets `wallet_funded` to `approved` once money is confirmed; starting a payment does not.

**Card or mobile money.** Owner, admin or finance session (or an API key with `wallet:topup`) calls `POST /v1/wallet/topups` with `X-Environment: live`, `amount`, `currency`, `channel` (`card`, `mobile_money` or `bank_transfer`) and the payer `email`, which must belong to a verified workspace member. The response contains an `authorization_url` to send the payer to. The wallet is credited only when the payment provider confirms it. A payer email that does not belong to a verified workspace member gets `403` `"payer email must belong to a verified workspace member"`.

With a live key (`sk_live_`, scope `wallet:topup`), which needs no `X-Environment` header:

<!-- tabs label="Top up the live wallet" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/wallet/topups \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: topup-2026-09-24-001' \
  -d '{"amount":"5000.00","currency":"KES","channel":"mobile_money","email":"billing@acme.co.ke"}'
```

```ts tab="TypeScript" logo="typescript" title="top-up.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const topup = await opensms.wallet.createTopup(
  { amount: '5000.00', currency: 'KES', channel: 'mobile_money', email: 'billing@acme.co.ke' },
  { idempotencyKey: 'topup-2026-09-24-001' },
);

console.log(topup.authorizationUrl); // send the payer here
```

```python tab="Python" logo="python" title="top_up.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

topup = client.wallet.create_topup(
    amount="5000.00",
    currency="KES",
    channel="mobile_money",
    email="billing@acme.co.ke",
    idempotency_key="topup-2026-09-24-001",
)

print(topup["authorization_url"])  # send the payer here
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

topup, err := client.Wallet.CreateTopup(context.Background(), opensms.CreateTopupParams{
	Amount:   "5000.00",
	Currency: "KES",
	Channel:  "mobile_money",
	Email:    "billing@acme.co.ke",
}, opensms.WithIdempotencyKey("topup-2026-09-24-001"))
if err != nil {
	log.Fatal(err)
}
fmt.Println(topup.AuthorizationURL) // send the payer here
```

```php tab="PHP" logo="php" title="top-up.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$topup = $opensms->wallet->createTopup([
    'amount' => '5000.00',
    'currency' => 'KES',
    'channel' => 'mobile_money',
    'email' => 'billing@acme.co.ke',
], ['idempotencyKey' => 'topup-2026-09-24-001']);

echo $topup['authorization_url'], PHP_EOL; // send the payer here
```

```java tab="Java" logo="java" title="TopUp.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Topup topup = opensms.wallet().createTopup(
    new TopupParams("5000.00", "KES", "mobile_money", "billing@acme.co.ke"),
    RequestOptions.idempotencyKey("topup-2026-09-24-001"));

System.out.println(topup.authorizationUrl); // send the payer here
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var topup = await client.Wallet.CreateTopupAsync(new CreateTopupParams
{
    Amount = "5000.00",
    Currency = "KES",
    Channel = "mobile_money",
    Email = "billing@acme.co.ke",
}, new RequestOptions { IdempotencyKey = "topup-2026-09-24-001" });

Console.WriteLine(topup.AuthorizationUrl); // send the payer here
```

```ruby tab="Ruby" logo="ruby" title="top_up.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

topup = client.wallet.create_topup(
  amount: "5000.00",
  currency: "KES",
  channel: "mobile_money",
  email: "billing@acme.co.ke",
  idempotency_key: "topup-2026-09-24-001"
)

puts topup[:authorization_url] # send the payer here
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let params = CreateTopup {
    amount: "5000.00".into(),
    currency: "KES".into(),
    channel: "mobile_money".into(),
    email: "billing@acme.co.ke".into(),
};
let topup = client
    .wallet()
    .create_topup_with(&params, &RequestOptions::idempotency_key("topup-2026-09-24-001"))
    .await?;

println!("{}", topup.authorization_url.as_deref().unwrap_or_default()); // send the payer here
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let topup = try await opensms.wallet.createTopup(
    .init(amount: "5000.00", currency: "KES", channel: "mobile_money", email: "billing@acme.co.ke"),
    idempotencyKey: "topup-2026-09-24-001"
)

print(topup.authorizationUrl ?? "") // send the payer here
```
<!-- /tabs -->

A sandbox key gets `422` `"sandbox wallets cannot use payment providers"`.

**Bank transfer.** Upload the proof of transfer. This needs a browser session of an owner, admin or finance member with two-factor authentication on, `X-Environment: live`, and an `Idempotency-Key`:

```sh
curl -s -X POST $OPENSMS_API/v1/wallet/topups/manual \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -H 'x-environment: live' -H 'idempotency-key: manual-1' \
  -F amount=5000.00 -F currency=KES -F file=@proof.png
```

```json
{"id":"0e91734d-ff9d-43e5-90cd-2d4cdc5659a8","status":"awaiting_approval"}
```

A finance operator then approves the payment, which credits the wallet. That approval also requires a clean malware scan of the proof; until the scan is clean it is refused with `422` `"A clean malware scan of the payment proof is required."`

## 6. Accept the terms of service and the DPA

List the current versions, then accept each one with the exact version string:

```sh
curl -s $OPENSMS_API/v1/legal/documents -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE"
```

```json
{"documents":[
  {"id":"ddad007d-0ac9-4823-b083-d2965a7af750","document":"dpa","version":"1.0","url":"https://opensms.io/legal/dpa/1.0","published_at":"2026-09-24T07:08:21.163602+03:00"},
  {"id":"30ca7041-ca82-4eaa-94ea-422969ca10ca","document":"privacy","version":"1.0","url":"https://opensms.io/legal/privacy/1.0","published_at":"2026-09-24T07:08:21.163602+03:00"},
  {"id":"1d1ef5b2-dfa8-45dd-a3b0-83bdc600c08f","document":"terms","version":"1.0","url":"https://opensms.io/legal/terms/1.0","published_at":"2026-09-24T07:08:21.163602+03:00"}
]}
```

```sh
curl -s -X POST $OPENSMS_API/v1/legal/accept \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -H 'content-type: application/json' -d '{"document":"terms","version":"1.0"}'
```

```json
{"accepted_at":"2026-09-24T07:24:58.433494+03:00","document":"terms","id":6,"version":"1.0","workspace_id":"f98e3f20-d354-493d-b003-c39d945e29db"}
```

Repeat with `"document":"dpa"`. Accepting the same version again returns the original receipt. A version that is not the current one returns `409` with `"code":"legal_version_not_current"`. `GET /v1/legal/acceptances` shows what you have accepted. Only the terms and the DPA gate going live; the privacy notice does not.

## 7. Turn on two-factor authentication

Activation is refused until every active owner and finance member has an authenticator enabled. Two-factor is also required for bank-transfer top-ups, live number purchases, and owner lookups in live. See [authentication](../integrate/authentication.md#two-factor-authentication) for the setup calls. Once a workspace is live, its owners and finance members cannot turn two-factor off (`409`).

## 8. Request live review

```sh
curl -s -X POST $OPENSMS_API/v1/onboarding/request-live \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE"
```

When every prerequisite is met this returns `202` with `{"workspace_id":"...","live_status":"pending_review"}`. It does not enable live sending. Owner only; a workspace that is not in `sandbox` gets `409`.

With anything missing:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"live sending prerequisites are incomplete"}
```

The response does not say which step is missing; read `GET /v1/onboarding` and `GET /v1/legal/acceptances`.

## 9. Activation (operator)

An operations operator reviews the request and sets the workspace to `live` (or back to `sandbox` with a reason). The server re-checks KYC, the five steps, legal acceptance and two-factor for owners and finance members at that moment. The change is emitted as a `workspace.live_status_changed` event in the live environment, which your live [webhooks](../integrate/delivery-reports-and-webhooks.md) can subscribe to.

## 10. Get a sender ID approved

Live messages need an approved sender ID: one approved for your workspace, or a platform default sender configured on the route for the destination. Custom sender IDs are requested with `POST /v1/sender-ids` (owner or admin session, or a key with `senders:manage`) and need a certificate, a signatory ID and an authorization letter uploaded first; without them the request is refused:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"certificate, signatory-id, and authorization documents are required for a custom sender ID"}
```

An operator decides on the request and, where the carrier requires it, registers it with the provider. Some markets charge a registration fee; `GET /v1/sender-ids/quote?countries=KE` (key scope `sender-ids:read`) shows it before you submit:

<!-- tabs label="Sender ID fee quote" -->
```sh tab="cURL" title="Terminal"
curl -s "$OPENSMS_API/v1/sender-ids/quote?countries=KE" -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="sender-id-fees.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const quote = await opensms.senderIds.quote({ countries: ['KE'] });

console.log(quote.quoteId);
for (const fee of quote.entries ?? []) console.log(fee.country, fee.provider, fee.feeAmount, fee.feeCurrency);
```

```python tab="Python" logo="python" title="sender_id_fees.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

quote = client.sender_ids.quote(countries=["KE"])

print(quote["quote_id"])
for fee in quote["entries"]:
    print(fee["country"], fee["provider"], fee["fee_amount"], fee["fee_currency"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

quote, err := client.SenderIDs.Quote(context.Background(), opensms.QuoteSenderIDParams{
	Countries: []string{"KE"},
})
if err != nil {
	log.Fatal(err)
}
fmt.Println(quote.QuoteID)
for _, fee := range quote.Entries {
	fmt.Println(fee.Country, fee.Provider, fee.FeeAmount, fee.FeeCurrency)
}
```

```php tab="PHP" logo="php" title="sender-id-fees.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$quote = $opensms->senderIds->quote(['countries' => ['KE']]);

echo $quote['quote_id'], PHP_EOL;
foreach ($quote['entries'] as $fee) {
    echo $fee['country'], ' ', $fee['provider'], ' ', $fee['fee_amount'], ' ', $fee['fee_currency'], PHP_EOL;
}
```

```java tab="Java" logo="java" title="SenderIdFees.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

SenderIdQuote quote = opensms.senderIds().quote(List.of("KE"));

System.out.println(quote.quoteId);
for (SenderIdQuote.Entry fee : quote.entries) {
    System.out.println(fee.country + " " + fee.provider + " " + fee.feeAmount + " " + fee.feeCurrency);
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var quote = await client.SenderIds.QuoteAsync(new SenderIdQuoteParams { Countries = new[] { "KE" } });

Console.WriteLine(quote.QuoteId);
foreach (var fee in quote.Entries ?? [])
    Console.WriteLine($"{fee.Country} {fee.Provider} {fee.FeeAmount} {fee.FeeCurrency}");
```

```ruby tab="Ruby" logo="ruby" title="sender_id_fees.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

quote = client.sender_ids.quote(countries: ["KE"])

puts quote[:quote_id]
quote[:entries].each { |fee| puts fee.values_at(:country, :provider, :fee_amount, :fee_currency).join(" ") }
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let quote = client
    .sender_ids()
    .quote(&QuoteSenderId { countries: vec!["KE".into()] })
    .await?;

println!("{}", quote.quote_id.as_deref().unwrap_or_default());
for fee in quote.entries.unwrap_or_default() {
    println!("{} {} {} {}", fee.country.as_deref().unwrap_or_default(), fee.provider.as_deref().unwrap_or_default(), fee.fee_amount.as_deref().unwrap_or_default(), fee.fee_currency.as_deref().unwrap_or_default());
}
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let quote = try await opensms.senderIds.quote(countries: ["KE"])

print(quote.quoteId ?? "")
for fee in quote.entries ?? [] {
    print(fee.country ?? "", fee.provider ?? "", fee.feeAmount ?? "", fee.feeCurrency ?? "")
}
```
<!-- /tabs -->

In the sandbox the quote comes from the mock provider and costs nothing:

```json
{"quote_id":"sq_3500e728cd584131...","entries":[{"country":"KE","provider":"Mock provider (sandbox)","fee_amount":"0","fee_currency":""}],"totals":[]}
```

The console's **Sender IDs** page walks through the same flow.

## 11. Create live keys and switch over

Owners and admins create live keys with `"test": false`:

```sh
curl -s -X POST $OPENSMS_API/v1/keys \
  -H "authorization: Bearer $SESSION" -H "x-workspace-id: $WORKSPACE" \
  -H 'content-type: application/json' -d '{"label":"live","test":false}'
```

```json
{"key":"sk_live_ya8M-wVQ...","key_info":{"id":"44da5572-01ad-41a6-a70f-368ddb0a778d","prefix":"sk_live_","label":"live","scopes":["messages:read","messages:write"],"created_at":"2026-09-24T07:27:28.844455+03:00","last_used_at":null}}
```

You can create a live key before the workspace is live, but it cannot send yet:

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"workspace is not approved for live sending"}
```

Things that change when you switch from `sk_test_` to `sk_live_`:

- Live data is separate. Recreate webhooks, templates and contacts in live; they do not carry over from the sandbox.
- Messages cost money and can be refused with `402` (insufficient funds or spend cap). See [billing and wallet](../integrate/billing-and-wallet.md).
- Destinations must have a live route and price, or the send is refused with `422` `"no eligible live route"` or `"no verified live price"`.
- Country rules apply: quiet hours, do-not-disturb registries for marketing traffic, and content rules. See [sending messages](../integrate/sending-messages.md#why-a-message-is-refused).
- Carriers send delivery reports, so messages go `queued`, `sending`, `sent`, then `delivered`, `failed` or `expired`.

A live payment review hold (set by operators after a disputed payment) pauses live sending with `403` `"live sending is paused pending payment review"` until it is resolved.
