# Runbook: encryption key rotation

What changing `OPENSMS_ENCRYPTION_KEY` involves, for when the key may have been exposed. For senior engineers with owner database access. Source: `api/docs/encryption-keys.md`, `api/internal/auth` (AES-GCM helpers).

Related: [security: encryption key](../security.md#encryption-key), [backup and restore](../backup-and-restore.md).

**There is no rotation tool.** opensms reads exactly one key and has no support for a second key, key IDs or background re-encryption. Simply changing the variable makes every existing TOTP secret, provider credential, callback HMAC secret, webhook signing secret, pending invitation, Slack destination and saved payment authorization unreadable. This page is the manual procedure from the source note. **It was not run while writing this page.**

## Before you start

- Decide whether rotation is needed. If only the database was exposed without the key, the encrypted columns are still protected. If the key was exposed, rotation plus revoking the underlying third-party credentials (provider API keys, Slack webhooks, Paystack authorizations) is the complete fix; the key protects copies of those credentials, not the credentials at their source.
- Plan a maintenance window: credential writes and affected workers must be paused.

## Steps

1. **Inventory** every encrypted column and every backup that contains them, without logging plaintext.
2. **Keep the old key** safely; you need it to decrypt and for rollback.
3. **Pause** the API (all instances) or at least all credential writes and the workers that decrypt: live dispatch, webhook delivery, automatic top-ups, Slack alerts, invitation delivery.
4. **Re-encrypt** with a one-off program that decrypts each value with the old key and encrypts it with the new key in the same format, including the workspace-bound associated data used for payment authorizations. Pending TOTP recovery enrollments can instead be invalidated.
5. **Verify** every migrated row decrypts with the new key.
6. **Switch every process** (API, `opensms-migrate`, `opensms-admin --with-totp`) to the new key at once and restart.
7. **Keep a rollback plan**: the pre-migration backup and the old key, stored separately.

Alternatives when writing a re-encryption program is not practical: reset affected users' TOTP (`POST /admin/v1/users/{id}/reset-2fa`), re-enter provider credentials and callback secrets through the admin API, rotate webhook secrets and ask customers to re-save payment methods. All of these happen after switching to the new key.
