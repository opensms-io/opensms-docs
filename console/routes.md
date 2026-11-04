# Routes

A route is the path a message takes to a phone through a messaging provider and mobile carrier. Open **Routes** under **Messaging** (`/app/routes`) to check the destinations and carrier options currently available to your workspace.

## Check destination availability

Select a country and review its carrier options, availability and customer price where one can be quoted. These are customer routing options, not a supplier catalogue. Supplier costs, credentials and internal route IDs are not exposed.

A country being listed or selected during [onboarding](onboarding.md) does not establish a working route. Sending also requires an eligible destination, approved sender, healthy route and verified price. An unavailable option or missing price requires a fresh check before sending.

## How a route is selected

OpenSMS selects an eligible route for the destination and sender under your workspace routing policy. The sender you choose can affect which routes are eligible and the price. An approved sender name does not by itself prove which route was used.

Owners and admins control **Allow provider fallback**. When enabled, another eligible route may be attempted if the preferred submission fails. With fallback blocked, OpenSMS does not automatically switch to another provider. A saved preferred provider, where configured, is a preference only and cannot bypass sender, destination, health or pricing checks. Changes apply to future accepted messages; queued messages keep their accepted policy.

## Domestic, international and premium pricing

Route scope describes the verified route design: **Domestic**, **International** or **Global**. An unknown or mixed scope stays unclassified. Global scope does not mean every country or carrier is available. Premium pricing is separate from scope: a premium rate alone does not establish that a route is international or global.

The current Kenya standard rate is **KES 0.60 per SMS part**. For the currently verified premium Kenya Safaricom option, the rate is **USD 0.30 per part**, converted into the workspace currency using the configured exchange rate. Recent verified charges were **KES 38.937 per part**. That is a recorded example, not a fixed KES rate or a price for every destination. Available routes, workspace prices and exchange rates can change.

Review the current estimate for the actual recipient, sender and text before sending. Long messages cost more because each SMS part is billed. The send response records the locked total price; see [Billing](billing.md#sms-prices-and-parts) and the [API quote example](../integrate/sending-messages.md#preview-the-price).

## Confirm what happened

The message and its attempt history show the recorded route scope and pricing classification when sufficient routing evidence exists. An unattempted or uncertain message can remain unclassified. A route attempt is not proof of delivery; use the message status and delivery report.

## Related

- [Messages](messages.md)
- [Billing](billing.md)
- [Notifications](notifications.md)
