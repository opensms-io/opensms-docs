# Runbook: corrupt JetStream consumer cursor

How to recover when the durable consumer's persisted state in NATS JetStream is corrupt, for example when `nats consumer ls` shows `opensms-business` but `nats consumer info` returns 404 and the API cannot consume. For engineers operating the NATS broker. Only relevant with `OPENSMS_EVENTBUS_ENABLED=true`. Source: `api/docs/broker-cursor-recovery.md` (observed with NATS 2.10.29, diagnosed with 2.14.6 as `corrupt state file (10104)`).

Related: [broker dead letters](broker-dead-letters.md), [backup and restore](../backup-and-restore.md), [architecture: outbox and event bus](../architecture.md#outbox-and-event-bus).

This is a manual procedure. The API never repairs broker state at startup. **Not run while writing this page**: it needs a corrupted store to act on.

## Never

- Delete or recreate the stream, or replace the NATS volume.
- Reset or delete `broker_consumer_receipts` in PostgreSQL.
- Pick a new consumer name to get past the error.
- Enable any external delivery during recovery.

## Steps

1. **Stop everything that uses the broker**: all API instances (they publish, consume and run maintenance). Confirm `OPENSMS_LIVE_DISPATCH_ENABLED`, `OPENSMS_EMAIL_DELIVERY_ENABLED`, `OPENSMS_WEBHOOK_DELIVERY_ENABLED` and `OPENSMS_AUTOMATIC_TOPUPS_ENABLED` are `false` for the whole procedure.
2. **Stop NATS cleanly and preserve evidence.** Copy the complete JetStream store (and the corrupted consumer directory) to private storage. Record the server version, stream config, message count, first and last sequence, and the consumer name. Back up PostgreSQL too. Do not copy a store while it is being written.
3. **Diagnose on a copy.** Start a separate NATS on an unused loopback port with the exact version you tested, pointing at a copy of the store. Connect no API to it. Inspect metadata only: do not fetch or acknowledge messages.
4. **If only the consumer's `o.dat` is corrupt**: keep that file aside, delete it from the stopped **copy** only, keep consumer metadata, stream blocks and indexes, and restart the copy. Verify the same consumer exists and message counts and sequences are unchanged. This rebuilds the cursor; it does not recover missing messages.
5. **Compare with PostgreSQL.** Every unresolved receipt (`pending`, `processing`, `dead`) must have a surviving envelope or a deliberate, audited republication. Investigate any gaps instead of republishing everything.
6. **Cut over** to the repaired store (or the original, if it proved fine) with the same consumer name and the same database. Keep the original backup.
7. **Resume the API with delivery flags still off.** Check `broker_pending`, `broker_processing`, `broker_deadletter` and newly queued webhook and email jobs before enabling any outbound flag.

## Why this is safe

The PostgreSQL receipt row fences business effects: a completed event is acknowledged without running again, dead and obsolete-generation receipts are acknowledged without execution, and live leases defer. Provider submissions keep their request keys and uncertainty state, so a redelivered envelope never triggers a second SMS. The repository's `TestBrokerRedeliveryPreservesActualSMSDispatchUncertainty` exercises exactly this cursor removal on an embedded server.
