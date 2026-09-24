# Runbook: sandbox wallet reset

How the daily sandbox wallet reset works and how to check it when a customer reports an unexpected sandbox balance or the log shows `sandbox wallet reset unavailable`. For on-call engineers. Sources: `api/internal/maintenance`, `api/docs/sandbox-wallet-reset.md`, migration 0099.

Related: [database](../database.md), [monitoring: logs](../monitoring.md#logs).

## How it works

- Always on (no flag). Every second the API resets up to 100 sandbox wallets that have no checkpoint for the current **UTC** date.
- The available sandbox balance is set to **10000** in the wallet's currency. Reserved funds and all live wallets are untouched.
- A non-zero change is posted through the normal ledger function. If the balance is already 10000 there is no ledger entry, only the checkpoint.
- Each reset writes an immutable row in `sandbox_wallet_resets (wallet_id, utc_date, ledger_id)` together with an audit record and an outbox event, in one transaction. Rows cannot be updated or deleted.

Consequences: a sandbox wallet can go above 10000 during the day (for example after a sandbox credit), and spending during the day is not refilled until the next UTC day.

## Checks

Read-only, as the owner role. On the docs stack on 24 September 2026:

```sql
select utc_date, count(*) as wallets, count(ledger_id) as with_ledger_entry
  from sandbox_wallet_resets group by 1 order by 1 desc limit 3;
```

```text
  utc_date  | wallets | with_ledger_entry
------------+---------+-------------------
 2026-09-24 |      64 |                64
```

```sql
select count(*) as sandbox_wallets_without_todays_checkpoint
  from wallets w
 where w.environment = 'sandbox'
   and not exists (select 1 from sandbox_wallet_resets r
                    where r.wallet_id = w.id and r.utc_date = (now() at time zone 'utc')::date);
```

```text
 sandbox_wallets_without_todays_checkpoint
-------------------------------------------
                                         0
```

A non-zero count more than a minute after UTC midnight means the worker is failing.

## If resets fail

1. Look for `sandbox wallet reset unavailable` in the API log. It appears during any database outage (seen while testing a PostgreSQL stop) and clears on its own afterwards.
2. If it persists with the database healthy, check that migration 0099 is applied (`select 1 from schema_migrations where version like '0099%'`). Before 0099, unchanged balances failed with `Empty posting`.
3. Do not insert checkpoints or ledger rows by hand; the tables are immutable and bound to the ledger by triggers. Fix the cause and let the worker catch up.
