# Admin guide

For the firm's Tax Admin. Everything below is in the ERPNext desk under **Pakistan Income Tax Consultancy** (`/app/pakistan-income-tax-consultancy`) unless it says *portal*.

## 1. Before you open the doors

1. **Firm Website Settings** — firm name, logo, brand colour, phone, WhatsApp number (e.g. `923001234567`), email, address, office hours, Google Maps link and embed URL, years of experience and membership number (*only true facts — they appear on the website*), bank / IBAN / Raast / JazzCash / Easypaisa details, announcement bar, and whether work may start before payment. Fields marked `[FILL]` are hidden from visitors until you replace them.
2. **Tax Year** — check each year's start/end and **Return Due Date** (the website countdown and reminders use it). Add next year when the Finance Act is passed.
3. **Tax Slab Setting** — the shipped slabs are DEMO values. For each tax year and taxpayer type (Salaried Individual, Non-Salaried Individual, AOP, Company), check every row against the Finance Act / FBR notification, then set *Validation Status* to validated and fill *Legal Reference*. Rows read: *where income exceeds From but not To, tax = Fixed Tax + Rate % of the amount above From*.
4. **Withholding Tax Section** and **Tax Credit Rule** — same check.
5. **Service** and **Service Package** — replace the demo prices, turnaround and inclusions with your own; untick *Published* for services you do not offer.
6. **Document Type** and **Document Requirement Rule** — which documents each client type must upload. A rule can apply only when the client answered *Yes* to a questionnaire question (e.g. *Bank Profit Certificate* when *has_profit_on_debt*).
7. **Tax Consultancy Settings** — default consultant for self-registered clients, upload size limit, OTP expiry, deadline-reminder days, billing company and fee item.
8. **Legal pages** — `/privacy`, `/terms` and `/refund-policy` are drafts marked *TO BE REVIEWED BY OWNER*; edit `www/privacy.html`, `www/terms.html`, `www/refund-policy.html` and remove the banner in `templates/ptc/legal.html` once reviewed.
9. **Staff users** — create a User per person and give exactly one working role: Tax Admin, Tax Consultant, Tax Reviewer, Tax Approver, Filing Officer or Field Officer.

## 2. Roles at a glance

| Role | Does |
|---|---|
| Tax Admin | Everything in the app, verifies payments, edits website content, exports reports |
| Tax Consultant | Registers clients, prepares returns, verifies documents (own clients only) |
| Tax Reviewer | Reviews returns (checklist), requests changes, sends to the client |
| Tax Approver | Approves a client-confirmed return — never one they prepared |
| Filing Officer | Files on IRIS, attaches the acknowledgment and receipt, reports filing errors |
| Field Officer | Records site visits and new leads |
| Client | Portal only — their own records |

## 3. Daily work

- **Payments to verify** (*portal → Payments to Verify*): match the proof with your bank / wallet statement, then **Verify** — this creates the Sales Invoice and Payment Entry in ERPNext — or **Reject** with a reason the client sees.
- **Consultation requests**: each website booking also created an ERPNext Lead; set the status as you call.
- **Website content**: FAQ, Tax Update (blog) and Testimonial records. Publish a testimonial only with the client's consent recorded (*Client consent received* + evidence attached).
- **Promo Code**: percentage or fixed discounts with validity dates and a usage cap.

## 4. The return workflow

| Step | Who | What the system checks |
|---|---|---|
| Documents Pending → Draft | Consultant (automatic when the last required document is verified) | Every required document verified; fee paid if *Start work before payment* is off |
| Draft → Pending Review | Consultant | Income entered, taxpayer type set, calculation current |
| Under Review → Changes Required | Reviewer | A comment |
| Under Review → Reviewed | Reviewer | Review checklist all Pass / N/A and calculation verified |
| Reviewed → Awaiting Client Confirmation | Reviewer | Client has a portal login |
| Client confirms / asks a question | Client (portal) | Records time and IP; a question sends it back with the comment |
| → Approved | Approver | Client confirmed; approver ≠ preparer; stores a fingerprint of the figures |
| Approved → Submitted to FBR | Filing Officer | Figures unchanged since approval; creates a Filing Record |
| Submitted → Acknowledged | Filing Officer | IRIS acknowledgment number + FBR receipt attached |
| Submitted → Filing Error | Filing Officer | Error description |

Changing any figure after review or approval sends the return back to **Pending Review** automatically and cancels the approval. A filed return cannot change — use **Create Revised Return** (desk form → Tools).

## 5. Reports

*Reports* card in the workspace (or *portal → Reports*): Client Master, Site Visits and Follow-ups, Missing Documents, Returns by Status, Review and Approval Aging, Consultant Workload, Filing Status and Errors, Tax Payable and Refund Summary, Fees and Collections, Consultation Requests. Each shows only the records the user may see; export to Excel / CSV is limited to Tax Admin.

## 6. Settings page: WhatsApp, email, payments

*Portal → Settings* (Tax Admin). Secrets (tokens, passwords, keys) are stored encrypted and never shown again; leave the field blank to keep the stored one.

- **Firm**: the details shown on the website, portal and invoices, plus the bank / wallet details clients pay to.
- **WhatsApp**
  - *Click-to-chat* works now: every WhatsApp button opens a chat with your number.
  - *WhatsApp Cloud API* sends automatic updates to clients who ticked "Send me updates on WhatsApp" (at sign-up or in their profile). You need a Meta Business account, a WhatsApp Business phone number, its **Phone Number ID**, a permanent **system-user access token**, and approved **message templates**. The page lists the placeholders each template needs, e.g. *filed*: `{{1}}` client name, `{{2}}` tax year, `{{3}}` IRIS acknowledgment no. Use **Send test** (Meta's `hello_world` template) before switching updates on.
- **Email**: creates the default outgoing ERPNext Email Account. Saving checks the login with the mail server; then send a test. For Gmail / Google Workspace use an App Password.
- **Payment gateway**: choose JazzCash, Easypaisa, Safepay, PayFast or Bank Alfalah and store the credentials the gateway gives you. Online checkout stays off until that gateway's checkout has been built and tested in Sandbox; until then clients pay by transfer and upload proof.

SMS still uses the *Console (development)* provider (messages go to the server log). To go live, add the provider in `services/sms.py` with credentials in `site_config.json`, and select it in Tax Consultancy Settings.

## 7. Demo data

Remove it before going live: `bench --site consultant execute pakistan_tax_consultancy.setup.demo.remove_demo_data`. It deletes only records in the `@demo.taxportal.example` domain or tagged *DEMO DATA*.
