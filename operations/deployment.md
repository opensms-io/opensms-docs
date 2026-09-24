# Deployment

How opensms is packaged and released: the single-host Docker Compose installation behind `make deploy` (the current opensms.io host), the systemd staging layout, the images and files involved, the order of operations for a release, and what rollback does and does not mean. This page is for engineers who ship opensms releases or build a new environment. Sources: `api/deploy/deploy.sh`, `api/ops/hosted/*`, `api/ops/staging/*`, `api/Dockerfile`, and the notes `hosted-deployment-2026-09-23.md`, `staging-release.md` and `container-development.md` in `api/docs`.

**Nothing on this page was executed while writing it.** No deploy, `ssh`, `scp` or remote command was run; commands are quoted from the repository. Local, read-only checks that were run are marked.

Related pages: [configuration](configuration.md), [database](database.md#migrations), [monitoring](monitoring.md), [backup and restore](backup-and-restore.md), [security](security.md).

## Deployment shapes

| Shape | Files | Use |
| --- | --- | --- |
| Hosted single host (Compose) | `api/ops/hosted/compose.yaml`, `Dockerfile.prebuilt`, `init-runtime.sh`, `runtime.env.example`, `dashboard.nginx.conf`, `api/deploy/deploy.sh` | The existing opensms.io host. Not highly available. |
| Staging (systemd) | `api/ops/staging/opensms.service`, `opensms-migrate@.service`, `runtime.env.example`, `migration.env.example` | A Linux host running the binaries directly, maintenance-window releases. Artifacts exist; no staging host is recorded as provisioned. |
| Local container | `api/docker-compose.yml` profile `app`, `api/Dockerfile` | Developer image check only. See [local development](local-development.md). |

## Images

| Image | Built from | Contains |
| --- | --- | --- |
| `api/Dockerfile` | Multi-stage `golang:1.27-alpine` build, `gcr.io/distroless/static-debian12` runtime | `/app/opensms`, `/app/opensms-migrate`, `/app/database`. Runs as `nonroot:nonroot`. `EXPOSE 8080 8081` (8081 is unused, see [configuration](configuration.md#drift-between-code-and-envexample)). |
| `api/ops/hosted/Dockerfile.prebuilt` | Linux amd64 binaries compiled by `deploy.sh` | `opensms`, `opensms-migrate`, `opensms-admin`, `opensms-at-bridge` and `database/`. Distroless, `nonroot`. Only `EXPOSE 8080`. |

No credentials are ever baked into an image.

## Hosted single host

### Layout on the host

| Path | Content |
| --- | --- |
| `/opt/opensms-backend/compose.yaml` | Compose project `opensms-backend` (immutable attribute set between deploys) |
| `/opt/opensms-backend/.env` | Compose interpolation only: `OPENSMS_IMAGE`, `POSTGRES_PASSWORD`, `OPENSMS_RUNTIME_DB_PASSWORD`. Mode 0600. |
| `/opt/opensms-backend/runtime.env` | API environment (copy of `runtime.env.example` filled privately). Mode 0600. |
| `/opt/opensms-backend/migration.env` | Migrator environment including the owner URL. Mode 0600. |
| `/opt/opensms-backend/init-runtime.sh` | Creates `opensms_runtime` on first database initialization only. |
| `/opt/opensms-backend/clamav/` | `start.sh`, `health.sh`, `clamd.conf` for the scanner container |
| `/opt/opensms-backend/releases/<release>/` | Staged build context and config per release |
| `/opt/opensms-backend/backups/opensms-<UTC stamp>.sql.gz` | `pg_dump` taken by every deploy, mode 0600 |
| `/opt/opensms-backend/accepted-api-revision`, `accepted-ui-revision` | Last deployed commits, used to reject stale checkouts |
| `/opt/opensms-dashboard/releases/<release>/` | Static UI build |
| `/opt/opensms-dashboard/nginx.conf` | UI container nginx config |

### Services in `compose.yaml`

| Service | Image | Networks | Notes |
| --- | --- | --- | --- |
| `postgres` | `postgres:16` | `backend` (internal) | Owner `opensms_owner`; health check `pg_isready`. |
| `redis` | `redis:7` with `--appendonly yes` | `backend` | |
| `nats` | `nats:2.10 --js` | `backend` | Present, but the API runs with `OPENSMS_EVENTBUS_ENABLED=false` (production validation needs TLS and 3 replicas). |
| `clamav` | `clamav/clamav:1.4` pinned by digest | `backend`, `ingress` | Needs outbound access for signature updates; shares its socket through the `clamav_socket` volume. `start_period: 4m`. |
| `migrate` | `${OPENSMS_IMAGE}`, profile `operator` | `backend` | One-shot `opensms-migrate -runtime-role opensms_runtime -database-dir /app/database` with `migration.env`. Read-only root, all capabilities dropped. |
| `api` | `${OPENSMS_IMAGE}` | `backend`, `ingress` | `OPENSMS_ENV=production`, port `172.17.0.1:18080:8080`, read-only root, `/tmp` tmpfs, `cap_drop: ALL`, `no-new-privileges`, `stop_grace_period: 60s`. Waits for healthy postgres, redis and clamav. |

`backend` is `internal: true`: PostgreSQL, Redis and NATS have no published ports and no internet access. Only the API is published, and only on the Docker bridge address so the shared nginx proxy on the host can reach it.

TLS terminates at the shared host nginx (`axene-proxy`). The existing vhost proxies `/v1/`, `/admin/v1/`, `/callbacks/providers/`, `/healthz`, `/readyz` and `/legal/` to `http://172.17.0.1:18080` (WebSocket upgrades on, 12 MiB bodies) and the SPA routes to the `opensms-dashboard` nginx container on `172.17.0.1:3022`.

### What `make deploy` does

`make deploy` runs `api/deploy/deploy.sh`. Prerequisites on the workstation: clean committed `api/` and `frontend/` checkouts, Go, pnpm, and SSH access to the host alias (`OPENSMS_DEPLOY_HOST`, default `forms`). Steps in order:

1. **Refuse dirty trees.** Fails with `Commit API changes before deploying.` or `Commit dashboard changes before deploying.` if either checkout has uncommitted changes.
2. **Name the release** `<api short sha>-<ui short sha>-<UTC timestamp>-<pid>`, or `OPENSMS_RELEASE`.
3. **Build locally.** `GOOS=linux GOARCH=amd64` builds of `opensms`, `opensms-migrate`, `opensms-admin`, `opensms-at-bridge`; `git archive` of `database/`; the dashboard with `VITE_API_BASE=https://opensms.io pnpm build --base /dashboard-assets/`. Tarballs are made with `COPYFILE_DISABLE=1`.
4. **Upload** the build context, the dashboard tarball, config files and the list of ancestor commits into a new release directory.
5. **Take the server lock** (`flock` on `/opt/opensms-backend/deploy.lock`); a concurrent deploy fails with `Another OpenSMS deployment holds the server lock.`
6. **Reject stale releases.** If the previously accepted API or UI commit is not an ancestor of what you are deploying, fails with `Rejected stale api release: update your checkout before deploying.`
7. **Install config.** Temporarily clears the immutable attribute on `compose.yaml`, the dashboard nginx config and the ClamAV files, copies the staged versions, and sets it again.
8. **Check production values** in `runtime.env` without printing them. It fails with `Missing production values: ...` unless all of these are non-empty: `OPENSMS_DATABASE_URL`, `OPENSMS_ENCRYPTION_KEY`, `OPENSMS_CORS_ORIGINS`, `OPENSMS_RECEIPT_BASE_URL`, `OPENSMS_ADMIN_CONSOLE_URL`, `OPENSMS_PASSWORD_RESET_URL`, `OPENSMS_EMAIL_DELIVERY_ENABLED`, `AXENE_API_KEY`, `AXENE_FROM_EMAIL`, `OPENSMS_FILE_SCAN_ENABLED`, `OPENSMS_FILE_SCAN_NETWORK`, `OPENSMS_FILE_SCAN_ADDRESS`. It also requires a 32-byte key, email delivery `true`, scanning on the Unix socket `/run/clamav/clamd.sock`, and `https://opensms.io` in the four URL values.
9. **Build the image** `opensms-backend:<release>` on the host from `Dockerfile.prebuilt`.
10. **Back up** with `pg_dump` as `opensms_owner` into `backups/opensms-<stamp>.sql.gz` (mode 0600).
11. **Switch the image** by rewriting `OPENSMS_IMAGE` in `.env` (previous file kept as `.env.bak`).
12. **Migrate and start:** `docker compose config --quiet`, `up -d postgres redis nats`, `--profile operator run --rm migrate`, `up -d api`. With `set -eu`, a failed migration stops the script before the API is replaced.
13. **Swap the dashboard container**, keeping older hashed assets so cached pages do not hit 404s, and renaming the old container to `opensms-dashboard-before-<release>` with restart disabled.
14. **Patch and reload the shared nginx** (backs up `opensms.conf` first, runs `nginx -t` before reload).
15. **Smoke test** over public HTTPS: `/healthz`, `/readyz`, `/admin/login`, `/legal/dpa/1.0`. Prints `OpenSMS: release <release> is live.`

`make deploy-status` runs, over SSH, `docker compose ps` and public `/healthz` and `/readyz`.

Note the order in step 12: the new migrations run while the **old API container is still running** and serving traffic, and only then is the API recreated on the new image. That differs from the manual procedure in `api/ops/hosted/README.md` and `staging-release.md`, which stop the API before migrating. Migrations therefore need to be compatible with the previous binary for the few seconds in between.

### First installation on a new host

From `api/ops/hosted/README.md` (not performed while writing this page):

1. Confirm the host has `172.17.0.1` on its Docker bridge and port 18080 is free.
2. Install the Compose file, `init-runtime.sh` and the ClamAV files in `/opt/opensms-backend`, root-owned.
3. Create `.env`, `runtime.env` and `migration.env` with mode 0600 in a private editor, never with secrets on a command line. Generate independent URL-safe database passwords of 32+ characters and a 32-byte encryption key. `migration.env` needs `OPENSMS_ENV=production`, the restricted `OPENSMS_DATABASE_URL`, `OPENSMS_MIGRATION_DATABASE_URL` for `opensms_owner`, and the same `OPENSMS_ENCRYPTION_KEY` (the migrator loads the full config).
4. Validate without printing secrets: `docker compose config --quiet`.
5. `docker compose up -d postgres redis nats`, then `docker compose --profile operator run --rm migrate`, then `docker compose up -d api`.
6. `curl --fail --silent --show-error http://172.17.0.1:18080/readyz`.
7. Add a separate server block to the shared proxy for the API hostname with WebSocket forwarding; `nginx -t` before reload.
8. Create the first operator with `opensms-admin --with-totp` (see [binaries](binaries.md#opensms-admin)).

`init-runtime.sh` runs only when the PostgreSQL volume is first initialized. Changing `OPENSMS_RUNTIME_DB_PASSWORD` later does **not** change the role's password, and deleting the volume to "fix" credentials deletes the database.

### Current hosted state

From `api/docs/hosted-deployment-2026-09-23.md`: the backend was installed on 23 September 2026 in `/opt/opensms-backend` alongside the unchanged PHP landing site. Migrations through 0118 were applied to a fresh database; no local data or provider credentials were copied. Axene email delivery is enabled with sender `info@opensms.io`. Live SMS dispatch, webhooks, payments, balance polling and route probes are disabled; the event bus is disabled. Verified at the time over public HTTPS: `/healthz` and `/readyz` 200, unauthenticated `/v1/me` and `/admin/v1/workspaces` 401, operator password login returning the mandatory TOTP challenge. The note calls this a limited staging deployment, not production readiness. The migration level on the host today was not checked for this page.

## Staging with systemd

`api/ops/staging` targets a Linux host with PostgreSQL, Redis and (optionally) NATS provided separately. Summary of `staging-release.md`:

- Two system users, `opensms` and `opensms-migrate`, no shell or home. Releases in `/opt/opensms/releases/<full commit>`, root-owned and never modified in place; `/opt/opensms/current` is a symlink to the active one.
- `/etc/opensms/runtime.env` and `/etc/opensms/migration.env`, root 0600, read by systemd before dropping privileges. Both examples set `OPENSMS_ENV=production`.
- `opensms.service` runs `/opt/opensms/current/opensms` with `ProtectSystem=strict`, `NoNewPrivileges`, empty capability set, `Restart=on-failure`, `TimeoutStopSec=60`.
- `opensms-migrate@<commit>.service` is a one-shot that `Conflicts=opensms.service`, so starting it stops the API.
- The API listens on all interfaces on `OPENSMS_PORT`; firewall it. Direct TLS (`OPENSMS_TLS_CERT_FILE`/`_KEY_FILE`) is recommended by the template and required for cookie mode.
- The staging example turns metrics on at `127.0.0.1:19090`.

## Release procedure

The manual procedure for either shape, from `staging-release.md` and the hosted README:

1. Build from a reviewed clean commit. Run `make test` (needs `OPENSMS_TEST_DATABASE_URL` and `OPENSMS_TEST_REDIS_URL`), `go vet ./...` and `make contracts-check`. Record commit, test results and checksums.
2. Record the current release and the last applied migration (`select max(version) from schema_migrations where version <> 'schema.sql'`). Take a verified backup.
3. Stop the API (`systemctl stop opensms.service`, or `docker compose stop api`).
4. Run the migrator with the **new** release (`systemctl start opensms-migrate@<commit>.service`, or `docker compose --profile operator run --rm migrate` after switching `OPENSMS_IMAGE`). Check its exit status. If it fails or is uncertain, stop here: do not start any API.
5. Point the runtime at the new release (symlink or image tag) and start it.
6. Verify `https://<api>/readyz` with certificate validation on (never `--insecure`), an authenticated own-account read, and that an unauthenticated protected route returns 401.
7. Record release, migration result, enabled workers and the rollback decision.

## Rollback

There is **no automatic schema downgrade**. A failed migration may leave earlier files of the same run applied; inspect `schema_migrations`. The safe options, in order of preference:

1. **Forward fix**: a new reviewed migration or binary.
2. **Previous binary on the migrated schema**, only after reviewing that the old binary tolerates the new schema. The startup check only requires that every migration file the running binary ships is recorded, so an older binary does start on a newer schema; whether it behaves correctly against it is what the review must establish. Changing the image tag or symlink alone is not a safe rollback.
3. **Database restore** from the pre-deploy dump, under a separately authorized recovery plan with sending and charging workers disabled. See [backup and restore](backup-and-restore.md).

For the hosted dashboard, the previous nginx container is kept as `opensms-dashboard-before-<release>` with restart disabled, so a UI rollback is `docker stop opensms-dashboard` and starting the previous container. The deploy guards (immutable files, stale-release check, lock) are deliberate; do not bypass them for an ordinary release.

## Checks that were run for this page

- `api/ops/prometheus` rules validated with `promtool` (see [monitoring](monitoring.md#alert-rules)).
- The local equivalents of every Compose step (containers, runtime role, migrator with grants, API start, readiness) through [`local-stack.sh`](local-development.md).

Not run: `deploy.sh`, `make deploy`, `make deploy-status`, `docker compose` against `api/ops/hosted` (it needs the private `.env`, `runtime.env` and `migration.env` and a host with the Docker bridge address), `systemd-analyze verify` on the staging units (no Linux systemd host available here).
