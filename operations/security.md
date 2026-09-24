# Security operations

The security controls an operator of opensms has to configure, protect or act on: the encryption key, secrets and credential files, API keys, sessions and two-factor authentication for customers and operators, document malware scanning with ClamAV, provider callback signing, and the network surface. This page is for engineers who run opensms and handle its secrets. Sources: `api/internal/config`, `api/internal/auth`, `api/internal/keys`, `api/internal/admin`, `api/internal/filescan`, `api/ops/clamav`, and the notes `encryption-keys.md`, `file-scanning.md`, `scanner-health.md`, `live-two-factor.md`, `customer-session-expiry.md`, `customer-cookie-sessions.md` and `admin-login.md` in `api/docs`.

Related pages: [configuration](configuration.md), [database roles](database.md#roles-and-grants), [API key compromise runbook](runbooks/api-key-compromise.md), [encryption key rotation runbook](runbooks/encryption-key-rotation.md), [scanner runbook](runbooks/file-scanner-degraded.md).

## Encryption key

`OPENSMS_ENCRYPTION_KEY` is one 32-byte value, used as-is (no base64 decoding, hashing or padding). It encrypts with AES-GCM:

- customer and operator TOTP secrets, and pending TOTP recovery enrollments
- provider credentials and each provider's `callback_hmac_secret`
- webhook signing secrets
- admin and team invitation tokens
- saved Paystack payment authorizations (additionally bound to the workspace ID)
- Slack alert destination URLs

Rules:

1. Generate it randomly. `openssl rand -base64 24` produces exactly 32 characters. Length is validated; randomness is not.
2. Production refuses the shipped development default (`opensms-dev-encryption-key-32b!!`), whether set explicitly or by omission.
3. Every process that shares a database must use the same key: the API, `opensms-migrate` (it validates the key even though it does not use it), and `opensms-admin --with-totp`.
4. Store it in a secret manager and back it up separately from database dumps. A restored database is useless without it.
5. Never change it on a running installation. There is no automated rotation or re-encryption; see the [rotation runbook](runbooks/encryption-key-rotation.md) for the manual procedure the source notes describe.

## Secrets and credential files

| Secret | Lives in | Handling |
| --- | --- | --- |
| Runtime database URL, encryption key, Axene key, Paystack secret, metrics token | `runtime.env` (hosted) or `/etc/opensms/runtime.env` (staging) | Root-owned, mode 0600. Never sourced into an interactive shell. |
| Owner database URL | `migration.env` only | Never in the API's environment. `opensms-migrate` exits with `OPENSMS_MIGRATION_DATABASE_URL is required; do not give migration credentials to the API` if absent. |
| Operator database URL for `opensms-admin` | Supplied only for that one command | The tool refuses the runtime URL: `database owner or superuser operator credential required`. |
| Provider credentials, callback HMAC secrets | Database, encrypted | Write-only through `/admin/v1/providers`; responses never include them. |
| Compose interpolation (`POSTGRES_PASSWORD`, `OPENSMS_RUNTIME_DB_PASSWORD`, `OPENSMS_IMAGE`) | `/opt/opensms-backend/.env` | Mode 0600. |

Practices the repository follows and you should too:

- Never put a secret on a command line: `opensms-admin` reads passwords only from stdin (`--password-stdin`), `init-runtime.sh` reads the runtime password with `\getenv`, and the local stack script passes secrets through files and the environment.
- Validate Compose with `docker compose config --quiet`; plain `docker compose config` prints resolved secrets.
- `deploy.sh` checks required production values without echoing them.
- When email delivery is disabled, the API drops `AXENE_API_KEY` from memory at load; when admin SMS alerts are disabled, it drops `OPENSMS_ADMIN_SMS_API_KEY`.
- The provider check tools (`opensms-at-check`, `opensms-textsms-check`) refuse credential files that are group- or world-readable and redact the API key from anything they write.

## API keys

| Property | Behaviour |
| --- | --- |
| Format | `sk_live_...` or `sk_test_...` (sandbox). The prefix is stored for display; the secret is shown **once**, at creation or rotation. |
| Storage | Argon2id hash plus a lookup value. The plaintext cannot be recovered. |
| Scope | One workspace and one environment. Scopes such as `messages:read`, `messages:write` (the default pair) limit what it can do. |
| Management | Owner or admin session: `POST /v1/keys`, `DELETE /v1/keys/{id}` (revoke, immediate), `POST /v1/keys/{id}/rotate`. |
| Rotation overlap | Rotation issues a new key and sets the old key to **expire 24 hours later**. The old secret keeps working during that window (`api/internal/keys/http.go`). |

Because of the overlap, rotation is for planned changes. For a leaked key, revoke it. Verified on a local stack: right after rotation the old secret still returned `200` on `GET /v1/messages`, while a revoked key immediately returned:

```text
{"type":"about:blank","title":"Unauthorized","status":401,"detail":"missing or invalid API key"}
```

The full procedure is in the [API key compromise runbook](runbooks/api-key-compromise.md).

## Sessions

| Session | Lifetime | Controls |
| --- | --- | --- |
| Customer (`sess_...` from `/v1/auth/login`, signup, login code) | 30 minutes idle, 30 days absolute by default; database-enforced (`customer_session_policy`). WebSocket traffic does not refresh idle time. | `GET /v1/auth/sessions`, `DELETE /v1/auth/sessions/{id}`, `POST /v1/auth/logout`. Operators: `POST /admin/v1/users/{id}/force-logout` revokes all sessions and pending login and recovery challenges. |
| Operator (from `/admin/v1/login`) | 12 hours absolute, plus the idle policy. | Operators are separate `admin_users` linked to a user by email; roles `superadmin`, `ops`, `finance`, `support`. |

Signup on the local stack returned a customer session expiring 30 days out (`"expires_at":"2026-10-24T07:21:30..."` for a signup at 07:21 on 24 September), and operator login one expiring 12 hours out.

Changing the session policy is a database action by the owner role (`update customer_session_policy set idle_seconds = ..., absolute_seconds = ...`). New sessions use the new values; existing ones keep theirs.

Optional cookie mode (`OPENSMS_CUSTOMER_COOKIES_ENABLED`) exchanges a bearer session for a `__Host-opensms_session` cookie with a CSRF token. It requires direct TLS on the API and exact HTTPS origins. The current console does not use it; leave it off.

## Two-factor authentication

**Customers.** Users enroll an authenticator with `POST /v1/auth/2fa/setup` and `/enable`, and get recovery codes. Once enabled, password and email-code logins return a TOTP challenge before issuing a session. A workspace cannot be switched to live (`PUT /admin/v1/workspaces/{id}` with `live_status: live`) until every active owner and finance member has TOTP enabled, and those users cannot disable it (`409`) while they belong to a live workspace.

**Operators.** Production operators must be created with TOTP:

```sh
umask 077
OPENSMS_ADMIN_DATABASE_URL=... OPENSMS_ENCRYPTION_KEY=... \
  opensms-admin --email ops@example.com --role ops --with-totp > /private/ops-credentials.json
```

The JSON contains a generated password and the authenticator secret, printed once. With TOTP enabled, `POST /admin/v1/login` returns `202` with `challenge_type: admin_totp`; the code goes to `/admin/v1/auth/2fa/verify`, which returns the real session. `--development-no-totp` is refused when `OPENSMS_ENV=production`:

```text
$ OPENSMS_ENV=production opensms-admin --email x@opensms.test --role ops --development-no-totp
use --with-totp, or explicitly --development-no-totp outside production
```

Sensitive operator actions need a TOTP verification within the last 10 minutes on the current session. An operator without TOTP (development bootstrap) is refused, as the local stack showed for force-logout:

```text
{"type":"about:blank","title":"Forbidden","status":403,"detail":"Current superadmin and fresh TOTP required."}
```

Operators can reset a customer's TOTP (`POST /admin/v1/users/{id}/reset-2fa`), lock, ban and force-logout users; all are audited.

## Document malware scanning (ClamAV)

Uploaded KYC documents, sender ID documents and payment proofs are stored quarantined. Only an exact clean verdict from `clamd` releases a file for review approval or download. Infected, failed, timed-out or oversized scans stay blocked.

| Setting | Value |
| --- | --- |
| Enable | `OPENSMS_FILE_SCAN_ENABLED=true`, `OPENSMS_FILE_SCAN_NETWORK=unix`, `OPENSMS_FILE_SCAN_ADDRESS=/run/clamav/clamd.sock` (the hosted deploy requires exactly this) |
| TCP alternative | Literal private or loopback `IP:port` only. clamd has no authentication; never expose it. |
| Limits | 10 MiB streamed per file in 32 KiB chunks, 15-second scan timeout per file, 60-second job leases, 5 attempts, 5-minute retry delay |
| Readiness | With scanning on, `/readyz` fails when clamd does not answer or signatures are older than 72 hours; the worker also stops leasing jobs. |
| Daemon config | `api/ops/clamav/clamd.conf`: `StreamMaxLength 10M`, `MaxFileSize 10M`, `MaxScanSize 50M`, `AlertEncryptedDoc yes`, `AlertExceedsMax yes`, local socket `/run/clamav/clamd.sock` |
| Supervision | `api/ops/clamav/start.sh` runs `freshclam` once, then `freshclam --daemon --checks=12` (every 2 hours) and `clamd`; if either exits the container exits so the restart policy recovers it. `health.sh` sends `nPING` to `127.0.0.1:3310`. Run in UTC. |
| Status | `GET /admin/v1/operations/file-scanning` (ops or superadmin) |

With scanning disabled (the docs stack) the status endpoint reports:

```text
{"backlog":{"pending":28,"retrying":0,"exhausted":0,"scanning":0},"scanner":{"status":"disabled"}}
```

A real ClamAV engine was not started for this page (the image needs a multi-gigabyte signature download and 4 GiB of memory). For a local engine use the `scanner` profile in `api/docker-compose.yml` (`docker compose --profile scanner up -d scanner`, loopback port 13310, image pinned by digest, `linux/amd64`). The repository records a successful clean and EICAR check against it on 2026-09-13; repeat with `OPENSMS_TEST_CLAMAV_ADDRESS=127.0.0.1:13310 go test -count=1 -v ./internal/filescan -run TestConfiguredClamAVEngine`.

## Provider callbacks

`POST /callbacks/providers/{provider_id}/dlr` accepts receipts only with `X-OpenSMS-Timestamp` (Unix seconds, within 5 minutes) and `X-OpenSMS-Signature` (hex HMAC-SHA256 of `timestamp + "." + body`) keyed with that provider's encrypted `callback_hmac_secret` (at least 32 bytes). Bodies are capped at 64 KiB. A 202 means evidence was stored, not that the message was delivered. Vendors that cannot sign (Africa's Talking) must go through [`opensms-at-bridge`](binaries.md#opensms-at-bridge).

## Network surface

- One HTTP listener (`OPENSMS_PORT`) for customers, operators and callbacks. `OPENSMS_ADMIN_PORT` does nothing; restrict `/admin/v1` at the proxy if you want a network boundary.
- The listener binds all interfaces. On the hosted host it is published only on the Docker bridge address `172.17.0.1:18080`; on staging, firewall it.
- Metrics use a separate listener, loopback by default; non-loopback requires a 32+ byte bearer token.
- CORS allows only the exact origins in `OPENSMS_CORS_ORIGINS`. Other origins get no CORS headers.
- In the hosted Compose file, PostgreSQL, Redis and NATS sit on an `internal: true` network with no published ports. Redis and NATS are unauthenticated there; do not attach other containers to that network.
- The balance-polling, FX and Slack clients and the provider check tools disable environment HTTP proxies and redirects. Webhook and Slack deliveries only allow public HTTPS destinations.
