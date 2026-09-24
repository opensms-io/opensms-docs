// SDK code samples for the API reference. Every API-key operation that an
// official SDK wraps (see sdks/spec/SURFACE.md) is described once below, with
// the values of its captured cURL example, and rendered here for the nine
// SDKs: TypeScript, Python, Go, PHP, Java, C#, Ruby, Rust and Swift. Method
// names, parameter names and types follow each SDK's source at 0.1.0
// (sdks/packages/<lang>); nothing here is invented per page.
//
// Each sample is the body only, as in the guides: the setup line, the call and
// a print. The imports and the main wrapper that make it a whole program are
// shown once, in integrate/sdk.md ("Client setup").
//
// scripts/gen-reference.mjs puts these next to the cURL example as one tab
// group. Operations missing from SDK_OPS (session-only routes) keep cURL only.

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
//
// res / m: the resource and method, as the TypeScript SDK spells them.
// ids:     positional path arguments (strings, or numbers for integer ids).
// p:       the request parameters with their wire (snake_case) names.
// t:       the parameter type (TYPES below) when the SDK takes one.
// v:       variable name for the result; show: what the sample prints.
//          { obj: [fields] } | { page: [fields] } | { arr: [fields] } | absent (no body)

const UUID = {
  batch: '959d8d9f-e177-4d5b-a62c-e25a66563a59',
  lookup: 'f8842eae-4d54-4433-b91c-7a19c741ac60',
  contact: '8127baa8-45fb-4f8e-ac46-9aa9555ed1ee',
  group: '9f25ed36-47ed-4dbe-a314-2185362b9162',
  template: '8a5ec16b-30a7-48c8-ab2d-15037a667874',
  webhook: 'd429eb48-c7ce-40ad-b9c1-a7db7bec6522',
  sender: '888d3b7a-6356-411f-a5d2-6fb29c47e517',
  draft: '4efae51b-735b-4fea-83d7-7ecc1870a58f',
  zero: '00000000-0000-4000-8000-000000000000',
};
const DOCS = ['fe68810d-6209-404f-b2fd-ec86384334ae', 'fb775984-e074-472b-b754-f878871526ed', 'b4c07473-8519-4c26-8c39-48ec384bf3f8'];
const RULE = { match: 'keyword', pattern: 'STOP', action: 'auto_reply', target: 'You are unsubscribed.' };

const op = (res, m, o = {}) => ({ res, m, ids: [], p: null, t: null, v: 'result', ...o });
const LIST = (res, m = 'list', v = 'page', fields = ['id'], o = {}) => op(res, m, { t: 'List', v, show: { page: fields }, ...o });

export const SDK_OPS = {
  'POST /v1/messages': op('messages', 'send', { t: 'SendMessage', p: { to: '+254712345678', text: 'Your order 1042 has shipped.' }, v: 'message', show: { obj: ['id', 'status'] } }),
  'GET /v1/messages': op('messages', 'list', { t: 'ListMessages', p: { limit: 10 }, v: 'page', show: { page: ['id', 'status'] } }),
  'GET /v1/messages/{id}': op('messages', 'get', { ids: [UUID.zero], v: 'message', show: { obj: ['id', 'status'] } }),
  'GET /v1/messages/{id}/attempts': op('messages', 'attempts', { ids: [UUID.zero], v: 'attempts', show: { arr: ['id', 'status'] } }),
  'POST /v1/messages/{id}/cancel': op('messages', 'cancel', { ids: [UUID.zero], v: 'message', show: { obj: ['id', 'status'] } }),

  'POST /v1/messages/batch': op('batches', 'create', {
    t: 'CreateBatch',
    p: { items: [
      { to: '+254712345678', text: 'Hi Amina, your order has shipped.' },
      { to: '+254722000111', text: 'Hi Brian, your order has shipped.' },
      { to: '0700', text: 'bad number' },
    ] },
    v: 'batch', show: { obj: ['id', 'status'] },
  }),
  'GET /v1/batches/{id}': op('batches', 'get', { ids: [UUID.batch], v: 'batch', show: { obj: ['id', 'status'] } }),
  'GET /v1/batches/{id}/validation': op('batches', 'validation', { ids: [UUID.batch], v: 'report', show: { obj: ['valid', 'invalid'] } }),
  'POST /v1/batches/{id}/start': op('batches', 'start', { ids: [UUID.batch], v: 'batch', show: { obj: ['id', 'status'] } }),
  'POST /v1/batches/{id}/stop': op('batches', 'stop', { ids: [UUID.batch], v: 'stopped', show: { obj: ['id', 'status'] } }),
  'GET /v1/batches/{id}/items': op('batches', 'listItems', { ids: [UUID.batch], t: 'ListBatchItems', v: 'page', show: { page: ['id', 'status'] } }),

  'POST /v1/otp/send': op('otp', 'send', { t: 'SendOtp', p: { to: '+254712345678', length: 6, ttl_seconds: 300 }, v: 'otp', show: { obj: ['otp_id'] } }),
  'POST /v1/otp/verify': op('otp', 'verify', { t: 'VerifyOtp', p: { otp_id: UUID.zero, code: '123456' }, v: 'check', show: { obj: ['valid', 'attempts_left'] } }),

  'POST /v1/lookup': op('lookups', 'create', { t: 'CreateLookup', p: { to: '+254712345678' }, v: 'lookup', show: { obj: ['id', 'state'] } }),
  'GET /v1/lookup/{id}': op('lookups', 'get', { ids: [UUID.lookup], v: 'lookup', show: { obj: ['id', 'state'] } }),

  'GET /v1/contacts': LIST('contacts', 'list', 'page', ['id', 'e164']),
  'POST /v1/contacts': op('contacts', 'create', { t: 'CreateContact', p: { e164: '+254712345678', name: 'Amina W.', attributes: { tier: 'gold' } }, v: 'contact', show: { obj: ['id', 'e164'] } }),
  'GET /v1/contacts/{id}': op('contacts', 'get', { ids: [UUID.contact], v: 'contact', show: { obj: ['id', 'e164'] } }),
  'PATCH /v1/contacts/{id}': op('contacts', 'update', { ids: [UUID.contact], t: 'UpdateContact', p: { name: 'Amina Wanjiru' }, v: 'contact', show: { obj: ['id', 'e164'] } }),
  'DELETE /v1/contacts/{id}': op('contacts', 'delete', { ids: [UUID.contact] }),

  'GET /v1/contact-groups': LIST('contactGroups', 'list', 'page', ['id', 'name']),
  'POST /v1/contact-groups': op('contactGroups', 'create', { t: 'CreateContactGroup', p: { name: 'VIP customers', contact_ids: [UUID.contact] }, v: 'group', show: { obj: ['id', 'name'] } }),
  'GET /v1/contact-groups/{id}': op('contactGroups', 'get', { ids: [UUID.group], v: 'group', show: { obj: ['id', 'name'] } }),
  'PATCH /v1/contact-groups/{id}': op('contactGroups', 'update', { ids: [UUID.group], t: 'UpdateContactGroup', p: { name: 'VIP customers (KE)' }, v: 'group', show: { obj: ['id', 'name'] } }),
  'DELETE /v1/contact-groups/{id}': op('contactGroups', 'delete', { ids: [UUID.group] }),
  'POST /v1/contact-groups/{id}/send': op('contactGroups', 'send', { ids: [UUID.group], t: 'GroupSend', p: { text: 'Hello from Acme' }, v: 'batch', show: { obj: ['id', 'status'] } }),

  'GET /v1/templates': LIST('templates', 'list', 'page', ['id', 'name']),
  'POST /v1/templates': op('templates', 'create', { t: 'CreateTemplate', p: { name: 'order_shipped', body: 'Hi {{name}}, order {{order}} has shipped.' }, v: 'template', show: { obj: ['id', 'name'] } }),
  'GET /v1/templates/{id}': op('templates', 'get', { ids: [UUID.template], v: 'template', show: { obj: ['id', 'name'] } }),
  'PATCH /v1/templates/{id}': op('templates', 'update', { ids: [UUID.template], t: 'UpdateTemplate', p: { body: 'Hi {{name}}, order {{order}} is on its way.' }, v: 'template', show: { obj: ['id', 'name'] } }),
  'DELETE /v1/templates/{id}': op('templates', 'delete', { ids: [UUID.template] }),

  'GET /v1/webhooks': LIST('webhooks', 'list', 'page', ['id', 'url']),
  'POST /v1/webhooks': op('webhooks', 'create', { t: 'CreateWebhook', p: { url: 'https://hooks.example.com/opensms', events: ['message.delivered', 'message.failed'] }, v: 'endpoint', show: { obj: ['id', 'secret'] } }),
  'GET /v1/webhooks/{id}': op('webhooks', 'get', { ids: [UUID.webhook], v: 'endpoint', show: { obj: ['id', 'url'] } }),
  'PUT /v1/webhooks/{id}': op('webhooks', 'update', { ids: [UUID.webhook], t: 'UpdateWebhook', p: { url: 'https://hooks.example.com/opensms/v2', events: ['message.delivered'], enabled: true }, v: 'endpoint', show: { obj: ['id', 'url'] } }),
  'DELETE /v1/webhooks/{id}': op('webhooks', 'delete', { ids: [UUID.webhook] }),
  'POST /v1/webhooks/{id}/test': op('webhooks', 'test', { ids: [UUID.webhook], v: 'ack', show: { obj: ['status'] } }),
  'GET /v1/webhooks/{id}/deliveries': LIST('webhooks', 'listDeliveries', 'page', ['id', 'status'], { ids: [UUID.webhook] }),
  'POST /v1/webhooks/{id}/deliveries/{delivery_id}/replay': op('webhooks', 'replayDelivery', { ids: [UUID.webhook, 21], t: 'ReplayDelivery', p: { generation: 0, reason: 'receiver was down' }, v: 'ack', show: { obj: ['status'] } }),

  'GET /v1/inbound': LIST('inbound', 'list', 'page', ['id', 'from']),
  'POST /v1/inbound/{id}/reply': op('inbound', 'reply', { ids: [UUID.zero], t: 'InboundReply', p: { text: 'Thanks, we got your message.' }, v: 'message', show: { obj: ['id', 'status'] } }),

  'GET /v1/numbers': LIST('numbers', 'list', 'page', ['id', 'number']),
  'GET /v1/numbers/available': op('numbers', 'available', { t: 'NumberSearch', p: { country: 'KE', kind: 'long_code' }, v: 'numbers', show: { arr: ['number', 'monthly_fee'] } }),
  'POST /v1/numbers': op('numbers', 'assign', { t: 'NumberSearch', p: { country: 'KE', kind: 'long_code' }, v: 'number', show: { obj: ['id', 'number'] } }),
  'DELETE /v1/numbers/{id}': op('numbers', 'release', { ids: [UUID.zero] }),
  'GET /v1/numbers/{id}/rules': LIST('numbers', 'listRules', 'page', ['id', 'match'], { ids: [UUID.zero] }),
  'POST /v1/numbers/{id}/rules': op('numbers', 'createRule', { ids: [UUID.zero], t: 'NumberRule', p: RULE, v: 'rule', show: { obj: ['id', 'action'] } }),
  'PUT /v1/numbers/{id}/rules/{rule_id}': op('numbers', 'updateRule', { ids: [UUID.zero, UUID.zero], t: 'NumberRule', p: RULE, v: 'rule', show: { obj: ['id', 'action'] } }),
  'DELETE /v1/numbers/{id}/rules/{rule_id}': op('numbers', 'deleteRule', { ids: [UUID.zero, UUID.zero] }),

  'GET /v1/sender-ids': LIST('senderIds', 'list', 'page', ['id', 'value']),
  'GET /v1/sender-ids/{id}': op('senderIds', 'get', { ids: ['222ff8e6-1629-48a9-9181-ee110d2e6ad5'], v: 'sender', show: { obj: ['value', 'status'] } }),
  'POST /v1/sender-ids': op('senderIds', 'create', { t: 'CreateSenderId', p: { value: 'ACMECO', kind: 'alphanumeric', countries: ['KE'], use_case: 'transactional', sample_message: 'Your ACME order 1042 has shipped.', documents: DOCS }, v: 'sender', show: { obj: ['id', 'status'] } }),
  'PATCH /v1/sender-ids/{id}': op('senderIds', 'update', { ids: [UUID.sender], t: 'UpdateSenderId', p: { use_case: 'otp', sample_message: 'Your ACME code is 123456.', countries: ['KE'], documents: DOCS }, v: 'sender', show: { obj: ['id', 'status'] } }),
  'DELETE /v1/sender-ids/{id}': op('senderIds', 'delete', { ids: [UUID.sender] }),
  'GET /v1/sender-ids/check': op('senderIds', 'check', { t: 'CheckSenderId', p: { value: 'ACMECO', country: 'KE' }, v: 'check', show: { obj: ['available', 'reason'] } }),
  'GET /v1/sender-ids/quote': op('senderIds', 'quote', { t: 'QuoteSenderId', p: { countries: ['KE'] }, v: 'quote', show: { obj: ['quote_id'] } }),
  'GET /v1/sender-documents': op('senderIds', 'listDocuments', { v: 'documents', show: { arr: ['id', 'kind'] } }),
  'GET /v1/sender-id-drafts': LIST('senderIds', 'listDrafts', 'page', ['id', 'value']),
  'POST /v1/sender-id-drafts': op('senderIds', 'createDraft', { t: 'CreateDraft', p: { value: 'ACMECO', kind: 'alphanumeric', countries: ['KE'], use_case: 'transactional', sample_message: 'Your ACME order 1042 has shipped.' }, v: 'draft', show: { obj: ['id', 'version'] } }),
  'GET /v1/sender-id-drafts/{id}': op('senderIds', 'getDraft', { ids: [UUID.draft], v: 'draft', show: { obj: ['id', 'version'] } }),
  'PATCH /v1/sender-id-drafts/{id}': op('senderIds', 'updateDraft', { ids: [UUID.draft], t: 'UpdateDraft', p: { version: 1, sample_message: 'Your ACME code is 123456.' }, v: 'draft', show: { obj: ['id', 'version'] } }),
  'DELETE /v1/sender-id-drafts/{id}': op('senderIds', 'deleteDraft', { ids: [UUID.draft] }),

  'GET /v1/compliance/suppressions': LIST('suppressions', 'list', 'page', ['id', 'e164']),
  'POST /v1/compliance/suppressions': op('suppressions', 'create', { t: 'Suppression', p: { e164: '+254700000001', reason: 'manual' }, v: 'suppression', show: { obj: ['id', 'e164'] } }),
  'POST /v1/compliance/suppressions/import': op('suppressions', 'import', { t: 'SuppressionImport', p: { items: [{ e164: '+254700000002', reason: 'complaint' }, { e164: '+254700000003', reason: 'manual' }] }, v: 'imported', show: { obj: ['created', 'received'] } }),
  'DELETE /v1/compliance/suppressions/{id}': op('suppressions', 'delete', { ids: [34] }),

  'GET /v1/compliance/countries': op('compliance', 'listCountries', { v: 'countries', show: { arr: ['iso2', 'name'] } }),
  'GET /v1/compliance/countries/{iso2}': op('compliance', 'getCountry', { ids: ['KE'], v: 'rules', show: { obj: ['iso2', 'name'] } }),
  'GET /v1/content-rules': op('compliance', 'listContentRules', { v: 'rules', show: { arr: ['id', 'pattern'] } }),

  'GET /v1/wallet': op('wallet', 'balances', { v: 'balances', show: { arr: ['currency', 'balance'] } }),
  'GET /v1/wallet/ledger': op('wallet', 'ledger', { t: 'Ledger', v: 'entries', show: { arr: ['id', 'amount'] } }),
  'POST /v1/wallet/topups': op('wallet', 'createTopup', { t: 'Topup', p: { amount: '1000', currency: 'KES', channel: 'card', email: 'billing@example.com' }, v: 'topup', show: { obj: ['id', 'authorization_url'] } }),

  'GET /v1/pricing': op('pricing', 'get', { t: 'Pricing', p: { country: 'KE' }, v: 'prices', show: { obj: ['currency', 'product'] } }),

  'GET /v1/analytics/overview': op('analytics', 'overview', { t: 'Analytics', v: 'overview', show: { obj: ['sent', 'delivered'] } }),
  'GET /v1/analytics/by-country': op('analytics', 'byCountry', { t: 'Analytics', v: 'rows', show: { arr: ['key', 'sent'] } }),
  'GET /v1/analytics/by-carrier': op('analytics', 'byCarrier', { t: 'Analytics', v: 'rows', show: { arr: ['key', 'sent'] } }),
  'GET /v1/analytics/by-sender-id': op('analytics', 'bySenderId', { t: 'Analytics', v: 'rows', show: { arr: ['key', 'sent'] } }),
  'GET /v1/analytics/timeseries': op('analytics', 'timeseries', { t: 'Analytics', p: { bucket: 'day' }, v: 'points', show: { arr: ['bucket', 'sent'] } }),

  'GET /v1/sandbox/messages': LIST('sandbox', 'listMessages', 'page', ['to', 'text'], { p: { limit: 10 } }),

  'GET /v1/countries': op('countries', 'list', { v: 'countries', show: { arr: ['iso2', 'name'] } }),
  'GET /v1/countries/{iso2}/carriers': op('countries', 'carriers', { ids: ['KE'], v: 'carriers', show: { arr: ['id', 'name'] } }),
  'GET /v1/countries/{iso2}/routes': op('countries', 'routes', { ids: ['KE'], v: 'routes', show: { arr: ['carrier', 'provider'] } }),
  'GET /v1/countries/{iso2}/compliance': op('countries', 'compliance', { ids: ['KE'], v: 'rules', show: { obj: ['iso2', 'name'] } }),
};

// ---------------------------------------------------------------------------
// Parameter types, per SDK
// ---------------------------------------------------------------------------
//
// go / cs: struct or class name. rust: struct name, `opt` = Option fields,
// `val` = passed by value (query structs), `nodefault` = no Default impl.
// java: how the call is written (see javaArgs). swift: `init` = one
// `.init(...)` argument, `labels` = labelled arguments on the method itself,
// `order` = parameter order of that initialiser or method.

const TYPES = {
  List: { go: 'ListParams', cs: 'ListParams', rust: { name: 'ListParams', val: true, opt: ['limit', 'cursor'] }, java: { fluent: 'ListParams' }, swift: { init: true, order: ['limit', 'cursor'] } },
  SendMessage: { go: 'SendMessageParams', cs: 'SendMessageParams', rust: { name: 'SendMessage', ctor: ['to', 'text'], opt: ['sender_id', 'traffic_type', 'scheduled_at', 'callback_url', 'metadata'] }, java: { ctor: 'SendMessageParams', args: ['to', 'text'] }, swift: { init: true, order: ['to', 'text', 'sender_id', 'traffic_type', 'scheduled_at', 'callback_url', 'metadata'] } },
  ListMessages: { go: 'ListMessagesParams', cs: 'MessageListParams', rust: { name: 'ListMessages', val: true, opt: ['limit', 'cursor', 'status', 'to', 'country', 'date_from', 'date_to'] }, java: { fluent: 'MessageListParams' }, swift: { init: true, order: ['limit', 'cursor', 'status', 'to', 'country', 'date_from', 'date_to'] } },
  CreateBatch: { go: 'CreateBatchParams', cs: 'CreateBatchParams', rust: { name: 'CreateBatch', opt: ['dedupe'] }, java: { items: 'BatchItemInput' }, swift: { init: true, order: ['items', 'dedupe'] } },
  ListBatchItems: { go: 'ListBatchItemsParams', cs: 'BatchItemListParams', rust: { name: 'ListBatchItems', val: true, opt: ['status', 'limit', 'cursor'] }, java: { fluent: 'BatchItemListParams' }, swift: { init: true, order: ['status', 'limit', 'cursor'] } },
  SendOtp: { go: 'SendOTPParams', cs: 'SendOtpParams', rust: { name: 'SendOtp', ctor: ['to'], opt: ['sender_id', 'template', 'length', 'ttl_seconds'] }, java: { ctor: 'OtpSendParams', args: ['to'] }, swift: { init: true, order: ['to', 'sender_id', 'template', 'length', 'ttl_seconds'] } },
  VerifyOtp: { go: 'VerifyOTPParams', cs: 'VerifyOtpParams', rust: { name: 'VerifyOtp', ctor: ['otp_id', 'code'] }, java: { positional: ['otp_id', 'code'] }, swift: { labels: true, order: ['otp_id', 'code'] } },
  CreateLookup: { go: 'CreateLookupParams', cs: 'CreateLookupParams', rust: { name: 'CreateLookup' }, java: { positional: ['to'] }, swift: { labels: true, order: ['to'] } },
  CreateContact: { go: 'CreateContactParams', cs: 'CreateContactParams', rust: { name: 'CreateContact', opt: ['name', 'attributes'] }, java: { fluent: 'ContactParams' }, swift: { labels: true, order: ['e164', 'name', 'attributes'] } },
  UpdateContact: { go: 'UpdateContactParams', cs: 'UpdateContactParams', rust: { name: 'UpdateContact', opt: ['e164', 'name', 'attributes'] }, java: { fluent: 'ContactParams' }, swift: { labels: true, order: ['e164', 'name', 'attributes'] } },
  CreateContactGroup: { go: 'CreateContactGroupParams', cs: 'CreateContactGroupParams', rust: { name: 'CreateContactGroup', opt: ['contact_ids'] }, java: { fluent: 'ContactGroupParams' }, swift: { labels: true, order: ['name', 'contact_ids'] } },
  UpdateContactGroup: { go: 'UpdateContactGroupParams', cs: 'UpdateContactGroupParams', rust: { name: 'UpdateContactGroup', opt: ['name', 'contact_ids'] }, java: { fluent: 'ContactGroupParams' }, swift: { labels: true, order: ['name', 'contact_ids'] } },
  GroupSend: { go: 'GroupSendParams', cs: 'GroupSendParams', rust: { name: 'SendToGroup', opt: ['text', 'template_id', 'variables', 'sender_id', 'traffic_type', 'callback_url'] }, java: { fluent: 'GroupSendParams' }, swift: { init: true, order: ['text', 'template_id', 'variables', 'sender_id', 'traffic_type', 'callback_url'] } },
  CreateTemplate: { go: 'CreateTemplateParams', cs: 'CreateTemplateParams', rust: { name: 'CreateTemplate', opt: ['traffic_type'] }, java: { fluent: 'TemplateParams' }, swift: { labels: true, order: ['name', 'body', 'traffic_type'] } },
  UpdateTemplate: { go: 'UpdateTemplateParams', cs: 'UpdateTemplateParams', rust: { name: 'UpdateTemplate', opt: ['name', 'body', 'traffic_type'] }, java: { fluent: 'TemplateParams' }, swift: { labels: true, order: ['name', 'body', 'traffic_type'] } },
  CreateWebhook: { go: 'CreateWebhookParams', cs: 'CreateWebhookParams', rust: { name: 'CreateWebhook', opt: ['enabled'] }, java: { ctor: 'WebhookParams', args: ['url', 'events'] }, swift: { labels: true, order: ['url', 'events', 'enabled'] } },
  UpdateWebhook: { go: 'UpdateWebhookParams', cs: 'UpdateWebhookParams', rust: { name: 'UpdateWebhook', nodefault: true }, java: { ctor: 'WebhookParams', args: ['url', 'events'] }, swift: { labels: true, order: ['url', 'events', 'enabled'] } },
  ReplayDelivery: { go: 'ReplayDeliveryParams', cs: 'ReplayDeliveryParams', rust: { name: 'ReplayDelivery' }, java: { positional: ['generation', 'reason'] }, swift: { labels: true, order: ['generation', 'reason'] } },
  InboundReply: { go: 'InboundReplyParams', cs: 'InboundReplyParams', rust: { name: 'ReplyInbound' }, java: { positional: ['text'] }, swift: { labels: true, order: ['text'] } },
  NumberSearch: { go: null, cs: 'NumberSearchParams', rust: { name: 'NumberQuery' }, java: { positional: ['country', 'kind'] }, swift: { labels: true, order: ['country', 'kind'] } },
  NumberRule: { go: 'NumberRuleParams', cs: 'NumberRuleParams', rust: { name: 'NumberRuleInput', opt: ['pattern', 'position'] }, java: { ctor: 'NumberRuleParams', args: ['match', 'action', 'target'] }, swift: { init: true, order: ['match', 'pattern', 'action', 'target', 'position'] } },
  CreateSenderId: { go: 'CreateSenderIDParams', cs: 'CreateSenderIdParams', rust: { name: 'CreateSenderId', opt: ['use_case', 'sample_message', 'draft_id', 'draft_version', 'quote_id'] }, java: { ctor: 'SenderIdCreateParams', args: ['value', 'kind', 'countries', 'documents'] }, swift: { init: true, order: ['value', 'kind', 'countries', 'documents', 'use_case', 'sample_message', 'draft_id', 'draft_version', 'quote_id'] } },
  UpdateSenderId: { go: 'UpdateSenderIDParams', cs: 'UpdateSenderIdParams', rust: { name: 'UpdateSenderId', opt: ['sample_message'] }, java: { ctor: 'SenderIdUpdateParams', args: ['use_case', 'countries', 'documents'] }, swift: { init: true, order: ['use_case', 'countries', 'documents', 'sample_message'] } },
  CheckSenderId: { go: 'CheckSenderIDParams', cs: 'SenderIdCheckParams', rust: { name: 'CheckSenderId', opt: ['country'] }, java: { positional: ['value', 'country'] }, swift: { labels: true, order: ['value', 'country'] } },
  QuoteSenderId: { go: 'QuoteSenderIDParams', cs: 'SenderIdQuoteParams', rust: { name: 'QuoteSenderId' }, java: { positional: ['countries'] }, swift: { labels: true, order: ['countries'] } },
  CreateDraft: { go: 'SenderIDDraftParams', cs: 'CreateSenderIdDraftParams', rust: { name: 'CreateSenderIdDraft', opt: ['source', 'value', 'kind', 'countries', 'use_case', 'sample_message', 'documents'] }, java: { fluent: 'SenderIdDraftParams' }, swift: { init: true, order: ['version', 'source', 'value', 'kind', 'countries', 'use_case', 'sample_message', 'documents'] } },
  UpdateDraft: { go: 'UpdateSenderIDDraftParams', cs: 'UpdateSenderIdDraftParams', rust: { name: 'UpdateSenderIdDraft', opt: ['value', 'kind', 'countries', 'use_case', 'sample_message', 'documents'] }, java: { fluent: 'SenderIdDraftParams' }, swift: { init: true, order: ['version', 'source', 'value', 'kind', 'countries', 'use_case', 'sample_message', 'documents'] } },
  Suppression: { go: 'CreateSuppressionParams', cs: 'SuppressionParams', rust: { name: 'CreateSuppression' }, java: { positional: ['e164', 'reason'] }, swift: { labels: true, order: ['e164', 'reason'] } },
  SuppressionImport: { go: 'SuppressionInput', cs: 'SuppressionParams', rust: { name: 'CreateSuppression' }, java: { items: 'SuppressionInput' }, swift: { order: ['e164', 'reason'] } },
  Ledger: { go: 'LedgerParams', cs: 'LedgerParams', rust: { name: 'LedgerParams', val: true, opt: ['limit', 'before'] }, java: { positional: ['limit', 'before'] }, swift: { labels: true, order: ['limit', 'before'] } },
  Topup: { go: 'CreateTopupParams', cs: 'CreateTopupParams', rust: { name: 'CreateTopup' }, java: { record: 'TopupParams', args: ['amount', 'currency', 'channel', 'email'] }, swift: { init: true, order: ['amount', 'currency', 'channel', 'email'] } },
  Pricing: { go: 'PricingParams', cs: 'PricingParams', rust: { name: 'PricingParams', val: true, opt: ['product', 'country'] }, java: { positional: ['product', 'country'] }, swift: { labels: true, order: ['product', 'country'] } },
  Analytics: { go: 'AnalyticsParams', cs: 'AnalyticsQuery', rust: { name: 'AnalyticsQuery', val: true, opt: ['currency', 'range', 'from', 'to', 'bucket'] }, java: { fluent: 'AnalyticsParams' }, swift: { init: true, order: ['currency', 'range', 'from', 'to', 'bucket'] } },
};

// Go splits numbers.available and numbers.assign into two structs.
const GO_TYPE = { 'numbers.available': 'AvailableNumbersParams', 'numbers.assign': 'AssignNumberParams' };


// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split('_').filter(Boolean);
const snake = (s) => words(s).join('_');
const camel = (s) => words(s).map((w, i) => (i ? cap(w) : w)).join('');
const pascal = (s) => words(s).map(cap).join('');
const GO_WORDS = { id: 'ID', ids: 'IDs', url: 'URL', otp: 'OTP', ttl: 'TTL', csv: 'CSV', iso2: 'ISO2' };
const goName = (s) => words(s).map((w) => GO_WORDS[w] ?? cap(w)).join('');

const q2 = (s) => JSON.stringify(s);
const q1 = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
//
// A tiny width-aware printer, so every sample reads like its language's
// formatter wrote it: a group stays on one line when it fits in WIDTH columns,
// otherwise it breaks with one item per line. A "hug" group (a call whose last
// argument is an object or struct) keeps its head on the first line and breaks
// only that last argument, as Prettier, gofmt and rustfmt do.

// Line width per language, close to each formatter's default (Prettier 80,
// Black 88, rustfmt 100) and to what the code panel shows without scrolling.
let WIDTH = 80;
const cols = (s) => s.replace(/\t/g, '    ').length;

/** A bracketed list. `open`/`close` are the one-line forms, `openB`/`closeB` the broken ones. */
const G = (open, items, close, o = {}) => ({
  g: true, open, items, close,
  openB: o.openB ?? open.trimEnd(), closeB: o.closeB ?? close.trimStart(),
  indent: o.indent ?? '    ', trailing: o.trailing ?? true, hug: o.hug ?? false, sep: o.sep ?? ',',
  // Java style: the closing bracket stays on the last item's line.
  closeOnLast: o.closeOnLast ?? false,
  // rustfmt-style limit on the width of the items alone, whatever the column.
  maxFlat: o.maxFlat ?? Infinity,
});
/** Text followed by a node, on the same line ("key: value"). */
const C = (...parts) => ({ c: parts });

function flat(n) {
  if (typeof n === 'string') return n;
  if (n.c) return n.c.map(flat).join('');
  return n.open + n.items.map(flat).join(`${n.sep} `) + n.close;
}

/** Whether `n` and every group inside it respect their own `maxFlat`. */
function flatOk(n) {
  if (typeof n === 'string') return true;
  if (n.c) return n.c.every(flatOk);
  return cols(n.items.map(flat).join(`${n.sep} `)) <= n.maxFlat && n.items.every(flatOk);
}

/** Render `n` starting at column `col` on a line indented by `base`. */
function fmt(n, col = 0, base = '') {
  if (typeof n === 'string') return n;
  if (n.c) {
    let out = '';
    for (const part of n.c) {
      const s = fmt(part, col, base);
      out += s;
      col = s.includes('\n') ? cols(s.split('\n').pop()) : col + cols(s);
    }
    return out;
  }
  if (!n.force) {
    const f = flat(n);
    if (!f.includes('\n') && col + cols(f) <= WIDTH && flatOk(n)) return f;
    const last = n.items[n.items.length - 1];
    if (n.hug && last && typeof last !== 'string') {
      // Keep the head on this line and break only the last argument.
      const pre = n.open + n.items.slice(0, -1).map(flat).join(`${n.sep} `) + (n.items.length > 1 ? `${n.sep} ` : '');
      const lead = last.c ? last.c.slice(0, -1).map(flat).join('') : '';
      const target = last.c ? last.c[last.c.length - 1] : last;
      if (target.g && col + cols(pre + lead + target.openB.split('\n')[0]) <= WIDTH) {
        const forced = { ...target, force: true };
        return pre + fmt(last.c ? { c: [...last.c.slice(0, -1), forced] } : forced, col + cols(pre), base) + n.close;
      }
    }
  }
  const inner = base + n.indent;
  const items = n.items.map((it, i) => inner + fmt(it, cols(inner), inner) + (i < n.items.length - 1 || (n.trailing && !n.closeOnLast) ? n.sep : ''));
  const open = n.openB.replace(/\n/g, `\n${base}`);
  if (n.closeOnLast) return `${open}\n${items.join('\n')}${n.closeB}`;
  return `${open}\n${items.join('\n')}\n${base}${n.closeB}`;
}

/** Final touches shared by every language: no trailing spaces. */
const tidy = (s) => s.replace(/[ \t]+\n/g, '\n');

const idArg = (x, quote) => (typeof x === 'number' ? String(x) : quote(x));

/** The print lines for a result, given a field accessor and a line template per shape. */
function printLines(o, L) {
  const s = o.show;
  if (!s) return [];
  if (s.obj) return ['', L.print(s.obj.map((f) => L.field(o.v, f)))];
  const fields = s.page ?? s.arr;
  const src = s.page ? L.items(o.v) : o.v;
  return ['', ...L.loop(src, L.print(fields.map((f) => L.field('item', f))))];
}

// ---------------------------------------------------------------------------
// TypeScript
// ---------------------------------------------------------------------------

// Free-form JSON objects (attributes, metadata, variables) keep their wire keys.
const FREEFORM = new Set(['attributes', 'metadata', 'variables']);

function tsNode(v, keyCase = camel) {
  if (Array.isArray(v)) return G('[', v.map((x) => tsNode(x, keyCase)), ']', { indent: '  ' });
  if (v && typeof v === 'object') {
    return G('{ ', Object.entries(v).map(([k, x]) => C(`${keyCase(k)}: `, tsNode(x, FREEFORM.has(k) ? (s) => s : keyCase))), ' }', { indent: '  ' });
  }
  return typeof v === 'string' ? q1(v) : String(v);
}
function ts(o) {
  WIDTH = 80;
  const args = o.ids.map((x) => idArg(x, q1));
  if (o.m === 'import') args.push(tsNode(o.p.items));
  else if (o.p) args.push(tsNode(o.p));
  const head = o.show ? `const ${o.v} = await ` : 'await ';
  const call = G(`opensms.${o.res}.${o.m}(`, args, ');', { indent: '  ', hug: true });
  return [
    'const opensms = new Opensms({ apiKey: process.env.OPENSMS_API_KEY! });', '',
    head + fmt(call, head.length),
    ...printLines(o, {
      field: (x, f) => `${x}.${camel(f)}`,
      print: (a) => `console.log(${a.join(', ')});`,
      items: (v) => `${v}.items`,
      loop: (src, body) => [`for (const item of ${src}) {`, `  ${body}`, '}'],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function pyNode(v) {
  if (Array.isArray(v)) return G('[', v.map(pyNode), ']');
  if (v && typeof v === 'object') return G('{', Object.entries(v).map(([k, x]) => C(`${q2(k)}: `, pyNode(x))), '}');
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  return typeof v === 'string' ? q2(v) : String(v);
}
const PY_KW = { from: 'from_' };
function py(o) {
  WIDTH = 88;
  const args = o.ids.map((x) => idArg(x, q2));
  if (o.m === 'import') args.push(pyNode(o.p.items));
  else if (o.p) for (const [k, x] of Object.entries(o.p)) args.push(C(`${PY_KW[k] ?? k}=`, pyNode(x)));
  const m = o.m === 'import' ? 'import_' : snake(o.m);
  const head = o.show ? `${o.v} = ` : '';
  const call = G(`client.${snake(o.res)}.${m}(`, args, ')', { hug: o.m === 'import' });
  return [
    'client = Opensms(api_key=os.environ["OPENSMS_API_KEY"])', '',
    head + fmt(call, head.length),
    ...printLines(o, {
      field: (x, f) => `${x}[${q2(f)}]`,
      print: (a) => `print(${a.join(', ')})`,
      items: (v) => `${v}.items`,
      loop: (src, body) => [`for item in ${src}:`, `    ${body}`],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

function goNode(v) {
  if (Array.isArray(v)) return G('[]string{', v.map(goNode), '}', { indent: '\t' });
  if (v && typeof v === 'object') return G('map[string]any{', Object.entries(v).map(([k, x]) => C(`${q2(k)}: `, goNode(x))), '}', { indent: '\t' });
  return typeof v === 'string' ? q2(v) : String(v);
}
/** A struct literal; gofmt aligns the values of a broken struct, which fmt() cannot, so it is done here. */
function goStruct(type, p) {
  const entries = Object.entries(p ?? {});
  const node = G(`${type}{`, entries.map(([k, x]) => {
    if (k === 'items') return C('Items: ', G('[]opensms.BatchItemInput{', x.map((i) => goStruct('', i)), '}', { indent: '\t' }));
    return C(`${goName(k)}: `, goNode(x));
  }), '}', { indent: '\t' });
  node.align = entries.map(([k]) => goName(k));
  return node;
}
/** gofmt: in a broken struct, pad "Key:" so the values of single-line fields line up. */
function goAlign(text) {
  const out = [];
  let run = [];
  const flush = () => {
    const w = Math.max(...run.map((r) => r.key.length));
    for (const r of run) out.push(`${r.ind}${r.key}:${' '.repeat(w - r.key.length + 1)}${r.rest}`);
    run = [];
  };
  for (const l of text.split('\n')) {
    const m = l.match(/^(\t+)([A-Z][A-Za-z0-9]*): (.*,)$/);
    if (m && run.length && run[0].ind !== m[1]) flush();
    if (m) { run.push({ ind: m[1], key: m[2], rest: m[3] }); continue; }
    if (run.length) flush();
    out.push(l);
  }
  if (run.length) flush();
  return out.join('\n');
}
function go(o) {
  WIDTH = 88;
  const res = o.res === 'otp' ? 'OTP' : o.res === 'senderIds' ? 'SenderIDs' : pascal(o.res);
  const args = ['ctx', ...o.ids.map((x) => idArg(x, q2))];
  const type = GO_TYPE[`${o.res}.${o.m}`] ?? TYPES[o.t]?.go;
  if (o.m === 'import') args.push(G('[]opensms.SuppressionInput{', o.p.items.map((i) => goStruct('', i)), '}', { indent: '\t' }));
  else if (o.t) args.push(goStruct(`opensms.${type}`, o.p));
  const head = o.show ? `${o.v}, err := ` : 'err = ';
  const call = G(`client.${res}.${goName(snake(o.m))}(`, args, ')', { indent: '\t', hug: true });
  return [
    'client, err := opensms.NewClient(os.Getenv("OPENSMS_API_KEY"))',
    'if err != nil {', '\tlog.Fatal(err)', '}', 'ctx := context.Background()', '',
    goAlign(head + fmt(call, head.length)),
    'if err != nil {', '\tlog.Fatal(err)', '}',
    ...printLines(o, {
      field: (x, f) => `${x}.${goName(f)}`,
      print: (a) => `fmt.Println(${a.join(', ')})`,
      items: (v) => `${v}.Items`,
      loop: (src, body) => [`for _, item := range ${src} {`, `\t${body}`, '}'],
    }).filter((l, i) => i > 0 || l !== ''),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// PHP
// ---------------------------------------------------------------------------

function phpNode(v) {
  if (Array.isArray(v)) return G('[', v.map(phpNode), ']');
  if (v && typeof v === 'object') return G('[', Object.entries(v).map(([k, x]) => C(`${q1(k)} => `, phpNode(x))), ']');
  if (typeof v === 'boolean') return String(v);
  return typeof v === 'string' ? q1(v) : String(v);
}
function php(o) {
  WIDTH = 88;
  const args = o.ids.map((x) => idArg(x, q1));
  if (o.m === 'import') args.push(phpNode(o.p.items));
  else if (o.p) args.push(phpNode(o.p));
  const head = o.show ? `$${o.v} = ` : '';
  const call = G(`$opensms->${o.res}->${o.m}(`, args, ');', { hug: true });
  return [
    "$opensms = new Client(getenv('OPENSMS_API_KEY'));", '',
    head + fmt(call, head.length),
    ...printLines(o, {
      field: (x, f) => `$${x}[${q1(f)}]`,
      print: (a) => `echo ${a.join(", ' ', ")}, PHP_EOL;`,
      items: (v) => `$${v}->items`,
      loop: (src, body) => [`foreach (${src.startsWith('$') ? src : `$${src}`} as $item) {`, `    ${body}`, '}'],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

const JAVA_LIST = { trailing: false, closeOnLast: true };
const JAVA_ARGS = { trailing: false, closeOnLast: true, indent: '        ' };
function javaNode(v) {
  if (Array.isArray(v)) return G('List.of(', v.map(javaNode), ')', JAVA_LIST);
  if (v && typeof v === 'object') return G('Map.of(', Object.entries(v).flatMap(([k, x]) => [q2(k), javaNode(x)]), ')', JAVA_LIST);
  return typeof v === 'string' ? q2(v) : String(v);
}
/** A builder: `new X(a, b)` followed by one `.field(value)` setter per remaining field. */
const javaChain = (head, setters) => ({ chain: true, head, setters });
function javaArgs(o) {
  const j = TYPES[o.t]?.java;
  const p = o.p ?? {};
  if (!j) return [];
  if (j.positional) return j.positional.map((k) => (p[k] === undefined ? 'null' : javaNode(p[k])));
  if (j.items) return [G('List.of(', p.items.map((i) => G(`new ${j.items}(`, Object.values(i).map(javaNode), ')', JAVA_ARGS)), ')', JAVA_LIST)];
  if (j.record) return [G(`new ${j.record}(`, j.args.map((k) => javaNode(p[k])), ')', JAVA_ARGS)];
  const setters = (skip) => Object.entries(p).filter(([k]) => !skip.includes(k)).map(([k, x]) => C(`.${camel(k)}(`, javaNode(x), ')'));
  if (j.ctor) {
    const head = G(`new ${j.ctor}(`, j.args.map((k) => (p[k] === undefined ? 'null' : javaNode(p[k]))), ')', JAVA_ARGS);
    const rest = setters(j.args);
    return [rest.length ? javaChain(head, rest) : head];
  }
  const s = setters([]);
  return s.length ? [javaChain(`new ${j.fluent}()`, s)] : [];
}
function java(o) {
  WIDTH = 88;
  const m = o.m === 'import' ? 'importItems' : o.m;
  const args = [...o.ids.map((x) => idArg(x, q2)), ...javaArgs(o)];
  const head = o.show ? `var ${o.v} = ` : '';
  const pre = `opensms.${o.res}().${m}(`;
  let callText;
  const chain = args.find((a) => a && a.chain);
  if (chain) {
    const chainFlat = flat(chain.head) + chain.setters.map(flat).join('');
    const one = `${head}${pre}${[...args.slice(0, -1).map(flat), chainFlat].join(', ')});`;
    if (cols(one) <= WIDTH) callText = one;
    else {
      // Too long for one line: build the parameters first, one setter per line.
      const built = `var params = ${fmt(chain.head, 13)}\n${chain.setters.map((x) => `    ${fmt(x, 4, '    ')}`).join('\n')};`;
      const call = `${head}${pre}${[...args.slice(0, -1).map(flat), 'params'].join(', ')});`;
      callText = `${built}\n${call}`;
    }
  } else {
    callText = head + fmt(G(pre, args, ');', { ...JAVA_ARGS, hug: true }), head.length);
  }
  return [
    'OpensmsClient opensms = new OpensmsClient(System.getenv("OPENSMS_API_KEY"));', '',
    callText,
    ...printLines(o, {
      field: (x, f) => `${x}.${camel(f)}`,
      print: (a) => `System.out.println(${a.join(' + " " + ')});`,
      items: (v) => `${v}.items`,
      loop: (src, body) => [`for (var item : ${src}) {`, `    ${body}`, '}'],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// C#
// ---------------------------------------------------------------------------

function csNode(v) {
  if (Array.isArray(v)) return G('[', v.map(csNode), ']', { openB: '\n[' });
  if (v && typeof v === 'object') return G('new Dictionary<string, object?> { ', Object.entries(v).map(([k, x]) => C(`[${q2(k)}] = `, csNode(x))), ' }', { openB: 'new Dictionary<string, object?>\n{', trailing: true });
  if (typeof v === 'boolean') return String(v);
  return typeof v === 'string' ? q2(v) : String(v);
}
/** An object initialiser; broken, C# puts the brace on its own line. */
function csInit(type, p) {
  return G(`new ${type} { `, Object.entries(p).map(([k, x]) => {
    if (k === 'items') return C('Items = ', G('[', x.map((i) => csInit('BatchItemInput', i)), ']', { openB: '\n[' }));
    return C(`${pascal(k)} = `, csNode(x));
  }), ' }', { openB: `new ${type}\n{` });
}
function cs(o) {
  WIDTH = 88;
  const args = o.ids.map((x) => idArg(x, q2));
  if (o.m === 'import') args.push(G('[', o.p.items.map((i) => csInit('SuppressionParams', i)), ']', { openB: '\n[' }));
  else if (o.t && o.p) args.push(csInit(TYPES[o.t].cs, o.p));
  const head = o.show ? `var ${o.v} = await ` : 'await ';
  const call = G(`client.${pascal(o.res)}.${pascal(o.m)}Async(`, args, ');', { trailing: false, hug: true });
  return [
    'using var client = new OpensmsClient(Environment.GetEnvironmentVariable("OPENSMS_API_KEY")!);', '',
    head + fmt(call, head.length),
    ...printLines(o, {
      field: (x, f) => `${x}.${pascal(f)}`,
      print: (a) => `Console.WriteLine(${a.length === 1 ? a[0] : `$"${a.map((x) => `{${x}}`).join(' ')}"`});`,
      items: (v) => `${v}.Items`,
      loop: (src, body2) => [`foreach (var item in ${src})`, '{', `    ${body2}`, '}'],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Ruby
// ---------------------------------------------------------------------------

function rbNode(v) {
  if (Array.isArray(v)) return G('[', v.map(rbNode), ']', { indent: '  ', trailing: false });
  if (v && typeof v === 'object') return G('{ ', Object.entries(v).map(([k, x]) => C(`${/^[a-z_][a-z0-9_]*$/.test(k) ? `${k}:` : `${q2(k)} =>`} `, rbNode(x))), ' }', { indent: '  ', trailing: false });
  return typeof v === 'string' ? q2(v) : String(v);
}
function rb(o) {
  WIDTH = 80;
  const args = o.ids.map((x) => idArg(x, q2));
  if (o.m === 'import') args.push(rbNode(o.p.items));
  else if (o.p) for (const [k, x] of Object.entries(o.p)) args.push(C(`${k}: `, rbNode(x)));
  const head = o.show ? `${o.v} = ` : '';
  const call = G(`client.${snake(o.res)}.${snake(o.m)}(`, args, ')', { indent: '  ', trailing: false, hug: o.m === 'import' });
  return [
    'client = Opensms::Client.new(api_key: ENV.fetch("OPENSMS_API_KEY"))', '',
    head + fmt(call, head.length),
    ...printLines(o, {
      field: (x, f) => `${x}[:${f}]`,
      print: (a) => `puts ${a.length === 1 ? a[0] : `"${a.map((x) => `#{${x}}`).join(' ')}"`}`,
      items: (v) => `${v}.items`,
      loop: (src, body) => [`${src}.each do |item|`, `  ${body}`, 'end'],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

// rustfmt's default "small heuristics": call arguments and arrays break past
// 60 columns, struct literal bodies past 18, method chains past 60.
const RS_CALL = { maxFlat: 60 };
const RS_STRUCT = { maxFlat: 18 };
function rustNode(v) {
  if (Array.isArray(v)) return G('vec![', v.map(rustNode), ']', RS_CALL);
  if (v && typeof v === 'object') return C('serde_json::json!(', G('{ ', Object.entries(v).map(([k, x]) => C(`${q2(k)}: `, q2(x))), ' }', { trailing: false }), ')');
  return typeof v === 'string' ? `${q2(v)}.into()` : String(v);
}
function rustStruct(r, p, uses) {
  uses.add(r.name);
  const keys = Object.keys(p ?? {});
  if (r.ctor && keys.length === r.ctor.length && r.ctor.every((k) => k in p)) return G(`${r.name}::new(`, r.ctor.map((k) => q2(p[k])), ')', RS_CALL);
  if (!keys.length) return `${r.name}::default()`;
  const fields = keys.map((k) => {
    if (k === 'items') {
      uses.add('BatchItemInput');
      return C('items: ', G('vec![', p.items.map((i) => G('BatchItemInput::new(', [q2(i.to), q2(i.text)], ')', RS_CALL)), ']', RS_CALL));
    }
    const val = rustNode(p[k]);
    return C(`${k === 'match' ? 'r#match' : k}: `, r.opt?.includes(k) ? C('Some(', val, ')') : val);
  });
  // `..Default::default()` fills the optional fields the sample leaves out.
  const missing = !r.nodefault && (r.opt ?? []).some((k) => !(k in p));
  const node = G(`${r.name} { `, [...fields, ...(missing ? ['..Default::default()'] : [])], ' }', { openB: `${r.name} {`, ...RS_STRUCT });
  return node;
}
// Printed response fields that are not Option in the Rust SDK; of the Option
// ones, those holding a Copy value (numbers, booleans). Every other printed field
// is Option<String>. Taken from sdks/packages/rust/src/models.rs at 0.1.0, so
// the samples print plain values ("ready"), never Some("ready").
const RS_PLAIN = new Set(['id', 'otp_id']);
const RS_OPT_COPY = new Set(['valid', 'invalid', 'attempts_left', 'available', 'version', 'created', 'received', 'sent', 'delivered']);
function rustField(x, f) {
  const e = `${x}.${f === 'match' ? 'r#match' : f}`;
  if (RS_PLAIN.has(f)) return e;
  return RS_OPT_COPY.has(f) ? `${e}.unwrap_or_default()` : `${e}.as_deref().unwrap_or_default()`;
}
function rust(o) {
  WIDTH = 100;
  const uses = new Set(['Client']);
  const args = o.ids.map((x) => idArg(x, q2));
  const r = TYPES[o.t]?.rust;
  if (o.m === 'import') {
    uses.add('CreateSuppression');
    args.push(C('&', G('[', o.p.items.map((i) => G('CreateSuppression { ', [C('e164: ', `${q2(i.e164)}.into()`), C('reason: ', `${q2(i.reason)}.into()`)], ' }', { openB: 'CreateSuppression {', ...RS_STRUCT })), ']', RS_CALL)));
  } else if (r) {
    const s = rustStruct(r, o.p, uses);
    args.push(r.val ? s : C('&', s));
  }
  const head = o.show ? `let ${o.v} = ` : '';
  // rustfmt keeps a struct argument on the call's line only when it is the only argument.
  const callNode = G(`.${snake(o.m)}(`, args, ')', { hug: args.length === 1, ...RS_CALL });
  const chain = `client.${snake(o.res)}()${flat(callNode)}.await?`;
  let text;
  if (cols(head + chain) + 1 <= WIDTH && cols(chain) <= 60 && flatOk(callNode)) text = `${head}${chain};`;
  else text = `${head}client\n    .${snake(o.res)}()\n    ${fmt(callNode, 4, '    ')}\n    .await?;`;
  // rustfmt: no comma after `..Default::default()`.
  text = text.replace(/(\.\.Default::default\(\)),\n/g, '$1\n');
  return [
    'let client = Client::new(std::env::var("OPENSMS_API_KEY").unwrap())?;', '',
    text,
    ...printLines(o, {
      field: (x, f) => rustField(x, f),
      print: (a) => `println!("${a.map(() => '{}').join(' ')}", ${a.join(', ')});`,
      items: (v) => `&${v}.items`,
      loop: (src, body) => [`for item in ${src.startsWith('&') ? src : `&${src}`} {`, `    ${body}`, '}'],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Swift
// ---------------------------------------------------------------------------

function swiftNode(v) {
  if (Array.isArray(v)) return G('[', v.map(swiftNode), ']');
  if (v && typeof v === 'object') return G('[', Object.entries(v).map(([k, x]) => C(`${q2(k)}: `, swiftNode(x))), ']');
  return typeof v === 'string' ? q2(v) : String(v);
}
function swiftLabels(order, p) {
  for (const k of Object.keys(p ?? {})) if (!order.includes(k)) throw new Error(`sdk-snippets: the Swift SDK has no parameter ${k}`);
  return order.filter((k) => k in (p ?? {})).map((k) => {
    if (k === 'items') return C('items: ', G('[', p.items.map((i) => `.init(to: ${q2(i.to)}, text: ${q2(i.text)})`), ']'));
    return C(`${camel(k)}: `, swiftNode(p[k]));
  });
}
// Response fields that are optionals in the Swift SDK, by the default printed
// in their place (taken from the compiler: every other printed field is not
// optional).
const SWIFT_OPT_STRING = new Set(['status', 'state', 'e164', 'name', 'url', 'secret', 'from', 'number', 'monthlyFee', 'match', 'action', 'value', 'reason', 'quoteId', 'kind', 'iso2', 'pattern', 'currency', 'balance', 'amount', 'authorizationUrl', 'product', 'key', 'to', 'text', 'carrier', 'provider']);
const SWIFT_OPT_INT = new Set(['attemptsLeft', 'version', 'created', 'received', 'sent', 'delivered', 'invalid']);
function swiftField(o, x, f) {
  const n = camel(f);
  const e = `${x}.${n}`;
  if (n === 'valid') return `${e} ?? ${o.m === 'validation' ? '0' : 'false'}`;
  if (n === 'available') return `${e} ?? false`;
  if (n === 'bucket') return `${e}?.description ?? ""`;
  if (SWIFT_OPT_STRING.has(n)) return `${e} ?? ""`;
  if (SWIFT_OPT_INT.has(n)) return `${e} ?? 0`;
  return e;
}
function swift(o) {
  WIDTH = 100;
  const s = TYPES[o.t]?.swift;
  const args = o.ids.map((x) => idArg(x, q2));
  // The second path argument is labelled in the Swift SDK.
  if (args.length > 1) args[1] = `${o.m === 'replayDelivery' ? 'deliveryId' : 'ruleId'}: ${args[1]}`;
  if (o.m === 'import') args.push(G('[', o.p.items.map((i) => `.init(e164: ${q2(i.e164)}, reason: ${q2(i.reason)})`), ']'));
  else if (s && o.p) {
    const labels = swiftLabels(s.order, o.p);
    if (s.init) args.push(G('.init(', labels, ')', { trailing: false }));
    else args.push(...labels);
  }
  const name = o.m === 'import' ? '`import`' : o.m;
  const head = o.show ? `let ${o.v} = try await ` : 'try await ';
  const call = G(`opensms.${o.res}.${name}(`, args, ')', { trailing: false, hug: true });
  return [
    'let apiKey = ProcessInfo.processInfo.environment["OPENSMS_API_KEY"] ?? ""',
    'let opensms = try OpensmsClient(apiKey: apiKey)', '',
    head + fmt(call, head.length),
    ...printLines(o, {
      field: (x, f) => swiftField(o, x, f),
      print: (a) => `print(${a.join(', ')})`,
      items: (v) => `${v}.items`,
      loop: (src, body) => [`for item in ${src} {`, `    ${body}`, '}'],
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Tab order after cURL, with the fence language of each. */
export const SDK_LANGS = [
  { fence: 'ts', label: 'TypeScript', render: ts },
  { fence: 'python', label: 'Python', render: py },
  { fence: 'go', label: 'Go', render: go },
  { fence: 'php', label: 'PHP', render: php },
  { fence: 'java', label: 'Java', render: java },
  { fence: 'csharp', label: 'C#', render: cs },
  { fence: 'ruby', label: 'Ruby', render: rb },
  { fence: 'rust', label: 'Rust', render: rust },
  { fence: 'swift', label: 'Swift', render: swift },
];

/** SDK samples for an operation key ("POST /v1/messages"), or null when no SDK wraps it. */
export function sdkSnippets(key) {
  const o = SDK_OPS[key];
  if (!o) return null;
  return SDK_LANGS.map((l) => ({ fence: l.fence, label: l.label, code: tidy(l.render(o)) }));
}
