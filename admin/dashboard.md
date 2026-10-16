# Dashboard

The admin dashboard at `/admin` starts with the business figures for finance administrators and superadmins. Operations and support administrators see links to the review queues available to their role. Financial data is private to finance administrators and superadmins.

## Financial overview

Choose **Month to date**, **Last 7 days**, **Last 30 days**, or **Last 90 days**. The dashboard defaults to month to date in KES. Reporting days follow Africa/Nairobi time, and the current day runs up to the report's refresh time.

Currencies are reported separately. Changing the currency selects a different set of live transactions; it does not convert the entire business using a current exchange rate. Sandbox activity is excluded.

| Figure | Meaning |
|---|---|
| Revenue | Posted customer charges less recorded refunds in the selected period. Wallet top-ups are excluded. Paid sender packages awaiting carrier submission are deferred. |
| Recorded supplier cost | Supplier costs recorded for activity in the selected period. Costs are dated independently of customer charges, so billable retries and failed attempts can still contribute costs. |
| Gross profit | Revenue less supplier costs, before overhead and unrecorded payment processing fees. Unavailable when required costs are missing. This is an operational figure, not a formal net-profit statement. |
| Customer funding received | Gross confirmed customer top-ups during the period, shown separately from revenue. This does not deduct payment reversals, chargebacks, or processing fees and is not net cash flow. |
| Available wallet credits | Current live wallet credits available for spending. Reserved credits are shown separately. These balances can include administrative credits and are not a bank balance. |
| Unpaid sender invoices | Current sender registration invoices awaiting payment. |
| Deferred sender payments | Paid sender packages awaiting carrier submission. These payments have not yet been included in dashboard revenue. |

**Daily trend** compares revenue with recorded supplier cost. Use the day control to inspect a date, or expand **View daily figures** for a table. The **By product** section separates SMS, number lookups, sender registrations, numbers, and other fees.

Read the cost-coverage labels before relying on gross profit. Missing costs are not treated as zero. Expand **How these figures are calculated** for the reporting basis.

## Needs attention

The dashboard links to payment reviews, sender invoices, workspace verifications, live applications, sender ID requests, incidents, and notifications as permitted by your role. Open the relevant queue for its current items and decisions.

Technical provider health and routing details remain available on their dedicated admin pages.

## Refresh and errors

Use **Refresh** to load a new snapshot. Changing the period or currency also refreshes the financial overview. If the report cannot load, use **Retry financial overview**. An unavailable report is not displayed as zero revenue.

## Related

- [Payments](payments.md)
- [Pricing](pricing.md)
- [Workspaces](workspaces.md)
- [Providers](providers.md)
- [Routes](routes.md)
- [Notifications](notifications.md)
