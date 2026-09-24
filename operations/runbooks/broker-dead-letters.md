# Runbook: event bus dead letters

What to do when `OpenSMSBrokerDeadLetters` fires, meaning an outbox event exhausted its processing attempts on the NATS JetStream event bus. Only relevant when `OPENSMS_EVENTBUS_ENABLED=true`. For `ops` operators and on-call engineers. Sources: `api/docs/broker-admin.md`, `api/docs/eventbus.md`, `api/ops/prometheus/alerts.yml`, `api/internal/admin/broker.go`.

Related: [architecture: outbox and event bus](../architecture.md#outbox-and-event-bus), [broker cursor recovery](broker-cursor-recovery.md), [monitoring](../monitoring.md).

## What a dead letter is

Every event has a receipt row per consumer in PostgreSQL. A handler failure is retried; after 10 downstream executions (or when a processing lease expires on the last allowed attempt) the receipt becomes `dead` and stops being processed. `opensms_queue_pending{queue="broker_deadletter"}` counts current dead receipts. The event payload stays in PostgreSQL; only a fixed failure classification is recorded, never raw errors.

## Steps

1. **List** current dead letters (ops or superadmin). Default limit 50, maximum 200:

   ```text
   GET /admin/v1/broker/dead-letters
   {"items":[],"next_cursor":null}
   ```

   (From a local stack with the event bus enabled and no failures.) Each item gives workspace, environment, event name, generation and failure class. When the event bus is disabled the endpoint returns:

   ```text
   {"type":"about:blank","title":"Service Unavailable","status":503,"detail":"Broker consumer unavailable."}
   ```

2. **Find and fix the cause.** Group by event name and failure class. Typical causes are a downstream dependency that was down for a long time or a bug in one handler. Check API logs around the receipts' timestamps.

3. **Replay** each event after the cause is fixed. Requirements: ops or superadmin, an **enrolled authenticator verified within the last 10 minutes** on this session, an `Idempotency-Key`, and a reason of 5 to 1000 characters.

   ```text
   POST /admin/v1/broker/dead-letters/{event_id}/replay
   Idempotency-Key: <unique>
   {"workspace_id":"...","environment":"live","generation":<listed generation>,"reason":"Webhook fanout fixed in release X"}
   ```

   `202 {"replay_id": ...}` records the intent; the broker worker publishes it shortly after. The same key and body returns the original receipt with `200`. A stale generation or changed body under the same key returns `409`; a wrong workspace or environment `404`.

4. **Watch** `broker_replay` and `broker_deadletter` go back to 0.

## What replay does not do

It does not reset a message's status, retry a provider submission, release funds or refund. Normal idempotency still applies downstream, so an SMS that was submitted before is not submitted again. Never infer that a provider did not accept a message from a dead letter.

Not exercised locally: no dead letters occurred, and replay needs an operator with TOTP (the local operator was created with `--development-no-totp`).
