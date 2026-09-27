# Account types

Before a workspace can send real messages, OpenSMS needs to know who is sending. You do not need a company for this. You can verify as a person, as a registered business name, or as a company, and you can move up later without any break in sending. This page is for workspace owners deciding how to verify, and for developers building on their own.

Sandbox sending never needs any of this. Verification only matters when you [go live](go-live.md).

## The three types

Choose the type when you create a profile under **Business profiles**. The type is fixed for that profile. If your situation changes, create a new profile of the new type and [switch to it](#upgrade-to-a-business).

| Type | Pick it if | You provide | Sender IDs |
| --- | --- | --- | --- |
| Just me (individual) | You are a developer or sole user with no registered business. | Your full name, your country and your tax PIN, plus your ID and tax PIN certificate. | You send from the shared OpenSMS sender ID. You cannot register your own. |
| Registered business name (sole proprietor) | Your business name is registered to you personally. | The business name, country and registration number, plus the registration certificate and your ID. | You can register your own sender ID. |
| Company | You run a limited company or another incorporated body. | The legal name, country, registration number and address, plus the certificate of incorporation, proof of address and a director's ID. | You can register your own sender ID. |

## What each type needs in Kenya

Every document is a PDF, PNG or JPEG of up to 10 MiB. OpenSMS checks each file for viruses and a person reviews it.

**Just me (individual)**

| Item | What to upload |
| --- | --- |
| National ID or passport | A clear copy of the front and back of your national ID, or the photo page of your passport. |
| KRA PIN certificate | Download it free from iTax. Your KRA PIN also goes in the **Tax PIN** field, for example `A123456789B`. |

No utility bill or proof of address is needed.

**Registered business name (sole proprietor)**

| Item | Required | What to upload |
| --- | --- | --- |
| Business name certificate | Yes | The certificate from eCitizen (Business Registration Service). |
| Your ID | Yes | Your national ID or passport. |
| Proof of address | No | A bank statement, lease or KRA PIN certificate that shows the address. |
| KRA PIN certificate | No | From iTax. |

**Company**

| Item | Required | What to upload |
| --- | --- | --- |
| Certificate of incorporation | Yes | From the Business Registration Service. |
| A director's ID | Yes | A national ID or passport. |
| Proof of address | Yes, or explain | A bank statement, lease or KRA PIN certificate that shows the address. If you have none, use **Don't have this?** below. |

The checklist on each profile always shows what that type needs, marked required or optional, so you do not have to remember this table.

## Don't have this?

Some companies have no utility bill or lease in the company's name, for example when they share an office. Where a document can be explained instead, its row has a **Don't have this?** link.

1. Click **Don't have this?** under the document.
2. Explain in your own words why you cannot provide it and what you can offer instead. Use 20 to 1000 characters.
3. Click **Save explanation**. You can submit the profile for review with the explanation in place of the document.

A reviewer reads the explanation and accepts it or asks for a document. If they ask for a document, the row shows their reason; upload the document or one of the listed alternatives. You can withdraw an explanation while the profile is still a draft.

## What an individual account can do

Once an individual profile is approved and the workspace goes live, you can send real OTP and transactional messages straight away. A few limits apply until you verify a business:

| Limit | What it means |
| --- | --- |
| Shared sender ID | Messages go out from the shared OpenSMS sender ID for the destination market. Leave the sender blank when you send. |
| Monthly spend limit | OpenSMS sets a maximum monthly spend for the account. You can set your own lower cap in [Settings](settings.md), but not above the limit and not blank. |
| API request rate | Your API keys have a lower request rate. |
| No marketing messages | OTP and transactional messages are allowed. Marketing messages are refused with "this traffic type is not available for this account". |

**Settings > Workspace** shows your account type and these limits. If you need more, [upgrade to a business](#upgrade-to-a-business) or contact support; OpenSMS can adjust the limits for a workspace.

## Upgrade to a business

When you register a business name or a company, move the workspace to it. Sending does not stop at any point.

1. Open **Business profiles** and click **Upgrade to a business** on your individual profile, or create a new profile and pick **Registered business name** or **Company**. The name is filled in from your individual profile; change it to the registered name.
2. Upload the documents in its checklist and submit it. A reviewer approves the profile as usual.
3. Once it is approved, click **Use for this workspace**. Because the workspace is already verified, this files an identity change for review instead of switching straight away. A banner says the change is waiting and that sending continues under your current identity and limits.
4. When OpenSMS approves the change, the workspace switches to the business in one step. Your limits become those of a business: no spend limit beyond your own cap, the normal request rate and marketing messages allowed. You can now [apply for your own sender ID](sender-ids.md).

You can cancel a waiting change from the banner. If OpenSMS turns the change down, the banner shows the reason and your current identity stays in place.

A verified business cannot switch back to an individual account. If the business has closed, contact support.

## Related

- [Go live](go-live.md)
- [Compliance and verification](compliance-and-verification.md)
- [Sender IDs](sender-ids.md)
- [Settings](settings.md)
