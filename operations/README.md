# Operating opensms

This section is for engineers who run opensms: build it, configure it, deploy it, watch it and recover it. It covers the Go API and its workers, PostgreSQL, Redis, NATS JetStream, ClamAV, and how the console is served. It does not cover using the product; see the console and integration guides for that. Everything here was checked against the code in `api/` and `frontend/`; commands that were run show their real output, and anything that could not be run locally says so and why.

## Start here

| If you want to | Read |
| --- | --- |
| Run the whole stack on your machine | [Local development](local-development.md) and the [`local-stack.sh`](local-stack.sh) script |
| Know what every environment variable does | [Configuration](configuration.md) |
| Understand the moving parts | [Architecture](architecture.md) |
| Understand roles, migrations, partitions and retention | [Database](database.md) |
| Ship a release or build a new host | [Deployment](deployment.md) |
| Wire up health checks, metrics, alerts, tracing | [Monitoring](monitoring.md) |
| Back up or restore data | [Backup and restore](backup-and-restore.md) |
| Handle keys, sessions, 2FA, scanning and secrets | [Security](security.md) |
| Look up a command-line tool | [Binaries](binaries.md) |
| Respond to an incident | [Runbooks](runbooks/README.md) |

## The system in one paragraph

opensms is one Go binary, `opensms`, that serves the customer API (`/v1`), the operator API (`/admin/v1`), provider receipt callbacks and the public status page on a single port, and runs every background worker in the same process. PostgreSQL 16 holds all state and enforces the financial rules with triggers and a restricted runtime role; Redis 7 holds rate-limit counters; NATS JetStream optionally carries outbox events between instances. Every outbound side effect (live SMS, email, webhooks, card charges, provider polling) is behind a flag that defaults to off. Schema changes are applied by a separate `opensms-migrate` run with owner credentials that the API never sees.

## Current state (September 2026)

- One hosted installation on the opensms.io host, single instance, Docker Compose, event bus off, email on, live SMS dispatch, webhooks and payments off. See [deployment](deployment.md#current-hosted-state).
- Backups are a `pg_dump` on the same host at each deploy. No scheduled, off-host or point-in-time backups yet. See [backup and restore](backup-and-restore.md).
- Prometheus alert rules exist and pass `promtool`, but no Prometheus or Alertmanager is deployed.
- Several production gates recorded in `api/docs/completion-gates.md` remain open: real provider acceptance, broker TLS and quorum, full deletion lifecycle, monitoring deployment and disaster recovery.

## Related sections

- [Admin API reference](../admin/api-reference.md) for every `/admin/v1` operation used in the runbooks.
- [API reference](../reference/api/authentication.md) for customer authentication and keys.
