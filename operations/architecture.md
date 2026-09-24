# Architecture

How the opensms backend is put together at runtime: one Go process that serves every HTTP surface and runs every background worker, PostgreSQL as the system of record, Redis for rate limiting, and optional NATS JetStream for event transport. This page is for engineers who operate or debug the platform and need to know which component does what, where state lives, and what each feature flag switches on. Sources: `api/cmd/opensms/main.go` (the wiring), `api/internal/*`, and the notes `eventbus.md`, `realtime-broadcast.md`, `dlr-timeouts.md` and `controlled-route-probes.md` in `api/docs`.

Related pages: [configuration](configuration.md), [database](database.md), [monitoring](monitoring.md), [runbooks](runbooks/README.md).

## Components

```text
                    browsers (console /app, operator /admin)       API clients (sk_live_ / sk_test_)
                                    |                                         |
                                    v                                         v
   SolidJS UI (static, Vite build) ---> opensms API process, one port (OPENSMS_PORT)
                                        /v1  /admin/v1  /callbacks/providers  /status  /legal  /healthz  /readyz
                                        + background workers (same process)
                                        + optional metrics listener (OPENSMS_METRICS_ADDRESS)
                                          |            |              |               |
                                   PostgreSQL 16    Redis 7     NATS JetStream     external (all behind flags):
                                   (system of       (rate       (optional          SMS providers, Axene mail,
                                    record)          limits)     event bus)        Paystack, Slack, ClamAV, OTLP
```

| Component | Role | Required |
| --- | --- | --- |
| `opensms` | Single binary: HTTP API for customers and operators, provider callback receiver, public status page, and all workers. | Yes |
| PostgreSQL 16 | All business state: workspaces, wallets and ledgers, messages and attempts, outbox, audit, broker receipts. Financial invariants are enforced by triggers and grants. | Yes |
| Redis 7 | Admission and per-key rate limiting. `/readyz` fails without it. Holds no business state. | Yes |
| NATS 2.10 with JetStream | Durable transport for outbox events and cross-instance realtime broadcast, only when `OPENSMS_EVENTBUS_ENABLED=true`. | No |
| ClamAV (`clamd`) | Scans uploaded KYC and payment documents over a Unix socket. | Needed to approve documents |
| `opensms-at-bridge` | Separate process that turns Africa's Talking delivery callbacks into signed opensms receipts. | Only for Africa's Talking DLRs |
| UI | Static SolidJS build served by nginx in the hosted setup; talks to the API at `VITE_API_BASE`. | For the console |

There is no separate admin server or admin port: `/admin/v1` is served by the same listener as `/v1` and is protected by operator sessions and roles only. Restrict it at the proxy if you need a network boundary.

## Request surfaces

| Path | Who | Authentication |
| --- | --- | --- |
| `/v1/...` | Customers and integrations | Session bearer token (`sess_...`) plus `X-Workspace-ID`, or API key (`sk_live_...`, `sk_test_...`) scoped to one workspace and environment. Optional cookie mode behind flags. |
| `/admin/v1/...` | Operators (`superadmin`, `ops`, `finance`, `support`) | Operator session from `/admin/v1/login` (12-hour lifetime); TOTP challenge when enabled. Sensitive actions (admin management, broker replay, refunds, customer user security actions such as force-logout) additionally require an enrolled authenticator verified in the last 10 minutes. |
| `/callbacks/providers/{provider_id}/dlr` | Provider bridges | HMAC-SHA256 over `timestamp.body` with the provider's stored `callback_hmac_secret`, timestamp within 5 minutes, body at most 64 KiB. |
| `/v1/realtime` | Console WebSocket | Session token or single-use ticket. |
| `/v1/payments/paystack/webhook` | Paystack | Mounted only when `OPENSMS_PAYSTACK_SECRET` is set; signature-verified. |
| `/status`, `/legal/...` | Public | None. |
| `/healthz`, `/readyz` | Load balancers, probes | None. See [monitoring](monitoring.md#health-endpoints). |

## Life of a message

A sandbox send traced on the local stack with the event bus enabled (`POST /v1/messages` with an `sk_test_` key to `+254700000012`):

1. **Admission** (HTTP request, one transaction). Validates the key, workspace state and onboarding, compliance rules and quiet hours, prices the message, reserves funds from the wallet (`post_wallet`), stores the message, freezes the chosen route, cost version and FX rate in a dispatch plan, and inserts a `message.created` row into `event_outbox`. Responds `status: queued`.
2. **Outbox** (worker every 250 ms). Claims unpublished events with `FOR UPDATE SKIP LOCKED` and hands them to the publisher: in-process fanout, or JetStream when the event bus is on.
3. **Fanout** (per event): notifications, email jobs, webhook jobs, realtime push, and the live dispatcher.
4. **Dispatch**. Sandbox events go to the mock provider. Live events, only when `OPENSMS_LIVE_DISPATCH_ENABLED=true`, commit an attempt row (submission intent) before calling the provider adapter.
5. **Settlement**. Confirmed acceptance captures the reservation; confirmed rejection releases it and may trigger fallback. A timeout or unreadable reply becomes `submission_unknown`: funds stay reserved and the message is **never** resent automatically.
6. **Receipts**. Delivery receipts arrive at `/callbacks/providers/...` (or over the SMPP bind), are stored as evidence first, then matched to exactly one attempt and applied. A `message.delivered` (or `failed`, `expired`) event goes back through the outbox.

What the database showed for that message a few seconds later:

```text
       event       |     consumer     |   state   | attempts | broadcast_done
-------------------+------------------+-----------+----------+----------------
 message.created   | opensms-business | completed |        1 | t
 message.delivered | opensms-business | completed |        1 | t

  status   | provider | has_provider_id
-----------+----------+-----------------
 delivered | mock     | t
```

## Outbox and event bus

The PostgreSQL `event_outbox` is the source of truth for every side effect. Without the event bus, the outbox worker calls the fanout chain in process. With `OPENSMS_EVENTBUS_ENABLED=true`:

- The publisher registers a pending `broker_consumer_receipts` row, publishes only `{event id, workspace, environment, generation}` to JetStream, and marks the outbox row published after the server acknowledgement.
- Consumers (durable consumer `OPENSMS_NATS_CONSUMER`, shared by every API instance, 8 concurrent, 2 minute ack wait) reload the event from PostgreSQL with the tenant binding, so a forged envelope cannot select another workspace's data.
- The receipt row fences business effects: a redelivered event whose receipt is `completed` is acknowledged without running again. Downstream executions are capped at 10 per event (`MaxDeliver`), after which the receipt is `dead` and appears in the [dead-letter review](runbooks/broker-dead-letters.md).
- After completion each instance's realtime broadcaster publishes to `<subject>.realtime` (plain subscription, every instance receives it) so WebSocket clients connected to any instance see the update.

Stream settings created on first start (read with `nats stream info OPENSMS_EVENTS` on the local stack):

```text
                     Subjects: opensms.events
                     Replicas: 1
                      Storage: File
                    Retention: WorkQueue
               Discard Policy: New
                Maximum Bytes: 1.0 GiB
```

A full or unreachable broker rejects publication; events stay pending in PostgreSQL rather than being dropped. Production validation requires `tls://` and at least 3 replicas, so the single-host hosted deployment runs with the event bus **off**.

## Providers and adapters

Every provider implements one interface (`api/internal/provider/provider.go`): `Send`, `ParseDLR`, `Balance`, `RegisterSenderID`, `Capabilities`.

| Adapter | Transport | Notes |
| --- | --- | --- |
| `mock` | In process | Sandbox only. Outcome decided by the sandbox number prefix. Never used for live traffic. |
| `generic_http` | HTTPS | Configured per provider: request templates, auth headers, status maps, optional balance and reconcile URLs. Most seeded providers use it. |
| `africastalking` | HTTPS | Native adapter. Delivery receipts need `opensms-at-bridge` because the vendor cannot sign opensms HMAC callbacks. |
| `textsms` | HTTPS | Native adapter; no delivery receipts, no sender registration, balance in credits without currency. |
| `smpp` | SMPP bind | One long-lived bind per provider configuration, owned by the API process, checked every 5 seconds and retired when configuration or credentials change. Receipts arrive on the bind. |

Provider credentials are stored encrypted with `OPENSMS_ENCRYPTION_KEY` and are write-only through the admin API. New providers start `pending_integration` and new routes start disabled.

## Routing and fallback

Route selection (`api/internal/routing/service.go`) works on a frozen snapshot of candidate routes:

1. **Eligibility.** Live traffic needs an enabled route on an active provider in an active country, health not `down`, weight above 0, a cost that is present and not `quote` or `stale` confidence, sender type support (alphanumeric or numeric), and an approved registration when the provider requires one. Sandbox traffic may only use `mock` routes.
2. **Health tier.** Prefer `healthy` routes; use `degraded` ones only when no healthy route exists. A workspace can pin a provider, which is honoured only while that provider is healthy.
3. **Priority, then weight.** Lowest `priority` wins; ties are broken by weighted random choice.
4. **Fallback order.** Remaining eligible routes sorted by priority, health, cost, p50 latency, then IDs.

Fallback is opt-in per workspace (`PUT /v1/settings/routing` with `{"allow_fallback": true}`, default false) and is captured at admission. It runs only after **confirmed** non-acceptance or a known-down route, at most three attempts, never across countries, never changes the sender or the price the customer was quoted. Unknown outcomes are never retried.

## Route health

A health worker runs every 30 seconds per enabled route over a 15-minute window of live attempts (`api/internal/health/evaluator.go`):

| Result | Condition |
| --- | --- |
| `down` | 5 or more consecutive submit failures; or, with reliable DLRs and at least 50 settled receipts, delivery rate below 85 percent |
| `degraded` | Fresh provider balance below its low threshold; submit p95 above 3 s; or DLR p50 above 60 s |
| `healthy` | Otherwise |

An empty window cannot restore health; recovery needs ten fresh successes (or, with probes configured, ten accepted controlled probes within 30 minutes). Operators can pin health with `PUT /admin/v1/routes/{id}/health-override` (see the [provider outage runbook](runbooks/provider-outage.md)). Health changes are written to route health history and published to workspaces that used the route in the last 15 minutes.

## Realtime

The console opens `GET /v1/realtime` as a WebSocket, authenticated by session token or a 60-second single-use ticket from `POST /v1/realtime/tickets`. Each API instance keeps an in-memory hub; with the event bus on, completed events are broadcast to every instance. Delivery is best effort: after a reconnect the UI reloads lists and the durable notification inbox. Expired tickets are cleaned every minute.

## Background workers

All run inside the API process. Most use `runMaintenanceQueue`: every second, drain up to 100 units of work, each with a 2-minute deadline and its own database claim, and log `maintenance worker unavailable` with the worker name on error.

| Worker | Cadence | Enabled by |
| --- | --- | --- |
| Outbox dispatch and dispatch recovery | 250 ms | Always |
| Submission reconciliation (unknown live attempts, 10 at a time) | 5 s | Always; does work only with live dispatch |
| Receipt reconciliation (unmatched DLR evidence) | 1 s | Always |
| DLR timeout monitor | 1 s queue | Always |
| Route health evaluation | 30 s | Always |
| Admin alert evaluation | 5 s | Always |
| Financial alerts, analytics, batch completion, operational metrics aggregation | 1 s queue | Always |
| Sandbox wallet reset (daily to 10000) | 1 s | Always |
| Message partition maintenance | hourly | Always |
| Account export builder | 1 s | Always |
| Realtime ticket cleanup | 1 min | Always |
| Recovery enrollment cleanup | 1 s queue | Always |
| Email delivery, admin and team invitation delivery | 1 s | `OPENSMS_EMAIL_DELIVERY_ENABLED` (invitations also need `OPENSMS_ADMIN_CONSOLE_URL`) |
| Webhook delivery | continuous, 5 s back-off | `OPENSMS_WEBHOOK_DELIVERY_ENABLED` |
| Event bus consumer and broadcast | continuous | `OPENSMS_EVENTBUS_ENABLED` |
| File scanning | 1 s queue | `OPENSMS_FILE_SCAN_ENABLED` |
| Provider balance polling | 1 s queue (per-account interval, default 300 s) | `OPENSMS_PROVIDER_BALANCE_POLLING_ENABLED` |
| Controlled route probes | 1 s queue | `OPENSMS_ROUTE_PROBES_ENABLED` |
| Automatic top-ups | 1 s queue | `OPENSMS_AUTOMATIC_TOPUPS_ENABLED` |
| Sender registration | 1 s queue | `OPENSMS_SENDER_REGISTRATION_ENABLED` |
| Number renewal | 1 s queue | `OPENSMS_NUMBER_RENEWAL_ENABLED` |
| Statement drafts | 1 s queue | `OPENSMS_STATEMENT_DRAFTS_ENABLED` |
| FX refresh | 1 min | `OPENSMS_FX_REFRESH_ENABLED` |
| Lookup processing / refresh | 1 s / 1 min | `OPENSMS_LOOKUP_ENABLED` / `OPENSMS_LOOKUP_REFRESH_ENABLED` |
| Retention and deletion workers | 1 s queue | `OPENSMS_RETENTION_ENABLED`, `OPENSMS_DELETION_LIFECYCLE_ENABLED` (see [database](database.md#retention-and-redaction)) |
| Admin SMS alerts / Slack alerts | 5 s / 1 s | `OPENSMS_ADMIN_SMS_ALERTS_ENABLED` / `OPENSMS_ADMIN_SLACK_ALERTS_ENABLED` |

Because every instance runs every worker, running more than one API instance is safe only because each worker claims work with row locks, leases or advisory locks. The hosted deployment runs one instance.

## Shutdown

On SIGTERM or SIGINT the API stops accepting work, waits up to 10 seconds for the HTTP server, metrics listener and event bus consumer to finish, and exits 0 on a clean shutdown. The hosted Compose file gives the container 60 seconds (`stop_grace_period: 60s`).
