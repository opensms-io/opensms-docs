# Getting access

This page explains how someone becomes an opensms operator and signs in to the console. It covers creating the first operators with the `opensms-admin` command, signing in with and without an authenticator, keeping the ten-minute factor window fresh for sensitive actions, and bringing in more operators through invitations. It is for whoever runs the platform: the engineer who bootstraps a new installation, and every operator who signs in afterwards.

Related: [roles and permissions](README.md#roles-and-what-each-can-do), [managing operators](admins.md).

## How operator identity works

An operator is two linked records: an ordinary user account (the same kind customers have) and an `admin_users` row that holds the role and, optionally, an encrypted authenticator secret. There are two ways to create one:

| Method | When to use | Authenticator |
|---|---|---|
| `opensms-admin` command | The first superadmin on a new installation, or any time you have database owner access | `--with-totp` generates one; `--development-no-totp` skips it (refused in production) |
| [Invitation](admins.md#invite-an-operator) from the Admins page | Every operator after the first | The invitee's own customer authenticator is copied over when they accept |

An email can only ever be one identity. `opensms-admin` refuses an email that already exists, customer or operator, and never promotes or resets an existing account.

## Create an operator with opensms-admin

`opensms-admin` is built from `api/cmd/opensms-admin`. The hosted prebuilt image (`api/ops/hosted/Dockerfile.prebuilt`) ships it in `/app` next to `opensms` and `opensms-migrate`. The plain `api/Dockerfile` builds only `opensms` and `opensms-migrate`, so with that image build the command yourself (`go build ./cmd/opensms-admin` from `api/`).

### What it needs

| Input | Required | Notes |
|---|---|---|
| `OPENSMS_ADMIN_DATABASE_URL` | yes | A separate credential that owns the `users` and `admin_users` tables (or is a Postgres superuser). The command does not read `.env` and does not fall back to the runtime database URL. |
| `OPENSMS_ENCRYPTION_KEY` | with `--with-totp` | The installation's existing 32-byte key. Never change it to run this command. |
| `--email` | yes | Lowercased. Must not already exist as a customer or operator. |
| `--role` | yes | `superadmin`, `ops`, `finance` or `support`. There is no default. |
| `--with-totp` or `--development-no-totp` | exactly one | `--development-no-totp` is rejected when `OPENSMS_ENV=production`. |
| `--password-stdin` | no | Read the password from standard input (16 to 1024 bytes). Without it, a random password is generated and printed once. |

### Steps (production)

1. Open a shell on a host that can reach the database, with the operator database credential and the encryption key exported.
2. Make new files private: `umask 077`.
3. Run the command and write its output to a private file:

   ```sh
   opensms-admin --email ops-lead@example.com --role superadmin --with-totp > operator-credentials.json
   ```

4. Open the file. It holds the generated password and the authenticator secret, shown this one time only.
5. Add the `totp_secret` to an authenticator app (any RFC 6238 app: SHA-1, 30 seconds, 6 digits) as a manual key.
6. Give the password and secret to the operator through your secret store, then delete the file.

This is the shape of the output from running the command against the docs stack (secret replaced with a placeholder):

```json
{"email":"docs-superadmin-totp@opensms.test","role":"superadmin","totp_secret":"<base32 secret, shown once>","login_path":"/admin/v1/login"}
```

With `--password-stdin`, the password is not echoed back. The docs role operators were created this way:

```sh
printf '%s' "$PASSWORD" | opensms-admin --email docs-ops@opensms.test --role ops --development-no-totp --password-stdin
```

```json
{"email":"docs-ops@opensms.test","role":"ops","login_path":"/admin/v1/login"}
```

If you pass neither mode flag, the command stops before it touches anything:

```
use --with-totp, or explicitly --development-no-totp outside production
```

Each successful run writes an `admin.operator_created` entry to the [audit log](audit-log.md) with the role and whether an authenticator was set up.

### Local development

`--development-no-totp` creates an operator with no authenticator, so signing in is one step. This is meant for local work. Such an operator can read everything its role allows but gets `403` on every [action that needs a fresh code](README.md#actions-that-need-a-fresh-authenticator-code).

## Sign in to the console

1. Go to `/admin/login` (for example `http://127.0.0.1:5190/admin/login` locally).
2. Enter your operator email and password and press Enter.
3. If your account has an authenticator, the page changes to **Two-factor verification**. Enter the six-digit code.
4. You land on the [Dashboard](dashboard.md). The rail lists every page for every role; a page your role cannot use shows **Not authorized** when you open it (see [console page access](README.md#console-page-access)).

The console uses its own sign-in page. A customer session from `/login` cannot open `/admin`, and the API refuses it:

```
GET /admin/v1/workspaces  (customer session)
403 {"type":"about:blank","title":"Forbidden","status":403,"detail":"active admin role required"}
```

### Sign in through the API

**Without an authenticator**, `POST /admin/v1/login` returns the session straight away:

```http
POST /admin/v1/login
{"email":"docs-admin@opensms.test","password":"..."}
```

```json
200 {"expires_at":"2026-09-24T19:22:20.708623+03:00","role":"superadmin","token":"sess_KpmP0f37qz..."}
```

Send the token as `Authorization: Bearer <token>` on every `/admin/v1` call. Sessions last 12 hours.

**With an authenticator**, the same call returns `202` and a short-lived challenge instead of a session:

```json
202 {"challenge_token":"sess_adminchallenge_1J6CVC...","challenge_type":"admin_totp","expires_in_seconds":300,"next_path":"/admin/v1/auth/2fa/verify","role":"superadmin","two_factor_required":true}
```

The challenge token is not a session. Using it anywhere else fails:

```json
401 {"type":"about:blank","title":"Unauthorized","status":401,"detail":"admin two-factor authentication required"}
```

Within five minutes, send the code with the challenge token as the bearer:

```http
POST /admin/v1/auth/2fa/verify
Authorization: Bearer sess_adminchallenge_1J6CVC...
{"code":"505574"}
```

```json
200 {"token":"sess_V-jiTsN...","role":"superadmin","expires_at":"2026-09-24T19:22:20.849473+03:00","expires_in_seconds":43199,"verified":true}
```

Keep the new `token`. The challenge is revoked as soon as it is used.

If the underlying user account also has its own customer authenticator, login first answers `202` with `challenge_type: "account_totp"` and `next_path: "/admin/v1/login/2fa"`. Post `{challenge_token, code}` there (or a recovery code), then complete the admin challenge as above. Treat every `202` as "not signed in yet".

### Failed sign-ins and lockout

A wrong password returns `401` with no hint about which part was wrong. Eight failed sign-ins for one email within 30 minutes lock that email: every attempt then returns `429 login temporarily locked`, the correct password included, and each locked attempt counts as another failure. Stop trying and wait 30 minutes after the last attempt. Wrong authenticator codes on `/admin/v1/auth/2fa/verify` count against the same budget: once eight failures are on record for the email, verification answers `429 Authenticator verification temporarily locked.` until the window clears.

## Refresh the ten-minute window

Actions marked "fresh code" in the [roles table](README.md#actions-that-need-a-fresh-authenticator-code) need a code entered on this session in the last ten minutes. When the window has run out you get `403` with a detail such as:

```json
403 {"type":"about:blank","title":"Forbidden","status":403,"detail":"Current superadmin and fresh TOTP required."}
```

Through the API, post a new code to `/admin/v1/auth/2fa/verify` with your current session token as the bearer. The server refreshes the ten-minute window on that same session: the response returns the **same** `token` you sent (keep using it) and the same `expires_at`, because the session's 12-hour lifetime does not move. Only the login challenge token is swapped for a new one. Verified on the docs stack: a re-verify answered `200` with `"verified":true`, the identical token and the identical `expires_at`.

```http
POST /admin/v1/auth/2fa/verify
Authorization: Bearer <your current session token>
{"code":"<current six-digit code>"}
```

> **Known issue.** The console has no "re-enter code" prompt. When an action answers `403 ... fresh TOTP required` (or similar), sign out, sign in again with a new code, and do the action within ten minutes.

## Invitations

After the first superadmin exists, add people through [Admins](admins.md#invite-an-operator) instead of the command line. The invitee must already have a customer account with a verified email and an authenticator turned on. They accept with a current code, which copies their authenticator onto the new operator identity, and then sign in at `/admin/login` like everyone else. Invitation email delivery needs `OPENSMS_EMAIL_DELIVERY_ENABLED=true` and `OPENSMS_ADMIN_CONSOLE_URL`. The console has no accept or decline pages yet (see [Admins](admins.md#accepting-an-invitation)).

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `401 Invalid admin credentials.` on login | No active operator with that email, or the operator was removed | Check [Admins](admins.md); removed operators cannot sign in again |
| `429 login temporarily locked` | 8 failures in 30 minutes | Wait 30 minutes without retrying |
| `429 Authenticator verification temporarily locked.` | 8 failed passwords or codes in 30 minutes | Wait 30 minutes without retrying |
| `401 admin two-factor authentication required` | Using a challenge token as a session, or the 12-hour factor verification lapsed | Complete `/admin/v1/auth/2fa/verify` |
| `403 ... fresh TOTP required` | Ten-minute window expired, or the operator has no authenticator | Re-verify, or create the operator with `--with-totp` |
| `403 active admin role required` | A customer session was used | Sign in at `/admin/login` |
| `identity already exists; no promotion or reset performed` from the command | The email is already a customer or operator | Use another email, or invite the existing customer |
