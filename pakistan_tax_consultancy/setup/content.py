"""Starter content, inserted once (only what is missing) — after that it belongs to the admin.

Tax slabs are DEMO values marked "DEMO — NOT VALIDATED": check every figure against the Finance Act / FBR
notifications before relying on a calculation. Prices are placeholders to replace with the firm's own.
"""

import frappe

DEMO = "DEMO — NOT VALIDATED"

TAX_YEARS = [
	("2026", "2025-07-01", "2026-06-30", "2026-09-30"),
	("2027", "2026-07-01", "2027-06-30", "2027-09-30"),
]

DOCUMENT_TYPES = [
	# name, category, hint
	("CNIC Copy", "Identity", "Front and back of your CNIC (one PDF or two photos)."),
	("NTN Certificate", "Identity", "Only if you already have an NTN."),
	("Salary Certificate", "Income", "From your employer, for the full tax year (July–June)."),
	("Salary Slip", "Income", "Any recent monthly slip."),
	("Withholding Tax Certificate", "Withholding", "Tax deducted by your employer, bank, telecom or other payers."),
	("Advance Tax Challan (CPR)", "Withholding", "Computerised Payment Receipt for advance tax you paid."),
	("Bank Statement", "Banking", "Statement for 1 July – 30 June of every account you hold."),
	("Bank Profit Certificate", "Banking", "Profit on savings / term deposits with tax deducted."),
	("Rent Agreement", "Property", "For property you rent out."),
	("Property Documents", "Property", "Registry / allotment letter / transfer letter for property you own."),
	("Vehicle Registration", "Wealth", "Registration book of vehicles you own."),
	("Business Accounts", "Business", "Profit & loss and balance sheet, or summary of receipts and expenses."),
	("Sales & Purchase Records", "Business", "Sales and purchase summary for the year."),
	("Previous Year Return", "Previous Returns", "Last year's return and wealth statement, if filed."),
	("Wealth Statement Records", "Wealth", "Details of assets, liabilities and household expenses."),
	("Utility Bills", "Utility", "Electricity / gas / phone bills showing tax deducted (optional)."),
	("Company Incorporation Certificate", "Business", "SECP certificate of incorporation."),
	("Partnership Deed", "Business", "Registered partnership deed for an AOP."),
]

# document type, mandatory, client type, when_answer
RULES = [
	("CNIC Copy", 1, "", ""),
	("Salary Certificate", 1, "", "has_salary"),
	("Withholding Tax Certificate", 0, "", "has_salary"),
	("Bank Statement", 1, "Individual-Salaried", ""),
	("Bank Statement", 1, "Individual-Business", ""),
	("Bank Profit Certificate", 1, "", "has_profit_on_debt"),
	("Rent Agreement", 1, "", "has_property_income"),
	("Property Documents", 1, "", "owns_property"),
	("Vehicle Registration", 1, "", "owns_vehicle"),
	("Business Accounts", 1, "", "has_business"),
	("Sales & Purchase Records", 0, "", "has_business"),
	("Previous Year Return", 0, "", ""),
	("Wealth Statement Records", 0, "", ""),
	("Utility Bills", 0, "", ""),
	("Company Incorporation Certificate", 1, "Company", ""),
	("Partnership Deed", 1, "AOP", ""),
]

SERVICES = [
	# title, slug, category, icon, summary, required docs, order
	("Income Tax Return Filing", "income-tax-return", "Tax Filing", "file-text",
		"Annual return and wealth statement for salaried people and business owners, filed on FBR IRIS.",
		["CNIC Copy"], 1),
	("NTN Registration", "ntn-registration", "Registration", "id-card",
		"Get registered with FBR and receive your National Tax Number.", ["CNIC Copy", "Utility Bills"], 2),
	("Sales Tax Registration", "sales-tax-registration", "Registration", "receipt",
		"GST / provincial sales tax registration for businesses that must charge sales tax.",
		["CNIC Copy", "NTN Certificate", "Utility Bills", "Bank Statement"], 3),
	("Company Registration (SECP)", "company-registration", "Corporate", "building-2",
		"Incorporate a private limited or single-member company with SECP.", ["CNIC Copy"], 4),
	("FBR Notice Reply", "fbr-notice-reply", "Advisory", "mail-warning",
		"We read the notice, prepare the reply and the supporting schedules.", ["CNIC Copy"], 5),
	("Tax Consultation", "tax-consultation", "Advisory", "messages-square",
		"A one-to-one session on your tax position, by phone, video or at our office.", [], 6),
]

PACKAGES = [
	# name, service, price, turnaround, for whom, popular, order, inclusions
	("Basic Filing", "Income Tax Return Filing", 4000, "3–5 working days",
		"Salaried individuals with one employer and a bank account.", 0, 1,
		["Income tax return", "Wealth statement", "IRIS acknowledgment copy"]),
	("Express Filing", "Income Tax Return Filing", 6500, "24–48 hours",
		"Anyone who needs the return filed quickly, including near the deadline.", 1, 2,
		["Everything in Basic", "Priority preparation and review", "Same-day document check"]),
	("Consultant Plus", "Income Tax Return Filing", 15000, "By appointment",
		"Business income, rental income, multiple properties or complex wealth reconciliation.", 0, 3,
		["One-to-one session with a senior consultant", "Business / rental schedules", "Wealth reconciliation review"]),
	("NTN Registration", "NTN Registration", 2500, "1–2 working days", "First-time taxpayers.", 0, 4,
		["IRIS registration", "NTN certificate"]),
]

# Finance Act 2025 rates as understood at build time — DEMO, verify before use. (from, to, fixed tax, rate %)
SLABS = {
	"Salaried Individual": [(0, 600000, 0, 0), (600000, 1200000, 0, 1), (1200000, 2200000, 6000, 11),
		(2200000, 3200000, 116000, 23), (3200000, 4100000, 346000, 30), (4100000, 0, 616000, 35)],
	"Non-Salaried Individual": [(0, 600000, 0, 0), (600000, 1200000, 0, 15), (1200000, 1600000, 90000, 20),
		(1600000, 3200000, 170000, 30), (3200000, 5600000, 650000, 40), (5600000, 0, 1610000, 45)],
	"AOP": [(0, 600000, 0, 0), (600000, 1200000, 0, 15), (1200000, 1600000, 90000, 20),
		(1600000, 3200000, 170000, 30), (3200000, 5600000, 650000, 40), (5600000, 0, 1610000, 45)],
	"Company": [(0, 0, 0, 29)],
}

WHT_SECTIONS = [
	("149", "Salary", "Adjustable"), ("151", "Profit on debt (bank profit)", "Final"),
	("153", "Payments for goods and services", "Minimum"), ("155", "Income from property (rent)", "Adjustable"),
	("231B", "Motor vehicle registration / transfer", "Adjustable"), ("235", "Electricity bill", "Adjustable"),
	("236", "Telephone / internet", "Adjustable"), ("236K", "Purchase of immovable property", "Adjustable"),
]

FAQS = [
	("General", "Who should file an income tax return?",
		"<p>Anyone whose taxable income is above the exemption limit, and anyone who wants to be on FBR's Active "
		"Taxpayers List (ATL) — which lowers the tax deducted on banking, property and vehicle transactions.</p>"),
	("Filing", "How does filing with you work?",
		"<p>Create an account and verify your mobile number, answer a short questionnaire, upload your documents, "
		"then we prepare and review your return. You confirm the summary, we file it on FBR IRIS on your behalf "
		"and send you the acknowledgment.</p>"),
	("Filing", "Do you file on my behalf?",
		"<p>Yes — with your authorisation we file your return on FBR IRIS and share the IRIS acknowledgment with you. "
		"Nothing is filed until you confirm the summary.</p>"),
	("Documents", "Which documents will I need?",
		"<p>Usually your CNIC, salary certificate, bank statements and certificates of tax deducted. The portal builds "
		"a checklist from your answers so you only upload what applies to you.</p>"),
	("Documents", "Are my documents safe?",
		"<p>Documents are stored as private files. Only you and the staff assigned to your case can open them, and every "
		"download is logged.</p>"),
	("Payments", "How can I pay?",
		"<p>By bank transfer, Raast, JazzCash or Easypaisa. Upload a screenshot of the payment in the portal and we "
		"confirm it.</p>"),
	("NTN & Registration", "I don't have an NTN. Can you help?",
		"<p>Yes. For individuals the NTN is your CNIC number once you are registered on IRIS; we handle the "
		"registration for you.</p>"),
	("Privacy", "Will you share my information?",
		"<p>No. We use your information only to prepare and file your return and to contact you about it. See our "
		"privacy policy for details.</p>"),
]

HIGHLIGHTS = [
	("Qualified consultants", "user-check", "Every return is prepared by a consultant and checked by a second reviewer."),
	("Private by design", "shield-check", "Documents are private files; every download is logged."),
	("You approve first", "badge-check", "Nothing is filed until you confirm the summary in your portal."),
	("Track every step", "list-checks", "See exactly where your return is, from documents to IRIS acknowledgment."),
]


def _insert(doc):
	d = frappe.get_doc(doc)
	d.flags.ignore_permissions = True
	d.insert()
	return d


def seed():
	try:
		_seed()
	except Exception:
		print(frappe.get_traceback())
		frappe.log_error(title="pakistan_tax_consultancy content seed")


def _seed():
	for name, start, end, due in TAX_YEARS:
		if not frappe.db.exists("Tax Year", name):
			_insert({"doctype": "Tax Year", "tax_year_name": name, "start_date": start, "end_date": end,
				"return_due_date": due, "is_active": 1})

	for order, (name, category, hint) in enumerate(DOCUMENT_TYPES, 1):
		if frappe.db.exists("Document Type", name):
			missing = {k: v for k, v in (("category", category), ("client_hint", hint))
				if not frappe.db.get_value("Document Type", name, k) or (k == "category" and
					frappe.db.get_value("Document Type", name, k) == "Other")}
			if missing:
				frappe.db.set_value("Document Type", name, missing, update_modified=False)
		else:
			_insert({"doctype": "Document Type", "document_type_name": name, "category": category, "client_hint": hint,
				"is_active": 1, "is_identity_document": 1 if category == "Identity" else 0,
				"is_sensitive": 1 if category in ("Identity", "Banking", "Wealth") else 0, "display_order": order})

	if not frappe.db.count("Document Requirement Rule"):
		for dtype, mandatory, client_type, answer in RULES:
			_insert({"doctype": "Document Requirement Rule", "document_type": dtype, "is_mandatory": mandatory,
				"is_active": 1, "client_type": client_type, "when_answer": answer})

	for title, slug, category, icon, summary, docs, order in SERVICES:
		if frappe.db.exists("Service", title):
			svc = frappe.get_doc("Service", title)
			if not svc.slug:
				svc.update({"slug": slug, "category": category, "icon": icon, "summary": summary, "published": 1,
					"display_order": order})
				if not svc.required_document_types:
					svc.set("required_document_types", [{"document_type": d} for d in docs])
				svc.flags.ignore_permissions = True
				svc.save()
			continue
		_insert({"doctype": "Service", "title": title, "slug": slug, "category": category, "icon": icon, "summary": summary,
			"description": summary, "published": 1, "is_active": 1, "display_order": order,
			"required_document_types": [{"document_type": d} for d in docs]})

	for name, service, price, turnaround, whom, popular, order, inclusions in PACKAGES:
		if not frappe.db.exists("Service Package", name):
			_insert({"doctype": "Service Package", "package_name": name, "service": service, "price": price,
				"turnaround": turnaround, "for_whom": whom, "most_popular": popular, "active": 1, "display_order": order,
				"inclusions": [{"item": i} for i in inclusions]})

	for year, *_ in TAX_YEARS:
		for taxpayer, slabs in SLABS.items():
			title = f"TY{year} {taxpayer} ({DEMO})"
			if frappe.db.exists("Tax Slab Setting", {"tax_year": year, "taxpayer_type": taxpayer}):
				continue
			start = next(s for n, s, *_ in TAX_YEARS if n == year)
			_insert({"doctype": "Tax Slab Setting", "rule_title": title, "tax_year": year, "taxpayer_type": taxpayer,
				"priority": 10, "effective_from": start, "is_active": 1, "validation_status": DEMO,
				"legal_reference": "Finance Act — VERIFY before use (demo figures)",
				"slabs": [{"from_amount": a, "to_amount": b or None, "fixed_tax": f, "rate_percent": r} for a, b, f, r in slabs]})

	for code, desc, nature in WHT_SECTIONS:
		if not frappe.db.exists("Withholding Tax Section", {"section_code": code}):
			_insert({"doctype": "Withholding Tax Section", "section_code": code, "description": desc, "tax_nature": nature,
				"effective_from": "2025-07-01", "is_active": 1, "validation_status": DEMO})

	if not frappe.db.count("FAQ"):
		for order, (category, q, a) in enumerate(FAQS, 1):
			_insert({"doctype": "FAQ", "category": category, "question": q, "answer": a, "published": 1,
				"display_order": order, "language": "en"})

	site = frappe.get_single("Firm Website Settings")
	if not site.why_choose_us:
		site.set("why_choose_us", [{"title": t, "icon": i, "description": d} for t, i, d in HIGHLIGHTS])
		site.flags.ignore_permissions = True
		site.save()
