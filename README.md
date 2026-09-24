# opensms documentation

opensms is a prepaid SMS platform for Africa: a workspace tops up a wallet and sends messages,
batches and one-time passcodes through an API or a web app, and opensms routes each message to an
upstream provider in the destination country. These docs cover it end to end, for everyone who
touches it: developers integrating the API, people using the web app, operators running the
platform, and engineers deploying it.

Every example on these pages came from a real call to a running opensms API, and the flows are
re-run by the tests in [`tests/`](tests). Where the code and older notes disagreed, the docs follow
the code; the differences are collected in [known issues](known-issues.md).

## Start here

| I want to | Read |
|---|---|
| Understand what opensms is and how it is organised | [Overview](getting-started/overview.md) |
| Send my first message in a few minutes | [Quickstart](getting-started/quickstart.md) |
| Move a workspace from sandbox to live traffic | [Going live](getting-started/going-live.md) |
| Use the web app | [Web app guide](console/README.md) |
| Run the platform as an operator | [Operator console](admin/README.md) |
| Deploy, configure or run opensms locally | [Operations](operations/README.md) |

## Integrate

Guides for developers calling the API with a key.

- [Authentication](integrate/authentication.md): sessions, API keys, scopes, sandbox and live keys, rotation, 2FA
- [Sending messages](integrate/sending-messages.md): single messages, batches, scheduling, statuses
- [Delivery reports and webhooks](integrate/delivery-reports-and-webhooks.md): events, payloads, signature verification, retries
- [One-time passcodes](integrate/otp.md)
- [Number lookup](integrate/lookup.md)
- [Inbound messages and numbers](integrate/inbound.md)
- [Contacts and templates](integrate/contacts-and-templates.md)
- [Realtime](integrate/realtime.md): the WebSocket event stream
- [Billing and wallet](integrate/billing-and-wallet.md): balances, pricing, spend caps, top-ups
- [Errors](integrate/errors.md)
- [Rate limits and idempotency](integrate/rate-limits-and-idempotency.md)
- [SDKs](integrate/sdk.md): official clients for TypeScript, Python, Go, .NET, Java, Rust, Ruby, PHP and Swift

## Reference

- [Customer API reference](reference/api/README.md): every `/v1` operation, with live-tested examples and a [coverage table](reference/api/COVERAGE.md)
- [Operator API reference](admin/api-reference.md): every `/admin/v1` operation
- [Configuration reference](operations/configuration.md): every environment variable

## Web app guides

Task-based guides with screenshots, for people using the customer web app: signing up and signing
in, onboarding, legal acceptance, messages, contacts, templates, sender IDs, numbers, inbound, OTP,
webhooks, API keys, usage, billing, routes, sandbox, going live, verification, notifications and
settings. Start at the [web app guide](console/README.md).

## Operator guides

For opensms staff with an operator account (superadmin, ops, finance, support): getting access,
the dashboard, countries, carriers, providers, routes, numbers, workspaces, users, sender IDs,
compliance review, pricing, payments, settlement, incidents, alerts, legal documents, the audit log
and operator management. Start at the [operator console guide](admin/README.md).

## Operations

For engineers who run opensms: [architecture](operations/architecture.md),
[local development](operations/local-development.md) (with a from-zero
[`local-stack.sh`](operations/local-stack.sh)), [configuration](operations/configuration.md),
[database](operations/database.md), [deployment](operations/deployment.md),
[monitoring](operations/monitoring.md), [backup and restore](operations/backup-and-restore.md),
[security](operations/security.md), [binaries](operations/binaries.md) and
[runbooks](operations/runbooks/README.md) for incidents.

## Running the docs tests

The tests call a running opensms API and fail when an example on a page no longer matches the
server. Start a local stack as described in [local development](operations/local-development.md),
create an operator with `opensms-admin`, then:

```sh
npm install
OPENSMS_API=http://127.0.0.1:18180 \
OPENSMS_ADMIN_EMAIL=<operator email> OPENSMS_ADMIN_PASSWORD=<operator password> \
npm test
```

Optional: `OPENSMS_SDK_DIR` (a built copy of `@opensms/sdk`) runs the SDK example, and
`OPENSMS_DOCS_OPERATORS` (a JSON file of role operators) runs the role checks in the operator tests.
Tests that need them are skipped when they are unset.

Screenshots are taken with `node scripts/shoot.mjs` against a running web app; see the comment at
the top of that script.
