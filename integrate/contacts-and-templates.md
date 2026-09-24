# Contacts and templates

opensms can store your recipients as contacts, group them, keep reusable message templates with `{{variables}}`, and send a template to a whole group in one call. This page is for developers who want opensms to hold audience data instead of passing every number and text on each request. If you already keep recipients in your own database, you can ignore this and use [single sends or batches](sending-messages.md).

Contacts, groups and templates belong to one workspace **and one environment**: sandbox records are invisible to live keys and the other way round.

| Resource | Key scope | Session roles |
| --- | --- | --- |
| Contacts and groups | `contacts:manage` | All members read; owner, admin and developer write |
| Templates | `templates:manage` | All members read; owner, admin and developer write |
| Sending to a group | `contacts:manage` and `messages:write`, plus `templates:manage` when using `template_id` | Owner, admin, developer |

Every `POST` on these resources requires `Idempotency-Key`. Lists return `{items, next_cursor}` with `limit` (1 to 200, default 50) and `cursor`.

## Templates

```sh
curl -s -X POST $OPENSMS_API/v1/templates \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: tpl-1' \
  -d '{"name":"order_shipped","body":"Hi {{name}}, order {{order_id}} has shipped."}'
```

```json
{
  "id": "fee8f573-eba3-4b16-954c-b464688ef84d",
  "workspace_id": "29ce64bb-8ec7-424f-8f44-9c0f22393323",
  "name": "order_shipped",
  "body": "Hi {{name}}, order {{order_id}} has shipped.",
  "traffic_type": "transactional",
  "created_at": "2026-09-24T07:27:21.238873+03:00",
  "updated_at": "2026-09-24T07:27:21.238873+03:00",
  "variables": ["name", "order_id"]
}
```

| Field | Rules |
| --- | --- |
| `name` | Required, 1 to 100 characters, unique per workspace and environment. A duplicate returns `409` `"Template name already exists in this environment."` |
| `body` | Required, 1 to 10000 characters. Placeholders are `{{variable_name}}`: 1 to 64 ASCII letters, digits or underscores, starting with a letter or underscore, at most 50 distinct names. |
| `traffic_type` | `transactional` (default), `otp` or `marketing`. |

`variables` is computed from the body. Other calls:

| Call | Notes |
| --- | --- |
| `GET /v1/templates`, `GET /v1/templates/{id}` | Read. |
| `PATCH /v1/templates/{id}` | Change any of `name`, `body`, `traffic_type`. |
| `DELETE /v1/templates/{id}` | Soft delete (`204`); messages already sent keep their reference. |

`PATCH` with a new body:

```sh
curl -s -X PATCH $OPENSMS_API/v1/templates/fee8f573-eba3-4b16-954c-b464688ef84d \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"body":"Hi {{name}}, order {{order_id}} is on its way."}'
```

```json
{"id":"fee8f573-eba3-4b16-954c-b464688ef84d","workspace_id":"29ce64bb-8ec7-424f-8f44-9c0f22393323","name":"order_shipped","body":"Hi {{name}}, order {{order_id}} is on its way.","traffic_type":"transactional","created_at":"2026-09-24T07:27:21.238873+03:00","updated_at":"2026-09-24T07:27:21.77271+03:00","variables":["name","order_id"]}
```

Templates are used by [group sends](#sending-to-a-group). `POST /v1/messages` and batches take literal `text` only; render templates yourself if you send that way.

## Contacts

```sh
curl -s -X POST $OPENSMS_API/v1/contacts \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: c-1' \
  -d '{"e164":"+254700000001","name":"Wanjiku","attributes":{"order_id":"A-1001"}}'
```

```json
{"id":"e6214f06-c57c-4cc0-90b1-ccd9b0561abc","e164":"+254700000001","name":"Wanjiku","attributes":{"order_id":"A-1001"},"created_at":"2026-09-24T04:27:22.034197+00:00","workspace_id":"29ce64bb-8ec7-424f-8f44-9c0f22393323"}
```

| Field | Rules |
| --- | --- |
| `e164` | Required on create. Unique per workspace and environment; a duplicate returns `409` `"A record with this phone number or name already exists."` |
| `name` | Optional, up to 200 characters, nullable. |
| `attributes` | Optional JSON object. String values can fill template variables. |

`PATCH /v1/contacts/{id}` replaces only the fields you send. Sending `attributes` replaces the whole object:

```sh
curl -s -X PATCH $OPENSMS_API/v1/contacts/e6214f06-c57c-4cc0-90b1-ccd9b0561abc \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"attributes":{"order_id":"A-1001","tier":"gold"}}'
```

```json
{"id":"e6214f06-c57c-4cc0-90b1-ccd9b0561abc","e164":"+254700000001","name":"Wanjiku","attributes":{"tier":"gold","order_id":"A-1001"},"created_at":"2026-09-24T04:27:22.034197+00:00","workspace_id":"29ce64bb-8ec7-424f-8f44-9c0f22393323"}
```

`DELETE /v1/contacts/{id}` returns `204` and removes the contact from its groups.

## Contact groups

```sh
curl -s -X POST $OPENSMS_API/v1/contact-groups \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: g-1' \
  -d '{"name":"Shipped today","contact_ids":["e6214f06-c57c-4cc0-90b1-ccd9b0561abc","7df47b64-8c4b-42de-8d91-5ae362dee844"]}'
```

```json
{"id":"783c8d54-e7d1-4b74-810a-371ddb657b95","name":"Shipped today","created_at":"2026-09-24T04:27:22.60256+00:00","contact_ids":["7df47b64-8c4b-42de-8d91-5ae362dee844","e6214f06-c57c-4cc0-90b1-ccd9b0561abc"],"workspace_id":"29ce64bb-8ec7-424f-8f44-9c0f22393323"}
```

`name` is required and unique per environment. `contact_ids` holds up to 1000 unique contacts from the same workspace and environment. `PATCH` with `contact_ids` replaces the whole membership (an empty array empties the group). `DELETE` returns `204`.

## Sending to a group

`POST /v1/contact-groups/{id}/send` with an `Idempotency-Key` and exactly one of `text` or `template_id`:

```sh
curl -s -X POST $OPENSMS_API/v1/contact-groups/783c8d54-e7d1-4b74-810a-371ddb657b95/send \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: gs-1' \
  -d '{"template_id":"fee8f573-eba3-4b16-954c-b464688ef84d"}'
```

| Field | Meaning |
| --- | --- |
| `text` or `template_id` | The message, literal or from a template. |
| `variables` | Optional object of string values that override every contact's values. |
| `sender_id`, `traffic_type` | As for [single sends](sending-messages.md#request). |

For each variable in the body, the value comes from `variables` if given, otherwise `name` is the contact's name, `e164` is the contact's number, and any other name is taken from the contact's string attribute of that name. If any contact is missing a value, nothing is sent and the call returns `422` `"A contact is missing required template variables."` A group must have 1 to 1000 contacts.

The call snapshots the group and runs it as a [batch](sending-messages.md#batches): it creates the batch and starts it at once. The `200` response is the batch. A retry with the same key reuses the original snapshot even if the contacts or template changed since.

On the local docs stack every recipient is refused by the email-verification gate, so the real response is a `failed` batch with both rows invalid:

```json
{"id":"c9a71ef7-0d1c-465b-857c-5f036741a166","status":"failed","total":2,"sent":0,"delivered":0,"failed":0,"invalid":2,"duplicates":0,"suppressed":0,"estimated_cost":0,"created_at":"2026-09-24T07:27:22.833971+03:00"}
```

Use `GET /v1/batches/{id}/validation` to see each row's reason and `GET /v1/batches/{id}/items` for the messages created.

## Idempotency on these endpoints

Create calls replay the original `201` for the same key and body. The same key with a different body returns `409`, for example `"Idempotency key used with different template details."` A deleted record is not recreated by replaying its create call.
