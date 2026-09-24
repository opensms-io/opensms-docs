# Configuration reference

Every environment variable the opensms binaries read, with its default, what it does, whether a production host needs it, and whether `api/.env.example` lists it. This page is for engineers who write `runtime.env`, `migration.env` or a systemd `EnvironmentFile` for opensms. The source of truth is `api/internal/config/config.go` (plus `admin_sms.go`, `eventbus.go`), `api/internal/logging/logging.go` and each `api/cmd/*/main.go`. Where notes in `api/docs` disagree with that code, this page follows the code and the disagreement is listed under [Drift](#drift-between-code-and-envexample).

Related pages: [local development](local-development.md), [deployment](deployment.md), [security](security.md), [binaries](binaries.md).

## How configuration is loaded

1. `config.Load()` first reads a file named `.env` from the **current working directory**, if one exists. Each `KEY=value` line is applied only when that variable is not already set in the process environment, so real environment variables always win. Quotes around values are stripped. Lines starting with `#` are ignored.
2. Every variable then falls back to the default in the table below when it is unset **or set to an empty string**.
3. `validate()` runs. Any failure stops the process before it opens the database. Booleans are `true` only when the value is exactly the string `true`; anything else (including `TRUE` or `1`) is false.

Because of step 1, starting `opensms` or `opensms-migrate` from inside `api/` silently picks up `api/.env`. The [local stack script](local-development.md) runs binaries from its own state directory for this reason.

`opensms-admin` and `opensms-at-bridge` do **not** call `config.Load()`. They read only the handful of variables listed for them, and never read `.env`. `opensms-migrate` calls `config.Load()` (so it needs a valid encryption key and database URL even though it connects with `OPENSMS_MIGRATION_DATABASE_URL`), then reads its own URL.

## Validation failures you can hit

Each line below was produced by running the `opensms` binary from an empty directory with only the shown variables set (`env -i PATH=$PATH VAR=... opensms`):

| Variables set | Startup error (`"msg":"config"`) |
| --- | --- |
| `OPENSMS_ENV=production` | `OPENSMS_ENCRYPTION_KEY must be explicitly configured with a non-default key in production` |
| `OPENSMS_ENCRYPTION_KEY=short` | `OPENSMS_ENCRYPTION_KEY must be exactly 32 raw bytes (no base64 decoding is performed)` |
| `OPENSMS_METRICS_ENABLED=true OPENSMS_METRICS_ADDRESS=0.0.0.0:19101` | `non-loopback metrics requires a token of at least 32 bytes` |
| `OPENSMS_EVENTBUS_ENABLED=true OPENSMS_ENV=production` (valid key) | `production event bus requires TLS and at least three replicas` |
| `OPENSMS_AUTOMATIC_TOPUPS_ENABLED=true` | `OPENSMS_PAYSTACK_SECRET is required when automatic top-ups are enabled` |
| `OPENSMS_FILE_SCAN_ENABLED=true` | `OPENSMS_FILE_SCAN_ADDRESS must be an absolute Unix socket path` |
| `OPENSMS_ADMIN_SMS_ALERTS_ENABLED=true` | `admin SMS alerts require live dispatch` |
| `OPENSMS_TRACING_ENABLED=true OPENSMS_TRACING_ENDPOINT=http://collector:4318` | `tracing requires an explicit HTTPS collector endpoint` |
| `OPENSMS_CUSTOMER_COOKIES_ENABLED=true` | `customer cookies require OPENSMS_TLS_CERT_FILE and OPENSMS_TLS_KEY_FILE` |
| `OPENSMS_ADMIN_CONSOLE_URL=http://opensms.example` | `OPENSMS_ADMIN_CONSOLE_URL must be an explicitly trusted HTTPS origin without credentials, path, query or fragment (localhost HTTP allowed outside production)` |
| `OPENSMS_NATS_REPLICAS=x` | `invalid NATS replica count` |

After configuration passes, startup also refuses an unsafe database identity and missing migrations. See [database](database.md#startup-checks).

## Legend

- **Prod**: `Yes` means production startup or `api/deploy/deploy.sh` fails without it. `Deploy` means only the hosted deploy script enforces it. `If X` means required when feature X is enabled. `No` means optional.
- **.env.example**: whether `api/.env.example` lists the variable.
- **Secret**: treat the value as a credential. Never paste it into tickets, logs or docs.

## Core runtime

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_ENV` | `development` | `production` switches on strict checks: non-default encryption key, HTTPS-only URLs, TLS NATS with 3+ replicas, and blocks `opensms-admin --development-no-totp`. Any other value is treated as non-production. | Yes (set to `production`) | Yes |
| `OPENSMS_PORT` | `8080` | Port for the single HTTP listener. It binds all interfaces (`:PORT`) and serves `/v1`, `/admin/v1`, `/callbacks/providers`, `/status`, `/legal`, `/healthz` and `/readyz`. | No | Yes |
| `OPENSMS_ADMIN_PORT` | `8081` | Parsed into `Config.AdminPort` but **not used by any code**. There is no separate admin listener. See [Drift](#drift-between-code-and-envexample). | No | Yes |
| `OPENSMS_DATABASE_URL` | `postgres://localhost:5432/opensms` | Runtime PostgreSQL URL. Must be a restricted, non-owner role (see [database](database.md)). Secret. | Yes | Yes |
| `OPENSMS_REDIS_URL` | `redis://localhost:6379` | Redis for admission and API-key rate limiting. `/readyz` fails when Redis is unreachable. | Yes (default points at localhost) | Yes |
| `OPENSMS_ENCRYPTION_KEY` | `opensms-dev-encryption-key-32b!!` | Exactly 32 raw bytes, used verbatim (no base64 decoding). Encrypts TOTP secrets, provider credentials, webhook secrets, invitations and saved payment authorizations. The default is rejected in production. Secret. See [security](security.md#encryption-key). | Yes | Yes |
| `OPENSMS_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174` | Comma-separated exact browser origins allowed to call the API. Requests from other origins get no CORS headers. Must include the UI origin. | Deploy | **No** |
| `OPENSMS_LOG_LEVEL` | `info` | `debug`, `warn`, `error`, anything else means `info`. Logs are JSON on stdout. | No | Yes |
| `OPENSMS_TLS_CERT_FILE` | empty | PEM certificate for direct HTTPS on the API listener. Must be set together with the key and load as a valid pair. | If cookies | No |
| `OPENSMS_TLS_KEY_FILE` | empty | PEM private key matching the certificate. Secret file path. | If cookies | No |

## Public URLs

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_ADMIN_CONSOLE_URL` | empty | Trusted UI origin used in admin and team invitation emails. Origin only (no path, query or credentials). HTTP allowed only for `localhost`/`127.0.0.1` outside production. Empty disables invitation delivery workers. | Deploy | Yes |
| `OPENSMS_PASSWORD_RESET_URL` | empty | UI path for reset links; the backend appends the single-use token as a path segment. HTTPS unless localhost outside production. Empty disables reset email sending. | Deploy | Yes (`http://127.0.0.1:5173/reset-password`) |
| `OPENSMS_RECEIPT_BASE_URL` | empty | Public API origin advertised to providers as the callback base for `/callbacks/providers/{id}/dlr`. Trailing `/` trimmed. HTTPS in production. Not used by the Africa's Talking adapter, which needs the [bridge](binaries.md#opensms-at-bridge). | Deploy | Yes |

## Outbound delivery switches

All default to `false`. Each one, when `true`, lets the API contact an external system. Keep them off in development and in recovery.

| Variable | Meaning when `true` | Prod | .env.example |
| --- | --- | --- | --- |
| `OPENSMS_LIVE_DISPATCH_ENABLED` | Submit live messages to real providers, run submission reconciliation. Sandbox traffic always uses the mock adapter regardless. | When you go live | Yes |
| `OPENSMS_EMAIL_DELIVERY_ENABLED` | Run the transactional email worker and authentication email senders through Axene. When false, `AXENE_API_KEY` is dropped from memory at load. | Deploy (must be `true`) | Yes |
| `OPENSMS_WEBHOOK_DELIVERY_ENABLED` | Deliver customer webhooks (signed, retried, public HTTPS only). | No | Yes |
| `OPENSMS_AUTOMATIC_TOPUPS_ENABLED` | Charge saved Paystack authorizations when wallets fall below thresholds. Requires `OPENSMS_PAYSTACK_SECRET`. | No | Yes |
| `OPENSMS_SENDER_REGISTRATION_ENABLED` | Submit paid sender ID registrations to providers that support it. | No | **No** |
| `OPENSMS_ROUTE_PROBES_ENABLED` | Send controlled recovery probe SMS on configured routes, charged to a service workspace. | No | Yes |
| `OPENSMS_PROVIDER_BALANCE_POLLING_ENABLED` | Poll provider balance endpoints for configured provider accounts. | No | Yes |
| `OPENSMS_ADMIN_SMS_ALERTS_ENABLED` | Send admin alerts by SMS through the normal message API. Needs live dispatch and the `OPENSMS_ADMIN_SMS_*` values below. | No | **No** |
| `OPENSMS_ADMIN_SLACK_ALERTS_ENABLED` | Deliver admin alerts to configured Slack incoming webhooks. | No | **No** |

## Maintenance workers

These start background workers that change stored data. They do not contact external systems.

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_RETENTION_ENABLED` | `false` | Redact settled messages and copies past each workspace's `data_retention_days`; redact audit payloads. See [database](database.md#retention-and-redaction). | No | Yes |
| `OPENSMS_DELETION_LIFECYCLE_ENABLED` | `false` | Run the staged workspace deletion and redaction workers. Does not claim full erasure. | No | Yes |
| `OPENSMS_NUMBER_RENEWAL_ENABLED` | `false` | Charge and renew rented virtual numbers. | No | Yes |
| `OPENSMS_STATEMENT_DRAFTS_ENABLED` | `false` | Build immutable monthly statement drafts (never issues invoices). | No | Yes |

## File scanning

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_FILE_SCAN_ENABLED` | `false` | Scan uploaded documents with ClamAV. When false, uploads stay quarantined and cannot be approved or downloaded for review. Adds a scanner check to `/readyz`. | Deploy (must be `true`) | Yes |
| `OPENSMS_FILE_SCAN_NETWORK` | `unix` | `unix` or `tcp`. | Deploy (must be `unix`) | Yes |
| `OPENSMS_FILE_SCAN_ADDRESS` | empty | Absolute socket path for `unix`; literal private or loopback `IP:port` for `tcp` (hostnames and public IPs rejected). Validated whenever set, even if scanning is disabled. | Deploy (`/run/clamav/clamd.sock`) | Yes |

## Observability

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_METRICS_ENABLED` | `false` | Serve Prometheus metrics on a separate listener. | No | Yes |
| `OPENSMS_METRICS_ADDRESS` | `127.0.0.1:19090` | Literal `IP:port` for the metrics listener. | No | Yes |
| `OPENSMS_METRICS_TOKEN` | empty | Bearer token for scrapes. At least 32 bytes and mandatory when the address is not loopback. Secret. | If non-loopback metrics | Yes |
| `OPENSMS_TRACING_ENABLED` | `false` | Export OpenTelemetry spans for message admission and submit attempts. | No | Yes |
| `OPENSMS_TRACING_ENDPOINT` | empty | HTTPS OTLP/HTTP collector URL without credentials, query or fragment. | If tracing | Yes |
| `OPENSMS_TRACING_SAMPLE_RATIO` | `0.1` | Root span sample ratio, 0 to 1. With tracing enabled, an unparseable or out-of-range value stops startup (`tracing sample ratio must be between 0 and 1`); with tracing disabled it is ignored. | No | Yes |

## Event bus (NATS JetStream)

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_EVENTBUS_ENABLED` | `false` | Route outbox events through JetStream instead of in-process fanout, and enable multi-instance realtime broadcast. Adds a broker check to `/readyz`. | No | **No** |
| `OPENSMS_NATS_URL` | `nats://localhost:4222` | `nats://` or `tls://` server URL without credentials. Production requires `tls://`. | If event bus | Yes |
| `OPENSMS_NATS_STREAM` | `OPENSMS_EVENTS` | Stream name, 1 to 64 of `A-Z a-z 0-9 _ -`. | No | **No** |
| `OPENSMS_NATS_SUBJECT` | `opensms.events` | Literal subject, no wildcards, at most 200 characters. Realtime uses `<subject>.realtime`. | No | **No** |
| `OPENSMS_NATS_CONSUMER` | `opensms-business` | Durable consumer shared by all API instances. Also the consumer the dead-letter admin API reads. | No | **No** |
| `OPENSMS_NATS_REPLICAS` | `1` | Stream replicas, 1 to 5. Production requires 3 or more. | If event bus | **No** |
| `OPENSMS_NATS_CREDENTIALS_FILE` | empty | NATS `.creds` file path. Secret file. | No | **No** |
| `OPENSMS_NATS_CA_FILE` | empty | CA bundle for `tls://`. Only valid with a `tls://` URL. | No | **No** |
| `OPENSMS_NATS_CERT_FILE` | empty | Client certificate; set together with the key; `tls://` only. | No | **No** |
| `OPENSMS_NATS_KEY_FILE` | empty | Client key. Secret file. | No | **No** |

## Customer cookie sessions (opt-in)

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_CUSTOMER_COOKIES_ENABLED` | `false` | Allow exchanging a bearer session for a `__Host-opensms_session` cookie with CSRF. Requires the TLS pair and origins. The current frontend does not use it. | No | **No** |
| `OPENSMS_CUSTOMER_COOKIE_ORIGINS` | empty | Comma-separated exact HTTPS origins. Each must also appear in `OPENSMS_CORS_ORIGINS` or the API exits with `cookie origins must also be configured CORS origins`. | If cookies | **No** |
| `OPENSMS_CUSTOMER_COOKIE_SAMESITE` | `lax` | `lax`, `strict` or `none`. | No | **No** |

## Payments, email and phone verification

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_PAYSTACK_SECRET` | empty | Paystack secret key. When set, mounts `/v1/payments/paystack/webhook` and enables wallet top-up initialization. Secret. | If top-ups or card payments | Yes |
| `AXENE_API_KEY` | empty | Axene mail API key for verification, login, reset, invitation and transactional email. Cleared at load when email delivery is disabled. Secret. | Deploy | Yes |
| `AXENE_FROM_EMAIL` | empty | Verified sender address for Axene. | Deploy | Yes |
| `OPENSMS_PHONE_VERIFICATION_API_KEY` | empty | Live service workspace API key (`messages:write`) used to send onboarding phone verification SMS through the normal message API. Secret. | If phone verification | Yes |
| `OPENSMS_PHONE_VERIFICATION_SENDER_ID` | empty | Approved sender ID for those SMS. | If phone verification | Yes |

## Admin SMS alerts

All five are required, and validated, only when `OPENSMS_ADMIN_SMS_ALERTS_ENABLED=true`. When the flag is false the API key is discarded at load.

| Variable | Default | Meaning | .env.example |
| --- | --- | --- | --- |
| `OPENSMS_ADMIN_SMS_API_KEY` | empty | Live service key; must start with `sk_live_` and be longer than 20 characters. Secret. | **No** |
| `OPENSMS_ADMIN_SMS_KEY_ID` | empty | UUID of that key (lowercase). | **No** |
| `OPENSMS_ADMIN_SMS_WORKSPACE_ID` | empty | UUID of the service workspace that pays for alerts. | **No** |
| `OPENSMS_ADMIN_SMS_SENDER_ID` | empty | Approved sender, at most 32 characters. | **No** |
| `OPENSMS_ADMIN_SMS_DAILY_LIMIT` | `0` | 1 to 10000 alert SMS admissions per UTC day. | **No** |

## FX refresh and number lookup

| Variable | Default | Meaning | Prod | .env.example |
| --- | --- | --- | --- | --- |
| `OPENSMS_FX_REFRESH_ENABLED` | `false` | Fetch daily FX rates from an operator-owned JSON feed. | No | Yes |
| `OPENSMS_FX_SOURCE_URL` | empty | HTTPS feed URL (no credentials, query or fragment). | If FX refresh | Yes |
| `OPENSMS_FX_PAIRS` | empty | Comma-separated `BASE/QUOTE` pairs, for example `USD/KES,KES/USD`. Parse errors stop loading. | If FX refresh | Yes |
| `OPENSMS_LOOKUP_ENABLED` | `false` | Enable the configured HTTP number lookup provider and its worker. | No | Yes |
| `OPENSMS_LOOKUP_SOURCE_URL` | empty | Lookup provider URL. | If lookup | Yes |
| `OPENSMS_LOOKUP_REFRESH_ENABLED` | `false` | Charged background cache refresh. Requires lookup enabled. | No | Yes |
| `OPENSMS_LOOKUP_REFRESH_WORKSPACE_ID` | empty | Service workspace UUID that pays for refreshes. | If refresh | Yes |
| `OPENSMS_LOOKUP_REFRESH_MAX_DAILY_REQUESTS` | `0` | 1 to 10000 when refresh is enabled. A non-integer stops loading. | If refresh | Yes |
| `OPENSMS_LOOKUP_REFRESH_MAX_DAILY_SPEND` | empty | Positive decimal, up to 8 integer and 6 fractional digits. | If refresh | Yes |

## Variables read only by separate binaries

| Variable | Read by | Meaning | .env.example |
| --- | --- | --- | --- |
| `OPENSMS_MIGRATION_DATABASE_URL` | `opensms-migrate` | Owner or superuser URL used to apply DDL, seed data and grants. Never give it to the API. Secret. | **No** (mentioned in a comment only) |
| `OPENSMS_ADMIN_DATABASE_URL` | `opensms-admin` | Owner or superuser URL for creating operator identities. The command checks the role owns `users` and `admin_users` or is superuser. Secret. | **No** |
| `OPENSMS_ENV`, `OPENSMS_ENCRYPTION_KEY` | `opensms-admin` | Production blocks `--development-no-totp`; the key is required for `--with-totp`. | Yes |
| `OPENSMS_AT_BRIDGE_API_BASE_URL` | `opensms-at-bridge` | HTTPS origin of the opensms API. | **No** |
| `OPENSMS_AT_BRIDGE_PROVIDER_ID` | `opensms-at-bridge` | Provider UUID in opensms. | **No** |
| `OPENSMS_AT_BRIDGE_CALLBACK_TOKEN` | `opensms-at-bridge` | At least 32 URL-safe characters; part of the callback path. Secret. | **No** |
| `OPENSMS_AT_BRIDGE_CALLBACK_HMAC_SECRET` | `opensms-at-bridge` | At least 32 characters; must equal the provider's stored `callback_hmac_secret`. Secret. | **No** |
| `OPENSMS_AT_BRIDGE_LISTEN` | `opensms-at-bridge` | Listen address, default `127.0.0.1:18085`. | **No** |

## Test-only variables

Read only by `*_test.go` files and the `Makefile`, never by a shipped binary: `OPENSMS_TEST_DATABASE_URL` (a role allowed to `CREATE DATABASE`), `OPENSMS_TEST_REDIS_URL`, `OPENSMS_TEST_BOOTSTRAP`, `OPENSMS_TEST_RESTORE` and `OPENSMS_TEST_PG_CONTAINER` (backup gate, see [backup and restore](backup-and-restore.md)), and `OPENSMS_TEST_CLAMAV_ADDRESS` (real ClamAV check). Never point them at a production database.

## Drift between code and .env.example

`api/.env.example` lists 44 variables; the shipped (non-test) code in `internal/config`, `internal/logging` and `cmd/*` reads 74. Missing from `.env.example`:

- `OPENSMS_CORS_ORIGINS`. Without it the API only allows the Vite default ports 5173 and 5174, so a UI on any other port fails with CORS errors in the browser. The hosted deploy script requires it.
- The whole event bus block except `OPENSMS_NATS_URL`: `OPENSMS_EVENTBUS_ENABLED`, `OPENSMS_NATS_STREAM`, `_SUBJECT`, `_CONSUMER`, `_REPLICAS`, `_CREDENTIALS_FILE`, `_CA_FILE`, `_CERT_FILE`, `_KEY_FILE`.
- `OPENSMS_TLS_CERT_FILE`, `OPENSMS_TLS_KEY_FILE` and the three `OPENSMS_CUSTOMER_COOKIE*` variables.
- `OPENSMS_SENDER_REGISTRATION_ENABLED`, `OPENSMS_ADMIN_SLACK_ALERTS_ENABLED`, `OPENSMS_ADMIN_SMS_ALERTS_ENABLED` and the five `OPENSMS_ADMIN_SMS_*` values.
- `OPENSMS_MIGRATION_DATABASE_URL` and `OPENSMS_ADMIN_DATABASE_URL` (intentionally kept out of the runtime file, but not documented as variables anywhere in the example).
- All `OPENSMS_AT_BRIDGE_*` variables.

`OPENSMS_ADMIN_PORT` is listed in `.env.example`, set in `api/docker-compose.yml`, and port 8081 is `EXPOSE`d in `api/Dockerfile`, but `config.go:259` only stores it and nothing starts a listener on it. Admin routes are served on `OPENSMS_PORT`. `api/ops/staging/runtime.env.example` and `api/docs/staging-release.md` already omit it and say so.
