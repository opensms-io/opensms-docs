# Runbook: API not ready (database, Redis or NATS outage)

What to do when `/readyz` returns 503, a load balancer takes opensms out of rotation, or `OpenSMSCollectorDown` fires. For on-call engineers. Sources: `api/cmd/opensms/health.go`, `main.go`. All outputs below were produced on a local stack by stopping each dependency container in turn.

Related: [monitoring: health endpoints](../monitoring.md#health-endpoints), [architecture](../architecture.md).

## Read the detail

`/readyz` names the first failing dependency:

| `detail` | Dependency | Effect while down |
| --- | --- | --- |
| `Database is temporarily unavailable.` | PostgreSQL | Nothing works: no API calls, no workers. `opensms_metrics_up` is 0. |
| `Rate limiter is temporarily unavailable.` | Redis | Rate-limited API requests fail; workers keep running. |
| `Event bus is temporarily unavailable.` | NATS (only with the event bus on) | Events stay pending in the PostgreSQL outbox; nothing is lost. |
| `File scanning is temporarily unavailable or signatures require updating.` | ClamAV (only with scanning on) | See [scanner degraded](file-scanner-degraded.md). |
| `The service is shutting down.` | The process itself | Normal during a deploy. |

```text
$ curl -si http://127.0.0.1:18200/readyz        # PostgreSQL stopped
HTTP/1.1 503 Service Unavailable
Content-Type: application/problem+json
{"type":"about:blank","title":"Service Unavailable","status":503,"detail":"Database is temporarily unavailable."}
```

`/healthz` keeps returning `200 ok` during dependency outages on purpose. Do not wire liveness to `/readyz`, or a database blip restarts every instance.

## Steps

1. **Restore the dependency.** Hosted: `docker compose ps` and `docker compose logs <service>` in `/opt/opensms-backend`; `docker compose up -d <service>`.
2. **Do not restart the API** just because it is unready. It reconnects by itself: on the local stack `/readyz` returned `ready` within 2 seconds of PostgreSQL, Redis or NATS coming back, with the same process.
3. **Check the log** for the outage window. Expected noise while the database is down:

   ```text
   {"level":"ERROR","msg":"maintenance worker unavailable","worker":"financial_alerts"}
   {"level":"ERROR","msg":"sandbox wallet reset unavailable"}
   {"level":"ERROR","msg":"outbox dispatch","err":"claim outbox events: failed to connect to `user=opensms_runtime database=opensms`: ..."}
   ```

   These stop once the database is back. `event bus consumer stopped` is different: the process exits so its supervisor restarts it.
4. **Watch queues drain** (`opensms_queue_pending`, `opensms_queue_oldest_age_seconds`). A backlog after a long outage is expected; it clears in bounded batches.

## When the API itself will not start

Read the first JSON log line:

| Message | Fix |
| --- | --- |
| `config` | Invalid environment; the `err` names the variable. See [configuration](../configuration.md#validation-failures-you-can-hit). |
| `store open failed` | Database unreachable or wrong credentials in `OPENSMS_DATABASE_URL`. |
| `unsafe database runtime privileges` | The URL uses an owner or superuser. Use `opensms_runtime`. |
| `database migrations required` | Run `opensms-migrate` for this release; check the working directory contains the release's `database/`. |
| `partitions` | Partition function missing or failing; run the migrator. |
| `invalid Redis rate limiter configuration` | Unparseable `OPENSMS_REDIS_URL`. |
| `event bus startup failed` | NATS unreachable at start, or the existing stream/consumer config differs from the configured names. Do not recreate the stream. |
