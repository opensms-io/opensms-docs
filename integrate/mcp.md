# AI assistants (MCP)

OpenSMS runs a hosted Model Context Protocol (MCP) server, so an AI assistant such as Claude, ChatGPT, Cursor or VS Code can send SMS, run one-time passcodes, look up numbers and read delivery status for you. This page is for developers and workspace owners connecting an assistant: how to connect each client, what an assistant is allowed to do, the limits that keep it safe, and the full reference for every tool, resource and prompt.

> **Not deployed yet.** The MCP server is built and tested end to end, but it is not live at `mcp.opensms.io` yet, so the URL below does not answer today. The examples on this page are real responses from a sandbox test run of that build (a Kenyan workspace), with the test server's addresses written as the hosted ones. Until the deploy, [send with an API key](sending-messages.md).

## At a glance

| Setting | Value |
|---|---|
| Server URL | `https://opensms.io/mcp` |
| Transport | Streamable HTTP, `POST` only, stateless |
| Sign-in | OAuth 2.1 with PKCE and dynamic client registration. You never paste an API key into an assistant. |
| What one connection can reach | Exactly one workspace and one environment (sandbox or live), chosen by you on the consent screen |
| What it can do | Only the scopes you tick, from the seven in [Scopes](#scopes) |
| Default limits | 10 spending calls a minute, 120 requests a minute, an optional daily spend cap |
| Revoking | Immediate, from **Settings > Connected AI apps** in the web app |

Start in sandbox. A sandbox connection runs the same tools against simulated delivery, so you can see what the assistant does before it can spend real credit.

## Connect your assistant

Pick your client. Each one registers itself with OpenSMS the first time it connects, then opens the OpenSMS consent screen in your browser, where you sign in, choose the workspace and environment, and decide what the assistant may do. The web app has the same steps with a copy button on the **AI assistants** page (see the [web app guide](../console/ai-assistants.md)).

<div data-client-grid></div>

### Claude

Works in Claude on the web and in the desktop apps. On a Team or Enterprise plan an organization owner adds the connector first, then each member connects.

1. Open **Customize > Connectors**, select **+**, then **Add custom connector**.
2. Name it `OpenSMS` and paste the server URL `https://opensms.io/mcp`. Leave **Advanced settings** empty: OpenSMS registers Claude automatically, there is no client ID or secret to enter.
3. Select **Add**, then **Connect**. The OpenSMS consent screen opens.
4. In a chat, turn on the OpenSMS tools from the tools menu.

Claude is a verified app: the consent screen shows its logo and a **Verified by OpenSMS** badge. Steps from Anthropic's [custom connectors guide](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp).

### ChatGPT

Custom MCP apps need ChatGPT's **Developer mode**, which OpenAI offers on paid plans.

1. Turn on **Developer mode** in ChatGPT's settings (under **Security and login** at the time of writing).
2. Create a developer-mode app, give it the name `OpenSMS` and the server URL `https://opensms.io/mcp`, and choose OAuth as the authentication.
3. ChatGPT opens the OpenSMS consent screen. Approve, then pick the OpenSMS app from the **Developer mode** tool in the composer.

OpenAI moves these menus often; if a label differs, follow OpenAI's [developer mode guide](https://developers.openai.com/api/docs/guides/developer-mode) and use the same URL.

### Claude Code

Add the server once, then sign in from inside Claude Code:

```sh
claude mcp add --transport http opensms https://opensms.io/mcp
```

Then run `/mcp` in a Claude Code session, select `opensms` and follow the browser sign-in. Claude Code signs in through a local callback on your computer, so the consent screen shows it as an app running on this device rather than as a verified app (see [Verified and unverified apps](#verified-and-unverified-apps)). Steps from the [Claude Code MCP docs](https://code.claude.com/docs/en/mcp).

### Cursor

Add OpenSMS to `~/.cursor/mcp.json` (every project) or `.cursor/mcp.json` (one project):

```json
{
  "mcpServers": {
    "opensms": {
      "url": "https://opensms.io/mcp"
    }
  }
}
```

Open **Cursor Settings > MCP**, find `opensms` and select **Connect** (or **Login**) to start the sign-in. Format from [Cursor's MCP docs](https://cursor.com/docs/context/mcp).

### VS Code

Add the server to `.vscode/mcp.json` in your workspace, or run **MCP: Add Server** from the Command Palette and choose HTTP:

```json
{
  "servers": {
    "opensms": {
      "type": "http",
      "url": "https://opensms.io/mcp"
    }
  }
}
```

Start the server from the file's code lens or the **MCP: List Servers** command; VS Code opens the OpenSMS sign-in in your browser. Format from the [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

### Windsurf

Add OpenSMS to Windsurf's `mcp_config.json` (open it from the MCP settings in Cascade), using the `serverUrl` key for a remote server:

```json
{
  "mcpServers": {
    "opensms": {
      "serverUrl": "https://opensms.io/mcp"
    }
  }
}
```

Refresh the MCP servers list and sign in when prompted. Windsurf is now documented as part of Devin Desktop; see its [MCP docs](https://docs.devin.ai/desktop/cascade/mcp) for the current file location on your system.

### Zed

Add a context server to your Zed `settings.json` without an `Authorization` header, and Zed runs the standard MCP sign-in:

```json
{
  "context_servers": {
    "opensms": {
      "url": "https://opensms.io/mcp"
    }
  }
}
```

Format from [Zed's MCP docs](https://zed.dev/docs/ai/mcp).

### Any other MCP client

Any client that supports remote MCP servers over Streamable HTTP with OAuth works. Give it the server URL `https://opensms.io/mcp` and no headers. The client discovers everything else from the server's [metadata documents](#for-client-authors), registers itself, and sends you through the consent screen. Clients that only support local (stdio) servers cannot connect.

If your client can only send a fixed `Authorization` header, it cannot use OpenSMS through MCP: the server accepts only the OAuth access tokens it issues, never API keys. Call the [REST API](sending-messages.md) with an API key instead.

## What happens when you connect

1. Your assistant registers itself with OpenSMS and sends you to the OpenSMS sign-in in your browser. If you are not signed in, you sign in first (including two-factor login), and come back to the same request.
2. The consent screen shows who is asking: a verified app with its logo, or an unverified app with a warning and the domain its sign-in returns to.
3. You choose the **workspace** and the **environment** (Sandbox or Live), untick any permissions you do not want to give, and optionally set a daily spend cap and a send rate.
4. For **Live**, you type the current code from your authenticator app.
5. You select **Allow access**. Your browser returns to the assistant, which receives its tokens. The consent link works once and expires after 10 minutes.

The web app guide walks through [the consent screen field by field](../console/ai-assistants.md#the-consent-screen).

## Access control

### Scopes

An assistant can only be given these seven scopes. They are the same scopes as [API keys](authentication.md#scopes), and every tool call is checked by the same code that checks an API key, so a connection can never do more than an API key with the same scopes.

| Scope | Shown on the consent screen as | What it allows | Risk in sandbox / live | Who can grant it |
|---|---|---|---|---|
| `messages:read` | Read messages | See messages you sent and their delivery status. | Low / Low | Any member |
| `messages:write` | Send SMS and verification codes | Send messages and one-time passcodes, and start batches. Uses wallet credit. | Medium / High | Any member |
| `pricing:read` | See prices | See your per-country SMS prices to estimate cost. | Low / Low | Any member |
| `sender-ids:read` | See sender IDs | See your sender IDs and whether they are approved. | Low / Low | Any member |
| `lookup:read` | Read number lookups | See the results of number lookups already run. | Low / Low | Any member |
| `lookup:request` | Run paid number lookups | Check a phone number's carrier and status. Each lookup is charged. | Medium / Medium | Any member |
| `wallet:read` | See wallet balance | See your wallet balance and today's spend. | Low / Low | Owner, admin |

If an assistant does not ask for scopes, it gets `messages:read messages:write pricing:read sender-ids:read`. You can untick any of them on the consent screen, but you can never add one the assistant did not ask for, and at least one must stay ticked.

Everything else is refused before the consent screen appears (`invalid_scope`): managing keys, topping up or changing the wallet, webhooks, numbers, compliance, sender ID applications, contacts, templates, analytics, realtime and the `*` wildcard. An assistant cannot create an API key, move money or change where delivery reports go. Two standard OAuth scopes that some assistants add on their own, `offline_access` and `openid`, are silently ignored rather than refused: refresh tokens are always issued, and there is no OpenID sign-in.

There is no separate OTP scope: sending and checking a passcode both use `messages:write`, exactly as the [OTP API](otp.md) does.

### Workspace and environment binding

A connection is bound to exactly one user, one workspace, one environment and one assistant. Nothing in a tool call can pick another workspace or switch between sandbox and live; a message ID from another workspace returns "not found". To use a second workspace, or live as well as sandbox, connect again and choose it: each connection shows up separately in **Connected AI apps**.

Connecting the same assistant again to the same workspace and environment replaces the old connection (the consent screen tells you so).

| Environment | What the tools do | Who can choose it |
|---|---|---|
| Sandbox | Simulated delivery: nothing reaches a real phone. OTP codes appear in the web app's [sandbox inbox](../console/sandbox.md). Sandbox wallet credit only. | Any member |
| Live | Real SMS to real phones, charged to the live wallet | Owners and admins, once the workspace [is live](../getting-started/going-live.md), with two-factor authentication turned on |

Every tool description starts with the environment, for example `[sandbox: simulated, no real SMS is delivered]` or `[live: sends real SMS and spends credit]`, so the assistant knows which one it is using.

### Live access needs your authenticator

Approving a live connection asks for a current code from your authenticator app, even if you signed in a minute ago. Five wrong codes in 10 minutes lock the check, using the same counter as the other sensitive actions on your account. If you have not turned on [two-factor authentication](../console/settings.md#security), turn it on first; without it you can still connect in sandbox.

### Access is checked on every request

Each MCP request re-checks, with no caching, that the connection is active, that you are still a member of the workspace, and that your current role still allows every granted scope (and live, for a live connection). If an owner removes you or lowers your role, your connections stop working on the very next request and are revoked.

### Tokens

| Token | Lifetime | Notes |
|---|---|---|
| Access token (`osm_at_...`) | 10 minutes | Works only on the MCP server. The REST API rejects it. |
| Refresh token (`osm_rt_...`) | 30 days without use, 180 days at most per connection | Replaced on every use. Using an old one revokes the whole connection. |

Assistants renew tokens automatically; you only see the consent screen again after 180 days, after a revoke, or when you connect a new workspace or environment. OpenSMS stores only hashes of tokens and codes.

## Limits

### Rates

| Limit | Default | Where you change it |
|---|---|---|
| Spending calls per connection (`send_message`, `send_otp`, `lookup_number`, confirming `create_batch`) | 10 a minute | Consent screen or **Connected AI apps**: 5, 10, 30 or 60 a minute |
| All MCP requests per connection | 120 a minute | Fixed |
| Your workspace's API key rate and per-recipient limits | As for API keys | See [rate limits](rate-limits-and-idempotency.md) |

Over the spending rate, the tool returns an error that tells the assistant how many seconds to wait. Over the request limit, the server answers HTTP `429` with `Retry-After`.

### Daily spend cap

You can give each connection a daily cap in the workspace currency (leave it empty for no cap). The cap is enforced inside the database when credit is reserved for a message, so two sends at the same moment cannot both slip past it. It resets at midnight UTC, counts messages, OTP and batch sends made through that connection, and gives back room when a message is released or refunded.

The cap is enforced only on **live** connections. Sandbox messages are free and reserve no wallet credit, so a sandbox send is never refused by the cap, however low you set it. In sandbox, `get_balance` still reports the cap and today's spend (which stays at 0), so you can check the setting, but you cannot test the refusal itself before going live.

When a send would pass the cap, the tool fails with code `ai_connection_spend_cap` and the message "This AI connection reached its daily spend cap of X. The workspace owner can raise it in Settings > Connected AI apps." Lookups are not wallet reservations: they are bounded by the `lookup:request` scope and the send rate.

### Workspace limits still apply

The connection's cap sits on top of everything that already protects the workspace: the workspace [spend cap](billing-and-wallet.md), the wallet balance, sender ID approval, compliance rules such as quiet hours and opt-outs, and the per-recipient limits. An assistant cannot get round any of them.

## Idempotency

Every tool that spends money is safe to retry, so an assistant that retries after a timeout does not send twice.

- **With a key.** Pass `idempotency_key` (8 to 128 characters of `A-Z a-z 0-9 . _ : -`). The same key within **24 hours** returns the original result with `"replayed": true`. Derive it from the business event, for example `delivery-A-1001`, as described in [choosing keys](rate-limits-and-idempotency.md#choosing-keys).
- **Without a key.** OpenSMS derives one from the content. The same text to the same number from the same connection within **10 minutes** is sent once, and repeats return the original message with `"replayed": true`.
- The same key with different content is refused with a conflict error that the assistant can read.
- Keys are namespaced per connection: one assistant can never replay another's key or read its stored result.
- A replay is not a new spend and is not audited as one, but it still counts toward the connection's spending rate (see [Rates](#rates)), because the rate is checked before the replay is found. An assistant that retries in a tight loop can hit "wait N seconds" even though nothing is sent twice.

The same rules cover `send_otp` (content is the number, sender ID, length and lifetime), `lookup_number` (the number) and staging a `create_batch` (the items).

## Tools

The server lists only the tools your connection's scopes allow. Each successful tool result carries `structuredContent` that matches its `outputSchema`, plus one short text summary for clients that ignore structured output. Every successful result includes `environment`. In text summaries, phone numbers are masked to the last four digits (`+2547••••5678`); structured content keeps the full number.

Annotations tell clients how careful to be. OpenSMS marks anything that spends money or reaches a real person as `destructiveHint: true`, which makes most clients ask you before running it.

| Tool | Scope | Read only | Destructive | Idempotent | Open world | Spends |
|---|---|---|---|---|---|---|
| [`send_message`](#send_message) | `messages:write` | no | yes | yes | yes | yes |
| [`preview_message`](#preview_message) | `pricing:read` | yes | no | yes | no | no |
| [`get_message`](#get_message) | `messages:read` | yes | no | yes | no | no |
| [`list_messages`](#list_messages) | `messages:read` | yes | no | yes | no | no |
| [`send_otp`](#send_otp) | `messages:write` | no | yes | yes | yes | yes |
| [`verify_otp`](#verify_otp) | `messages:write` | no | no | no | no | no |
| [`lookup_number`](#lookup_number) | `lookup:request` | no | yes | yes | yes | yes |
| [`get_lookup`](#get_lookup) | `lookup:read` | yes | no | yes | no | no |
| [`get_balance`](#get_balance) | `wallet:read` | yes | no | yes | no | no |
| [`list_sender_ids`](#list_sender_ids) | `sender-ids:read` | yes | no | yes | no | no |
| [`create_batch`](#create_batch) | `messages:write` + `messages:read` | no | yes | yes | yes | confirm only |

`create_batch` needs both scopes because staging reads the batch's validation report, which is a `messages:read` call. A connection without **Read messages** does not list it.

The examples below are real `tools/call` exchanges from a sandbox test run (IDs and times are from that run). Sandbox prices show as `0`, because sandbox messages are free; `preview_message` shows what live sending would cost.

Phone number inputs are E.164 (`^\+[1-9][0-9]{7,14}$`, for example `+254712345678`), except the `to` filter of `list_messages`, which takes 3 to 15 digits with an optional `+` so you can search by part of a number. Every input object rejects unknown properties.

### `send_message`

Sends one SMS through `POST /v1/messages`.

| Input | Type | Notes |
|---|---|---|
| `to` | E.164 string, required | Recipient |
| `text` | string, 1 to 1600, required | Emoji and other non-GSM characters switch the message to UCS-2 (70 characters a part) |
| `sender_id` | string, up to 15 | An approved sender ID from `list_sender_ids`. Omit for the workspace default. |
| `traffic_type` | `transactional` or `marketing` | Default `transactional`. OTP traffic goes through `send_otp`. |
| `scheduled_at` | RFC 3339 date-time | Optional future send time |
| `idempotency_key` | string | See [Idempotency](#idempotency) |
| `metadata` | object, up to 20 properties | Your own reference data, returned with the message |

Output: `message_id`, `status`, `to`, `sender_id`, `parts`, `encoding`, `price`, `currency`, `environment`, `idempotency_key`, `replayed`, `scheduled_at` and `console_url` (the message in the web app).

A `callback_url` is deliberately not accepted: an assistant cannot point delivery reports at an address of its choosing.

The input schema as `tools/list` returns it, with the `description` strings left out (the other tools follow the same pattern, with the fields in their tables):

```json
{"type": "object", "additionalProperties": false, "required": ["to", "text"],
 "properties": {
  "to": {"type": "string", "pattern": "^\\+[1-9][0-9]{7,14}$"},
  "text": {"type": "string", "minLength": 1, "maxLength": 1600},
  "sender_id": {"type": "string", "maxLength": 15},
  "traffic_type": {"type": "string", "enum": ["transactional", "marketing"], "default": "transactional"},
  "scheduled_at": {"type": "string", "format": "date-time"},
  "idempotency_key": {"type": "string", "pattern": "^[A-Za-z0-9._:-]{8,128}$"},
  "metadata": {"type": "object", "maxProperties": 20}}}
```

```json
{"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {
  "name": "send_message",
  "arguments": {"to": "+254712345678", "text": "Your order A-1001 is out for delivery.", "idempotency_key": "delivery-A-1001"}
}}
```

Result:

```json
{"jsonrpc": "2.0", "id": 7, "result": {
  "content": [{"type": "text", "text": "Queued message 4840d913-da44-4630-a584-ffb2e9728cb3 to +2547••••5678, status queued, 1 part(s). Price 0 KES. Sandbox: no real SMS was delivered; it appears in the console Sandbox inbox."}],
  "structuredContent": {
    "message_id": "4840d913-da44-4630-a584-ffb2e9728cb3", "status": "queued",
    "to": "+254712345678", "sender_id": "OPENSMS", "parts": 1, "encoding": "gsm7",
    "price": "0.000000", "currency": "KES", "environment": "sandbox",
    "idempotency_key": "delivery-A-1001", "replayed": false, "scheduled_at": null,
    "console_url": "https://opensms.io/app/messages/4840d913-da44-4630-a584-ffb2e9728cb3"}
}}
```

`console_url` opens the message in the web app. Sending the same call again returns the same `message_id` with `"replayed": true`, and the text starts "Already sent (replayed, not sent again) message 4840d913-...". Nothing is sent twice. The same key with different text is refused with a conflict error (shown under [Errors](#errors)).

### `preview_message`

Works out encoding, parts and cost without sending anything. Uses the same encoding function as the send path and the price from `GET /v1/pricing`.

| Input | Type | Notes |
|---|---|---|
| `to` | E.164 string, required | Decides the country and price |
| `text` | string, required | |
| `sender_id` | string | Warns if it is not one of yours |
| `traffic_type` | `transactional` or `marketing` | |

Output: `encoding`, `parts`, `characters`, `per_part_limit`, `country_iso2`, `country_name`, `price_per_part`, `estimated_total`, `currency`, `price_basis` (`absolute`, or `unavailable` when the price is only fixed at send time) and `warnings` (switch to UCS-2, more than 3 parts, unknown sender ID).

```json
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
  "name": "preview_message",
  "arguments": {"to": "+254712345678", "text": "Hello"}
}}
```

Result:

```json
{"jsonrpc": "2.0", "id": 3, "result": {
  "content": [{"type": "text", "text": "GSM7, 1 part(s), 5 characters. Estimated cost 1 KES to Kenya. Sandbox messages are free and never delivered; the price shown is what live sending would cost."}],
  "structuredContent": {
    "encoding": "gsm7", "parts": 1, "characters": 5, "per_part_limit": 160,
    "country_iso2": "KE", "country_name": "Kenya",
    "price_per_part": "1", "estimated_total": "1", "currency": "KES", "price_basis": "absolute",
    "environment": "sandbox",
    "warnings": ["Sandbox messages are free and never delivered; the price shown is what live sending would cost."]}
}}
```

### `get_message`

Input `message_id` (UUID). Returns the message and up to 10 delivery attempts, with the same customer-safe fields as `GET /v1/messages/{id}` and `GET /v1/messages/{id}/attempts`.

### `list_messages`

Inputs, all optional: `status`, `to`, `country`, `date_from`, `date_to`, `limit` (1 to 50, default 20) and `cursor`. They are passed to the `GET /v1/messages` filters. Output `items` and `next_cursor`. Message text is cut to 160 characters in the list.

### `send_otp`

Sends a one-time passcode through `POST /v1/otp/send`.

| Input | Type | Notes |
|---|---|---|
| `to` | E.164 string, required | |
| `sender_id` | string | |
| `length` | integer, 4 to 10 | Default 6 |
| `ttl_seconds` | integer, 30 to 86400 | Default 600 |
| `idempotency_key` | string | |

Output: `otp_id`, `expires_at`, `to`, `environment`, `idempotency_key` and `replayed`. The code itself is never returned to the assistant. In sandbox the text summary says the code is in the web app's sandbox inbox. When you pass no `idempotency_key`, the output shows the one OpenSMS derived (`mcp-auto:...`).

```json
{"jsonrpc": "2.0", "id": 5, "result": {
  "content": [{"type": "text", "text": "Sent a 6-digit code to +2547••••5678 (otp_id d1d2c71f-c58b-4224-af7f-5b8959bf0e7c). Ask the user for the code, then call verify_otp. Sandbox: the code appears in the console Sandbox inbox, not on a real phone."}],
  "structuredContent": {
    "otp_id": "d1d2c71f-c58b-4224-af7f-5b8959bf0e7c", "expires_at": "2026-09-24T22:35:52Z",
    "to": "+254712345678", "environment": "sandbox",
    "idempotency_key": "mcp-auto:a3bc84f0-02ab-4e2a-9a9a-a79ab5e217cf", "replayed": false}
}}
```

### `verify_otp`

Inputs `otp_id` (UUID) and `code` (4 to 10 digits). Output `valid`, `attempts_left` and `environment`. The OTP's own attempt limit (5 checks) applies unchanged. A wrong code is a normal result, not an error:

```json
{"jsonrpc": "2.0", "id": 6, "result": {
  "content": [{"type": "text", "text": "The code is not valid. 4 attempt(s) left."}],
  "structuredContent": {"valid": false, "attempts_left": 4, "environment": "sandbox"}
}}
```

With the right code the text is "The code is valid. The phone number is verified." and `valid` is `true`.

### `lookup_number`

Runs a paid number lookup through `POST /v1/lookup`. Inputs `to` and `idempotency_key`. Output: the [lookup](lookup.md) result plus `charged` and `currency`. When the lookup has not finished, the text summary tells the assistant to call `get_lookup`.

### `get_lookup`

Input `lookup_id` (UUID). Returns the lookup as `GET /v1/lookup/{id}` does.

### `get_balance`

No input. Output: `environment`, `balance`, `currency`, `grant_daily_cap`, `grant_spent_today` (this connection's spend today, counted the same way as the cap) and `workspace_spend_cap`. From a sandbox connection with a 1 KES cap, after several sends (sandbox sends cost nothing, so the cap is never reached; see [Daily spend cap](#daily-spend-cap)):

```json
{"jsonrpc": "2.0", "id": 9, "result": {
  "content": [{"type": "text", "text": "Balance 10000 KES (sandbox). This connection spent 0 KES today of a 1 KES daily cap."}],
  "structuredContent": {
    "balance": "10000.000000", "currency": "KES", "environment": "sandbox",
    "grant_daily_cap": "1", "grant_spent_today": "0", "workspace_spend_cap": null}
}}
```

### `list_sender_ids`

Optional inputs `status` (`approved`, `pending` or `rejected`) and `country` (ISO 3166 alpha-2). Output `items`, each with `sender_id`, `status`, `countries` and `type`.

### `create_batch`

Sends up to 1000 messages in two steps. There is no one-shot send: the assistant must stage the batch, show you the counts and cost, and confirm.

| Input | Type | Notes |
|---|---|---|
| `items` | array of 1 to 1000 `{to, text, sender_id?, traffic_type?, metadata?}` | Required when staging, forbidden when confirming |
| `dry_run` | boolean | Default `true` |
| `batch_id` | UUID | Required when confirming |
| `confirmation_token` | string | Required when confirming |
| `idempotency_key` | string | For staging |

1. **Stage** (`dry_run` omitted or `true`): nothing is sent. Returns `batch_id`, `status: "staged"`, `valid_count`, `invalid_count`, up to 10 `sample_errors`, `estimated_cost`, `currency`, `confirmation_token` and `confirmation_expires_at`. The text summary tells the assistant to show you the numbers and ask before confirming.
2. **Confirm** (`dry_run: false` with `batch_id` and `confirmation_token`, no `items`): starts the batch and returns `batch_id` and `status`.

The confirmation token is signed, bound to this connection and this batch, valid for 15 minutes and single use. `dry_run: false` with `items` is refused with "stage the batch first".

```json
{"jsonrpc": "2.0", "id": 12, "method": "tools/call", "params": {
  "name": "create_batch",
  "arguments": {"items": [
    {"to": "+254712345678", "text": "Reminder: your appointment is tomorrow at 10:00."},
    {"to": "+254733000111", "text": "Reminder: your appointment is tomorrow at 11:30."}
  ]}
}}
```

The staging result. Nothing has been sent yet:

```json
{"jsonrpc": "2.0", "id": 12, "result": {
  "content": [{"type": "text", "text": "Staged batch 9d11d425-0550-4253-a109-21dc3edfe192. Nothing has been sent. 2 valid, 0 invalid. Estimated cost 2 KES. Show these counts and the cost to the user and ask before confirming. To send, call create_batch with dry_run false, this batch_id and the confirmation_token within 15 minutes."}],
  "structuredContent": {
    "batch_id": "9d11d425-0550-4253-a109-21dc3edfe192", "status": "staged",
    "valid_count": 2, "invalid_count": 0, "sample_errors": [],
    "estimated_cost": "2", "currency": "KES", "environment": "sandbox",
    "confirmation_token": "nRHUJQVQQlOhCSHcPt_hkpm...", "confirmation_expires_at": "2026-09-24T22:40:56Z"}
}}
```

After you agree, the assistant confirms:

```json
{"jsonrpc": "2.0", "id": 13, "method": "tools/call", "params": {
  "name": "create_batch",
  "arguments": {"dry_run": false, "batch_id": "9d11d425-0550-4253-a109-21dc3edfe192", "confirmation_token": "nRHUJQVQQlOhCSHcPt_hkpm..."}
}}
```

```json
{"jsonrpc": "2.0", "id": 13, "result": {
  "content": [{"type": "text", "text": "Started batch 9d11d425-0550-4253-a109-21dc3edfe192, status running. Sandbox: no real SMS is delivered."}],
  "structuredContent": {"batch_id": "9d11d425-0550-4253-a109-21dc3edfe192", "status": "running", "environment": "sandbox"}
}}
```

Confirming again with the same token is refused: "Already confirmed: This confirmation token was already used. A batch starts only once." Invalid items are counted in `invalid_count` and up to 10 appear in `sample_errors`, for example `{"row": 3, "to": "+2547••••5678", "error": "duplicate item"}`.

## Resources

| URI | Scope | Content |
|---|---|---|
| `opensms://workspace` | any connection | JSON: workspace name, currency, live status, the connection's environment, scopes, caps, assistant name and when it was connected |
| `opensms://pricing/{country_iso2}` | `pricing:read` | JSON prices for one country, from `GET /v1/pricing?product=sms&country=` |
| `opensms://sender-ids` | `sender-ids:read` | JSON from `GET /v1/sender-ids` |
| `opensms://guides/sms-basics` | any connection | Markdown: GSM-7 and UCS-2, parts, sender IDs, opt-out wording, quiet hours, sandbox and live |

Resource reads are logged in the connection's activity like tool calls.

## Prompts

Prompts are ready-made tasks your client can offer as slash commands or menu items. Each prompt is listed only when the connection has every scope in its Scope column, because it tells the assistant to use tools that need them.

| Prompt | Scope | Arguments | What it asks the assistant to do |
|---|---|---|---|
| `send_delivery_notification` | `messages:write` + `pricing:read` | `customer_name`, `phone`, `order_reference`, `eta` (optional) | Draft a short message, run `preview_message`, show you the text and cost, and after you confirm call `send_message` with the key `delivery-<order_reference>` |
| `verify_phone_number` | `messages:write` | `phone` | `send_otp`, ask you for the code, `verify_otp`, report the result and attempts left |
| `check_delivery_status` | `messages:read` | `message_id` or `phone` | `get_message`, or `list_messages` for that number, then explain the status in plain words |
| `estimate_campaign_cost` | `pricing:read` | `country_iso2`, `recipient_count`, `text` | `preview_message` and the pricing resource, then the total. Never sends. |

## Errors

API errors come back as tool results with `isError: true`, not as protocol errors, so the assistant can read them and adjust. An error result has no `structuredContent`: each tool's `outputSchema` describes its successful output only, so never validate an error against it. The error is in two places:

- **The text block**, for the assistant and for any client: `"<title>: <detail>"`, which says what to do next, then a second line in brackets with whichever of the code, HTTP status, retry delay and trace id apply, for example `[code insufficient_scope, HTTP 401]` or `[HTTP 429, retry after 12 s]`.
- **`_meta["opensms.io/error"]`**, for client code: `{status, code, detail, retry_after_seconds, trace_id}`, with `null` for what does not apply and `""` for `code` when the REST API gave none.

A real error result from the test run, from reusing an `idempotency_key` with different text:

```json
{"jsonrpc": "2.0", "id": 4, "result": {
  "isError": true,
  "content": [{"type": "text", "text": "Conflict: Idempotency-Key was already used with a different request. If you reused an idempotency_key, use a new key for different content.\n[HTTP 409]"}],
  "_meta": {"opensms.io/error": {
    "status": 409, "code": "", "retry_after_seconds": null, "trace_id": null,
    "detail": "Idempotency-Key was already used with a different request. If you reused an idempotency_key, use a new key for different content."}}
}}
```

| Situation | What the assistant sees |
|---|---|
| Connection's daily cap reached | `ai_connection_spend_cap`, with the cap and where to raise it |
| Workspace spend cap reached or wallet too low | The same [problem codes](errors.md) as the REST API |
| Sender ID not approved | The REST refusal, so the assistant can pick another from `list_sender_ids` |
| Spending rate exceeded | "Rate limited: This connection may send N messages or lookups per minute. Wait N seconds and try again." (code `rate_limited`, HTTP `429`, with `retry_after_seconds`) |
| Permission not granted | "Permission missing: This connection was not granted the permission this action needs. Reconnect OpenSMS and allow it on the consent screen." (code `insufficient_scope`). The connection still works for everything else; reconnect and tick the permission. |
| Connection revoked during a call | "Connection revoked: This connection was revoked. Ask the user to reconnect OpenSMS." (code `connection_revoked`). The next request gets HTTP `401`. |
| Same `idempotency_key` with different content | "Conflict: Idempotency-Key was already used with a different request." Use a new key for different content. |
| Tool not granted | A JSON-RPC error `-32602` `unknown tool "<name>"`: tools outside the connection's scopes are not listed and cannot be called. |
| Invalid arguments | Refused by the schema before anything runs |
| OpenSMS briefly unavailable | "Temporarily unavailable: ... Try again shortly." (code `unavailable`). Nothing was sent. |
| Internal error | A generic message (code `internal_error`) and a `trace_id` to quote to support, never internal details |

## Revoking access

- **From the web app.** **Settings > Connected AI apps**, then **Disconnect** on the connection. It stops working on the next request; messages already sent are not affected. Owners and admins see and can disconnect every connection in the workspace; other members see their own. See the [web app guide](../console/ai-assistants.md#connected-ai-apps).
- **From the assistant.** Clients that support token revocation revoke their refresh token when you remove the connector or sign out, which ends the whole connection. If you are not sure yours does, disconnect in the web app as well.
- **Automatically.** A reused refresh token, a replayed authorization code, removing the member, lowering their role below what the connection needs, deleting the workspace, or connecting the same assistant again all revoke the connection. A reused refresh token also sends an in-app notification to you and the workspace owners.

Revoking also revokes the connection's internal API key, so a call already in flight fails at its next credential check.

## Security model

### Verified and unverified apps

Any program can register itself as an MCP client and call itself anything. OpenSMS therefore ignores the name, logo and links an app sends when deciding how to show it. An app is **verified** only when every address its sign-in can return to belongs to that vendor, from a list reviewed by OpenSMS. Registering as "Claude" with Claude's callback address gets an attacker nothing, because the code can only be delivered to claude.ai.

| On the consent screen | Verified app | Unverified app |
|---|---|---|
| Logo | The vendor's logo | A generic assistant icon, never the app's own |
| Heading | "Claude wants to connect to OpenSMS" | "An unverified app wants access" |
| Name | The vendor's product name and publisher | The name the app gave itself, in quotes, labelled "Calls itself" |
| Where the sign-in returns | The vendor's domain | The domain in bold, or "This device" for local tools |
| To approve | **Allow access** | Tick **I trust this app**, then **Allow unverified app** |

An unverified app whose name contains a verified app's name or "OpenSMS" is shown as "Unknown app". Local tools such as Claude Code, and editors that sign in through a callback on your own computer, always show as unverified, because any program on the machine could claim that address. Approve one only if you started the connection yourself.

### What protects your workspace

- **No token passthrough.** The assistant's token works only on the MCP server. Each tool call runs the normal REST endpoint with an internal API key that belongs to the connection, is never shown to anyone, and is hidden from the API key list. Every message an assistant sends is attributed to that connection.
- **Same checks as API keys.** Scopes, sender ID rules, compliance, spend caps and rate limits are the REST API's own, not a second copy.
- **PKCE and exact redirects.** Every sign-in uses PKCE (`S256`), redirect addresses must match exactly, and authorization codes last 60 seconds and work once.
- **Rotating refresh tokens** with reuse detection, as above.
- **Rate limits on sign-in endpoints**: registration, authorization, token and revocation are all limited per IP address and per client. Hosted assistants that call from a published shared network (such as Anthropic's) are counted per network with a larger budget, so one busy assistant cannot lock out the rest, and the per-client and overall limits still apply.
- **Audit trail.** Approvals, denials, token issues, revocations and every spending tool call are written to the workspace audit log. The connection's activity log records each tool call's outcome, but never message text, phone numbers or OTP codes.
- **No cookies on the MCP endpoints.** `/mcp` and `/oauth/` strip and never read the web app's session cookie, so another site cannot ride your signed-in session.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The assistant keeps asking you to sign in (a `401` loop) | The connection was revoked, replaced by a newer one, or its refresh token was reused (for example two copies of the same client config). Remove the connector in the client and connect again. |
| "invalid_redirect_uri" or an OpenSMS error page instead of the consent screen | The client's sign-in address does not match what it registered. Update the client, or remove and re-add the server so it registers again. |
| `invalid_scope` | The client asked for a scope outside the seven above, often `*` or `keys:admin`. Configure it to request only the scopes listed in [Scopes](#scopes), or none for the default set. |
| "Only owners and admins can connect live" | Ask an owner or admin to connect, or use sandbox. |
| "This workspace is not live yet" | Live is available once the workspace [goes live](../getting-started/going-live.md). |
| The consent link says it expired | Consent links last 10 minutes and work once. Start the connection again from the assistant. |
| Authenticator code refused | Check your device clock is set automatically. After 5 wrong codes, wait 10 minutes. |
| Tools missing from the list | The connection lacks a scope the tool needs (see the Scope column in [Tools](#tools)). For example `get_balance` needs `wallet:read`, which only owners and admins can grant, and `create_batch` needs both `messages:write` and `messages:read`, so it disappears if you untick **Read messages**. Disconnect and connect again with the scopes ticked. |
| "Permission missing" (`insufficient_scope`) | The action needs a scope this connection was not given; the connection itself is fine. Connect again with the permission ticked. A reconnect from the same registered client replaces the old connection; clients that register afresh each time (Claude does) leave the old one listed in **Connected AI apps**, so disconnect it there. |
| "This AI connection reached its daily spend cap" | Raise or clear the cap in **Connected AI apps**, or wait until midnight UTC. |

## For client authors

The server follows the MCP authorization spec (protocol versions `2025-06-18` and `2025-11-25` and later) with these endpoints on `https://opensms.io`:

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/oauth-protected-resource/mcp` (and `/.well-known/oauth-protected-resource`) | Protected resource metadata (RFC 9728) |
| `GET /.well-known/oauth-authorization-server` | Authorization server metadata (RFC 8414) |
| `POST /oauth/register` | Dynamic client registration (RFC 7591). Public clients only: `token_endpoint_auth_method` is always `none`. |
| `GET /oauth/authorize` | Authorization code with PKCE `S256`. `resource` must be `https://opensms.io/mcp` if sent. |
| `POST /oauth/token` | `authorization_code` and `refresh_token` grants |
| `POST /oauth/revoke` | Token revocation (RFC 7009) |
| `POST /mcp` | MCP over Streamable HTTP, stateless, JSON responses. An authenticated `GET` or `DELETE` returns `405`; without a valid token they get the same `401` challenge as `POST`, because authentication runs first. A request with an `Origin` header other than OpenSMS's own gets `403` (`forbidden_origin`): clients call this endpoint server to server, not from a web page. |

An unauthenticated `POST /mcp` returns `401` with a `WWW-Authenticate: Bearer resource_metadata="https://opensms.io/.well-known/oauth-protected-resource/mcp"` header, which is where a client starts discovery. Redirect URIs must be `https`, or loopback `http` redirects as in RFC 8252 section 7.3 (the port may differ between registration and sign-in). Custom schemes are accepted only for exact addresses on the verified list. The authorization response includes `iss`. Client ID metadata documents are planned but not supported yet.

The server is stateless and answers with JSON, never a stream. `initialize` declares the `tools`, `resources` and `prompts` capabilities without `listChanged`, because it never sends list-changed notifications: the lists are fixed for the life of a token, and a different set of permissions is a new connection.

These are the real responses from the test run, with the test server's origin written as `https://opensms.io`.

Protected resource metadata (`GET /.well-known/oauth-protected-resource/mcp`):

```json
{"resource": "https://opensms.io/mcp",
 "authorization_servers": ["https://opensms.io"],
 "bearer_methods_supported": ["header"],
 "resource_name": "OpenSMS",
 "resource_documentation": "https://docs.opensms.io/integrate/mcp",
 "scopes_supported": ["messages:read", "pricing:read", "sender-ids:read", "lookup:read", "wallet:read", "messages:write", "lookup:request"]}
```

Authorization server metadata (`GET /.well-known/oauth-authorization-server`):

```json
{"issuer": "https://opensms.io",
 "authorization_endpoint": "https://opensms.io/oauth/authorize",
 "token_endpoint": "https://opensms.io/oauth/token",
 "registration_endpoint": "https://opensms.io/oauth/register",
 "revocation_endpoint": "https://opensms.io/oauth/revoke",
 "response_types_supported": ["code"],
 "response_modes_supported": ["query"],
 "grant_types_supported": ["authorization_code", "refresh_token"],
 "code_challenge_methods_supported": ["S256"],
 "token_endpoint_auth_methods_supported": ["none"],
 "revocation_endpoint_auth_methods_supported": ["none"],
 "authorization_response_iss_parameter_supported": true,
 "scopes_supported": ["messages:read", "pricing:read", "sender-ids:read", "lookup:read", "wallet:read", "messages:write", "lookup:request"],
 "service_documentation": "https://docs.opensms.io/integrate/mcp"}
```

Registration (`POST /oauth/register`) answers `201` and echoes the client with its new `client_id` (the test client's loopback redirect is written here as `https://client.example/oauth/callback`):

```json
{"client_id": "osc_RmagvqwWaIORHiJF0p10YIRXZ1ZCVk1oZPDELSpFwXg", "client_id_issued_at": 1790288728,
 "client_name": "OpenSMS docs sample", "redirect_uris": ["https://client.example/oauth/callback"],
 "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"],
 "token_endpoint_auth_method": "none"}
```

The code exchange (`POST /oauth/token`, form encoded, with `code_verifier` and `resource`) returns the scopes actually granted, which can be fewer than the client asked for if you untick some (tokens shortened here):

```json
{"access_token": "osm_at_...", "token_type": "Bearer", "expires_in": 600,
 "refresh_token": "osm_rt_...", "scope": "messages:read pricing:read sender-ids:read wallet:read messages:write"}
```

A request without a token, or with a revoked one, gets the challenge. After a revoke it starts with `error="invalid_token"`:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token", resource_metadata="https://opensms.io/.well-known/oauth-protected-resource/mcp", scope="messages:read messages:write pricing:read sender-ids:read"
```

## Related

- [AI assistants in the web app](../console/ai-assistants.md): the Connect page, consent screen and Connected AI apps.
- [Authentication](authentication.md) for API keys and scopes.
- [Rate limits and idempotency](rate-limits-and-idempotency.md).
- [Errors](errors.md) for the problem codes tools pass through.
