# Local development stack

How to run opensms on your own machine from nothing: PostgreSQL, Redis and NATS in Docker, a restricted database role, migrations, a bootstrapped operator, the Go API and the SolidJS UI. It is for engineers who work on the API or the console and need a stack that behaves like the hosted one (same role split, same startup checks) while never sending email, SMS, webhooks or payments.

You can do it in one command with [`operations/local-stack.sh`](local-stack.sh), or step by step below. Both produce the same result. Related pages: [configuration](configuration.md), [database](database.md), [binaries](binaries.md).

![Operator console of a freshly created local stack, signed in as the bootstrapped superadmin](../assets/screens/operations/local-stack-admin-dashboard.png)

## Prerequisites

| Tool | Version used when this page was verified |
| --- | --- |
| Docker | any recent engine; images `postgres:16`, `redis:7`, `nats:2.10` |
| Go | 1.27 (the version in `api/go.mod`) |
| Node.js and pnpm | Node 22, pnpm (run `pnpm install` once in `frontend/`) |
| `openssl`, `curl` | system versions |

Check out `api/` and `frontend/` side by side. The script assumes `<workspace>/api` and `<workspace>/frontend` next to `<workspace>/docs`; set `OPENSMS_API_DIR` and `OPENSMS_UI_DIR` if yours live elsewhere.

## One command

```sh
operations/local-stack.sh up
```

What it does, in order, and why each step exists:

1. Generates four random 32-character secrets (database owner password, runtime password, encryption key, superadmin password) into `secrets.env` in the state directory, mode 0600. They are reused on later runs.
2. Creates or restarts three containers on loopback-only ports: `<prefix>-pg` (PostgreSQL 16, superuser `opensms_owner`), `<prefix>-redis`, `<prefix>-nats` (JetStream enabled, persistent volume).
3. Creates the login role `opensms_runtime` with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, using the same SQL as `api/ops/hosted/init-runtime.sh`. The password is passed through the container environment, never on a command line.
4. Builds `opensms`, `opensms-migrate` and `opensms-admin` into the state directory.
5. Runs `opensms-migrate -runtime-role opensms_runtime` with the owner URL. This applies `schema.sql`, every file in `database/migrations`, `seed.sql`, creates message partitions, then grants the runtime role exactly the privileges the API is allowed.
6. Runs `opensms-admin --role superadmin --development-no-totp --password-stdin` to create the first operator. If the operator already exists, it is left unchanged.
7. Writes `runtime.env` (all outbound delivery flags `false`, metrics on loopback) and starts the API with **only** that environment, from the state directory. Starting from there matters: the API loads `./.env` from its working directory and resolves `./database` for its migration check.
8. Starts Vite with `VITE_API_BASE` pointing at the API.

Every step is idempotent. Running `up` again on a healthy stack only rebuilds binaries and re-runs the migrator (which skips applied files and re-applies grants).

Output of a second `up` on an existing stack (paths shortened):

```text
[local-stack] container opsdocs-pg already running
[local-stack] container opsdocs-redis already running
[local-stack] container opsdocs-nats already running
[local-stack] PostgreSQL is ready
[local-stack] Redis is ready
[local-stack] ensuring restricted role opensms_runtime exists
[local-stack] building opensms
[local-stack] building opensms-migrate
[local-stack] building opensms-admin
[local-stack] running opensms-migrate with runtime grants
2026/09/24 07:18:42 Migrations and requested runtime grants complete
[local-stack] bootstrapping superadmin admin@opensms.test (development mode, no TOTP)
[local-stack] superadmin already exists, left unchanged
[local-stack] API already running (pid 34741)
[local-stack] starting ui on 127.0.0.1:5200 (VITE_API_BASE=http://127.0.0.1:18200, log: .../logs/ui.log)
[local-stack] ui is ready
API          http://127.0.0.1:18200   (customer /v1, operator /admin/v1)
UI           http://127.0.0.1:5200    (customer /login, operator /admin/login)
Metrics      http://127.0.0.1:19100/metrics (0 means disabled)
PostgreSQL   127.0.0.1:15460  container opsdocs-pg (owner opensms_owner, runtime opensms_runtime)
Redis        127.0.0.1:16410  container opsdocs-redis
NATS         127.0.0.1:14250  container opsdocs-nats (event bus enabled: false)
Superadmin   admin@opensms.test, password in .../secrets.env (ADMIN_PASSWORD)
State        .../opsdocs-state
```

(That run used `OPENSMS_LOCAL_PREFIX=opsdocs` and a scratch `OPENSMS_LOCAL_STATE`. The first `up` on an empty machine prints `creating container ...` and the created operator as JSON: `{"email":"admin@opensms.test","role":"superadmin","login_path":"/admin/v1/login"}`.)

### Other commands

| Command | Effect | Changes state |
| --- | --- | --- |
| `status` | Container states, applied versus available migrations, runtime role attributes, partition range, `/healthz`, `/readyz`, metrics and UI HTTP codes. | No (read-only) |
| `env` | Prints the connection summary. | Creates secrets if missing |
| `mock-ui` | Starts a second Vite server with no `VITE_API_BASE`, so the in-browser mock backend answers every call. | Starts a process |
| `stop` | Stops the API and Vite processes started by the script. | Yes |
| `down` | `stop`, then removes this prefix's three containers. Volumes and secrets are kept. | Yes |
| `down --purge` | Also deletes the prefix's volumes and the state directory. This destroys the local database. | Yes, destructive |
| `help` | Prints the header. | No |

### Settings

All optional. Defaults avoid the ports used by `api/docker-compose.yml` (15432, 6379, 4222) and by a native `go run` API (8080/18080).

| Variable | Default |
| --- | --- |
| `OPENSMS_LOCAL_PREFIX` | `opensms-local` (container and volume names) |
| `OPENSMS_LOCAL_STATE` | `~/.local/state/<prefix>` |
| `OPENSMS_LOCAL_PG_PORT`, `_REDIS_PORT`, `_NATS_PORT` | `15460`, `16410`, `14250` |
| `OPENSMS_LOCAL_API_PORT`, `_UI_PORT`, `_MOCK_PORT` | `18200`, `5200`, `5201` |
| `OPENSMS_LOCAL_METRICS_PORT` | `19100` (`0` disables metrics) |
| `OPENSMS_LOCAL_EVENTBUS` | `false`; `true` routes the outbox through JetStream |
| `OPENSMS_LOCAL_ADMIN_EMAIL` | `admin@opensms.test` |
| `OPENSMS_LOCAL_SKIP_UI` | `false` |

`status` can also inspect a stack it did not create by overriding container names, for example the docs stack:

```sh
OPENSMS_LOCAL_PG_CONTAINER=osdocs-pg OPENSMS_LOCAL_PG_SUPERUSER=osdocs \
OPENSMS_LOCAL_REDIS_CONTAINER=osdocs-redis OPENSMS_LOCAL_NATS_CONTAINER=osdocs-nats \
OPENSMS_LOCAL_API_PORT=18180 OPENSMS_LOCAL_UI_PORT=5190 OPENSMS_LOCAL_METRICS_PORT=0 \
operations/local-stack.sh status
```

```text
containers:
  osdocs-pg                running postgres:16
  osdocs-redis             running redis:7
  osdocs-nats              running nats:2.10
migrations: 126 applied of 126 in ./database (schema.sql + migrations/*.sql)
runtime role: opensms_runtime superuser=false createdb=false createrole=false bypassrls=false
message partitions: 14 (messages_2026_08 .. messages_2027_09)
api /healthz: HTTP 200
api /readyz: HTTP 200
ui: HTTP 200
```

## Step by step

The same stack by hand, for when you want to understand or change a step. Replace the example passwords with your own random values.

### 1. Dependencies

```sh
docker run -d --name opensms-local-pg -p 127.0.0.1:15460:5432 \
  -e POSTGRES_USER=opensms_owner -e POSTGRES_DB=opensms -e POSTGRES_PASSWORD=owner-pw \
  -v opensms-local-pgdata:/var/lib/postgresql/data postgres:16
docker run -d --name opensms-local-redis -p 127.0.0.1:16410:6379 redis:7
docker run -d --name opensms-local-nats  -p 127.0.0.1:14250:4222 \
  -v opensms-local-natsdata:/data nats:2.10 --js --store_dir /data/jetstream
```

Wait for `docker exec opensms-local-pg pg_isready -h 127.0.0.1 -U opensms_owner` to succeed. Use `-h 127.0.0.1`: on first boot the image runs a temporary socket-only server, and a socket check can pass before the real server has started. (The first version of the script hit exactly this and failed the next `psql` call.)

### 2. Runtime role

```sh
docker exec -i opensms-local-pg psql -U opensms_owner -d opensms <<'SQL'
CREATE ROLE opensms_runtime LOGIN PASSWORD 'runtime-pw'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
SQL
```

Never make this role a member of the owner role or of `opensms_audit_custodian`. The API refuses to start if it can create objects, owns tables or can update wallet balances. See [database](database.md#roles-and-grants).

### 3. Build the binaries into a clean run directory

Build instead of `go run -C api`: `-C` makes the program's working directory `api/`, so it would load `api/.env` for any variable you did not set. In this workspace that file sets email, event bus, port and database values, which is exactly what you do not want in an isolated stack.

```sh
mkdir -p ~/opensms-run/bin && cd ~/opensms-run
for b in opensms opensms-migrate opensms-admin; do go build -C /path/to/api -o ./bin/$b ./cmd/$b; done
ln -sfn /path/to/api/database ./database
```

The `database` link matters twice: `opensms-migrate` defaults to `-database-dir database`, and the API checks every file in `./database` has been applied before it serves.

### 4. Migrations and grants

```sh
OPENSMS_MIGRATION_DATABASE_URL='postgres://opensms_owner:owner-pw@127.0.0.1:15460/opensms?sslmode=disable' \
OPENSMS_DATABASE_URL='postgres://opensms_runtime:runtime-pw@127.0.0.1:15460/opensms?sslmode=disable' \
./bin/opensms-migrate -runtime-role opensms_runtime
```

Expected output: `Migrations and requested runtime grants complete`. Re-running it is safe: applied files are skipped and grants are re-applied.

### 5. First operator

```sh
printf '%s' 'a-password-of-16+-chars' | \
OPENSMS_ADMIN_DATABASE_URL='postgres://opensms_owner:owner-pw@127.0.0.1:15460/opensms?sslmode=disable' \
./bin/opensms-admin --email admin@opensms.test --role superadmin --development-no-totp --password-stdin
```

```text
{"email":"admin@opensms.test","role":"superadmin","login_path":"/admin/v1/login"}
```

Without `--password-stdin` the command generates a password and prints it once in the JSON output (`"password":"..."`). Running it again for the same email prints `identity already exists; no promotion or reset performed` and exits 1. For production use `--with-totp`; see [binaries](binaries.md#opensms-admin).

### 6. API

```sh
OPENSMS_PORT=18200 \
OPENSMS_DATABASE_URL='postgres://opensms_runtime:runtime-pw@127.0.0.1:15460/opensms?sslmode=disable' \
OPENSMS_REDIS_URL=redis://127.0.0.1:16410/0 \
OPENSMS_NATS_URL=nats://127.0.0.1:14250 \
OPENSMS_ENCRYPTION_KEY="$(openssl rand -base64 24)" \
OPENSMS_CORS_ORIGINS=http://127.0.0.1:5200,http://localhost:5200 \
OPENSMS_EMAIL_DELIVERY_ENABLED=false OPENSMS_LIVE_DISPATCH_ENABLED=false \
OPENSMS_WEBHOOK_DELIVERY_ENABLED=false OPENSMS_AUTOMATIC_TOPUPS_ENABLED=false \
./bin/opensms
```

`openssl rand -base64 24` yields exactly 32 characters, which the API uses as 32 raw bytes. Keep the encryption key you choose: data encrypted with one key (TOTP secrets, webhook secrets, provider credentials) cannot be read with another. The script stores it in `secrets.env`.

Check it, and sign in as the operator:

```text
$ curl -s http://127.0.0.1:18200/healthz
ok
$ curl -s http://127.0.0.1:18200/readyz
ready
$ curl -s -X POST http://127.0.0.1:18200/admin/v1/login -H 'Content-Type: application/json' \
    -d '{"email":"admin@opensms.test","password":"a-password-of-16+-chars"}'
{"expires_at":"2026-09-24T19:34:45.969179+03:00","role":"superadmin","token":"sess_O3p9..."}
```

The API handles SIGINT (Ctrl-C) and SIGTERM by draining for up to 10 seconds; the SIGTERM case was checked and exited with code 0.

`api/scripts/dev.sh` (`make dev`) is the repository's own shortcut for this step. It forces the four delivery flags to `false` and requires `OPENSMS_DATABASE_URL` and `OPENSMS_ENCRYPTION_KEY` to be exported, but it runs from `api/` and so also loads `api/.env`.

### 7. UI against the real API

`VITE_API_BASE` tells the console where the API is, and `OPENSMS_CORS_ORIGINS` on the API must contain the exact origin the browser uses (scheme, host and port). `127.0.0.1` and `localhost` are different origins.

```sh
cd /path/to/frontend
VITE_API_BASE=http://127.0.0.1:18200 pnpm exec vite --host 127.0.0.1 --port 5200 --strictPort
```

This exact command was not run while writing this page, because a second Vite server on the same checkout shares `frontend/node_modules/.vite` with other running dev servers. The script's equivalent (same flags, isolated cache) was run. Verified preflight from the allowed origin, and from an origin that is not listed (the API simply omits CORS headers and the route answers normally, so the browser blocks it):

```text
$ curl -si -X OPTIONS http://127.0.0.1:18200/v1/auth/login -H 'Origin: http://127.0.0.1:5200' -H 'Access-Control-Request-Method: POST'
HTTP/1.1 204 No Content
Access-Control-Allow-Headers: Authorization, Content-Type, Idempotency-Key, X-Workspace-ID, X-Environment, X-CSRF-Token
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Origin: http://127.0.0.1:5200
Access-Control-Expose-Headers: X-Request-ID, Retry-After, X-Next-Cursor
Access-Control-Max-Age: 600
Vary: Origin

$ curl -si -X OPTIONS http://127.0.0.1:18200/v1/auth/login -H 'Origin: http://evil.example' -H 'Access-Control-Request-Method: POST'
HTTP/1.1 404 Not Found
Content-Type: application/problem+json
```

Sign in at `http://127.0.0.1:5200/admin/login` with the operator from step 5, or create a customer at `/signup` (`/login` for existing accounts).

A `frontend/.env.local` file, if present, also sets `VITE_API_BASE` (in this workspace it points at `http://127.0.0.1:18080`). A variable set on the command line overrides it. The script sidesteps the file entirely by giving Vite its own `envDir` and `cacheDir` in the state directory, which also keeps its dependency cache away from any other Vite server running from the same checkout.

## UI without a backend (mock mode)

When `VITE_API_BASE` is unset and Vite runs in dev mode, `frontend/src/index.tsx` starts an MSW service worker and every `/v1` and `/admin/v1` request is answered in the browser from a seeded mock database (a demo workspace called Northlane). Nothing reaches a real API. Use it for UI work when you do not need real data.

```sh
cd /path/to/frontend && pnpm dev            # with no VITE_API_BASE set anywhere
# or
operations/local-stack.sh mock-ui           # http://127.0.0.1:5201
```

Mock credentials (from `frontend/README.md`): customer `amara@northlane.io` / `opensms-demo`, operator `admin@opensms.dev` / `opensms-admin`. Mock data persists in `localStorage`; add `?reset=1` to a URL to reseed.

Verified with Playwright against `mock-ui`: after signing in as Amara, every API response was served by the service worker, for example:

```text
POST 127.0.0.1:5201/v1/auth/login 200 sw=true
GET 127.0.0.1:5201/v1/legal/acceptances 200 sw=true
GET 127.0.0.1:5201/v1/analytics/overview 200 sw=true
```

![Console overview served entirely by the mock backend (Northlane demo data)](../assets/screens/operations/mock-backend-overview.png)

Mock mode is not a contract test. The mock handlers can differ from the real API: in the capture above the "Top countries" card shows "Couldn't load this breakdown" even though the mock answered `GET /v1/analytics/by-country` with 200.

## What is deliberately off

The generated `runtime.env` sets `OPENSMS_EMAIL_DELIVERY_ENABLED`, `OPENSMS_LIVE_DISPATCH_ENABLED`, `OPENSMS_WEBHOOK_DELIVERY_ENABLED`, `OPENSMS_AUTOMATIC_TOPUPS_ENABLED`, `OPENSMS_PROVIDER_BALANCE_POLLING_ENABLED`, `OPENSMS_ROUTE_PROBES_ENABLED` and `OPENSMS_LOOKUP_REFRESH_ENABLED` to `false`, and leaves every other external feature at its `false` default. Consequences you will notice:

- Signup works, but verification, login-code and reset emails are not sent. Sandbox sending requires the `email_verified` onboarding step, so a fresh workspace gets `403 email verification is required for sandbox sending` until that step is approved. On a disposable local database you can approve it directly as the owner role (`update onboarding_states set status='approved' where workspace_id='<id>' and step='email_verified'`); never do this on a shared or hosted database.
- Sandbox messages still flow end to end through the mock provider: a sandbox send to `+254700000012` went `queued` to `delivered` within a second on the script's stack.
- Uploaded documents stay quarantined because file scanning is off.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| API exits with `unsafe database runtime privileges` | `OPENSMS_DATABASE_URL` uses the owner or a superuser. Use `opensms_runtime`. |
| API exits with `run opensms-migrate before starting API: missing NNNN_x.sql` | A migration file exists in `./database/migrations` that the database has not recorded. Run the migrator. Also check the API's working directory points at the checkout you think it does. |
| `opensms-admin` prints `database owner or superuser operator credential required` | You passed the runtime URL. Use the owner URL. |
| `opensms-admin` prints `identity already exists; no promotion or reset performed` | The email exists as a customer or operator. The tool never modifies existing users. |
| Browser shows CORS errors | The UI origin is not in `OPENSMS_CORS_ORIGINS`. |
| UI shows Northlane data unexpectedly | `VITE_API_BASE` is unset, so mock mode is on. |
| `psql: ... No such file or directory` right after creating the container | First-boot init. Wait with `pg_isready -h 127.0.0.1`. |
