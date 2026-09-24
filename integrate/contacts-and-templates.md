# Contacts and templates

OpenSMS can store your recipients as contacts, group them, keep reusable message templates with `{{variables}}`, and send a template to a whole group in one call. This page is for developers who want OpenSMS to hold audience data instead of passing every number and text on each request. If you already keep recipients in your own database, you can ignore this and use [single sends or batches](sending-messages.md).

Contacts, groups and templates belong to one workspace **and one environment**: sandbox records are invisible to live keys and the other way round.

| Resource | Key scope | Session roles |
| --- | --- | --- |
| Contacts and groups | `contacts:manage` | All members read; owner, admin and developer write |
| Templates | `templates:manage` | All members read; owner, admin and developer write |
| Sending to a group | `contacts:manage` and `messages:write`, plus `templates:manage` when using `template_id` | Owner, admin, developer |

Every `POST` on these resources requires `Idempotency-Key`. Lists return `{items, next_cursor}` with `limit` (1 to 200, default 50) and `cursor`.

The examples use the [SDKs](sdk.md) or cURL. Each SDK sends an `Idempotency-Key` on its own; the examples pass one derived from the record, so a rerun of the same code replays instead of creating a duplicate.

## Templates

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/templates \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: template-order-shipped' \
  -d '{"name":"order_shipped","body":"Hi {{name}}, order {{order_id}} has shipped."}'
```

```ts tab="TypeScript" logo="typescript" title="template.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const template = await opensms.templates.create(
  { name: 'order_shipped', body: 'Hi {{name}}, order {{order_id}} has shipped.' },
  { idempotencyKey: 'template-order-shipped' },
);

console.log(template.id, template.variables);
```

```python tab="Python" logo="python" title="template.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

template = client.templates.create(
    name="order_shipped",
    body="Hi {{name}}, order {{order_id}} has shipped.",
    idempotency_key="template-order-shipped",
)

print(template["id"], template["variables"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

tpl, err := client.Templates.Create(context.Background(), opensms.CreateTemplateParams{
	Name: "order_shipped",
	Body: "Hi {{name}}, order {{order_id}} has shipped.",
}, opensms.WithIdempotencyKey("template-order-shipped"))
if err != nil {
	log.Fatal(err)
}
log.Println(tpl.ID, tpl.Variables)
```

```php tab="PHP" logo="php" title="template.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$template = $opensms->templates->create([
    'name' => 'order_shipped',
    'body' => 'Hi {{name}}, order {{order_id}} has shipped.',
], ['idempotencyKey' => 'template-order-shipped']);

echo $template['id'], ' ', implode(',', $template['variables']), PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Template template = opensms.templates().create(
    new TemplateParams().name("order_shipped").body("Hi {{name}}, order {{order_id}} has shipped."),
    RequestOptions.idempotencyKey("template-order-shipped"));

System.out.println(template.id + " " + template.variables);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var template = await client.Templates.CreateAsync(
    new CreateTemplateParams { Name = "order_shipped", Body = "Hi {{name}}, order {{order_id}} has shipped." },
    new RequestOptions { IdempotencyKey = "template-order-shipped" });

Console.WriteLine($"{template.Id} {string.Join(",", template.Variables ?? new())}");
```

```ruby tab="Ruby" logo="ruby" title="template.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

template = client.templates.create(
  name: "order_shipped",
  body: "Hi {{name}}, order {{order_id}} has shipped.",
  idempotency_key: "template-order-shipped"
)

puts template[:id], template[:variables].inspect
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let template = client
    .templates()
    .create_with(
        &CreateTemplate {
            name: "order_shipped".into(),
            body: "Hi {{name}}, order {{order_id}} has shipped.".into(),
            traffic_type: None,
        },
        &RequestOptions::idempotency_key("template-order-shipped"),
    )
    .await?;

println!("{} {:?}", template.id, template.variables.as_deref().unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let template = try await opensms.templates.create(
    name: "order_shipped",
    body: "Hi {{name}}, order {{order_id}} has shipped.",
    idempotencyKey: "template-order-shipped"
)

print(template.id, template.variables ?? [])
```
<!-- /tabs -->

```json
{
  "id": "cdec129b-bac3-40ad-bce7-37174580b65a",
  "workspace_id": "d75af78f-6268-42bf-a11f-000b5d922f3c",
  "name": "order_shipped",
  "body": "Hi {{name}}, order {{order_id}} has shipped.",
  "traffic_type": "transactional",
  "created_at": "2026-09-24T14:42:55.78489+03:00",
  "updated_at": "2026-09-24T14:42:55.78489+03:00",
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

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X PATCH $OPENSMS_API/v1/templates/cdec129b-bac3-40ad-bce7-37174580b65a \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"body":"Hi {{name}}, order {{order_id}} is on its way."}'
```

```ts tab="TypeScript" logo="typescript" title="template.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const template = await opensms.templates.update('cdec129b-bac3-40ad-bce7-37174580b65a', {
  body: 'Hi {{name}}, order {{order_id}} is on its way.',
});

console.log(template.body, template.updatedAt);
```

```python tab="Python" logo="python" title="template.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

template = client.templates.update(
    "cdec129b-bac3-40ad-bce7-37174580b65a",
    body="Hi {{name}}, order {{order_id}} is on its way.",
)

print(template["body"], template["updated_at"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

tpl, err := client.Templates.Update(context.Background(), "cdec129b-bac3-40ad-bce7-37174580b65a",
	opensms.UpdateTemplateParams{Body: "Hi {{name}}, order {{order_id}} is on its way."})
if err != nil {
	log.Fatal(err)
}
log.Println(tpl.Body, tpl.UpdatedAt)
```

```php tab="PHP" logo="php" title="template.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$template = $opensms->templates->update('cdec129b-bac3-40ad-bce7-37174580b65a', [
    'body' => 'Hi {{name}}, order {{order_id}} is on its way.',
]);

echo $template['body'], ' ', $template['updated_at'], PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Template template = opensms.templates().update("cdec129b-bac3-40ad-bce7-37174580b65a",
    new TemplateParams().body("Hi {{name}}, order {{order_id}} is on its way."));

System.out.println(template.body + " " + template.updatedAt);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var template = await client.Templates.UpdateAsync("cdec129b-bac3-40ad-bce7-37174580b65a",
    new UpdateTemplateParams { Body = "Hi {{name}}, order {{order_id}} is on its way." });

Console.WriteLine($"{template.Body} {template.UpdatedAt}");
```

```ruby tab="Ruby" logo="ruby" title="template.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

template = client.templates.update(
  "cdec129b-bac3-40ad-bce7-37174580b65a",
  body: "Hi {{name}}, order {{order_id}} is on its way."
)

puts template[:body], template[:updated_at]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let template = client
    .templates()
    .update(
        "cdec129b-bac3-40ad-bce7-37174580b65a",
        &UpdateTemplate {
            body: Some("Hi {{name}}, order {{order_id}} is on its way.".into()),
            ..Default::default()
        },
    )
    .await?;

println!("{} {}", template.body.as_deref().unwrap_or_default(), template.updated_at.as_deref().unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let template = try await opensms.templates.update(
    "cdec129b-bac3-40ad-bce7-37174580b65a",
    body: "Hi {{name}}, order {{order_id}} is on its way."
)

print(template.body ?? "", template.updatedAt as Any)
```
<!-- /tabs -->

```json
{"id":"cdec129b-bac3-40ad-bce7-37174580b65a","workspace_id":"d75af78f-6268-42bf-a11f-000b5d922f3c","name":"order_shipped","body":"Hi {{name}}, order {{order_id}} is on its way.","traffic_type":"transactional","created_at":"2026-09-24T14:42:55.78489+03:00","updated_at":"2026-09-24T14:43:03.568519+03:00","variables":["name","order_id"]}
```

Templates are used by [group sends](#sending-to-a-group). `POST /v1/messages` and batches take literal `text` only; render templates yourself if you send that way.

## Contacts

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/contacts \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: contact-254712345678' \
  -d '{"e164":"+254712345678","name":"Wanjiku","attributes":{"order_id":"A-1001"}}'
```

```ts tab="TypeScript" logo="typescript" title="contact.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const contact = await opensms.contacts.create(
  { e164: '+254712345678', name: 'Wanjiku', attributes: { order_id: 'A-1001' } },
  { idempotencyKey: 'contact-254712345678' },
);

console.log(contact.id);
```

```python tab="Python" logo="python" title="contact.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

contact = client.contacts.create(
    e164="+254712345678",
    name="Wanjiku",
    attributes={"order_id": "A-1001"},
    idempotency_key="contact-254712345678",
)

print(contact["id"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

contact, err := client.Contacts.Create(context.Background(), opensms.CreateContactParams{
	E164:       "+254712345678",
	Name:       "Wanjiku",
	Attributes: map[string]any{"order_id": "A-1001"},
}, opensms.WithIdempotencyKey("contact-254712345678"))
if err != nil {
	log.Fatal(err)
}
log.Println(contact.ID)
```

```php tab="PHP" logo="php" title="contact.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$contact = $opensms->contacts->create([
    'e164' => '+254712345678',
    'name' => 'Wanjiku',
    'attributes' => ['order_id' => 'A-1001'],
], ['idempotencyKey' => 'contact-254712345678']);

echo $contact['id'], PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Contact contact = opensms.contacts().create(
    new ContactParams().e164("+254712345678").name("Wanjiku")
        .attributes(Map.of("order_id", "A-1001")),
    RequestOptions.idempotencyKey("contact-254712345678"));

System.out.println(contact.id);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var contact = await client.Contacts.CreateAsync(new CreateContactParams
{
    E164 = "+254712345678",
    Name = "Wanjiku",
    Attributes = new Dictionary<string, object?> { ["order_id"] = "A-1001" },
}, new RequestOptions { IdempotencyKey = "contact-254712345678" });

Console.WriteLine(contact.Id);
```

```ruby tab="Ruby" logo="ruby" title="contact.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

contact = client.contacts.create(
  e164: "+254712345678",
  name: "Wanjiku",
  attributes: { order_id: "A-1001" },
  idempotency_key: "contact-254712345678"
)

puts contact[:id]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let contact = client
    .contacts()
    .create_with(
        &CreateContact {
            e164: "+254712345678".into(),
            name: Some("Wanjiku".into()),
            attributes: Some(serde_json::json!({ "order_id": "A-1001" })),
        },
        &RequestOptions::idempotency_key("contact-254712345678"),
    )
    .await?;

println!("{}", contact.id);
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let contact = try await opensms.contacts.create(
    e164: "+254712345678",
    name: "Wanjiku",
    attributes: ["order_id": "A-1001"],
    idempotencyKey: "contact-254712345678"
)

print(contact.id)
```
<!-- /tabs -->

```json
{"id":"a1bfb8ee-7966-4ae5-ad7a-85368e20a993","e164":"+254712345678","name":"Wanjiku","attributes":{"order_id":"A-1001"},"created_at":"2026-09-24T11:42:56.076182+00:00","workspace_id":"d75af78f-6268-42bf-a11f-000b5d922f3c"}
```

In Rust, `attributes` is a `serde_json::Value`, so add the `serde_json` crate to build it with `json!`.

| Field | Rules |
| --- | --- |
| `e164` | Required on create. Unique per workspace and environment; a duplicate returns `409` `"A record with this phone number or name already exists."` |
| `name` | Optional, up to 200 characters, nullable. |
| `attributes` | Optional JSON object. String values can fill template variables. |

`PATCH /v1/contacts/{id}` replaces only the fields you send. Sending `attributes` replaces the whole object:

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X PATCH $OPENSMS_API/v1/contacts/a1bfb8ee-7966-4ae5-ad7a-85368e20a993 \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -d '{"attributes":{"order_id":"A-1001","tier":"gold"}}'
```

```ts tab="TypeScript" logo="typescript" title="contact.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const contact = await opensms.contacts.update('a1bfb8ee-7966-4ae5-ad7a-85368e20a993', {
  attributes: { order_id: 'A-1001', tier: 'gold' },
});

console.log(contact.attributes);
```

```python tab="Python" logo="python" title="contact.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

contact = client.contacts.update(
    "a1bfb8ee-7966-4ae5-ad7a-85368e20a993",
    attributes={"order_id": "A-1001", "tier": "gold"},
)

print(contact["attributes"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

contact, err := client.Contacts.Update(context.Background(), "a1bfb8ee-7966-4ae5-ad7a-85368e20a993",
	opensms.UpdateContactParams{Attributes: map[string]any{"order_id": "A-1001", "tier": "gold"}})
if err != nil {
	log.Fatal(err)
}
log.Println(contact.Attributes)
```

```php tab="PHP" logo="php" title="contact.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$contact = $opensms->contacts->update('a1bfb8ee-7966-4ae5-ad7a-85368e20a993', [
    'attributes' => ['order_id' => 'A-1001', 'tier' => 'gold'],
]);

echo json_encode($contact['attributes']), PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Contact contact = opensms.contacts().update("a1bfb8ee-7966-4ae5-ad7a-85368e20a993",
    new ContactParams().attributes(Map.of("order_id", "A-1001", "tier", "gold")));

System.out.println(contact.attributes);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var contact = await client.Contacts.UpdateAsync("a1bfb8ee-7966-4ae5-ad7a-85368e20a993", new UpdateContactParams
{
    Attributes = new Dictionary<string, object?> { ["order_id"] = "A-1001", ["tier"] = "gold" },
});

Console.WriteLine(string.Join(", ", contact.Attributes!.Keys));
```

```ruby tab="Ruby" logo="ruby" title="contact.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

contact = client.contacts.update(
  "a1bfb8ee-7966-4ae5-ad7a-85368e20a993",
  attributes: { order_id: "A-1001", tier: "gold" }
)

puts contact[:attributes]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let contact = client
    .contacts()
    .update(
        "a1bfb8ee-7966-4ae5-ad7a-85368e20a993",
        &UpdateContact {
            attributes: Some(serde_json::json!({ "order_id": "A-1001", "tier": "gold" })),
            ..Default::default()
        },
    )
    .await?;

println!("{}", contact.attributes.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let contact = try await opensms.contacts.update(
    "a1bfb8ee-7966-4ae5-ad7a-85368e20a993",
    attributes: ["order_id": "A-1001", "tier": "gold"]
)

print(contact.attributes ?? [:])
```
<!-- /tabs -->

```json
{"id":"a1bfb8ee-7966-4ae5-ad7a-85368e20a993","e164":"+254712345678","name":"Wanjiku","attributes":{"tier":"gold","order_id":"A-1001"},"created_at":"2026-09-24T11:42:56.076182+00:00","workspace_id":"d75af78f-6268-42bf-a11f-000b5d922f3c"}
```

`DELETE /v1/contacts/{id}` returns `204` and removes the contact from its groups.

## Contact groups

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/contact-groups \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: group-shipped-today' \
  -d '{"name":"Shipped today","contact_ids":["a1bfb8ee-7966-4ae5-ad7a-85368e20a993","817d562e-b7d0-4791-a545-cb2593c7e8df"]}'
```

```ts tab="TypeScript" logo="typescript" title="group.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const group = await opensms.contactGroups.create(
  {
    name: 'Shipped today',
    contactIds: ['a1bfb8ee-7966-4ae5-ad7a-85368e20a993', '817d562e-b7d0-4791-a545-cb2593c7e8df'],
  },
  { idempotencyKey: 'group-shipped-today' },
);

console.log(group.id, group.contactIds);
```

```python tab="Python" logo="python" title="group.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

group = client.contact_groups.create(
    name="Shipped today",
    contact_ids=["a1bfb8ee-7966-4ae5-ad7a-85368e20a993", "817d562e-b7d0-4791-a545-cb2593c7e8df"],
    idempotency_key="group-shipped-today",
)

print(group["id"], group["contact_ids"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

group, err := client.ContactGroups.Create(context.Background(), opensms.CreateContactGroupParams{
	Name:       "Shipped today",
	ContactIDs: []string{"a1bfb8ee-7966-4ae5-ad7a-85368e20a993", "817d562e-b7d0-4791-a545-cb2593c7e8df"},
}, opensms.WithIdempotencyKey("group-shipped-today"))
if err != nil {
	log.Fatal(err)
}
log.Println(group.ID, group.ContactIDs)
```

```php tab="PHP" logo="php" title="group.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$group = $opensms->contactGroups->create([
    'name' => 'Shipped today',
    'contact_ids' => ['a1bfb8ee-7966-4ae5-ad7a-85368e20a993', '817d562e-b7d0-4791-a545-cb2593c7e8df'],
], ['idempotencyKey' => 'group-shipped-today']);

echo $group['id'], ' ', implode(',', $group['contact_ids']), PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

ContactGroup group = opensms.contactGroups().create(
    new ContactGroupParams().name("Shipped today").contactIds(List.of(
        "a1bfb8ee-7966-4ae5-ad7a-85368e20a993", "817d562e-b7d0-4791-a545-cb2593c7e8df")),
    RequestOptions.idempotencyKey("group-shipped-today"));

System.out.println(group.id + " " + group.contactIds);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var group = await client.ContactGroups.CreateAsync(new CreateContactGroupParams
{
    Name = "Shipped today",
    ContactIds = new[] { "a1bfb8ee-7966-4ae5-ad7a-85368e20a993", "817d562e-b7d0-4791-a545-cb2593c7e8df" },
}, new RequestOptions { IdempotencyKey = "group-shipped-today" });

Console.WriteLine($"{group.Id} {string.Join(",", group.ContactIds ?? new())}");
```

```ruby tab="Ruby" logo="ruby" title="group.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

group = client.contact_groups.create(
  name: "Shipped today",
  contact_ids: ["a1bfb8ee-7966-4ae5-ad7a-85368e20a993", "817d562e-b7d0-4791-a545-cb2593c7e8df"],
  idempotency_key: "group-shipped-today"
)

puts group[:id], group[:contact_ids].inspect
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let group = client
    .contact_groups()
    .create_with(
        &CreateContactGroup {
            name: "Shipped today".into(),
            contact_ids: Some(vec![
                "a1bfb8ee-7966-4ae5-ad7a-85368e20a993".into(),
                "817d562e-b7d0-4791-a545-cb2593c7e8df".into(),
            ]),
        },
        &RequestOptions::idempotency_key("group-shipped-today"),
    )
    .await?;

println!("{} {:?}", group.id, group.contact_ids.as_deref().unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let group = try await opensms.contactGroups.create(
    name: "Shipped today",
    contactIds: ["a1bfb8ee-7966-4ae5-ad7a-85368e20a993", "817d562e-b7d0-4791-a545-cb2593c7e8df"],
    idempotencyKey: "group-shipped-today"
)

print(group.id, group.contactIds ?? [])
```
<!-- /tabs -->

```json
{"id":"3241c300-349a-4f00-bb3e-23db65853fcd","name":"Shipped today","created_at":"2026-09-24T11:43:03.955119+00:00","contact_ids":["817d562e-b7d0-4791-a545-cb2593c7e8df","a1bfb8ee-7966-4ae5-ad7a-85368e20a993"],"workspace_id":"d75af78f-6268-42bf-a11f-000b5d922f3c"}
```

`name` is required and unique per environment. `contact_ids` holds up to 1000 unique contacts from the same workspace and environment. `PATCH` with `contact_ids` replaces the whole membership (an empty array empties the group). `DELETE` returns `204`.

## Sending to a group

`POST /v1/contact-groups/{id}/send` with an `Idempotency-Key` and exactly one of `text` or `template_id`:

<!-- tabs label="SDK language" -->
```sh tab="cURL" title="Terminal"
curl -s -X POST $OPENSMS_API/v1/contact-groups/3241c300-349a-4f00-bb3e-23db65853fcd/send \
  -H "authorization: Bearer $OPENSMS_API_KEY" -H 'content-type: application/json' \
  -H 'idempotency-key: shipped-today-2026-09-24' \
  -d '{"template_id":"cdec129b-bac3-40ad-bce7-37174580b65a"}'
```

```ts tab="TypeScript" logo="typescript" title="group-send.ts"
const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });

const batch = await opensms.contactGroups.send(
  '3241c300-349a-4f00-bb3e-23db65853fcd',
  { templateId: 'cdec129b-bac3-40ad-bce7-37174580b65a' },
  { idempotencyKey: 'shipped-today-2026-09-24' },
);

console.log(batch.id, batch.status, batch.invalid);
```

```python tab="Python" logo="python" title="group_send.py"
client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])

batch = client.contact_groups.send(
    "3241c300-349a-4f00-bb3e-23db65853fcd",
    template_id="cdec129b-bac3-40ad-bce7-37174580b65a",
    idempotency_key="shipped-today-2026-09-24",
)

print(batch["id"], batch["status"], batch["invalid"])
```

```go tab="Go" logo="golang" title="main.go"
client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))
if err != nil {
	log.Fatal(err)
}

batch, err := client.ContactGroups.Send(context.Background(), "3241c300-349a-4f00-bb3e-23db65853fcd",
	opensms.GroupSendParams{TemplateID: "cdec129b-bac3-40ad-bce7-37174580b65a"},
	opensms.WithIdempotencyKey("shipped-today-2026-09-24"))
if err != nil {
	log.Fatal(err)
}
log.Println(batch.ID, batch.Status, batch.Invalid)
```

```php tab="PHP" logo="php" title="group-send.php"
$opensms = new Client(getenv('OPENSMS_API_KEY'));

$batch = $opensms->contactGroups->send('3241c300-349a-4f00-bb3e-23db65853fcd', [
    'template_id' => 'cdec129b-bac3-40ad-bce7-37174580b65a',
], ['idempotencyKey' => 'shipped-today-2026-09-24']);

echo $batch['id'], ' ', $batch['status'], ' ', $batch['invalid'], PHP_EOL;
```

```java tab="Java" logo="java" title="Main.java"
OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));

Batch batch = opensms.contactGroups().send("3241c300-349a-4f00-bb3e-23db65853fcd",
    new GroupSendParams().templateId("cdec129b-bac3-40ad-bce7-37174580b65a"),
    RequestOptions.idempotencyKey("shipped-today-2026-09-24"));

System.out.println(batch.id + " " + batch.status + " " + batch.invalid);
```

```csharp tab="C#" logo="dotnet" title="Program.cs"
using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);

var batch = await client.ContactGroups.SendAsync("3241c300-349a-4f00-bb3e-23db65853fcd",
    new GroupSendParams { TemplateId = "cdec129b-bac3-40ad-bce7-37174580b65a" },
    new RequestOptions { IdempotencyKey = "shipped-today-2026-09-24" });

Console.WriteLine($"{batch.Id} {batch.Status} {batch.Invalid}");
```

```ruby tab="Ruby" logo="ruby" title="group_send.rb"
client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))

batch = client.contact_groups.send(
  "3241c300-349a-4f00-bb3e-23db65853fcd",
  template_id: "cdec129b-bac3-40ad-bce7-37174580b65a",
  idempotency_key: "shipped-today-2026-09-24"
)

puts batch[:id], batch[:status], batch[:invalid]
```

```rust tab="Rust" logo="rust" title="src/main.rs"
let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;

let batch = client
    .contact_groups()
    .send_with(
        "3241c300-349a-4f00-bb3e-23db65853fcd",
        &SendToGroup {
            template_id: Some("cdec129b-bac3-40ad-bce7-37174580b65a".into()),
            ..Default::default()
        },
        &RequestOptions::idempotency_key("shipped-today-2026-09-24"),
    )
    .await?;

println!("{} {} {}", batch.id, batch.status.as_deref().unwrap_or_default(), batch.invalid.unwrap_or_default());
```

```swift tab="Swift" logo="swift" title="main.swift"
let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""
let opensms = try OpensmsClient(apiKey: apiKey)

let batch = try await opensms.contactGroups.send(
    "3241c300-349a-4f00-bb3e-23db65853fcd",
    .init(templateId: "cdec129b-bac3-40ad-bce7-37174580b65a"),
    idempotencyKey: "shipped-today-2026-09-24"
)

print(batch.id, batch.status ?? "", batch.invalid ?? 0)
```
<!-- /tabs -->

| Field | Meaning |
| --- | --- |
| `text` or `template_id` | The message, literal or from a template. |
| `variables` | Optional object of string values that override every contact's values. |
| `sender_id`, `traffic_type` | As for [single sends](sending-messages.md#request). |

For each variable in the body, the value comes from `variables` if given, otherwise `name` is the contact's name, `e164` is the contact's number, and any other name is taken from the contact's string attribute of that name. If any contact is missing a value, nothing is sent and the call returns `422` `"A contact is missing required template variables."` A group must have 1 to 1000 contacts.

The call snapshots the group and runs it as a [batch](sending-messages.md#batches): it creates the batch and starts it at once. The `200` response is the batch. A retry with the same key reuses the original snapshot even if the contacts or template changed since.

If the workspace owner has not verified their email yet, every recipient is refused by the email-verification gate and the response is a `failed` batch with both rows invalid:

```json
{"id":"2dd56886-659c-47dd-b29d-25e444dba99e","status":"failed","total":2,"sent":0,"delivered":0,"failed":0,"invalid":2,"duplicates":0,"suppressed":0,"estimated_cost":0,"created_at":"2026-09-24T14:43:09.965514+03:00"}
```

Use `GET /v1/batches/{id}/validation` to see each row's reason and `GET /v1/batches/{id}/items` for the messages created.

## Idempotency on these endpoints

Create calls replay the original `201` for the same key and body. The same key with a different body returns `409`, for example `"Idempotency key used with different template details."` A deleted record is not recreated by replaying its create call.
