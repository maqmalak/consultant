# Pakistan Tax Consultancy

Website, client portal and back office for an income tax consultancy in Pakistan, built on ERPNext / Frappe v16.

- **Public website** (`/`): server-rendered pages — services, pricing, salary tax calculator, consultation booking, FAQ, tax updates, legal pages — in English and Urdu.
- **Client portal** (`/portal`): sign up with mobile OTP, choose a package, answer a short questionnaire, upload documents (phone camera supported), confirm the return summary, pay, message the consultant, download the IRIS acknowledgment.
- **Staff workspace** (`/portal/staff`, plus the ERPNext desk): clients, site visits, a 10-step Tax Return wizard, review / approval / filing queues, document and payment verification, reports.

Returns move through a 12-state workflow — *Documents Pending → Draft → Pending Review → Under Review → Reviewed → Awaiting Client Confirmation → Approved → Submitted to FBR → Acknowledged → Closed* (plus *Changes Required* and *Filing Error*). Every rule is enforced on the server, so neither the desk, the REST API nor the portal can skip a step.

## Layout

| Path | What it is |
|---|---|
| `pakistan_tax_consultancy/services/` | Business logic: `workflow.py` (states, transitions, guards), `tax_calc.py`, `checklist.py`, `files.py`, `filing.py` (Manual IRIS adapter; FBR API stub disabled), `billing.py`, `otp.py`, `sms.py`, `notify.py` |
| `pakistan_tax_consultancy/api/` | Whitelisted endpoints: `public.py` (website), `auth.py` (sign-up / OTP), `portal.py` (client), `staff.py` (back office) |
| `pakistan_tax_consultancy/permissions.py` | Record-level isolation: clients see only themselves, consultants only assigned clients |
| `pakistan_tax_consultancy/www/`, `templates/ptc/` | Public website (Jinja) |
| `pakistan_tax_consultancy/setup/` | `install.py` (idempotent site setup + workflow), `content.py` (starter content), `demo.py` (demo data) |
| `frontend/` | React + TypeScript portal (Vite, Tailwind, react-i18next). Builds into `public/frontend/` and `www/portal.html` |
| `scripts/api_checks.sh` | curl checks proving forbidden actions fail |
| `docs/PLAN.md` | Architecture, data model, permission matrix, workflow table |

## Development

```bash
# desk + website on :8010, portal dev server on :5180 (proxies /api to :8010)
cd sites && ../env/bin/python -m frappe.utils.bench_helper frappe --site consultant serve --port 8010
cd apps/pakistan_tax_consultancy/frontend && npm run dev          # http://consultant.localhost:5180/portal/

# production build of the portal + website CSS (also run by `bench build --app pakistan_tax_consultancy`)
cd apps/pakistan_tax_consultancy/frontend && npm run build
```

Use the `consultant.localhost` host name in the browser: every site on this bench shares cookie names, and the separate host keeps this login apart from the others.

## Tests

```bash
bench --site consultant run-tests --app pakistan_tax_consultancy     # 23 Python tests (workflow, isolation, OTP, payments…)
cd apps/pakistan_tax_consultancy/frontend && npm test                # 11 Vitest tests
bash apps/pakistan_tax_consultancy/scripts/api_checks.sh             # 20 curl checks (needs demo data)
```

## Demo data

```bash
bench --site consultant execute pakistan_tax_consultancy.setup.demo.create_demo_data
bench --site consultant execute pakistan_tax_consultancy.setup.demo.remove_demo_data
```

Creates one user per role (`<role>@demo.taxportal.example`) and four clients (salaried, business, AOP, company) with fake CNICs, walked through the real workflow. The password is written to `~/.consultant-demo-secrets`, never to git.

## Honesty rules built in

- Tax slabs ship as **DEMO — NOT VALIDATED**; the staff screens and the calculator say so until an admin validates them against the Finance Act.
- The website shows testimonials only when the client's consent is recorded, and the trust strip only shows facts entered in Firm Website Settings.
- A return is never marked filed without the IRIS acknowledgment number and the FBR receipt.
- No FBR endpoints are invented: filing is recorded from IRIS by the filing officer.
