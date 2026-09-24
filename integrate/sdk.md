# SDKs

OpenSMS has official client libraries for nine languages, all written by hand from one shared
contract and tested against a live API. This page is for developers choosing how to call OpenSMS
from their code: which client to use, how to install it, and what every client does the same way.
If your language is not listed, call the HTTP API directly (see the [quickstart](../getting-started/quickstart.md)).

The source, per-language READMEs and the shared contract live in
[opensms-io/opensms-sdks](https://github.com/opensms-io/opensms-sdks).

## Clients

All nine are published at version 0.1.0.

| Language | Install | Registry |
|---|---|---|
| <span id="sdk-typescript">TypeScript / JavaScript</span> | `npm install @opensms/sdk` | [npm](https://www.npmjs.com/package/@opensms/sdk) |
| <span id="sdk-python">Python</span> | `pip install opensms` | [PyPI](https://pypi.org/project/opensms/) |
| <span id="sdk-go">Go</span> | `go get github.com/opensms-io/opensms-go` | [pkg.go.dev](https://pkg.go.dev/github.com/opensms-io/opensms-go) |
| <span id="sdk-dotnet">.NET (C#)</span> | `dotnet add package Opensms` | [NuGet](https://www.nuget.org/packages/Opensms) |
| <span id="sdk-java">Java</span> | `io.opensms:opensms-java:0.1.0` | [Maven Central](https://central.sonatype.com/artifact/io.opensms/opensms-java) |
| <span id="sdk-rust">Rust</span> | `cargo add opensms` | [crates.io](https://crates.io/crates/opensms) |
| <span id="sdk-ruby">Ruby</span> | `gem install opensms` | [RubyGems](https://rubygems.org/gems/opensms) |
| <span id="sdk-php">PHP</span> | `composer require opensms/opensms-php` | [Packagist](https://packagist.org/packages/opensms/opensms-php) |
| <span id="sdk-swift">Swift</span> | `.package(url: "https://github.com/opensms-io/opensms-swift", from: "0.1.0")` | [SwiftPM](https://github.com/opensms-io/opensms-swift) |

Each package README has the full install and usage guide.

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

```ts
import { Opensms } from '@opensms/sdk';

const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });
const message = await opensms.messages.send({ to: '+254712345678', text: 'Your order has shipped' });
console.log(message.id, message.status);
```

```python
import os
from opensms import Opensms

opensms = Opensms(api_key=os.environ["OPENSMS_API_KEY"])
message = opensms.messages.send(to="+254712345678", text="Your order has shipped")
print(message.id, message.status)
```

A sandbox key (`sk_test_...`) talks to your sandbox; a live key (`sk_live_...`) to live traffic. The
key alone selects the workspace, so the clients never send `X-Workspace-ID`.

A fuller example: read the wallet, send, and handle a refusal. Save it as `example.mjs` and run it
with `OPENSMS_API_KEY` set (and `OPENSMS_BASE_URL` when you are not calling the hosted API):

<!-- test:sdk-example -->
```js
import { Opensms, OpensmsError } from '@opensms/sdk';

const opensms = new Opensms({
  apiKey: process.env.OPENSMS_API_KEY,
  baseUrl: process.env.OPENSMS_BASE_URL, // omit to use https://api.opensms.io
});

const [wallet] = await opensms.wallet.balances();
console.log('wallet', wallet.environment, wallet.currency, wallet.balance);

try {
  const message = await opensms.messages.send({ to: '+254712345678', text: 'Your order has shipped' });
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

