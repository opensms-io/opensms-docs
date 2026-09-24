# Runbook: provider or route outage

What to do when an SMS provider stops accepting messages, becomes slow, or a route is marked `down` or `degraded`. For the on-call engineer or `ops` operator. Sources: `api/internal/health`, `api/internal/routing`, `api/internal/dispatch`, the admin OpenAPI contract, and `controlled-route-probes.md` in `api/docs`.

Related: [architecture: routing and route health](../architecture.md#routing-and-fallback), [DLR timeouts](dlr-timeouts.md), [monitoring](../monitoring.md).

## Signals

- `provider_health{provider="<uuid>"}` drops to 1 (degraded) or 0 (down).
- Route health history shows a transition with a reason such as `consecutive submit failures`, `delivery rate below 85 percent`, `provider balance below threshold`, `submit p95 above 3 seconds` or `DLR p50 above 60 seconds`.
- `GET /admin/v1/reconciliation/attempts` starts filling with unknown submissions (timeouts, unreadable replies).
- Customers see messages stuck in `sending` or `failed`, or receive `route.*` health notifications.

## Principles

- **Never resend a message whose submission outcome is unknown.** The provider may have accepted it. Unknown attempts keep their reservation and are resolved only by the submission reconciler or receipts.
- Automatic health already stops routing to a `down` route and prefers healthy routes over degraded ones. Fallback to another provider happens only for workspaces that opted in, only after confirmed non-acceptance, and never across countries.
- Do not enable other delivery flags to "test" a provider.

## Steps

1. **Confirm scope.** List routes and their health (`GET /admin/v1/routes`); each route shows `health`, `health_override` and `effective_health`. Read the history of an affected route:

   ```text
   GET /admin/v1/routes/{id}/health-history?limit=3
   [{"at":"2026-09-24T04:28:27.898253+00:00","id":1,"reason":"admin health override","metrics":{"admin_id":"157ebc65-...","health_override":"down"},"route_id":"aa91a5de-...","to_health":"down","from_health":"healthy"}]
   ```

   Automatic transitions carry the evaluator's `metrics` (window 900 s, submit failures, p95, delivery rate, balance flag).

2. **Check the provider itself**: its status page or account, and the balance (`GET /admin/v1/providers/{id}/balance`, if an account is configured). A low balance only degrades a route; fund the account and wait for a fresh poll.

3. **Take the route out of rotation if automatic health has not.** Pin it `down` (ops or superadmin). The override is audited and published as a route health event:

   ```text
   PUT /admin/v1/routes/{id}/health-override   {"status":"down"}
   200 {"id":"aa91a5de-...","health":"healthy",...,"health_override":"down",...}
   ```

   Alternatives: `PATCH /admin/v1/routes/{id}` with `{"enabled": false}` removes the route entirely (also audited), and `PATCH /admin/v1/providers/{id}` with `{"status": "disabled"}` retires a provider. Disabled providers can still authenticate receipts for messages they already accepted.

4. **Tell customers** through an incident, which appears on the public `/status` page. It needs an `Idempotency-Key`; the `reason` is private audit text, the `body` is public:

   ```text
   POST /admin/v1/incidents
   Idempotency-Key: ops-runbook-incident-1
   {"title":"Delayed delivery on Kenya routes","severity":"sev2","status":"investigating",
    "provider_ids":["1347e5d2-..."],"body":"Some messages to Kenya are delayed. We are investigating.",
    "reason":"Provider submit failures observed on route health"}

   201 {"id":"99904ddd-...","title":"Delayed delivery on Kenya routes","status":"investigating","severity":"sev2",
        "updates":[{"id":1,"body":"Some messages to Kenya are delayed. We are investigating.",...}],...}
   ```

   `GET /status` then reported `"status":"degraded"`.

5. **Watch unknown submissions** (`GET /admin/v1/reconciliation/attempts`). The reconciler queries providers that support it every 5 seconds; others stay unresolved for manual review against the provider's records. Do not refund or release them by hand based on age.

6. **Restore.** When the provider is healthy again, clear the override so automatic health takes over:

   ```text
   PUT /admin/v1/routes/{id}/health-override   {"status":null}
   200 {...,"health_override":null,...}
   ```

   Automatic `down` from submit failures does not clear on an empty window: it needs ten fresh successful attempts in the 15-minute window, or, if [controlled probes](../configuration.md#outbound-delivery-switches) are configured for the route (`PUT /admin/v1/routes/{id}/probe`, superadmin, charged to a service workspace), ten accepted probes within 30 minutes.

7. **Resolve the incident** (`PATCH /admin/v1/incidents/{id}` with `{"status":"resolved","body":"...","reason":"..."}` and a new `Idempotency-Key`). Resolved incidents cannot be reopened; publish a new one if the problem returns.

## Evidence

All requests above were made against a local stack built with [`local-stack.sh`](../local-development.md) (operator `admin@opensms.test`) on the sandbox mock provider's Kenya route, then reverted. No real provider was involved; real submit failures, reconciliation and probes were not exercised because live dispatch is disabled locally.
