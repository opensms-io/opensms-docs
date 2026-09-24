# Runbook: document scanner degraded

What to do when uploaded documents stay pending, `/readyz` reports `File scanning is temporarily unavailable or signatures require updating.`, or reviewers cannot approve KYC documents. For on-call engineers and ops operators. Sources: `api/internal/filescan`, `api/ops/clamav/*`, `api/docs/file-scanning.md`, `api/docs/scanner-health.md`.

Related: [security: document malware scanning](../security.md#document-malware-scanning-clamav), [dependency outage](dependency-outage.md).

## How it behaves

- Uploads are quarantined until `clamd` returns an exact clean verdict. KYC approval needs all three documents clean; manual transfer approval needs a clean proof.
- With scanning enabled, the API checks `clamd` (PING and VERSION, 2-second deadline). Unreachable, or signatures older than 72 hours, or timestamps more than 5 minutes in the future, make the scanner unhealthy: `/readyz` fails and the worker stops leasing jobs.
- Jobs retry up to 5 times, 5 minutes apart. After that they are `exhausted`.

## Steps

1. **Read the status** (ops or superadmin):

   ```text
   GET /admin/v1/operations/file-scanning
   {"backlog":{"pending":28,"retrying":0,"exhausted":0,"scanning":0},"scanner":{"status":"disabled"}}
   ```

   (Docs stack, scanning disabled.) With scanning enabled, `scanner` also reports the engine version, signature version and age.
2. **`status: disabled`** means `OPENSMS_FILE_SCAN_ENABLED` is not `true`. Uploads will never be released. Enable it with the socket settings in [configuration](../configuration.md#file-scanning) and restart the API.
3. **Scanner unavailable.** Hosted: `docker compose ps clamav` and `docker compose logs clamav` in `/opt/opensms-backend`. The container exits if either `clamd` or `freshclam` dies and restarts on its own; the first start downloads signatures and can take a few minutes (`start_period: 4m`). Check the socket volume is mounted in both containers at `/run/clamav`.
4. **Signatures stale.** `freshclam` needs outbound internet from the `clamav` container (it is on the `ingress` network for that reason). Look for download errors in its log.
5. **Exhausted jobs** stay blocked. Ask the customer to re-upload once the scanner is healthy; a replacement upload creates a fresh scan job.
6. **Never** mark files clean in the database or disable scanning to unblock a review.

Not exercised locally: no ClamAV engine was started for this page. The repository records a clean and EICAR check against the pinned image on 2026-09-13.
