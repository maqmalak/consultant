"""A demo filing season (TY2026) played by the whole team and the clients, so every queue, dashboard and report has data.

  bench --site consultant execute pakistan_tax_consultancy.setup.demo_season.create      # ~45 clients, idempotent
  bench --site consultant execute pakistan_tax_consultancy.setup.demo_season.remove      # only these records

Everything is FAKE: names end in "(demo)", CNICs start 00000-, mobiles are 0300-0992xxx, e-mails season###@demo.taxportal.example,
and every client carries "DEMO DATA · SEASON" in its internal notes. Each return is walked through the real workflow by
the user who would do it (client orders and uploads, consultant verifies and prepares, reviewer reviews, client confirms,
approver approves, filing officer files), then its timeline is spread over May–October so trends have a shape.
"""

import random
from datetime import datetime, time, timedelta

import frappe
from frappe.utils import add_days, getdate, now_datetime

from pakistan_tax_consultancy.setup.demo import DOMAIN, _pdf, as_user, email, make_user, upload_all

TAG = "DEMO DATA · SEASON"
PASSWORD = "demo@123"
YEAR = "2026"
SEED = 2026

FIRST = ["Ali", "Hassan", "Zainab", "Ayesha", "Imran", "Fatima", "Usama", "Mariam", "Tariq", "Hira", "Bilal", "Sadia", "Kamran", "Rabia",
	"Naveed", "Iqra", "Faisal", "Mehwish", "Junaid", "Sobia", "Adnan", "Amna", "Waqas", "Nimra", "Shahid", "Saima", "Asad", "Kiran",
	"Haris", "Huma", "Zeeshan", "Lubna", "Fahad", "Uzma", "Owais", "Rida"]
LAST = ["Khan", "Butt", "Chaudhry", "Malik", "Sheikh", "Qureshi", "Rana", "Mirza", "Awan", "Siddiqui", "Bhatti", "Raza", "Javed",
	"Akhtar", "Hashmi", "Gill", "Anwar", "Nawaz"]
BUSINESSES = ["Traders", "Electronics", "Pharmacy", "Garments", "Auto Parts", "Builders", "Foods", "Textiles", "Surgical", "Furniture"]
CITIES = [("Faisalabad", "Punjab", 9), ("Lahore", "Punjab", 7), ("Karachi", "Sindh", 4), ("Islamabad", "Islamabad Capital Territory", 3),
	("Multan", "Punjab", 2), ("Rawalpindi", "Punjab", 2), ("Sialkot", "Punjab", 2), ("Gujranwala", "Punjab", 1)]
# how far each return gets this season (counts) — every staff queue ends up with work in it
TARGETS = [("Documents Pending", 8), ("Draft", 6), ("Pending Review", 4), ("Under Review", 3), ("Changes Required", 2),
	("Reviewed", 2), ("Awaiting Client Confirmation", 4), ("Approved", 3), ("Submitted to FBR", 3), ("Filing Error", 1), ("Acknowledged", 9)]
ORDER = ["Documents Pending", "Draft", "Pending Review", "Under Review", "Reviewed", "Awaiting Client Confirmation", "Approved",
	"Submitted to FBR", "Acknowledged"]
TYPES = [("Individual-Salaried", 22), ("Individual-Business", 15), ("AOP", 4), ("Company", 4)]
PACKAGE_BY_TYPE = {"Individual-Salaried": ["Basic Filing", "Basic Filing", "Express Filing"], "Individual-Business": ["Express Filing", "Consultant Plus"],
	"AOP": ["Consultant Plus"], "Company": ["Consultant Plus"]}
SEASON_START = datetime(2026, 5, 4)


def _staff():
	u = {k: email(k) for k in ("admin", "consultant", "consultant2", "reviewer", "approver", "filing", "field")}
	missing = [m for m in u.values() if not frappe.db.exists("User", m)]
	if missing:
		frappe.throw(f"Run setup.demo.create_demo_data first (missing {missing}).")
	return u


def _lines(rng, ctype):
	"""Income / deductions / tax paid that fit the client type (round, believable figures)."""
	r = lambda lo, hi, step=10_000: rng.randrange(lo, hi, step)  # noqa: E731
	income, deductions, wht, adv = [], [], [], []
	answers = {}
	if ctype == "Individual-Salaried":
		salary = r(900_000, 6_000_000, 50_000)
		income.append({"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": salary, "payer_or_employer": "Employer (demo)"})
		wht.append({"payer": "Employer (demo)", "amount": round(salary * rng.uniform(0.02, 0.09), -2)})
		answers["has_salary"] = 1
		if rng.random() < 0.6:
			profit = r(20_000, 400_000, 1_000)
			income.append({"income_category": "Profit on Debt", "tax_treatment": "Separate Block", "tax_rate_percent": 15, "gross_amount": profit,
				"payer_or_employer": "Bank (demo)"})
			wht.append({"payer": "Bank (demo)", "amount": round(profit * 0.15, -1)})
			answers["has_profit_on_debt"] = 1
		if rng.random() < 0.3:
			deductions.append({"deduction_type": "Zakat", "amount": r(10_000, 120_000, 1_000)})
	else:
		sales = {"Individual-Business": (2_000_000, 25_000_000), "AOP": (6_000_000, 45_000_000), "Company": (15_000_000, 120_000_000)}[ctype]
		gross = r(*sales, 100_000)
		income.append({"income_category": "Business", "tax_treatment": "Normal", "gross_amount": gross})
		deductions.append({"deduction_type": "Business Expense", "amount": round(gross * rng.uniform(0.55, 0.85), -4)})
		answers["has_business"] = 1
		if rng.random() < 0.5:
			adv.append({"cpr_no": f"DEMO-CPR-{rng.randrange(10000, 99999)}", "amount": round(gross * rng.uniform(0.005, 0.02), -3)})
		if ctype == "Individual-Business" and rng.random() < 0.35:
			rent = r(240_000, 1_800_000, 20_000)
			income.append({"income_category": "Property (Rent)", "tax_treatment": "Normal", "gross_amount": rent})
			wht.append({"payer": "Tenant (demo)", "amount": round(rent * 0.1, -2)})
			answers["has_property_income"] = 1
	if rng.random() < 0.4:
		answers["owns_vehicle"] = 1
	return answers, income, deductions, wht, adv


def _retime(doc_name, client, start, rng):
	"""Spread one return's history over the season: client → order → each workflow step a few days apart."""
	events = frappe.get_all("Tax Audit Event", {"tax_client": client}, ["name", "timestamp"], order_by="timestamp asc, creation asc")
	t = start
	stamps = {}
	for e in events:
		t = min(t + timedelta(hours=rng.uniform(6, 90)), now_datetime() - timedelta(hours=1))
		frappe.db.set_value("Tax Audit Event", e.name, {"timestamp": t, "creation": t, "modified": t}, update_modified=False)
		stamps[e.name] = t
	last = t
	frappe.db.set_value("Tax Client", client, {"creation": start - timedelta(days=rng.randint(0, 6)), "modified": last}, update_modified=False)
	frappe.db.set_value("Tax Return", doc_name, {"creation": start, "modified": last}, update_modified=False)
	eng = frappe.db.get_value("Tax Return", doc_name, "tax_engagement")
	if eng:
		frappe.db.set_value("Tax Engagement", eng, {"creation": start, "engagement_date": start.date()}, update_modified=False)
	for d in frappe.get_all("Tax Document", {"tax_return": doc_name}, ["name", "upload_date"]):
		frappe.db.set_value("Tax Document", d.name, {"creation": start, "upload_date": (start + timedelta(days=rng.randint(0, 5))).date()
			if d.upload_date else None}, update_modified=False)
	for p in frappe.get_all("Payment Proof", {"tax_engagement": eng}, ["name", "status"]) if eng else []:
		paid = start + timedelta(days=rng.randint(1, 6))
		frappe.db.set_value("Payment Proof", p.name, {"paid_on": paid.date(), "creation": paid,
			**({"verified_on": paid + timedelta(days=rng.randint(0, 2))} if p.status == "Verified" else {})}, update_modified=False)
	reached = lambda state: frappe.db.get_value("Tax Audit Event", {"reference_name": doc_name, "to_state": state}, "timestamp")  # noqa: E731
	sent, approved, submitted = reached("Awaiting Client Confirmation"), reached("Approved"), reached("Submitted to FBR")
	confirmed = (approved - timedelta(hours=rng.uniform(2, 20))) if approved else (sent + timedelta(hours=rng.uniform(4, 40)) if sent else None)
	for f, when in (("client_confirmed_on", confirmed), ("approved_on", approved), ("submission_timestamp", submitted)):
		if when and frappe.db.get_value("Tax Return", doc_name, f):
			frappe.db.set_value("Tax Return", doc_name, f, min(when, now_datetime()), update_modified=False)
	ack = frappe.db.get_value("Tax Audit Event", {"reference_name": doc_name, "to_state": "Acknowledged"}, "timestamp")
	if ack:
		frappe.db.set_value("Tax Return", doc_name, "filing_date", getdate(ack), update_modified=False)
	return last


def _walk(tr_name, target, users, consultant, client_user, rng, pdf):
	"""Move one return to `target` the way the team would."""
	from pakistan_tax_consultancy.api import portal
	from pakistan_tax_consultancy.api import staff as staff_api
	from pakistan_tax_consultancy.services import tax_calc
	from pakistan_tax_consultancy.services.files import attach_private

	state = lambda: frappe.db.get_value("Tax Return", tr_name, "workflow_state")  # noqa: E731
	go = lambda user, action, comment=None: as_user(user, staff_api.transition, tr_name, action, comment)  # noqa: E731
	reach = ORDER.index(target) if target in ORDER else {"Changes Required": 3, "Filing Error": 7}[target]

	# documents: the client uploads (all, or some if we stop at Documents Pending); the consultant checks them
	docs = frappe.get_all("Tax Document", {"tax_return": tr_name, "status": ("in", ("Requested", "Rejected"))}, pluck="name")
	if target == "Documents Pending":
		upload = docs[: rng.randint(0, max(len(docs) - 1, 0))]
		for name in upload:
			d = frappe.get_doc("Tax Document", name)
			d.file = attach_private("Tax Document", d.name, "file", f"{d.document_type.lower().replace(' ', '-')}.pdf", pdf)
			d.status, d.uploaded_by, d.is_client_upload, d.upload_date = "Pending", client_user, 1, getdate()
			d.save(ignore_permissions=True)
		pend = frappe.get_all("Tax Document", {"tax_return": tr_name, "status": "Pending"}, pluck="name")
		for name in pend[: len(pend) // 2]:
			as_user(consultant, staff_api.verify_document, name, rng.choice(["Verified", "Verified", "Rejected"]),
				"Photo is blurred — please upload a clear scan.")
		return
	upload_all(client_user, tr_name, pdf)
	for name in frappe.get_all("Tax Document", {"tax_return": tr_name, "status": "Pending"}, pluck="name"):
		as_user(consultant, staff_api.verify_document, name, "Verified")
	if state() == "Documents Pending":
		go(consultant, "Documents Complete")
	if reach < 1 or target == "Draft" and rng.random() < 0.5:
		return

	# preparation
	tr = frappe.get_doc("Tax Return", tr_name)
	ctype = frappe.db.get_value("Tax Client", tr.tax_client, "client_type")
	answers, income, deductions, wht, adv = _lines(rng, ctype)
	tr.update(answers)
	for row in income:
		tr.append("income_sources", row)
	for row in deductions:
		tr.append("deduction_lines", row)
	for row in wht:
		tr.append("withholding_lines", row)
	for row in adv:
		tr.append("advance_tax_lines", row)
	as_user(consultant, tr.save)
	as_user(consultant, lambda: tax_calc.calculate_return(frappe.get_doc("Tax Return", tr_name)))
	if target == "Draft":
		return
	go(consultant, "Submit for Review")
	if target == "Pending Review":
		return
	go(users["reviewer"], "Start Review")
	if target == "Under Review":
		return
	if target == "Changes Required":
		go(users["reviewer"], "Request Changes", rng.choice(["Bank profit certificate does not match the statement — please recheck.",
			"Rent income is missing from the return; the client mentioned a shop on rent."]))
		return
	review = as_user(users["reviewer"], staff_api.start_review, tr_name)
	as_user(users["reviewer"], staff_api.save_review, review, [{"check_item": c, "result": "Pass"} for c in staff_api.REVIEW_CHECKLIST], 1)
	go(users["reviewer"], "Mark Reviewed")
	if target == "Reviewed":
		return
	go(users["reviewer"], "Send to Client")
	if target == "Awaiting Client Confirmation":
		if rng.random() < 0.5:
			as_user(client_user, portal.confirm, tr_name)
		return
	as_user(client_user, portal.confirm, tr_name)
	go(users["approver"], "Approve")
	if target == "Approved":
		return
	go(users["filing"], "Mark Submitted on IRIS")
	if target == "Submitted to FBR":
		return
	doc = frappe.get_doc("Tax Return", tr_name)
	if target == "Filing Error":
		doc.filing_error_notes = "IRIS rejected the wealth reconciliation: unreconciled amount Rs 85,000 (demo)."
		as_user(users["filing"], doc.save)
		go(users["filing"], "Report Filing Error")
		return
	doc.fbr_receipt = attach_private("Tax Return", doc.name, "fbr_receipt", "fbr-receipt-demo.pdf", pdf)
	doc.iris_acknowledgment_no = f"DEMO-IRIS-{YEAR}-{rng.randrange(100000, 999999)}"
	as_user(users["filing"], doc.save)
	go(users["filing"], "Record Acknowledgment")


def create():
	from pakistan_tax_consultancy.api import portal
	from pakistan_tax_consultancy.api import staff as staff_api

	frappe.set_user("Administrator")
	if frappe.db.exists("Tax Client", {"internal_notes": ("like", f"%{TAG}%")}):
		print("Season data already exists — run remove first to rebuild it.")
		return
	rng = random.Random(SEED)
	users = _staff()
	pdf = _pdf()
	frappe.db.set_single_value("Firm Website Settings", "work_before_payment", 1)

	targets = [t for t, n in TARGETS for _ in range(n)]
	rng.shuffle(targets)
	types = [t for t, n in TYPES for _ in range(n)]
	rng.shuffle(types)
	cities = [(c, p) for c, p, w in CITIES for _ in range(w)]
	consultants = [users["consultant"], users["consultant2"]]
	used_names = set()
	made = []
	span = (getdate() - SEASON_START.date()).days - 14

	for i, target in enumerate(targets, 1):
		ctype = types[(i - 1) % len(types)]
		while True:
			person = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
			if person not in used_names:
				used_names.add(person)
				break
		name = person if ctype.startswith("Individual") else f"{person.split()[1]} {rng.choice(BUSINESSES)}" + (" (Pvt) Ltd" if ctype == "Company" else " & Co (AOP)")
		name += " (demo)"
		city, province = rng.choice(cities)
		key = f"season{i:03d}"
		cuser = make_user(key, name.replace(" (demo)", ""), ["Client"], PASSWORD)
		consultant = consultants[i % 2]
		source = rng.choice(["Self Registration", "Self Registration", "Office", "Field Visit"])
		client = frappe.get_doc({"doctype": "Tax Client", "client_name": name, "client_type": ctype,
			"cnic": f"00000-{1000000 + i:07d}-{i % 10}" if ctype.startswith("Individual") else None, "mobile": f"03000992{i:03d}", "email": cuser,
			"city": city, "province": province, "status": "Active", "registration_source": source, "assigned_consultant": consultant,
			"field_officer": users["field"] if source == "Field Visit" else None, "portal_user": cuser, "consent_given": 1, "mobile_verified": 1,
			"email_verified": 1, "fbr_registration_status": rng.choice(["Filer (Active Taxpayer)", "Filer (Active Taxpayer)", "Non-Filer"]),
			"whatsapp_opt_in": int(rng.random() < 0.7), "internal_notes": TAG})
		client.insert(ignore_permissions=True)
		package = rng.choice(PACKAGE_BY_TYPE[ctype])
		order = as_user(cuser, portal.order, package, YEAR)
		tr_name = order["tax_return"]
		eng = frappe.get_doc("Tax Engagement", order["engagement"])
		# fee: most pay once documents are in; some still owe
		if target != "Documents Pending":
			if rng.random() < 0.85:
				proof = frappe.get_doc({"doctype": "Payment Proof", "tax_engagement": eng.name, "tax_client": client.name,
					"method": rng.choice(["Raast", "Bank Transfer", "JazzCash", "Easypaisa"]), "amount": eng.net_fee,
					"reference": f"DEMO-{rng.randrange(100000, 999999)}", "paid_on": getdate(), "status": "Pending"}).insert(ignore_permissions=True)
				if rng.random() < 0.8:
					as_user(users["admin"], staff_api.verify_payment, proof.name, "Verified")
		as_user(cuser, portal.save_answers, tr_name, {"has_salary" if ctype == "Individual-Salaried" else "has_business": 1})
		_walk(tr_name, target, users, consultant, cuser, rng, pdf)
		start = SEASON_START + timedelta(days=rng.triangular(0, span, span * 0.75))  # busier towards the deadline
		start = datetime.combine(start.date(), time(rng.randint(9, 18), rng.randint(0, 59)))
		# finished returns started earlier, fresh ones later — so the funnel reads like a season
		if target in ("Acknowledged", "Submitted to FBR", "Filing Error", "Approved"):
			start = min(start, SEASON_START + timedelta(days=span * 0.7))
		if target == "Documents Pending":
			start = max(start, SEASON_START + timedelta(days=span * 0.55))
		_retime(tr_name, client.name, start, rng)
		made.append((client.name, tr_name, target))
		frappe.db.commit()
		print(f"{i:02d}/{len(targets)} {name:40} {ctype:20} → {frappe.db.get_value('Tax Return', tr_name, 'workflow_state')}")

	_visits(rng, users, made)
	_consultations(rng, users)
	frappe.db.commit()
	print(f"Season ready: {len(made)} clients / returns. Client logins season###@{DOMAIN}, password {PASSWORD}.")


def _visits(rng, users, made):
	"""Field visits across the season; converted ones point at the season clients that came from the field."""
	field_clients = [c for c, _tr, _t in made if frappe.db.get_value("Tax Client", c, "registration_source") == "Field Visit"]
	statuses = ["New"] * 6 + ["Contacted"] * 8 + ["Qualified"] * 5 + ["Not Interested"] * 6 + ["Converted"] * len(field_clients)
	rng.shuffle(statuses)
	span = (getdate() - SEASON_START.date()).days
	for i, status in enumerate(statuses, 1):
		day = (SEASON_START + timedelta(days=rng.randint(0, span))).date()
		client = field_clients.pop() if status == "Converted" and field_clients else None
		full = frappe.db.get_value("Tax Client", client, "client_name") if client else f"{rng.choice(FIRST)} {rng.choice(LAST)} (demo)"
		follow = add_days(getdate(), rng.randint(-6, 10)) if status in ("New", "Contacted", "Qualified") else None
		v = frappe.get_doc({"doctype": "Site Visit", "visit_type": "Prospect", "full_name": full, "mobile": f"03000993{i:03d}",
			"email": f"visit{i:03d}@{DOMAIN}", "client_type": rng.choice(["Individual-Salaried", "Individual-Business", "Individual-Business"]),
			"status": status, "visit_date": day, "city": rng.choice(["Faisalabad", "Faisalabad", "Lahore", "Multan"]),
			"purpose": rng.choice(["Annual return", "NTN registration", "Notice from FBR", "Shop owner — never filed"]),
			"field_officer": users["field"], "assigned_consultant": rng.choice([users["consultant"], users["consultant2"]]),
			"follow_up_date": follow, "converted_client": client, "conversion_date": add_days(day, rng.randint(1, 9)) if client else None,
			"notes": TAG})
		v.insert(ignore_permissions=True)
		frappe.db.set_value("Site Visit", v.name, {"creation": datetime.combine(day, time(11, 0))}, update_modified=False)


def _consultations(rng, users):
	span = (getdate() - SEASON_START.date()).days
	for i in range(1, 13):
		day = SEASON_START + timedelta(days=rng.randint(0, span))
		c = frappe.get_doc({"doctype": "Consultation Request", "full_name": f"{rng.choice(FIRST)} {rng.choice(LAST)} (demo)",
			"mobile": f"+923000994{i:03d}", "mode": rng.choice(["Office", "Phone", "Video"]), "call_preference": "Scheduled",
			"service": "Tax Consultation", "preferred_date": add_days(day.date(), 2), "preferred_slot": "Morning (9–12)",
			"message": f"{TAG}: " + rng.choice(["Rental income question", "Received a notice under section 114", "Want to become a filer",
				"Selling a plot — capital gains?"]),
			"status": rng.choice(["New", "Contacted", "Scheduled", "Completed", "Completed"]), "assigned_to": users["consultant"]})
		c.insert(ignore_permissions=True)
		frappe.db.set_value("Consultation Request", c.name, {"creation": day}, update_modified=False)


def remove():
	"""Delete only the season records (clients tagged SEASON, their returns, documents, payments, visits, consultations, users)."""
	frappe.set_user("Administrator")
	frappe.flags.in_test = True  # allows audit-event cleanup for these records only
	clients = frappe.get_all("Tax Client", {"internal_notes": ("like", f"%{TAG}%")}, pluck="name")
	for client in clients:
		for dt in ("Payment Proof", "Client Message", "Review Comment", "Filing Record", "Tax Approval", "Tax Review", "Tax Calculation",
				"Tax Document", "Tax Scenario", "Generated Document", "Tax Return", "Tax Engagement", "Tax Audit Event"):
			for name in frappe.get_all(dt, {"tax_client": client}, pluck="name"):
				frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
		frappe.delete_doc("Tax Client", client, force=True, ignore_permissions=True)
	for dt, field in (("Site Visit", "notes"), ("Consultation Request", "message")):
		for name in frappe.get_all(dt, {field: ("like", f"%{TAG}%")}, pluck="name"):
			frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
	if "crm" in frappe.get_installed_apps():
		for lead in frappe.get_all("CRM Lead", {"email": ("like", f"visit%@{DOMAIN}")}, pluck="name"):
			for child in ("FCRM Note", "CRM Task"):
				for n in frappe.get_all(child, {"reference_doctype": "CRM Lead", "reference_docname": lead}, pluck="name"):
					frappe.delete_doc(child, n, force=True, ignore_permissions=True)
			frappe.delete_doc("CRM Lead", lead, force=True, ignore_permissions=True)
	for user in frappe.get_all("User", {"name": ("like", f"season%@{DOMAIN}")}, pluck="name"):
		frappe.delete_doc("User", user, force=True, ignore_permissions=True)
	frappe.db.commit()
	print(f"Removed {len(clients)} season clients and their records.")
