# SDKs

OpenSMS has official client libraries for nine languages. They all implement one shared contract,
[`spec/SURFACE.md`](https://github.com/opensms-io/opensms-sdks/blob/main/spec/SURFACE.md), and are
tested against the live API. This page is for developers choosing how to call OpenSMS
from their code: which client to use, how to install it, and what every client does the same way.
If your language is not listed, call the HTTP API directly (see the [quickstart](../getting-started/quickstart.md)).

The source, per-language READMEs and the shared contract live in
[opensms-io/opensms-sdks](https://github.com/opensms-io/opensms-sdks).

## Clients

| Language | Package | Registry | Status |
|---|---|---|---|
| <span id="sdk-typescript">TypeScript</span> | `@opensms/sdk` | npm | Published, 0.1.0 |
| <span id="sdk-python">Python</span> | `opensms` | PyPI | Published, 0.1.0 |
| <span id="sdk-go">Go</span> | `github.com/opensms-io/opensms-go` | Go modules | Published, v0.1.0 |
| <span id="sdk-dotnet">.NET (C#)</span> | `Opensms` | NuGet | Published, 0.1.0 |
| <span id="sdk-java">Java</span> | `io.opensms:opensms-java` | Maven Central | Published, 0.1.0 |
| <span id="sdk-rust">Rust</span> | `opensms` | crates.io | Published, 0.1.0 |
| <span id="sdk-ruby">Ruby</span> | `opensms` | RubyGems | Published, 0.1.0 |
| <span id="sdk-php">PHP</span> | `opensms/opensms-php` | Packagist | Published, v0.1.0 |
| <span id="sdk-swift">Swift</span> | `opensms-swift` (product `Opensms`) | SwiftPM (git tag) | Tagged, 0.1.0 |

### Install

<!-- tabs label="Install command" -->
```sh tab="TypeScript" logo="typescript" title="Terminal"
npm install @opensms/sdk
```

```sh tab="Python" logo="python" title="Terminal"
pip install opensms
```

```sh tab="Go" logo="golang" title="Terminal"
go get github.com/opensms-io/opensms-go@v0.1.0
```

```sh tab="PHP" logo="php" title="Terminal"
composer require opensms/opensms-php
```

```kotlin tab="Java" logo="java" title="build.gradle.kts"
dependencies {
    implementation("io.opensms:opensms-java:0.1.0")
}
```

```sh tab="C#" logo="dotnet" title="Terminal"
dotnet add package Opensms
```

```sh tab="Ruby" logo="ruby" title="Terminal"
bundle add opensms
```

```sh tab="Rust" logo="rust" title="Terminal"
cargo add opensms
cargo add tokio --features full
```

```swift tab="Swift" logo="swift" title="Package.swift"
dependencies: [
    .package(
        url: "https://github.com/opensms-io/opensms-swift",
        from: "0.1.0"
    ),
],
targets: [
    .target(name: "YourApp", dependencies: [
        .product(name: "Opensms", package: "opensms-swift"),
    ]),
]
```
<!-- /tabs -->

On Maven rather than Gradle, add the same coordinates to `pom.xml`:

```xml title="pom.xml"
<dependency>
  <groupId>io.opensms</groupId>
  <artifactId>opensms-java</artifactId>
  <version>0.1.0</version>
</dependency>
```

## Client setup

Every client is built once from an API key and reused. The tabs below are complete programs: the
imports, the setup line and, in Go, Java and Rust, the `main` function. They also show how to point
the client at another API origin, such as a self-hosted deployment, through `OPENSMS_BASE_URL`. The
default is `https://api.opensms.io`.

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
export OPENSMS_API=https://api.opensms.io
export OPENSMS_API_KEY=sk_test_...

curl -s $OPENSMS_API/v1/wallet -H "authorization: Bearer $OPENSMS_API_KEY"
```

```ts tab="TypeScript" logo="typescript" title="client.ts"
import { Opensms } from '@opensms/sdk';

const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

// Another API origin:
const local = new Opensms({
  apiKey: process.env.OPENSMS_API_KEY!,
  baseUrl: process.env.OPENSMS_BASE_URL,
});

console.log(opensms.environment, local.environment); // "sandbox" for an sk_test_ key
```

```python tab="Python" logo="python" title="client.py"
import os

from opensms import Opensms

client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

# Another API origin:
local = Opensms(api_key=os.environ["OPENSMS_API_KEY"], base_url=os.environ["OPENSMS_BASE_URL"])

print(client.environment, local.environment)  # "sandbox" for an sk_test_ key
```

```go tab="Go" logo="golang" title="main.go"
package main

import (
	"log"
	"os"

	opensms "github.com/opensms-io/opensms-go"
)

func main() {
	client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
	if err != nil {
		log.Fatal(err) // the key is malformed; no request was made
	}

	// Another API origin:
	local, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"),
		opensms.WithBaseURL(os.Getenv("OPENSMS_BASE_URL")))
	if err != nil {
		log.Fatal(err)
	}

	log.Println(client.Environment(), local.Environment()) // "sandbox" for an sk_test_ key
}
```

```php tab="PHP" logo="php" title="client.php"
<?php

require 'vendor/autoload.php';

use Opensms\Client;

$opensms = new Client(getenv('OPENSMS_API_KEY'));

// Another API origin:
$local = new Client(getenv('OPENSMS_API_KEY'), ['baseUrl' => getenv('OPENSMS_BASE_URL')]);

echo $opensms->environment, ' ', $local->environment, PHP_EOL; // "sandbox" for an sk_test_ key
```

```java tab="Java" logo="java" title="Main.java"
import io.opensms.*;
import io.opensms.models.*;

public class Main {
    public static void main(String[] args) throws Exception {
        OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

        // Another API origin:
        OpensmsClient local = OpensmsClient.builder()
            .apiKey(System.getenv("OPENSMS_API_KEY"))
            .baseUrl(System.getenv("OPENSMS_BASE_URL"))
            .build();

        System.out.println(opensms.environment() + " " + local.environment()); // "sandbox" for an sk_test_ key
    }
}
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using Opensms;

using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

// Another API origin:
using var local = new OpensmsClient(
    Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!,
    new OpensmsClientOptions { BaseUrl = Environment.GetEnvironmentVariable("OPENSMS_BASE_URL")! });

Console.WriteLine($"{client.Environment} {local.Environment}"); // "sandbox" for an sk_test_ key
```

```ruby tab="Ruby" logo="ruby" title="client.rb"
require "opensms"

client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

# Another API origin:
local = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"), base_url: ENV.fetch("OPENSMS_BASE_URL"))

puts client.environment, local.environment # "sandbox" for an sk_test_ key
```

```rust tab="Rust" logo="rust" title="src/main.rs"
use opensms::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

    // Another API origin:
    let local = Client::builder(std::env::var("OPENSMS_API_KEY").unwrap())
        .base_url(std::env::var("OPENSMS_BASE_URL").unwrap())
        .build()?;

    println!("{} {}", client.environment(), local.environment()); // "sandbox" for an sk_test_ key
    Ok(())
}
```

```swift tab="Swift" logo="swift" title="main.swift"
import Foundation
import Opensms

let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

// Another API origin:
let local = try OpensmsClient(apiKey: apiKey, baseURL: ProcessInfo.processInfo.environment["OPENSMS_BASE_URL"] ?? "")

print(opensms.environment, local.environment) // "sandbox" for an sk_test_ key
```
<!-- /tabs -->

A malformed key fails at construction, before any request.

Every other example in these docs, in the guides and in the API reference, shows only the body:
the setup line above, then the call. To run one, put it where the setup line sits in the program
above, in place of the rest of that program. It needs the same imports, plus any names it uses
from the SDK or the standard library: in TypeScript and Python the SDK names such as
`OpensmsError`, and `readFileSync` from `node:fs`; in Go `context`, `fmt` and `errors`; in Java
`java.util.*` and `java.nio.file.*`; in PHP a `use Opensms\...;` line per class; in Rust the SDK
types, for example `use opensms::{Client, SendMessage};`.

## What the clients cover

Every client covers the same 18 resources and 83 methods: everything an API key can call. That is
messages, batches, OTP, lookups, contacts and contact groups, templates, webhooks, inbound, numbers,
sender IDs, suppressions, compliance, wallet, pricing, analytics, sandbox and countries.

Operations that need a console session rather than an API key are not in the SDKs: key management,
sign-in and 2FA, workspace and team settings, invitations, top-ups and payment methods, invoices,
onboarding, legal acceptance, notifications, and document upload. Do those in the
[console](../console/README.md) or through the [API reference](../reference/api/README.md) with a
session token.

## Quick example

Send one message with a sandbox key in `OPENSMS_API_KEY`. Every client reads the same way: build
it once with the key, call `messages.send`, get the message back with its `id` and `status`. The
SDKs generate the `Idempotency-Key` for you; with cURL you send it yourself.

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/messages \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: order-1042-shipped' \
  -d '{"to":"+254712345678","text":"Your Acme order #1042 has shipped"}'
```

```ts tab="TypeScript" logo="typescript" title="send.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const message = await opensms.messages.send({
  to: '+254712345678',
  text: 'Your Acme order #1042 has shipped',
});

console.log(message.id, message.status);
```

```python tab="Python" logo="python" title="send.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

message = client.messages.send(
    to="+254712345678",
    text="Your Acme order #1042 has shipped",
)

print(message["id"], message["status"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err) // the key is malformed; no request was made
}

msg, err := client.Messages.Send(context.Background(), opensms.SendMessageParams{
	To:   "+254712345678",
	Text: "Your Acme order #1042 has shipped",
})
if err != nil {
	log.Fatal(err)
}
log.Printf("sent %s (%s)", msg.ID, msg.Status)
```

```php tab="PHP" logo="php" title="send.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$message = $opensms->messages->send([
    'to' => '+254712345678',
    'text' => 'Your Acme order #1042 has shipped',
]);

echo $message['id'], ' ', $message['status'], PHP_EOL;
```

```java tab="Java" logo="java" title="Send.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Message message = opensms.messages().send(new SendMessageParams(
    "+254712345678", "Your Acme order #1042 has shipped"));

System.out.println(message.id + " " + message.status);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var message = await client.Messages.SendAsync(new SendMessageParams
{
    To = "+254712345678",
    Text = "Your Acme order #1042 has shipped",
});

Console.WriteLine($"{message.Id} {message.Status}");
```

```ruby tab="Ruby" logo="ruby" title="send.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

message = client.messages.send(
  to: "+254712345678",
  text: "Your Acme order #1042 has shipped"
)

puts message[:id], message[:status]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let message = client
    .messages()
    .send(&SendMessage::new(
        "+254712345678",
        "Your Acme order #1042 has shipped",
    ))
    .await?;

println!("{} is {}", message.id, message.status.as_deref().unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let message = try await opensms.messages.send(
    .init(to: "+254712345678", text: "Your Acme order #1042 has shipped")
)

print(message.id, message.status ?? "")
```
<!-- /tabs -->

A sandbox key (`sk_test_...`) talks to your sandbox; a live key (`sk_live_...`) to live traffic. The
key alone selects the workspace, so the clients never send `X-Workspace-ID`.

A fuller example: read the wallet, send, and handle a refusal. Save it as `example.mjs` and run it
with `OPENSMS_API_KEY` set (and `OPENSMS_BASE_URL` when you are not calling the hosted API):

<!-- test:sdk-example -->
```js title="example.mjs"
import { Opensms, OpensmsError } from '@opensms/sdk';

const opensms = new Opensms({
  apiKey: process.env.OPENSMS_API_KEY,
  // Leave OPENSMS_BASE_URL unset to call https://api.opensms.io
  baseUrl: process.env.OPENSMS_BASE_URL,
});

const [wallet] = await opensms.wallet.balances();
const { environment, currency, balance } = wallet;
console.log('wallet', environment, currency, balance);

try {
  const message = await opensms.messages.send({
    to: '+254712345678',
    text: 'Your Acme order #1042 has shipped',
  });
  console.log('sent', message.id, message.status);
} catch (err) {
  if (!(err instanceof OpensmsError)) throw err;
  console.log('refused', err.status, err.detail);
}
```

A new sandbox workspace refuses sends until its email address is verified, so on a fresh account
the last line prints `refused 403 email verification is required for sandbox sending`.

## Behaviour shared by every client

| Concern | What the clients do |
|---|---|
| Retries | Retry 429 and 5xx, honouring `Retry-After`, only when the request is safe to repeat. POSTs send an `Idempotency-Key` generated once per call and reused on every retry. OTP verify and sender ID creation are never retried. See [rate limits and idempotency](rate-limits-and-idempotency.md). |
| Errors | Problem responses become one error type (`OpensmsError`, or the language's equivalent) with `status`, `title`, `detail`, `type` and `code` when the API sends one. See [errors](errors.md). |
| Pagination | Cursor lists return `items` and `next_cursor`, plus an iterator over every page. |
| Webhooks | A helper verifies `X-OpenSMS-Signature` (HMAC-SHA256 of `"<t>.<raw body>"` with your `whsec_...` secret, 300 second tolerance). See [delivery reports and webhooks](delivery-reports-and-webhooks.md). |

## How the clients are tested

Each client has mock-transport unit tests and a live conformance suite that runs the same scenario
(send, read, list, batch, OTP, lookup, contacts, templates, webhooks, scope and auth errors) against
a real sandbox. All nine pass both suites.

