# AI assistants

You can let an AI assistant such as Claude, ChatGPT, Cursor or VS Code send messages and check delivery for your workspace. This guide covers the three places in the web app that control it: the **AI assistants** page with setup steps for each assistant, the consent screen you see when an assistant asks for access, and **Connected AI apps** in Settings, where you see what each assistant did, change its limits or disconnect it. It is for anyone who connects an assistant, and for owners and admins who keep an eye on them.

> **Not deployed yet.** AI assistant access is built and tested, but it is not switched on at opensms.io yet, so these pages are not in the web app you use today. The screens below are the ones that will ship. The developer reference is [AI assistants (MCP)](../integrate/mcp.md).

## Before you start

- **Try it in sandbox first.** A sandbox connection uses simulated delivery and sandbox credit, so nothing reaches a real phone.
- **Live needs an owner or admin with two-factor login.** Connecting an assistant to live traffic asks for a code from your authenticator app. Turn on [two-factor authentication](settings.md#security) before you start.
- **Nothing to copy from API keys.** You never paste an API key into an assistant. The assistant asks OpenSMS for access, and you approve it in your browser.

## Connect an assistant

Open **AI assistants** in the left-hand menu, under **Developer** (`/app/ai-assistants`).

1. At the top of the page is the server address, `https://opensms.io/mcp`, with a **Copy** button.
2. Choose your assistant from the tiles: Claude, ChatGPT, Claude Code, Cursor, VS Code, Windsurf, Zed or Other. The steps below the tiles change to match, and the page address remembers your choice (for example `?client=cursor`), so you can send the link to a colleague.
3. Follow the numbered steps. Where the assistant uses a settings file, the page shows it in a code block with its own **Copy** button.
4. When the assistant opens the OpenSMS consent screen in your browser, carry on with [the consent screen](#the-consent-screen) below.

The page also lists what an assistant can do (one card per tool) and three ways you stay in control: you choose the permissions, you can set a daily spending limit, and you can disconnect at any time.

The same steps, with the exact settings for each assistant, are in the [developer guide](../integrate/mcp.md#connect-your-assistant).

## The consent screen

When an assistant asks for access, your browser opens the OpenSMS consent screen. If you are not signed in, OpenSMS asks you to sign in first (including two-factor login and choosing a workspace) and then brings you back to the same screen. The link works once and expires after 10 minutes; if it has expired, start the connection again from the assistant.

From top to bottom:

1. **Who is asking.** The OpenSMS logo, a dotted line, and the assistant's logo. Only apps OpenSMS has verified show a logo; everything else shows a plain assistant icon.
2. **Heading.** For a verified app, for example "Claude wants to connect to OpenSMS". Under it, the email you are signed in with and a **Not you?** link to switch accounts.
3. **Identity.** A **Verified by OpenSMS** badge with the publisher (for example Anthropic) and the website the sign-in returns to. For an unverified app, see [the warning below](#unverified-apps).
4. **Workspace.** Pick the workspace the assistant may use. Each connection is for one workspace only.
5. **Environment.** **Sandbox** ("Simulated. No real SMS.") or **Live** ("Real SMS, spends credit."). Live is greyed out with the reason when you cannot choose it: "Only owners and admins can connect live" or "This workspace is not live yet".
6. **This app will be able to.** One row per permission the assistant asked for, grouped under **View** and **Send and spend**, each with a short description and a risk label (Low, Medium or High; sending is High in live). Untick anything you do not want to allow. At least one must stay ticked, and you can never add a permission the assistant did not ask for.
7. **Limits.** A **daily spend cap** in your workspace currency (leave it empty for no cap) and a **send rate** of 5, 10, 30 or 60 messages a minute (10 by default). This section is open by default for Live. The cap only stops sends on a **Live** connection: sandbox messages are free, so a sandbox send is never refused by the cap (the assistant can still read the cap and today's spend, which stays at 0, with `get_balance`).
8. **Authenticator code** (Live only). The 6-digit code from your authenticator app. Five wrong codes in 10 minutes lock the check for a while.
9. **Replaces your current connection.** If this assistant is already connected to the same workspace and environment, a note says the new connection replaces it.
10. **Buttons.** **Cancel** tells the assistant you said no. **Allow access** approves and sends you back to the assistant.

A line at the bottom reminds you that you can disconnect at any time, and that the assistant's access renews itself every 10 minutes while it stays connected.

The permissions in plain words:

| Permission | What the assistant can do |
|---|---|
| Read messages | See messages you sent and their delivery status |
| Send SMS and verification codes | Send messages and one-time passcodes, and start batches. Uses wallet credit. |
| See prices | See your per-country SMS prices to estimate cost |
| See sender IDs | See your sender IDs and whether they are approved |
| Read number lookups | See the results of number lookups already run |
| Run paid number lookups | Check a phone number's carrier and status. Each lookup is charged. |
| See wallet balance | See your wallet balance and today's spend (owners and admins only) |

An assistant can never create API keys, top up or change the wallet, change webhooks, or manage numbers, contacts, templates or compliance settings.

### Unverified apps

Any program can call itself "Claude". OpenSMS only trusts what it can check: where the sign-in returns to. When it cannot confirm an app, the consent screen changes:

- The heading reads **An unverified app wants access** and there is no logo.
- A red notice says: "OpenSMS has not verified this app. Its name is self-reported. Only continue if you started this connection yourself."
- The app's own name appears in quotes after **Calls itself**, and the website it returns to is shown in bold. For a tool running on your own computer (such as Claude Code or an editor) it says **This device** instead.
- If the name looks like a well-known assistant or like OpenSMS, the heading says **Unknown app**.
- You must tick **I trust this app** before **Allow unverified app** can be selected.

Local tools like Claude Code always show as unverified, because any program on your computer could use the same return address. That is expected: approve them if you just started the connection yourself.

## Connected AI apps

Open **Settings** and choose **Connected AI apps** (`/app/settings/ai-apps`). Owners and admins see every assistant connected to the workspace; other members see only the ones they connected.

Each connection is a card showing:

- The assistant's logo (verified apps) or a plain icon, its name, a **Verified** or **Unverified** badge, and a **Sandbox** or **Live** tag.
- Its permissions (the first three, then "+N"), who connected it and when, and when it was last used.
- Today's spending against its daily cap as a bar that turns amber from 80% and red at 100%.

The menu on each card has three actions:

| Action | What it does |
|---|---|
| **View activity** | Every tool the assistant ran, newest first, 25 at a time: the tool, whether it worked, when, and a link to the message, passcode, lookup or batch it touched. Message text, phone numbers and codes are never stored here. |
| **Edit limits** | Change the daily spend cap and the send rate. The person who connected it can lower them; raising them needs an owner or admin. |
| **Disconnect** | After you confirm ("Claude will lose access immediately. Messages already sent are not affected."), the assistant stops working on its next request. |

If nothing is connected, the page says **No AI apps connected** with a button to the **AI assistants** page.

Connections also end on their own when the person who made them leaves the workspace or loses the role they need, when the workspace is deleted, after 180 days, or when OpenSMS detects a stolen token being reused. In that last case you and the workspace owners get a notification.

## Related

- [AI assistants (MCP)](../integrate/mcp.md): the developer reference, with every tool, limit and error.
- [API keys](api-keys.md): for your own software rather than an assistant.
- [Sandbox](sandbox.md): where sandbox passcodes and messages appear.
- [Settings](settings.md#security): turning on two-factor authentication.
