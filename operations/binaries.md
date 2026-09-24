# Binaries

Every program under `api/cmd`: what it is for, its flags and environment, when to run it, and what it refuses to do. This page is for engineers who build, deploy and operate opensms. The help text and error messages below were produced by binaries built from the current `api/` checkout with `go build -o <dir>/<name> ./cmd/<name>` and run from an empty directory. The build directory is shortened out of the `Usage of ...` lines.

Related pages: [configuration](configuration.md), [deployment](deployment.md), [local development](local-development.md).

| Binary | Purpose | Ships in hosted image | Run when |
| --- | --- | --- | --- |
| [`opensms`](#opensms) | API server and all workers | Yes (entrypoint) | Always, as the service |
| [`opensms-migrate`](#opensms-migrate) | Apply schema, migrations, seed, partitions and runtime grants | Yes | Before starting a new release, as a one-shot |
| [`opensms-admin`](#opensms-admin) | Create an operator account | Yes | Bootstrapping or adding operators when no admin can invite |
| [`opensms-at-bridge`](#opensms-at-bridge) | Sign Africa's Talking delivery callbacks for opensms | Yes (not started by Compose) | Only when Africa's Talking receipts are needed |
| [`opensms-at-check`](#opensms-at-check) | Africa's Talking balance check or one authorized test SMS | No | Provider onboarding |
| [`opensms-textsms-check`](#opensms-textsms-check) | TextSMS provider config export or one authorized test SMS | No | Provider onboarding |

Build any of them for the hosted host with `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o <name> ./cmd/<name>` from `api/`. `make build` builds only `bin/opensms`.

## opensms

The API. It has **no flags**: everything comes from the environment and `./.env` (see [configuration](configuration.md)). `opensms -h` does not print help; it starts normally and, with no configuration, tries `postgres://localhost:5432/opensms`:

```text
$ opensms -h
{"time":"...","level":"ERROR","msg":"store open failed","err":"ping: failed to connect to `user=user database=opensms`: ..."}
```

Startup order: load and validate config, open PostgreSQL, check runtime privileges, check that every file in `./database` is applied, register lookup configuration, start workers, ensure 12 months of partitions, connect Redis, start the event bus if enabled, then listen. Any failure before listening exits with status 1 and a JSON error line. Run it with a working directory that contains the release's `database/` directory (the images use `WORKDIR /app`).

Signals: SIGTERM and SIGINT trigger a graceful stop (up to 10 seconds) and exit 0.

## opensms-migrate

```text
$ opensms-migrate -h
Usage of opensms-migrate:
  -database-dir string
    	Database schema and migration directory (default "database")
  -runtime-role string
    	Existing nonprivileged runtime role to grant application access
```

| Environment | Required | Meaning |
| --- | --- | --- |
| `OPENSMS_MIGRATION_DATABASE_URL` | Yes | Owner or superuser URL used for DDL. |
| everything `config.Load()` validates | Yes | The migrator loads the full API config first, so production needs a valid 32-byte `OPENSMS_ENCRYPTION_KEY` and valid values for any feature you enable in the same file. It exits with `Invalid migration configuration` otherwise. |

What it does: applies `schema.sql`, each `migrations/*.sql` not yet recorded, and `seed.sql` (each once, each in its own transaction), ensures message partitions 12 months ahead, then, with `-runtime-role`, grants that role its restricted privileges. Timeout 5 minutes. Output on success:

```text
2026/09/24 07:34:32 Migrations and requested runtime grants complete
```

Refusals:

```text
$ opensms-migrate            # no OPENSMS_MIGRATION_DATABASE_URL
2026/09/24 07:19:26 OPENSMS_MIGRATION_DATABASE_URL is required; do not give migration credentials to the API
```

`GrantRuntime` also refuses a runtime role that has superuser, createrole, createdb, replication or bypassrls (`runtime role has administrative privileges`).

Run it: before starting any release that adds migrations, always with `-runtime-role opensms_runtime`, with the API stopped (manual procedure) or at least before the new API starts (`deploy.sh`). It is safe to re-run. Hosted: `docker compose --profile operator run --rm migrate`. Staging: `systemctl start opensms-migrate@<commit>.service`.

## opensms-admin

```text
$ opensms-admin -h
Usage of opensms-admin:
  -development-no-totp
    	Explicit local development bootstrap without admin TOTP
  -email string
    	New administrator email
  -password-stdin
    	Read password from stdin instead of generating one
  -role string
    	Explicit role: superadmin, ops, finance, support
  -with-totp
    	Generate admin authenticator secret using explicit OPENSMS_ENCRYPTION_KEY
```

| Environment | Meaning |
| --- | --- |
| `OPENSMS_ADMIN_DATABASE_URL` | Required. A superuser, or a role that owns the `users` and `admin_users` tables. Does not fall back to `OPENSMS_DATABASE_URL` and never reads `.env`. |
| `OPENSMS_ENCRYPTION_KEY` | Required with `--with-totp`; must be the installation's existing key. |
| `OPENSMS_ENV` | `production` rejects `--development-no-totp`. |

It creates a new user and a matching operator in one transaction, writes an `admin.operator_created` audit row, and prints JSON. The password (unless `--password-stdin`) and TOTP secret (with `--with-totp`) appear only in that output, so redirect it to a private file with `umask 077`. Passwords must be 16 to 1024 bytes.

```text
$ printf '%s' 'a-password-of-16+-chars' | opensms-admin --email admin@opensms.test --role superadmin --development-no-totp --password-stdin
{"email":"admin@opensms.test","role":"superadmin","login_path":"/admin/v1/login"}

$ opensms-admin --email ops2@opensms.test --role ops --development-no-totp
{"email":"ops2@opensms.test","role":"ops","password":"<generated, redacted here>","login_path":"/admin/v1/login"}
```

Refusals (each exits 1):

| Situation | Message |
| --- | --- |
| Neither or both TOTP modes, or `--development-no-totp` in production | `use --with-totp, or explicitly --development-no-totp outside production` / `choose one TOTP provisioning mode` |
| No database URL | `OPENSMS_ADMIN_DATABASE_URL is required; use a separate operator credential` |
| Runtime (non-owner) URL | `database owner or superuser operator credential required` |
| Role not in the list | `role must be superadmin, ops, finance, or support` |
| Email already used by any customer or operator | `identity already exists; no promotion or reset performed` |

It never promotes an existing account and never resets a password. Once one superadmin exists, prefer inviting operators from the console (`/admin/v1/admins/invite`), which is audited and email-based.

## opensms-at-bridge

A small HTTP server that receives Africa's Talking delivery callbacks at an unguessable path and forwards the **exact body** to `POST <api>/callbacks/providers/<provider id>/dlr` with the opensms HMAC headers. Needed because Africa's Talking cannot sign requests the way opensms requires. No flags.

| Environment | Required | Meaning |
| --- | --- | --- |
| `OPENSMS_AT_BRIDGE_API_BASE_URL` | Yes | HTTPS origin of the opensms API (HTTP is rejected). |
| `OPENSMS_AT_BRIDGE_PROVIDER_ID` | Yes | The provider's UUID in opensms. |
| `OPENSMS_AT_BRIDGE_CALLBACK_TOKEN` | Yes | 32+ URL-safe characters; the secret last path segment. |
| `OPENSMS_AT_BRIDGE_CALLBACK_HMAC_SECRET` | Yes | 32+ characters; must equal the provider's stored `callback_hmac_secret`. |
| `OPENSMS_AT_BRIDGE_LISTEN` | No | Default `127.0.0.1:18085`. Put an HTTPS proxy in front. |

The callback URL to register in the Africa's Talking dashboard is `https://<bridge host>/callbacks/africastalking/<provider id>/<callback token>`, and the same URL goes in the provider's adapter config as `callback_url`.

Behaviour checked locally with a valid configuration pointing at an unreachable API (`https://127.0.0.1:1`):

```text
Africa's Talking callback bridge listening on 127.0.0.1:18299
GET right path: 405
POST wrong token: 404
POST right path, upstream unreachable: 502
```

It relays only the opensms status code to the caller, never the opensms response body. Its own refusals are 405 (empty body) for any method other than POST, and, with a short plain-text body, 404 for a wrong path or any query string, 413 for bodies over 64 KiB and 502 when the API cannot be reached. With missing or invalid configuration it exits 1 with `Invalid Africa's Talking callback bridge configuration`. The hosted Compose file does not define a bridge service; run it separately when needed. Forwarding to a real API was not tested here because the API base must be HTTPS.

## opensms-at-check

Provider onboarding tool for Africa's Talking. Reads a private JSON credentials file (`{"username": ..., "api_key": ...}`, must be a regular file with no group or other permissions).

```text
$ opensms-at-check -h
Usage of opensms-at-check:
  -credentials string
    	Private JSON containing username and api_key
  -from string
    	Approved sender; omit to use provider default
  -journal string
    	New private journal required for sending
  -send
    	Submit one authorized SMS; defaults to balance lookup
  -text string
    	Explicit test message
  -to string
    	Authorized recipient in E.164 format
```

- Without `--send`: prints the account balance as JSON.
- With `--send`: requires `--to`, `--text` and a **new** `--journal` file (created exclusively, mode 0600). It writes the intent before sending, every provider response (API key redacted) and the result. If the outcome is not a confirmed acceptance it exits non-zero with `acceptance not confirmed; inspect journal, do not resend automatically`.

Checked locally without credentials only (`--credentials is required`, `sending requires --to, --text and a new --journal`). A real balance call or send was not made: it contacts Africa's Talking and spends credit.

## opensms-textsms-check

Provider onboarding tool for TextSMS. Reads a private dotenv with `SMS_API_KEY`, `SMS_PARTNER_ID`, `SMS_SENDER`.

```text
$ opensms-textsms-check -h
Usage of opensms-textsms-check:
  -config-output string
    	Create private provider configuration for the admin API, without sending
  -confirm-received
    	Append the operator's handset receipt confirmation without sending
  -credentials string
    	Existing private dotenv containing SMS_API_KEY, SMS_PARTNER_ID and SMS_SENDER
  -journal string
    	New private evidence file; existing files prevent submission
  -send
    	Authorize one real SMS using provider credit
  -to string
    	Explicitly authorized test recipient in E.164 format
```

Three separate actions:

1. `--credentials F --config-output OUT.json` writes a provider definition (slug `textsms-zkteco`, adapter `textsms`, status `pending_integration`, credentials included) to a new 0600 file, without network access. Submit it with `POST /admin/v1/providers`, then delete the file.
2. `--credentials F --to +254... --journal NEW.jsonl --send` sends one fixed test SMS with the same journal discipline as `opensms-at-check`.
3. `--journal EXISTING.jsonl --confirm-received` appends the operator's handset confirmation without sending.

Checked locally without credentials only (`--send, --credentials, --to and a new --journal are required`). The config export and send were not run: no TextSMS credentials were available, and sending spends credit.

## Makefile targets

From `api/Makefile`, for reference: `make run` (`go run ./cmd/opensms` from `api/`, so it reads `api/.env`), `make build`, `make test` (needs `OPENSMS_TEST_DATABASE_URL` and `OPENSMS_TEST_REDIS_URL`), `make dev` (`scripts/dev.sh`, delivery flags forced off), `make smoke`, `make ci`, `make docker` (`opensms/api:local` from `api/Dockerfile`), `make up`/`down` (dependency containers from `api/docker-compose.yml`), `make contracts-check`, `make deploy` and `make deploy-status` (remote, see [deployment](deployment.md)). None of the remote targets was run for this page.
