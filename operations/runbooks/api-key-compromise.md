# Runbook: leaked API key or compromised account

What to do when a customer's API key is exposed (committed to a repository, pasted in a ticket, logged) or a customer account is suspected compromised. For support and ops operators, and for customers' own engineers. Sources: `api/internal/keys/http.go`, the customer and admin OpenAPI contracts, `api/docs/customer-session-expiry.md`.

Related: [security: API keys and sessions](../security.md#api-keys), [API keys reference](../../reference/api/api-keys.md).

## Leaked API key

Done by a workspace **owner or admin** with a console session (`X-Workspace-ID` set).

1. **Identify the key** by prefix, label and last use:

   ```text
   GET /v1/keys     (fields extracted from the JSON: id prefix, key prefix, label, last_used_at)
     bd77b299 sk_test_ leaked-key None
     1c403701 sk_test_ ops-arch3 2026-09-24T07:22:24.297479+03:00
   ```

2. **Revoke it.** Revocation is immediate.

   ```text
   DELETE /v1/keys/{id}
   204
   ```

   The revoked secret then fails on every request:

   ```text
   GET /v1/messages?limit=1   (Authorization: Bearer <revoked sk_test_...>)
   401 {"type":"about:blank","title":"Unauthorized","status":401,"detail":"missing or invalid API key"}
   ```

3. **Issue a replacement** with `POST /v1/keys` (`{"label": "...", "test": false}`), store the secret (shown once) in the integration's secret store, and deploy it.

4. **Review what the key did**: messages sent in the window (`GET /v1/messages`), wallet ledger, and the audit log (operators: `GET /admin/v1/audit`).

**Do not use rotate for a leak.** `POST /v1/keys/{id}/rotate` issues a new secret but leaves the old one valid for 24 hours. On a local stack the old secret still returned `200` immediately after rotation. If you already rotated, revoke the old key ID as well; after that, the database showed the old key revoked and the replacement active:

```text
$ psql -Atc "select label, rotated_from is not null as is_replacement, expires_at is not null as has_expiry, revoked_at is not null as revoked from api_keys where label='leaked-key' order by created_at"
leaked-key|f|t|t
leaked-key|t|f|f
```

## Compromised customer account

1. The user (or another owner) lists sessions with `GET /v1/auth/sessions` and revokes unknown ones with `DELETE /v1/auth/sessions/{id}`; changes the password through the reset flow; enables TOTP.
2. An operator can act for them. These need a **superadmin** session with TOTP verified in the last 10 minutes, a `reason` of 5 to 1000 characters, and are audited. Operators' own linked accounts cannot be targeted.
   - `POST /admin/v1/users/{id}/force-logout` revokes all sessions and outstanding login and recovery challenges.
   - `POST /admin/v1/users/{id}/lock` locks the account and revokes sessions and challenges.
   - `POST /admin/v1/users/{id}/reset-2fa` if the attacker enrolled their own authenticator (also revokes sessions).
   - `POST /admin/v1/users/{id}/ban` for abuse: it also suspends workspaces where the user is the sole active owner and revokes **all** their API keys. `/unban` restores sign-in only, not keys, sessions or workspaces.
3. Revoke the workspace's API keys as above if the attacker could have created or read any.

An operator without TOTP is refused:

```text
POST /admin/v1/users/{id}/force-logout   {"reason":"Suspected credential compromise"}
403 {"type":"about:blank","title":"Forbidden","status":403,"detail":"Current superadmin and fresh TOTP required."}
```

## Compromised operator account

From another superadmin session with fresh TOTP, revoke the operator with `DELETE /admin/v1/admins/{id}` (soft revoke; also ends their sessions; you cannot remove yourself or the last active superadmin), then review `GET /admin/v1/audit` (superadmin; metadata only, payloads are never returned) for actions taken by that operator. If the encryption key or database credentials could have been read (for example from a host), follow [encryption key rotation](encryption-key-rotation.md) and rotate the database passwords. Not exercised locally.

## Evidence

Key listing, rotation, revocation and the force-logout refusal were run on a local stack built with [`local-stack.sh`](../local-development.md), using a throwaway workspace and `sk_test_` keys.
