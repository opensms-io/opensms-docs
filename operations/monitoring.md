# Monitoring

What opensms exposes for monitoring and how to read it: liveness and readiness endpoints, the Prometheus metrics listener and its queue gauges, the shipped alert rules, OpenTelemetry tracing, logs, provider balance polling, and the operator endpoints that report backlog. This page is for engineers who run opensms and wire it into their monitoring. Every output below was captured from a local stack while writing the page. Sources: `api/cmd/opensms/health.go`, `api/internal/metrics`, `api/ops/prometheus`, and the notes `operational-metrics.md`, `queue-metrics.md`, `operational-alerts.md`, `message-tracing.md`, `provider-balance-polling.md`, `provider-balance-admin.md` and `scanner-health.md` in `api/docs`.

Related pages: [configuration](configuration.md#observability), [architecture](architecture.md), [runbooks](runbooks/README.md).

## Health endpoints

Both are on the main API port, unauthenticated, and send `Cache-Control: no-store`.

| Endpoint | Meaning | Use for |
| --- | --- | --- |
| `GET /healthz` | The process is serving HTTP. Never checks dependencies, by design, so a database outage does not turn into a restart loop. | Liveness probe |
| `GET /readyz` | Checks, in order: shutting down, PostgreSQL ping, Redis ping, then the event bus (only when enabled) and the ClamAV scanner with signatures fresher than 72 hours (only when scanning is enabled). The first failure is returned. 2-second overall deadline. | Readiness probe, load balancer, post-deploy gate |

Healthy:

```text
$ curl -si http://127.0.0.1:18180/healthz
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: text/plain; charset=utf-8
Content-Length: 2

ok
$ curl -si http://127.0.0.1:18180/readyz
HTTP/1.1 200 OK
Cache-Control: no-store
Content-Type: text/plain; charset=utf-8
Content-Length: 5

ready
```

Unready responses are RFC 9457 problem documents with a fixed, non-sensitive `detail`. Each of these was produced by stopping one dependency container of the local stack:

```text
# Redis stopped
HTTP/1.1 503 Service Unavailable
Content-Type: application/problem+json
{"type":"about:blank","title":"Service Unavailable","status":503,"detail":"Rate limiter is temporarily unavailable."}
healthz during outage: 200

# NATS stopped (event bus enabled)
{"type":"about:blank","title":"Service Unavailable","status":503,"detail":"Event bus is temporarily unavailable."}

# PostgreSQL stopped
{"type":"about:blank","title":"Service Unavailable","status":503,"detail":"Database is temporarily unavailable."}
```

The other two possible details are `The service is shutting down.` and `File scanning is temporarily unavailable or signatures require updating.` Readiness came back to `ready` within 2 seconds of each dependency restarting, without restarting the API.

## Metrics

Enable with `OPENSMS_METRICS_ENABLED=true`. Metrics are served on their own listener (`OPENSMS_METRICS_ADDRESS`, default `127.0.0.1:19090`), never on the customer port. A non-loopback address requires `OPENSMS_METRICS_TOKEN` (32+ bytes) and scrapers must send `Authorization: Bearer <token>`; startup refuses a non-loopback address without a token (`non-loopback metrics requires a token of at least 32 bytes`). Whenever a token is set, even on loopback, a scrape without the matching bearer token gets `401 Unauthorized` (from `api/internal/metrics/http.go`; not run here because the local stacks run without a token).

The docs stack runs with metrics disabled, so the scrape below comes from the script-built local stack (`OPENSMS_LOCAL_METRICS_PORT=19100`, event bus on):

```text
$ curl -s http://127.0.0.1:19100/metrics | grep -E '^(opensms|sms_|wallet|provider)'
opensms_metric_events_pending 0
opensms_metrics_up 1
opensms_queue_count_capped{queue="broker_broadcast"} 0
opensms_queue_count_capped{queue="broker_deadletter"} 0
...
opensms_queue_oldest_age_seconds{queue="outbox"} 0
...
opensms_queue_pending{queue="webhook_delivery"} 0
provider_health{provider="1347e5d2-e930-48f0-aa40-0964c42eea60"} 2
```

With PostgreSQL stopped, the same scrape returned `opensms_metrics_up 0`; it returned to 1 once the database was back.

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `opensms_metrics_up` | gauge | none | 1 when the bounded database collection succeeded. 0 means every other series from this scrape is untrustworthy. |
| `opensms_metric_events_pending` | gauge | none | Observations waiting for the aggregation worker (lag). |
| `opensms_queue_pending` | gauge | `queue` | Eligible records, capped at 10000. |
| `opensms_queue_oldest_age_seconds` | gauge | `queue` | Age of the oldest eligible record from its creation or state timestamp; 0 when empty. |
| `opensms_queue_count_capped` | gauge | `queue` | 1 when the real count exceeds 10000. |
| `sms_sent_total` | counter | `country`, `carrier`, `provider`, `status` | Live lifecycle transitions since instrumentation began. One message can be counted under several statuses. Sandbox excluded. Appears only after live traffic. |
| `sms_submit_latency_seconds`, `sms_dlr_latency_seconds` | histogram | `provider` | Measured live submit and receipt latency. |
| `sms_margin_total` | gauge | `currency` | Recorded SMS revenue minus frozen accepted-attempt cost. A gauge because refunds can lower it. Not an accounting figure. |
| `wallet_low_balance_total` | counter | none | Distinct live low-balance episodes. |
| `provider_health` | gauge | `provider` (UUID) | Worst effective health across the provider's enabled routes: 0 down, 1 degraded, 2 healthy. |

Queue labels are fixed:

| `queue` | Counts |
| --- | --- |
| `outbox` | Unpublished outbox events whose retry time is due. |
| `live_dispatch` | The subset of `outbox` that is dispatchable live messages. Do not add it to `outbox`. |
| `webhook_delivery` | Pending or failed webhook jobs that are due, unleased, on enabled endpoints. |
| `webhook_deadletter` | Webhook jobs in `dead`. |
| `broker_pending`, `broker_processing`, `broker_deadletter`, `broker_broadcast`, `broker_replay` | Event bus receipt states in PostgreSQL (not native JetStream depth). |

No label ever contains a workspace, recipient, message ID, URL or payload. Collection has a 2-second deadline and caps of 10000 aggregate rows and 5000 providers. Because each instance queries the same database, do not sum queue gauges across instances.

Remember that paused workers produce expected backlog: with `OPENSMS_WEBHOOK_DELIVERY_ENABLED=false`, webhook jobs accumulate and `webhook_delivery` grows. That is correct behaviour, not an incident.

## Alert rules

`api/ops/prometheus/alerts.yml` is a ready-to-load rule file (it is not deployed anywhere yet). Point your scrape job at the metrics listener with `job="opensms"` or edit the selectors.

| Alert | Fires when | For | Severity |
| --- | --- | --- | --- |
| `OpenSMSCollectorDown` | Target down, `opensms_metrics_up == 0`, the metric is missing, or no target exists | 2 m | critical |
| `OpenSMSEligibleQueueLag` | Oldest record in `outbox`, `live_dispatch`, `webhook_delivery`, `broker_broadcast` or `broker_replay` older than 300 s, while collection is up | 5 m | warning |
| `OpenSMSQueueCountCapped` | Any queue above 10000 records | 10 m | warning |
| `OpenSMSBrokerDeadLetters` | `broker_deadletter` above 0 | 2 m | warning |

Validate before loading. Both commands were run while writing this page:

```text
$ cd api/ops/prometheus
$ docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --entrypoint /bin/promtool -v "$PWD:/rules:ro" -w /rules prom/prometheus:v3.9.1 check rules alerts.yml
Checking alerts.yml
  SUCCESS: 4 rules found

$ docker run --rm --network none --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \
    --entrypoint /bin/promtool -v "$PWD:/rules:ro" -w /rules prom/prometheus:v3.9.1 test rules alerts.test.yml
  SUCCESS
```

Alertmanager routing, receivers and silences are not part of the repository. What to do when each alert fires is in the [runbooks](runbooks/README.md).

## Tracing

`OPENSMS_TRACING_ENABLED=true` with an HTTPS OTLP/HTTP `OPENSMS_TRACING_ENDPOINT` exports spans for message admission and each submit attempt, sharing one trace per message across workers (the trace context is stored with the message). `OPENSMS_TRACING_SAMPLE_RATIO` (default 0.1) samples root spans. The exporter queue is bounded (1024 spans, 3-second export timeout, no retries), so a slow collector never blocks sending. Span attributes are limited to generated IDs, environment and fixed outcomes: no message text, phone numbers, credentials or provider responses. Customer trace headers are ignored.

Not run locally: no OTLP collector was available, and the HTTPS requirement rules out a plain local one. Validation of the endpoint was checked (`tracing requires an explicit HTTPS collector endpoint` for an `http://` URL).

## Logs

JSON lines on stdout, one object per event, level set by `OPENSMS_LOG_LEVEL`. A healthy start logs one line:

```json
{"time":"2026-09-24T07:18:34.509501+03:00","level":"INFO","msg":"customer api listening","addr":":18200"}
```

Errors worth alerting on in a log pipeline (all seen during the dependency outage tests above):

| Message | Meaning |
| --- | --- |
| `maintenance worker unavailable` with `worker` | A queue worker's run failed. Transient during a database blip; persistent means a stuck queue. |
| `outbox dispatch` | Outbox claim failed (usually database). Nothing is published until it recovers. |
| `sandbox wallet reset unavailable` | Daily sandbox reset failed; see the [runbook](runbooks/sandbox-wallet-reset.md). |
| `event bus consumer stopped` | Fatal for the process: it stops so the supervisor restarts it. |
| `metrics listener unavailable`, `listen failed` | Fatal: port conflict or permissions. |
| `config`, `unsafe database runtime privileges`, `database migrations required` | Startup refused; see [configuration](configuration.md) and [database](database.md#startup-checks). |

Logs never include request bodies, message content or secrets by design, but they do include database connection error text (user and database name).

## Provider balance polling

Off by default (`OPENSMS_PROVIDER_BALANCE_POLLING_ENABLED`). When on, the worker polls only active providers that have a configured account (`PUT /admin/v1/providers/{id}/account` with currency, `low_threshold`, `balance_checks_enabled`, `balance_poll_interval_seconds` from 60 to 86400, default 300). Supported: `generic_http` with a balance URL mapping, and `africastalking`. SMPP and TextSMS report unsupported. A snapshot is stale after the greater of 15 minutes or three intervals; a fresh balance below threshold marks routes `degraded` and raises one `provider.balance_low` alert per episode.

Read the state with `GET /admin/v1/providers/{id}/balance`. On a provider with no account configured (the seeded mock):

```text
{"type":"about:blank","title":"Not Found","status":404,"detail":"Provider account is not configured."}
```

Polling calls real provider APIs, so it was not enabled while writing this page.

## Operator alerts inside opensms

Separate from Prometheus, the API evaluates operator alert rules itself (the admin alert worker runs every 5 seconds) and delivers them to operators. This is where events such as `route.down`, `route.degraded`, `provider.balance_low` and `webhook.disabled` reach people without any external monitoring stack. The console page is `/admin/alerts`. The API, for `ops`, `finance` and `superadmin` sessions (each role only sees the events it is allowed to select):

| Endpoint | Purpose |
| --- | --- |
| `GET /admin/v1/alerts/catalog` | Selectable events and channels. Channels are always `in_app` and `email`; `sms` appears only with `OPENSMS_ADMIN_SMS_ALERTS_ENABLED=true`, `slack` only with `OPENSMS_ADMIN_SLACK_ALERTS_ENABLED=true`. |
| `GET`/`POST /admin/v1/alerts`, `/admin/v1/alerts/{id}` | Alert rules (up to 500). |
| `GET /admin/v1/alerts/inbox`, `POST /admin/v1/alerts/inbox/{id}/ack` | Delivered in-app alerts and acknowledgement. |
| `GET /admin/v1/alerts/slack-destinations` | Encrypted Slack destinations; webhook URLs are never returned. |

On the docs stack (no SMS or Slack flags) the catalog returned `"channels":["in_app","email"]`, `GET /admin/v1/alerts` returned `[]` and `GET /admin/v1/alerts/slack-destinations` returned `{"items":[],"next_cursor":null}`. Full request and response shapes are in the [Admin API reference](../admin/api-reference.md).

## Operator endpoints for backlog

These need an operator session (`ops` or `superadmin` unless noted). Outputs are from the docs stack.

| Endpoint | Shows |
| --- | --- |
| `GET /admin/v1/operations/file-scanning` | Scanner status and document scan backlog. |
| `GET /admin/v1/broker/dead-letters` | Current dead event bus deliveries. 503 when the event bus is disabled. |
| `GET /admin/v1/reconciliation/attempts` | Live attempts with unknown submission outcome. |
| `GET /admin/v1/reconciliation/receipts` | Receipts not yet matched to an attempt. |
| `GET /admin/v1/reconciliation/dlr-reviews` | Accepted attempts whose delivery receipt is overdue. |
| `GET /admin/v1/messages/held` | Messages held for compliance review. |
| `GET /admin/v1/routes/{id}/health-history` | Route health transitions. |

```text
GET /admin/v1/operations/file-scanning
{"backlog":{"pending":28,"retrying":0,"exhausted":0,"scanning":0},"scanner":{"status":"disabled"}}

GET /admin/v1/broker/dead-letters          (event bus disabled on the docs stack)
{"type":"about:blank","title":"Service Unavailable","status":503,"detail":"Broker consumer unavailable."}

GET /admin/v1/reconciliation/dlr-reviews?limit=2
{"items":[],"next_cursor":null}
```

The 28 pending scans are expected on the docs stack: scanning is disabled there, so uploads stay quarantined.

## Public status page

`GET /status` returns component status per country and provider, plus open incidents published by operators. It is derived from route health and incidents, not from a synthetic check, so it is not a substitute for external uptime monitoring.
