# Runbook: delivery receipt timeouts

What to do when accepted messages do not receive a delivery receipt (DLR) in time. For `ops` operators and on-call engineers. Sources: `api/internal/dlrmonitor`, `api/docs/dlr-timeouts.md`, the admin OpenAPI contract.

Related: [provider outage](provider-outage.md), [architecture: life of a message](../architecture.md#life-of-a-message).

## How it works

- Each route has `dlr_timeout_seconds` (the seeded mock routes use 90). Change it with `PATCH /admin/v1/routes/{id}` `{"dlr_timeout_seconds": N}`.
- The DLR monitor runs continuously. For each live attempt that the provider **accepted**, on a provider that supports receipts, with no receipt after the timeout, it opens a `dlr_timeout_reviews` record and emits a `message.dlr_overdue` event and audit entry.
- The message stays `sent`, the charge stays captured, no new attempt is made and fallback is not triggered. An overdue receipt is **not** evidence that delivery failed.
- If a valid terminal receipt arrives later, the review resolves automatically and `message.dlr_recovered` is emitted.
- Sandbox messages, providers without receipt support and unaccepted attempts never create reviews.

## Steps

1. **List pending reviews** (ops or superadmin). Defaults to `pending`; filter with `workspace_id`, `provider_id`, `environment`, `status`; `limit` 1 to 100.

   ```text
   GET /admin/v1/reconciliation/dlr-reviews?limit=2
   {"items":[],"next_cursor":null}
   ```

   (Empty on the docs stack, which has no live traffic.) Detail: `GET /admin/v1/reconciliation/dlr-reviews/{attempt_id}`. Neither returns message text, destinations or raw provider errors.

2. **Group by provider.** Many reviews on one provider usually mean its receipts are not reaching opensms, not that messages failed.

3. **Check the receipt path** for that provider:
   - `GET /admin/v1/reconciliation/receipts` for receipts that arrived but could not be matched to an attempt.
   - The callback URL configured at the provider: `OPENSMS_RECEIPT_BASE_URL` + `/callbacks/providers/{provider_id}/dlr`, or the [`opensms-at-bridge`](../binaries.md#opensms-at-bridge) URL for Africa's Talking.
   - Proxy logs for 401 (bad or missing HMAC signature, clock skew over 5 minutes), 413 (body over 64 KiB) or 503 (database unavailable) on `/callbacks/providers/`.
   - For SMPP providers, whether the bind is up (the API reconnects and retires stale binds itself).

4. **Fix the path** (callback URL, bridge secret matching the provider's `callback_hmac_secret`, proxy route). Providers usually retry callbacks; receipts that arrive later resolve their reviews.

5. **If receipts are gone for good**, the reviews stay pending as evidence. There is currently no API to query a provider for final delivery status or to close a review manually; record the provider's own delivery report against the affected period.

## What not to do

- Do not mark messages failed or refund them because the receipt is late.
- Do not lower `dlr_timeout_seconds` to make reviews disappear; it only changes when a review is opened.

Not exercised locally: creating a real review needs a live accepted attempt on a provider with receipt support, which requires live dispatch.
