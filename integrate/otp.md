# One-time passcodes (OTP)

The OTP API generates a numeric code, sends it by SMS, and later checks the code your user types in. OpenSMS stores only a hash of the code, so you never handle or store it. This page is for developers adding phone verification or two-step login to their product.

## How it works

1. Your server calls `POST /v1/otp/send` with the user's phone number. OpenSMS generates the code, sends it as an `otp` traffic message, and returns an `otp_id`.
2. You keep the `otp_id` with the user's pending session.
3. The user types the code. Your server calls `POST /v1/otp/verify` with `otp_id` and the code.
4. `{"valid": true}` means the code matched. Each OTP can succeed once.

Both calls need `messages:write` on an API key (or an owner, admin or developer session with `X-Workspace-ID` and `X-Environment`).

## Send a code

<!-- tabs label="Send an OTP" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/otp/send \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: signup-7781-otp-1' \
  -d '{"to":"+254712345678","template":"Your Acme code is {{code}}","length":6,"ttl_seconds":300}'
```

```ts tab="TypeScript" logo="typescript" title="send-otp.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const { otpId } = await opensms.otp.send(
  { to: '+254712345678', template: 'Your Acme code is {{code}}', length: 6, ttlSeconds: 300 },
  { idempotencyKey: 'signup-7781-otp-1' },
);

console.log(otpId); // keep it with the user's pending session
```

```python tab="Python" logo="python" title="send_otp.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

otp = client.otp.send(
    to="+254712345678",
    template="Your Acme code is {{code}}",
    length=6,
    ttl_seconds=300,
    idempotency_key="signup-7781-otp-1",
)

print(otp["otp_id"])  # keep it with the user's pending session
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

otp, err := client.OTP.Send(context.Background(), opensms.SendOTPParams{
	To:         "+254712345678",
	Template:   "Your Acme code is {{code}}",
	Length:     6,
	TTLSeconds: 300,
}, opensms.WithIdempotencyKey("signup-7781-otp-1"))
if err != nil {
	log.Fatal(err)
}
log.Println(otp.OTPID) // keep it with the user's pending session
```

```php tab="PHP" logo="php" title="send-otp.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$otp = $opensms->otp->send([
    'to' => '+254712345678',
    'template' => 'Your Acme code is {{code}}',
    'length' => 6,
    'ttl_seconds' => 300,
], ['idempotencyKey' => 'signup-7781-otp-1']);

echo $otp['otp_id'], PHP_EOL; // keep it with the user's pending session
```

```java tab="Java" logo="java" title="SendOtp.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

OtpSendResult otp = opensms.otp().send(
    new OtpSendParams("+254712345678")
        .template("Your Acme code is {{code}}")
        .length(6)
        .ttlSeconds(300),
    RequestOptions.idempotencyKey("signup-7781-otp-1"));

System.out.println(otp.otpId); // keep it with the user's pending session
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var otp = await client.Otp.SendAsync(
    new SendOtpParams
    {
        To = "+254712345678",
        Template = "Your Acme code is {{code}}",
        Length = 6,
        TtlSeconds = 300,
    },
    new RequestOptions { IdempotencyKey = "signup-7781-otp-1" });

Console.WriteLine(otp.OtpId); // keep it with the user's pending session
```

```ruby tab="Ruby" logo="ruby" title="send_otp.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

otp = client.otp.send(
  to: "+254712345678",
  template: "Your Acme code is {{code}}",
  length: 6,
  ttl_seconds: 300,
  idempotency_key: "signup-7781-otp-1"
)

puts otp[:otp_id] # keep it with the user's pending session
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let otp = client
    .otp()
    .send_with(
        &SendOtp {
            to: "+254712345678".into(),
            template: Some("Your Acme code is {{code}}".into()),
            length: Some(6),
            ttl_seconds: Some(300),
            ..Default::default()
        },
        &RequestOptions::idempotency_key("signup-7781-otp-1"),
    )
    .await?;

println!("{}", otp.otp_id); // keep it with the user's pending session
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let otp = try await opensms.otp.send(
    .init(to: "+254712345678", template: "Your Acme code is {{code}}", length: 6, ttlSeconds: 300),
    idempotencyKey: "signup-7781-otp-1"
)

print(otp.otpId) // keep it with the user's pending session
```
<!-- /tabs -->

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

Sending an OTP creates an SMS, so until the workspace owner's email is verified the send is refused like any sandbox message:

```json
{"type":"about:blank","title":"Forbidden","status":403,"detail":"email verification is required for sandbox sending"}
```

A template without the placeholder:

```json
{"type":"about:blank","title":"Bad Request","status":400,"detail":"template must contain {{code}}"}
```

## Verify a code

<!-- tabs label="Verify an OTP" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/otp/verify \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"otp_id":"7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47","code":"482913"}'
```

```ts tab="TypeScript" logo="typescript" title="verify-otp.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const result = await opensms.otp.verify({
  otpId: '7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47',
  code: '482913',
});

console.log(result.valid, result.attemptsLeft);
```

```python tab="Python" logo="python" title="verify_otp.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

result = client.otp.verify(
    otp_id="7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47",
    code="482913",
)

print(result["valid"], result["attempts_left"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

result, err := client.OTP.Verify(context.Background(), opensms.VerifyOTPParams{
	OTPID: "7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47",
	Code:  "482913",
})
if err != nil {
	log.Fatal(err)
}
log.Println(result.Valid, result.AttemptsLeft)
```

```php tab="PHP" logo="php" title="verify-otp.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$result = $opensms->otp->verify([
    'otp_id' => '7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47',
    'code' => '482913',
]);

var_dump($result['valid'], $result['attempts_left']);
```

```java tab="Java" logo="java" title="VerifyOtp.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

OtpVerifyResult result = opensms.otp().verify(
    "7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47", "482913");

System.out.println(result.valid + " " + result.attemptsLeft);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var result = await client.Otp.VerifyAsync(new VerifyOtpParams
{
    OtpId = "7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47",
    Code = "482913",
});

Console.WriteLine($"{result.Valid} {result.AttemptsLeft}");
```

```ruby tab="Ruby" logo="ruby" title="verify_otp.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

result = client.otp.verify(
  otp_id: "7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47",
  code: "482913"
)

puts result[:valid], result[:attempts_left]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let result = client
    .otp()
    .verify(&VerifyOtp::new("7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47", "482913"))
    .await?;

println!("{} {}", result.valid.unwrap_or(false), result.attempts_left.unwrap_or(0));
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let result = try await opensms.otp.verify(
    otpId: "7c1e2f4a-9b3d-4e8f-a2c6-5d0b1e9f3a47",
    code: "482913"
)

print(result.valid ?? false, result.attemptsLeft ?? 0)
```
<!-- /tabs -->

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
