# Backup and restore

What is backed up today, how to take and restore a PostgreSQL backup of opensms without breaking its role and privilege model, and which recovery steps prevent duplicate SMS sends or card charges. This page is for engineers responsible for data safety and recovery drills. Sources: `api/deploy/deploy.sh`, `api/internal/backuprestore/restore_test.go`, and the notes `backup-restore-acceptance.md`, `encryption-keys.md`, `eventbus.md` and `broker-cursor-recovery.md` in `api/docs`.

Related pages: [database](database.md), [deployment](deployment.md), [security](security.md#encryption-key), [broker cursor recovery](runbooks/broker-cursor-recovery.md).

## What exists today

| Mechanism | Status |
| --- | --- |
| Pre-deploy logical dump on the hosted host | Every `deploy.sh` run writes `pg_dump -U opensms_owner opensms \| gzip` to `/opt/opensms-backend/backups/opensms-<UTC stamp>.sql.gz`, mode 0600, on the **same host**. |
| Scheduled backups, WAL archiving / PITR, off-host copies, encryption at rest for dumps | **Not configured.** The hosted README and `backup-restore-acceptance.md` list them as required before wider access. |
| RPO / RTO targets | Not defined. |
| Automated restore gate | `internal/backuprestore` test, opt-in, runs against disposable databases only. |

In other words: the hosted installation can lose everything since the last deploy if the host's disk is lost. Treat that as an open risk, not a feature.

## What must be recoverable

| Item | Where | Why it matters |
| --- | --- | --- |
| PostgreSQL database `opensms` | `postgres` volume | Everything: accounts, wallets, ledgers, messages, audit, outbox, broker receipts. |
| Cluster roles | Not in `pg_dump` | `opensms_runtime`, `opensms_audit_custodian` and the owner are cluster-global. Recreate them (see below) before restoring into a new cluster. |
| `OPENSMS_ENCRYPTION_KEY` | Secret store / `runtime.env` | Without the exact key, TOTP secrets, provider credentials, webhook signing secrets, invitations and saved payment authorizations in the dump are unreadable. Back it up separately from the dump. |
| `runtime.env`, `migration.env`, `.env` | `/opt/opensms-backend` | Configuration and credentials; not in any backup today. |
| NATS JetStream volume | `nats` volume | Only relevant with the event bus on (off on the hosted host). PostgreSQL is authoritative; see the [cursor recovery runbook](runbooks/broker-cursor-recovery.md). |
| Redis | `redis` volume | Rate-limit counters only. Safe to lose. |
| ClamAV signatures | `clamav_signatures` volume | Re-downloaded by `freshclam`. Safe to lose. |

## Taking a backup

The deploy script's format, which is also the simplest manual backup (run as the owner role, never as `opensms_runtime`):

```sh
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker exec opensms-backend-postgres-1 pg_dump -U opensms_owner opensms | gzip > "opensms-$stamp.sql.gz"
```

Use the `pg_dump` inside the PostgreSQL 16 container. A host `pg_dump` from an older major version refuses the server (the acceptance note records PostgreSQL 14's `pg_dump` failing against 16).

The same command was run against the local stack's container while writing this page:

```text
-rw-------  86469  opensms-20260924T044018Z.sql.gz
```

## Restoring

The procedure below was run end to end on the local stack (restoring into a second database in the same cluster, so the cluster roles already existed).

1. **Keep side effects off.** Before any API process touches the restored database, make sure `OPENSMS_LIVE_DISPATCH_ENABLED`, `OPENSMS_EMAIL_DELIVERY_ENABLED`, `OPENSMS_WEBHOOK_DELIVERY_ENABLED` and `OPENSMS_AUTOMATIC_TOPUPS_ENABLED` are `false`. The restored outbox and job tables contain work that, once workers run, would be sent again.
2. **Recreate cluster roles** if restoring into a new cluster: the owner (the `POSTGRES_USER` of the container), `opensms_runtime` with `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS` (see `api/ops/hosted/init-runtime.sh`), and `NOLOGIN` `opensms_audit_custodian`. Skip if they exist.
3. **Create an empty database and load the dump as the owner:**

   ```sh
   docker exec opsdocs-pg createdb -U opensms_owner opensms_restore
   gunzip -c opensms-20260924T044018Z.sql.gz | \
     docker exec -i opsdocs-pg psql -q -U opensms_owner -d opensms_restore -v ON_ERROR_STOP=1
   ```

4. **Compare** the restored database with the source (or with figures recorded at backup time):

   ```text
   opensms: 126 migrations, 1 messages, 1 ledger rows, 17 audit rows, 10000.000000 total wallet balance
   opensms_restore: 126 migrations, 1 messages, 1 ledger rows, 17 audit rows, 10000.000000 total wallet balance
   ```

5. **Start the API against it** with the runtime role and the **same encryption key**. Ownership and grants are restored from the dump, so the startup privilege check passes without re-running `opensms-migrate`. On the local drill: `readyz: ready (200)`, operator login on the restored database `200`, clean shutdown exit 0.
6. **Reconcile before enabling workers.** Review `GET /admin/v1/reconciliation/attempts` (unknown submissions), pending outbox and webhook queues (`opensms_queue_pending`), pending top-ups and payment reviews. Anything sent or charged after the backup was taken exists at the provider or at Paystack but not in the restored database. Reconcile against those systems before turning any delivery flag back on.
7. **Enable workers one at a time**, watching queue metrics.

If you restored into a new cluster whose roles were recreated by hand, run `opensms-migrate -runtime-role opensms_runtime` once (it applies nothing new but re-grants), then start the API.

## The automated restore gate

`internal/backuprestore/restore_test.go` builds a disposable source database with full schema, migrations and seed, writes synthetic data, takes a custom-format `pg_dump`, restores it into a second disposable database, and checks: migration checksums, a message in the same monthly partition, exact wallet balance and ledger, audit payload, working sequences, ownership and ACLs (the runtime role passes `ValidateRuntime` without re-granting), and that the runtime role still cannot rewrite ledgers, audit or triggers. It never dumps the database named in the URL; that connection only creates and drops its own databases and one unique role.

Run while writing this page against the local stack's PostgreSQL container (owner credentials, which can create databases and roles):

```text
$ OPENSMS_TEST_DATABASE_URL='postgres://opensms_owner:...@127.0.0.1:15460/postgres?sslmode=disable' \
  OPENSMS_TEST_RESTORE=1 OPENSMS_TEST_PG_CONTAINER=opsdocs-pg \
  go test -race -count=1 -v ./internal/backuprestore
=== RUN   TestIsolatedBackupRestore
    restore_test.go:182: custom archive restored: migration checksums, partitioned message, wallet, ledger, audit sequence, idempotency, foreign key and restricted runtime protections passed
--- PASS: TestIsolatedBackupRestore (3.11s)
PASS
ok  	github.com/opensms-io/api/internal/backuprestore	4.784s
```

Without `OPENSMS_TEST_RESTORE=1` the test skips. `OPENSMS_TEST_PG_CONTAINER` makes it run `pg_dump`/`pg_restore` inside that container (credentials passed as environment, not arguments); omit it when compatible PostgreSQL 16 tools are on your `PATH`. Never point `OPENSMS_TEST_DATABASE_URL` at a production cluster.

## Still required before production

From `backup-restore-acceptance.md`, none of which exists yet: agreed RPO and RTO, scheduled and monitored backups, WAL archiving with a tested point-in-time restore, encrypted off-host storage with defined key custody and retention, backup of cluster roles and extension versions, and a restore drill with production-sized data that measures actual recovery time.
