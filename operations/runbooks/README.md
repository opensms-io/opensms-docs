# Runbooks

Step-by-step procedures for operational situations in opensms. Each runbook says what signals it, what to do in order, what never to do, and which parts were exercised on a local stack while it was written. They are for on-call engineers and `ops`/`superadmin` operators. Background is in [architecture](../architecture.md) and [monitoring](../monitoring.md).

| Runbook | Use when |
| --- | --- |
| [API not ready (dependency outage)](dependency-outage.md) | `/readyz` returns 503, the API will not start, or `OpenSMSCollectorDown` fires |
| [Provider or route outage](provider-outage.md) | A provider stops accepting, routes go `down`/`degraded`, unknown submissions pile up |
| [Delivery receipt timeouts](dlr-timeouts.md) | Accepted messages have no DLR; `message.dlr_overdue` events; DLR reviews pending |
| [Event bus dead letters](broker-dead-letters.md) | `OpenSMSBrokerDeadLetters` fires |
| [Corrupt JetStream consumer cursor](broker-cursor-recovery.md) | The durable consumer exists but its info returns 404 and nothing is consumed |
| [Sandbox wallet reset](sandbox-wallet-reset.md) | Unexpected sandbox balances, `sandbox wallet reset unavailable` in logs |
| [Leaked API key or compromised account](api-key-compromise.md) | A secret key is exposed or a customer or operator account is suspect |
| [Encryption key rotation](encryption-key-rotation.md) | `OPENSMS_ENCRYPTION_KEY` may have been exposed |
| [Document scanner degraded](file-scanner-degraded.md) | Uploads stuck pending, scanner readiness failure |

Rules that apply to every runbook:

1. Never resend or refund a message because its outcome is unknown or late. Unknown means the provider may have accepted it.
2. Keep outbound delivery flags off during any recovery until queues have been reviewed.
3. Do not edit ledgers, audit, receipts or checkpoints by hand. They are immutable by design and the runtime role cannot change them.
4. Operator actions that need a fresh TOTP cannot be done by a `--development-no-totp` operator. Make sure production operators have TOTP.
