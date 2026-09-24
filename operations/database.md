# Database

How opensms uses PostgreSQL 16: which roles exist and what each may do, how migrations and seed data are applied, how message partitions are maintained, and what the retention and redaction workers actually remove. This page is for engineers who provision, migrate, inspect or restore the opensms database. Sources: `api/internal/store/*.go`, `api/cmd/opensms-migrate`, `api/database/*`, and the notes `database-runtime.md`, `audit-retention.md`, `retention-worker.md`, `deletion-business-redaction.md` and `customer-session-expiry.md` in `api/docs`.

Related pages: [configuration](configuration.md), [backup and restore](backup-and-restore.md), [security](security.md), [local development](local-development.md).

## Roles and grants

opensms deliberately splits database identities. The API never holds DDL rights, and the ledger and audit tables cannot be rewritten through the API's credential.

| Role | Login | Used by | Can |
| --- | --- | --- | --- |
| Owner (for example `opensms_owner`, or the container superuser) | Yes | `opensms-migrate` via `OPENSMS_MIGRATION_DATABASE_URL`, `opensms-admin` via `OPENSMS_ADMIN_DATABASE_URL`, backups | Own every object, run DDL, grant privileges. Never given to the API. |
| `opensms_runtime` | Yes | The API via `OPENSMS_DATABASE_URL` | Read and write application data, with the exceptions below. Must be `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`. |
| `opensms_audit_custodian` | No (`NOLOGIN`) | Owner of `redact_audit_payload(bigint)` only | Null the `before`, `after` and `ip` columns of eligible `audit_log` rows. Created by migration 0040. No members allowed. |
| Test administrator | Yes | `OPENSMS_TEST_DATABASE_URL` in tests only | `CREATE DATABASE` for disposable test databases. Never production. |

Roles on the docs stack, read with `select rolname, rolsuper, rolcanlogin, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname not like 'pg_%'` (here the owner is the container superuser `osdocs`):

```text
opensms_audit_custodian|f|f|f|f|f
opensms_runtime|f|t|f|f|f
osdocs|t|t|t|t|t
```

### What the runtime grant does

`opensms-migrate -runtime-role opensms_runtime` (`store.GrantRuntime`) refuses a role that has any administrative attribute, then in one transaction:

1. Grants `USAGE` on schema `public`, `SELECT, INSERT, UPDATE, DELETE` on all tables and `USAGE, SELECT` on all sequences.
2. Makes `schema_migrations` and `schema_seeds` read-only.
3. Revokes `UPDATE`/`DELETE` on the financial and evidence tables: `wallets`, `wallet_ledger`, `provider_ledger`, `provider_route_costs`, `audit_log`, refunds, statements, reconciliation, broker dead letters and replays, admin alert jobs and outcomes, and about 40 more (full list in `api/internal/store/bootstrap.go`).
4. Re-grants narrow column updates where the application needs them, for example `wallets.runtime_lock_version` (so `SELECT ... FOR UPDATE` works while balances stay trigger-only), `admin_alert_deliveries.acknowledged_at`, and the `response`/`reason_redacted_at` columns used for replay and redaction.
5. Grants `EXECUTE` on the three controlled functions `ensure_message_partitions(integer)`, `redact_audit_payload(bigint)` and `redact_admin_sms_alert_phone(uuid)`.
6. Revokes writes on `audit_redactions` when it exists.

Grants are not automatic for tables created later. **Every migration run must include `-runtime-role`**, which both the hosted Compose `migrate` service and the staging systemd unit do.

Effective privileges on the docs stack after a normal migration run:

```text
    table_name     | sel | ins | upd | del
-------------------+-----+-----+-----+-----
 messages          | t   | t   | t   | t
 wallets           | t   | t   | f   | f
 wallet_ledger     | t   | t   | f   | f
 audit_log         | t   | t   | f   | f
 schema_migrations | t   | f   | f   | f
 api_keys          | t   | t   | t   | t

 balance_update | lock_column_update | schema_create
----------------+--------------------+---------------
 f              | t                  | f
```

## Startup checks

Before the API starts any worker it runs two checks against the database and exits if either fails.

**Runtime privilege check** (`store.ValidateRuntime`): the connected role must have no administrative attributes, no `CREATE` on `public`, own no table or function in `public`, be unable to update `wallets.balance`/`reserved`, and hold no `UPDATE`, `DELETE`, `TRUNCATE` or `TRIGGER` on the protected tables. Running the API with the owner URL:

```text
{"level":"ERROR","msg":"unsafe database runtime privileges","err":"API database identity must be a non-owner without administrative, schema-create, balance-update or audit-mutation privileges"}
```

**Migration check** (`store.CheckMigrations`): every file named `database/schema.sql` and `database/migrations/*.sql` **relative to the API's working directory** must be recorded in `schema_migrations`. It reads only; it never applies DDL. With an extra file present:

```text
{"level":"ERROR","msg":"database migrations required","err":"run opensms-migrate before starting API: missing 9999_example.sql"}
```

## Migrations

| Fact | Detail |
| --- | --- |
| Files | `database/schema.sql` (baseline), then `database/migrations/*.sql` in lexical order, then `database/seed.sql`. 125 migration files today, numbered `0002` to `0133` with gaps (there is no `0001`). |
| Tracking | Each file's base name goes into `schema_migrations(version, applied_at)`; the seed into `schema_seeds`. A file already recorded is skipped. Editing an applied file has no effect. |
| Atomicity | Each file runs in its own transaction with an advisory lock on its name, so two migrators cannot apply the same file twice. A failure rolls back that file only; earlier files stay applied. |
| Direction | Forward only. There are no down migrations and no automatic rollback. Prefer a reviewed forward fix. |
| After migrating | `EnsurePartitions(12)` runs, then runtime grants if `-runtime-role` was given. |
| Tool | `opensms-migrate -runtime-role opensms_runtime [-database-dir database]`, see [binaries](binaries.md#opensms-migrate). |

A fresh docs database has 126 rows in `schema_migrations` (baseline plus 125 files) and one row (`seed.sql`) in `schema_seeds`.

Packaging trap seen in the hosted deployment of 2026-09-23: macOS `tar` added AppleDouble `._0002_batch_fields.sql` style files to the migration directory, and the migrator tried to apply them. Build archives with `COPYFILE_DISABLE=1`; `deploy.sh` also deletes `._*` files on the host.

Order of operations for an upgrade is in [deployment](deployment.md#release-procedure): stop the API, back up, migrate with the new image, then start the new API.

## Message partitions

`messages` is the only partitioned table (range by `created_at`, one partition per UTC month, named `messages_YYYY_MM`).

- `ensure_message_partitions(ahead)` is a `SECURITY DEFINER` function owned by the database owner, bounded to a 24-month horizon, so the runtime role can create partitions without `CREATE` rights.
- The migrator creates the previous month through 12 months ahead. The API calls the same function with 12 at startup (and exits if it fails) and every hour.
- A fresh database on 24 September 2026 has 14 partitions, `messages_2026_08` through `messages_2027_09`.

Retention never drops partitions: accounting needs the message envelopes. There is no archiving job for old partitions yet.

## Seed data

`database/seed.sql` is applied once per database and describes a researched catalogue, not live commercial terms.

| Data | What a fresh database contains |
| --- | --- |
| Countries | 9: KE, NG, GH, ZA, GB, US `active`; TZ, UG, RW `coming_soon`. All get a 15 percent default markup. |
| Carriers | 35 with dialling prefixes. |
| Providers | 20: 19 real providers all `pending_integration` (Africa's Talking uses the native `africastalking` adapter, the rest `generic_http`), plus `mock`, which is `active` and serves only sandbox traffic. |
| Routes | 63 in total. The 54 real provider routes are disabled. The 9 mock routes (one per country) are enabled and excluded from live routing. |
| Route costs | Researched prices with a `confidence` of `verified`, `advertised`, `stale` or `quote`. `quote` rows cost 0 and the router treats them (and `stale`) as non-routable. |
| Price books | Opening sell prices for KE, NG, GH, ZA and percent markups for GB and US. |
| Sandbox numbers | Magic prefixes: `+2547000000xx` delivered after 800 ms, `+2547000001xx` fails `carrier_rejected`, `+2547000002xx` expires `dlr_timeout`. |
| Compliance | Marketing quiet hours 21:00 to 08:00 in KE, NG, GH; hold-for-review keywords (`loan`, `betting`, `casino`, `mkopo`) in KE and NG; restricted sender patterns `M-PESA`, `SAFARICOM`, `AIRTEL MONEY`. |
| Senders | One shared approved alphanumeric sender, `OPENSMS`. |
| Legal | Terms, privacy and DPA version 1.0. |

## Customer session policy

`customer_session_policy` is a single-row table: `idle_seconds` default 1800 (30 minutes, range 60 to 86400) and `absolute_seconds` default 2592000 (30 days, range 60 to 7776000). The runtime role can only read it; change it as the owner. New sessions snapshot the policy, so a change never extends existing sessions. Operator sessions created by `/admin/v1/login` get a fixed 12-hour absolute expiry (`api/internal/admin/login.go`) and are subject to the same idle check.

## Retention and redaction

Each workspace has `data_retention_days` (default 30, range 1 to 400), which the owner changes with `PUT /v1/settings/retention` (`{"days": N}`). Setting it only stores the policy. **Nothing is redacted unless the worker flags are on, and both default to off**, including in the hosted `runtime.env.example`.

| Flag | Workers started | What they clear | What they keep |
| --- | --- | --- | --- |
| `OPENSMS_RETENTION_ENABLED` | `retention`, `retention_copies`, `retention_inbox`, `retention_audit`, `retention_lookups`, `retention_lookup_cache`, `retention_webhook_responses`, `retention_workspace_creation`, `retention_admin_sms_phone` | For terminal messages past the workspace's retention: text, destination, metadata, callback URL, raw provider errors, idempotency response copies, published outbox and finished webhook and email payloads. Also contact and template replay copies, settled batch sources, notification bodies, old unattributed inbox payloads (after 400 days), and audit `before`/`after`/`ip` via the custodian function. | Message envelopes, amounts, ledger entries, reservation snapshots, operation keys, audit facts (who, what, when). Anything still pending, sending, unknown or leased is skipped. |
| `OPENSMS_DELETION_LIFECYCLE_ENABLED` | `deletion_lifecycle`, `deletion_redaction`, `deletion_messages`, `deletion_copies`, `deletion_identity`, `deletion_delivery`, `deletion_lookups`, `deletion_lookup_refunds`, `deletion_number_purchases`, `deletion_registration_reviews`, `deletion_webhook_responses`, `deletion_workspace_creation`, and `deletion_audit` if retention is off | Staged erasure for workspaces with a deletion request: contacts, groups, onboarding documents, invitations, payment authorization ciphertext, templates, then message content, then webhook configuration and finally the workspace name and slug. | Global users and sessions, sender ownership, financial and provider evidence. The request stays `redaction_pending`; there is no "deletion completed" state. |

Audit payload redaction (`redact_audit_payload`) is enforced by the database: eligibility is the workspace's `data_retention_days`, or 400 days for platform records and missing workspaces, or immediately for deleted workspaces. Each redaction writes an immutable row in `audit_redactions` with the SHA-256 of the erased payload, and bumps `workspaces.retention_generation` so ready export archives are invalidated.

Known gaps, stated in the source notes and still true in code: shared user identity is never removed, there is no seven-year financial archive or expiry, remote objects (external batch sources) and backups and logs are not covered, and unknown provider submissions block erasure indefinitely until reconciled.

## Inspecting a database safely

Use the owner role and read-only statements. Useful checks (all run on the docs stack while writing this page):

```sql
select count(*) from schema_migrations;                          -- 126
select version from schema_seeds;                                -- seed.sql
select count(*), min(c.relname), max(c.relname)
  from pg_inherits i join pg_class c on c.oid = i.inhrelid
 where i.inhparent = 'public.messages'::regclass;                -- 14 | messages_2026_08 | messages_2027_09
select slug, adapter, status from providers order by 1;
select idle_seconds, absolute_seconds from customer_session_policy;
```

Or run `operations/local-stack.sh status`, which performs the first three plus a runtime role check without changing anything.
