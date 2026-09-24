# Dashboard

The dashboard is the first page every operator sees after signing in (`/admin`). It gives a quick count of workspaces, providers, countries and routes, plus how many incidents and alert rules exist and the status of each provider. It is for every role, as a starting point before you open a detailed page. It has no actions of its own.

![Dashboard with counters and provider health](../assets/screens/admin/dashboard.png)

## What each part shows

| Tile | What it counts | Where the number comes from |
|---|---|---|
| Workspaces | Workspaces that are not deleted | `GET /admin/v1/workspaces?limit=200`. The tile counts one page, so it stops at 200. Use [Workspaces](workspaces.md) for the real list. |
| Active providers | Providers with status `active`, and the total underneath | `GET /admin/v1/providers` |
| Countries covered | Countries with status `active`, and the total underneath | The public catalogue `GET /v1/countries`, the same list customers see. Countries that are hidden from customers are not in the total; see [Countries](countries.md) for all of them. |
| Healthy routes | Routes whose effective health (manual override if set, otherwise automatic) is `healthy`, and the total | `GET /admin/v1/routes`. Disabled routes are counted too. |
| Incidents | Every incident, resolved ones included | `GET /admin/v1/incidents` (ops and superadmin only) |
| Alert rules | Alert rules you are allowed to see | `GET /admin/v1/alerts` (ops, finance and superadmin) |
| Provider health | One row per provider: protocol, adapter and status | `GET /admin/v1/providers` |

For `finance` and `support`, the Incidents tile cannot load because the API refuses that role (and for `support`, Alert rules too).

## Typical use

1. Open the dashboard and compare **Healthy routes** with the total. A gap means some routes are degraded or down: go to [Routes](routes.md) and look at the Health column.
2. Check the provider list for any provider that should be `active` but shows `PENDING INTEGRATION`, `TESTING` or `DISABLED`. Open it from [Providers](providers.md).
3. If there is an open incident, go to [Incidents](incidents.md) to post an update.
4. Use the bell in the header to open your [notification inbox](notifications.md). A dot on the bell means there are unread notifications.

## Related

- [Routes](routes.md), [Providers](providers.md), [Incidents](incidents.md), [Notifications](notifications.md)
