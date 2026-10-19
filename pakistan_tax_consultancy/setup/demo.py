"""Demo data: one user per role and sample clients with FAKE identifiers, walked through the real workflow.

  bench --site consultant execute pakistan_tax_consultancy.setup.demo.create_demo_data
  bench --site consultant execute pakistan_tax_consultancy.setup.demo.remove_demo_data

Every demo user ends in @demo.taxportal.example and every demo client is tagged "DEMO DATA" in its internal notes,
so removal never touches real records. The demo password is written to ~/.consultant-demo-secrets (not to git).
"""

import os
import secrets
from pathlib import Path

import frappe
from frappe.utils.password import update_password

DOMAIN = "demo.taxportal.example"
TAG = "DEMO DATA"
SECRETS = Path.home() / ".consultant-demo-secrets"

STAFF = [
	("admin", "Ayesha Admin", ["Tax Admin"]),
	("consultant", "Bilal Consultant", ["Tax Consultant"]),
	("consultant2", "Hina Consultant", ["Tax Consultant"]),
	("reviewer", "Kamran Reviewer", ["Tax Reviewer"]),
	("approver", "Nadia Approver", ["Tax Approver"]),
	("filing", "Omar Filing", ["Filing Officer"]),
	("field", "Saad Field", ["Field Officer"]),
	("dataentry", "Zara Data Entry", ["Data Entry Officer"]),
]

CLIENTS = [
	# key, name, type, cnic, mobile, city
	("salaried", "Ahmed Raza", "Individual-Salaried", "00000-0000000-1", "03000000001", "Lahore"),
	("business", "Sana Malik", "Individual-Business", "00000-0000000-2", "03000000002", "Karachi"),
	("aop", "Raza & Partners (AOP)", "AOP", None, "03000000003", "Islamabad"),
	("company", "Demo Textiles (Pvt) Ltd", "Company", None, "03000000004", "Faisalabad"),
]


def email(key):
	return f"{key}@{DOMAIN}"


def demo_password():
	if SECRETS.exists():
		for line in SECRETS.read_text().splitlines():
			if line.startswith("demo_password="):
				return line.split("=", 1)[1]
	pw = "Demo-" + secrets.token_urlsafe(9)
	SECRETS.write_text(f"# local demo users on site consultant (@{DOMAIN})\ndemo_password={pw}\n")
	os.chmod(SECRETS, 0o600)
	return pw


def make_user(key, full_name, roles, password):
	mail = email(key)
	if not frappe.db.exists("User", mail):
		first, _sp, last = full_name.partition(" ")
		frappe.get_doc({"doctype": "User", "email": mail, "first_name": first, "last_name": last, "send_welcome_email": 0,
			"user_type": "Website User" if roles == ["Client"] else "System User",
			"roles": [{"role": r} for r in roles]}).insert(ignore_permissions=True)
	update_password(mail, password)
	return mail


def as_user(user, fn, *args, **kwargs):
	frappe.set_user(user)
	try:
		return fn(*args, **kwargs)
	finally:
		frappe.set_user("Administrator")


def _pdf():
	import io

	from pypdf import PdfWriter

	w = PdfWriter()
	w.add_blank_page(200, 200)
	buf = io.BytesIO()
	w.write(buf)
	return buf.getvalue()


def upload_all(client_user, tax_return, pdf):
	from pakistan_tax_consultancy.services.files import attach_private

	for name in frappe.get_all("Tax Document", {"tax_return": tax_return, "status": ("in", ("Requested", "Rejected"))},
			pluck="name"):
		d = frappe.get_doc("Tax Document", name)
		d.file = attach_private("Tax Document", d.name, "file", f"{d.document_type.lower().replace(' ', '-')}.pdf", pdf)
		d.status, d.uploaded_by, d.is_client_upload = "Pending", client_user, 1
		d.upload_date = frappe.utils.getdate()
		d.save(ignore_permissions=True)


def create_demo_data():
	from pakistan_tax_consultancy.api import staff as staff_api
	from pakistan_tax_consultancy.services import tax_calc
	from pakistan_tax_consultancy.services import workflow as wf

	frappe.set_user("Administrator")
	pw = demo_password()
	users = {key: make_user(key, name, roles, pw) for key, name, roles in STAFF}
	frappe.db.set_single_value("Tax Consultancy Settings", "default_consultant", users["consultant"])
	frappe.db.set_single_value("Firm Website Settings", "work_before_payment", 1)

	clients = {}
	for key, name, ctype, cnic, mobile, city in CLIENTS:
		cuser = make_user(key, name, ["Client"], pw)
		existing = frappe.db.get_value("Tax Client", {"portal_user": cuser}, "name")
		if existing:
			clients[key] = existing
			continue
		doc = frappe.get_doc({"doctype": "Tax Client", "client_name": name, "client_type": ctype, "cnic": cnic,
			"mobile": mobile, "email": cuser, "city": city, "province": "Punjab", "status": "Active",
			"registration_source": "Office", "assigned_consultant": users["consultant"], "portal_user": cuser,
			"consent_given": 1, "mobile_verified": 1, "email_verified": 1, "fbr_registration_status": "Filer (Active Taxpayer)",
			"internal_notes": TAG})
		doc.insert(ignore_permissions=True)
		clients[key] = doc.name

	pdf = _pdf()
	year = "2026"

	def new_return(key, answers):
		name = frappe.db.get_value("Tax Return", {"tax_client": clients[key], "tax_year": year}, "name")
		if name:
			return frappe.get_doc("Tax Return", name), False
		tr = frappe.get_doc({"doctype": "Tax Return", "tax_client": clients[key], "tax_year": year, "return_type": "Original",
			**answers})
		as_user(users["consultant"], tr.insert)
		from pakistan_tax_consultancy.services.checklist import generate_checklist

		generate_checklist(tr)
		return tr, True

	# 1. salaried: fully prepared and reviewed, waiting for the client's confirmation
	tr, fresh = new_return("salaried", {"has_salary": 1, "has_profit_on_debt": 1, "owns_vehicle": 1})
	if fresh:
		upload_all(email("salaried"), tr.name, pdf)
		for d in frappe.get_all("Tax Document", {"tax_return": tr.name, "status": "Pending"}, pluck="name"):
			as_user(users["consultant"], staff_api.verify_document, d, "Verified")
		tr = frappe.get_doc("Tax Return", tr.name)
		tr.append("income_sources", {"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": 2_400_000,
			"payer_or_employer": "Demo Employer Ltd"})
		tr.append("income_sources", {"income_category": "Profit on Debt", "tax_treatment": "Separate Block",
			"gross_amount": 85_000, "tax_rate_percent": 15, "payer_or_employer": "Demo Bank"})
		tr.append("withholding_lines", {"payer": "Demo Employer Ltd", "amount": 160_000})
		tr.append("withholding_lines", {"payer": "Demo Bank", "amount": 12_750})
		tr.append("asset_lines", {"asset_type": "Motor Vehicle", "description": "Car (demo)", "cost_value": 3_200_000})
		as_user(users["consultant"], tr.save)
		as_user(users["consultant"], lambda: tax_calc.calculate_return(frappe.get_doc("Tax Return", tr.name)))
		as_user(users["consultant"], staff_api.transition, tr.name, "Submit for Review")
		as_user(users["reviewer"], staff_api.transition, tr.name, "Start Review")
		review = as_user(users["reviewer"], staff_api.start_review, tr.name)
		as_user(users["reviewer"], staff_api.save_review, review,
			[{"check_item": c, "result": "Pass"} for c in staff_api.REVIEW_CHECKLIST], 1)
		as_user(users["reviewer"], staff_api.transition, tr.name, "Mark Reviewed")
		as_user(users["reviewer"], staff_api.transition, tr.name, "Send to Client")

	# 2. business: ordered a package from the portal (engagement + return), documents still to upload, payment proof sent
	from pakistan_tax_consultancy.api import portal

	business = clients["business"]
	if not frappe.db.exists("Tax Engagement", {"tax_client": business}):
		order = as_user(email("business"), portal.order, "Express Filing", year)
		as_user(email("business"), portal.save_answers, order["tax_return"],
			{"has_business": 1, "has_property_income": 1, "owns_property": 1})
		eng = frappe.get_doc("Tax Engagement", order["engagement"])
		frappe.get_doc({"doctype": "Payment Proof", "tax_engagement": eng.name, "tax_client": business, "method": "Raast",
			"amount": eng.net_fee, "reference": "DEMO-RAAST-001", "paid_on": frappe.utils.getdate(),
			"status": "Pending"}).insert(ignore_permissions=True)

	# 3. AOP: in preparation
	tr, fresh = new_return("aop", {"has_business": 1})
	if fresh:
		upload_all(email("aop"), tr.name, pdf)
		for d in frappe.get_all("Tax Document", {"tax_return": tr.name, "status": "Pending"}, pluck="name"):
			as_user(users["consultant"], staff_api.verify_document, d, "Verified")

	# 4. company: filed and acknowledged (with a demo receipt)
	tr, fresh = new_return("company", {"has_business": 1})
	if fresh:
		upload_all(email("company"), tr.name, pdf)
		for d in frappe.get_all("Tax Document", {"tax_return": tr.name, "status": "Pending"}, pluck="name"):
			as_user(users["consultant"], staff_api.verify_document, d, "Verified")
		tr = frappe.get_doc("Tax Return", tr.name)
		tr.append("income_sources", {"income_category": "Business", "tax_treatment": "Normal", "gross_amount": 9_500_000})
		tr.append("deduction_lines", {"deduction_type": "Business Expense", "amount": 6_200_000})
		tr.append("advance_tax_lines", {"cpr_no": "DEMO-CPR-0001", "amount": 400_000})
		as_user(users["consultant"], tr.save)
		as_user(users["consultant"], lambda: tax_calc.calculate_return(frappe.get_doc("Tax Return", tr.name)))
		as_user(users["consultant"], staff_api.transition, tr.name, "Submit for Review")
		as_user(users["reviewer"], staff_api.transition, tr.name, "Start Review")
		review = as_user(users["reviewer"], staff_api.start_review, tr.name)
		as_user(users["reviewer"], staff_api.save_review, review,
			[{"check_item": c, "result": "Pass"} for c in staff_api.REVIEW_CHECKLIST], 1)
		as_user(users["reviewer"], staff_api.transition, tr.name, "Mark Reviewed")
		as_user(users["reviewer"], staff_api.transition, tr.name, "Send to Client")
		from pakistan_tax_consultancy.api import portal

		as_user(email("company"), portal.confirm, tr.name)
		as_user(users["approver"], staff_api.transition, tr.name, "Approve")
		as_user(users["filing"], staff_api.transition, tr.name, "Mark Submitted on IRIS")
		from pakistan_tax_consultancy.services.files import attach_private

		doc = frappe.get_doc("Tax Return", tr.name)
		doc.fbr_receipt = attach_private("Tax Return", doc.name, "fbr_receipt", "fbr-receipt-demo.pdf", pdf)
		doc.iris_acknowledgment_no = "DEMO-ACK-2026-0001"
		as_user(users["filing"], doc.save)
		as_user(users["filing"], staff_api.transition, tr.name, "Record Acknowledgment")

	# site visits, a consultation request and a payment proof
	if not frappe.db.exists("Site Visit", {"full_name": "Usman Tariq (demo)"}):
		for name, mobile, status, follow in (("Usman Tariq (demo)", "03000000011", "Contacted", frappe.utils.getdate()),
				("Farah Naz (demo)", "03000000012", "New", frappe.utils.add_days(frappe.utils.getdate(), 3))):
			frappe.get_doc({"doctype": "Site Visit", "visit_type": "Prospect", "full_name": name, "mobile": mobile,
				"client_type": "Individual-Salaried", "status": status, "visit_date": frappe.utils.getdate(), "city": "Lahore",
				"purpose": "Annual return", "field_officer": users["field"], "assigned_consultant": users["consultant"],
				"follow_up_date": follow, "notes": TAG}).insert(ignore_permissions=True)
	if not frappe.db.exists("Consultation Request", {"full_name": "Imran Ali (demo)"}):
		frappe.get_doc({"doctype": "Consultation Request", "full_name": "Imran Ali (demo)", "mobile": "+923000000021",
			"mode": "Phone", "call_preference": "Scheduled", "service": "Tax Consultation", "preferred_date": frappe.utils.add_days(
				frappe.utils.getdate(), 1), "preferred_slot": "Morning (9–12)", "message": f"{TAG}: rental income question",
			"status": "New"}).insert(ignore_permissions=True)
	# business client: plain-language "My details" entered in the portal, waiting for the consultant to copy in
	biz_return = frappe.db.get_value("Tax Return", {"tax_client": business}, "name")
	if biz_return and not frappe.db.get_value("Tax Return", biz_return, "client_details"):
		from pakistan_tax_consultancy.api import portal as portal_api

		as_user(email("business"), portal_api.save_details, biz_return, {
			"business": [{"name": "Malik Traders (demo)", "annual_sales": 6_400_000, "annual_expenses": 4_900_000}],
			"rent": [{"property": "Shop 4, D-Ground (demo)", "annual_rent": 480_000, "tax_deducted": 24_000}],
			"bank": [{"bank": "Demo Bank", "balance_30_june": 850_000, "profit": 62_000, "tax_deducted": 9_300}],
			"property": [{"description": "10 marla house (demo)", "city": "Faisalabad", "purchase_year": "2018", "value": 14_500_000}],
			"vehicles": [{"make_model": "Honda City 2020 (demo)", "registration_no": "FDA-000", "value": 3_100_000, "tax_paid_on_registration": 50_000}],
			"cash_in_hand": 120_000, "household_expenses_monthly": 150_000,
			"notes": "Shop rent is paid by cheque each quarter."})

	# WhatsApp (test mode): a short conversation with the salaried client
	from pakistan_tax_consultancy.services import wa_inbox

	if wa_inbox.is_mock() and not frappe.db.exists("Client Conversation", {"tax_client": clients["salaried"]}):
		from pakistan_tax_consultancy.api import whatsapp as wa_api

		wa_inbox.install_mock()
		as_user(users["consultant"], wa_api.simulate_incoming, "03000000001",
			"Assalam o Alaikum, I uploaded my salary certificate. Anything else needed?", "Ahmed Raza")
		conv = frappe.db.get_value("Client Conversation", {"tax_client": clients["salaried"]}, "name")
		if conv:
			as_user(users["consultant"], wa_api.send, conv,
				"Walaikum Assalam! Everything is received — your return summary is ready in the portal. Please confirm it there.")

	create_demo_crm()
	frappe.db.commit()
	print(f"Demo data ready. Users: <role>@{DOMAIN} — password in {SECRETS}")
	for key, *_ in STAFF:
		print("  staff ", email(key))
	for key, *_ in CLIENTS:
		print("  client", email(key))


# name, mobile, source, client type, package (deal value), pipeline stage (None: stays a lead), note
CRM_DEMO = [
	("Usman Tariq", "+923000000101", "Website", "Individual-Salaried", "Basic Filing", "Enquiry", "Wants to know if he must file this year."),
	("Rabia Nadeem", "+923000000102", "WhatsApp", "Individual-Salaried", "Express Filing", "Consultation", "Two employers this year."),
	("Hamza Iqbal", "+923000000103", "Referral", "Individual-Business", "Consultant Plus", "Proposal Sent", "Grocery store, sales tax question too."),
	("Sadia Khan", "+923000000104", "Consultation Booking", "Individual-Salaried", "Express Filing", "Documents Pending", "Refund of bank WHT."),
	("Faisal Textiles", "+923000000105", "Site Visit", "Company", "Consultant Plus", "Engaged", "Annual return + withholding statements."),
	("Bilal Ahmed", "+923000000106", "Facebook", "Individual-Salaried", "Basic Filing", "Lost", "Went with a cheaper option."),
	("Nida Farooq", "+923000000107", "Contact Form", "Individual-Salaried", None, None, "Asked about NTN registration."),
	("Kashif Mehmood", "+923000000108", "Walk In", "Individual-Business", None, None, "Shopkeeper, never filed before."),
]


def create_demo_crm():
	"""Leads and deals across the pipeline in Frappe CRM (fake names and 0300-00001xx numbers)."""
	from pakistan_tax_consultancy.api import crm as crm_api
	from pakistan_tax_consultancy.services import crm

	if not crm.installed() or frappe.db.exists("CRM Lead", {"email": ("like", f"%@{DOMAIN}")}):
		return
	owner = email("consultant")
	for i, (name, mobile, source, ctype, package, stage, note) in enumerate(CRM_DEMO, 1):
		lead = crm.make_lead(name, mobile, f"lead{i}@{DOMAIN}", source=source, note=f"{note} ({TAG})", owner=owner, client_type=ctype)
		if not stage:
			continue
		price = frappe.db.get_value("Service Package", package, "price") if package and frappe.db.exists("Service Package", package) else 0
		deal = as_user(owner, crm_api.convert, lead)
		frappe.db.set_value("CRM Deal", deal, {"expected_deal_value": price, "deal_owner": owner,
			"service_package": package if package and frappe.db.exists("Service Package", package) else None,
			"next_step": {"Enquiry": "Call back", "Consultation": "Meet on Monday", "Proposal Sent": "Follow up on the quote",
				"Documents Pending": "Collect bank certificate"}.get(stage)})
		order = [p[0] for p in crm.PIPELINE if p[1] != "Lost"]
		for step in order[1:order.index(stage) + 1] if stage in order else []:  # walk the stages like a consultant would
			as_user(owner, crm_api.move_deal, deal, step)
		if stage == "Lost":
			as_user(owner, crm_api.move_deal, deal, "Lost", "Fee too high")
		client = frappe.db.get_value("CRM Deal", deal, "tax_client")
		if client:
			frappe.db.set_value("Tax Client", client, "internal_notes", TAG)
	if frappe.db.exists("CRM Lead", {"email": f"lead7@{DOMAIN}"}):
		frappe.get_doc({"doctype": "CRM Task", "title": "Call Nida about NTN registration", "assigned_to": owner, "status": "Todo",
			"priority": "High", "due_date": frappe.utils.now_datetime(), "reference_doctype": "CRM Lead",
			"reference_docname": frappe.db.get_value("CRM Lead", {"email": f"lead7@{DOMAIN}"})}).insert(ignore_permissions=True)


def remove_demo_crm():
	if "crm" not in frappe.get_installed_apps():
		return
	leads = frappe.get_all("CRM Lead", {"email": ("like", f"%@{DOMAIN}")}, pluck="name")
	deals = frappe.get_all("CRM Deal", {"lead": ("in", leads or [""])}, pluck="name")
	# clients created by winning demo deals are demo clients too: tag them so remove_demo_data deletes them
	for client in frappe.get_all("CRM Deal", {"name": ("in", deals or [""]), "tax_client": ("is", "set")}, pluck="tax_client"):
		frappe.db.set_value("Tax Client", client, "internal_notes", TAG)
	for dt, names in (("CRM Deal", deals), ("CRM Lead", leads)):
		for name in names:
			for child in ("FCRM Note", "CRM Task"):
				for n in frappe.get_all(child, {"reference_doctype": dt, "reference_docname": name}, pluck="name"):
					frappe.delete_doc(child, n, force=True, ignore_permissions=True)
			frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
	for c in frappe.get_all("Contact", {"email_id": ("like", f"%@{DOMAIN}")}, pluck="name"):
		frappe.delete_doc("Contact", c, force=True, ignore_permissions=True)


def remove_demo_data():
	"""Delete only demo records (users in the demo domain, clients tagged DEMO DATA and everything linked to them)."""
	frappe.set_user("Administrator")
	frappe.flags.in_test = True  # allows audit-event cleanup for these records only
	remove_demo_crm()
	clients = frappe.get_all("Tax Client", {"internal_notes": ("like", f"%{TAG}%")}, pluck="name")
	for client in clients:
		for dt in ("Payment Proof", "Client Message", "Review Comment", "Filing Record", "Tax Approval", "Tax Review",
				"Tax Calculation", "Tax Document", "Tax Return", "Tax Engagement", "Tax Audit Event"):
			field = "tax_client"
			for name in frappe.get_all(dt, {field: client}, pluck="name"):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.delete_doc("Tax Client", client, force=True, ignore_permissions=True)
	for dt, field in (("Site Visit", "notes"), ("Consultation Request", "message")):
		for name in frappe.get_all(dt, {field: ("like", f"%{TAG}%")}, pluck="name"):
			frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
	for user in frappe.get_all("User", {"name": ("like", f"%@{DOMAIN}")}, pluck="name"):
		frappe.delete_doc("User", user, force=True, ignore_permissions=True)
	frappe.db.commit()
	print(f"Removed {len(clients)} demo clients and the @{DOMAIN} users.")
