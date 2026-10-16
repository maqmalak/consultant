"""Client portal API. Every call resolves the caller's own Tax Client first; nothing takes a client id from the
browser, so one client can never reach another's records."""

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, getdate, now_datetime

from pakistan_tax_consultancy.services import workflow as wf

STEPS = ["Account", "Documents", "In preparation", "In review", "Your confirmation", "Filed", "Acknowledgment received"]
STEP_OF = {
	wf.DOCUMENTS_PENDING: 1, wf.DRAFT: 2, wf.CHANGES_REQUIRED: 2, wf.PENDING_REVIEW: 3, wf.UNDER_REVIEW: 3,
	wf.REVIEWED: 3, wf.AWAITING_CLIENT: 4, wf.APPROVED: 5, wf.SUBMITTED: 5, wf.FILING_ERROR: 5,
	wf.ACKNOWLEDGED: 6, wf.CLOSED: 6,
}
# what a client is told for each internal state
CLIENT_STATUS = {
	wf.DOCUMENTS_PENDING: "Waiting for your documents", wf.DRAFT: "We are preparing your return",
	wf.CHANGES_REQUIRED: "We are updating your return", wf.PENDING_REVIEW: "In review",
	wf.UNDER_REVIEW: "In review", wf.REVIEWED: "In review", wf.AWAITING_CLIENT: "Please confirm your return",
	wf.APPROVED: "Approved — being filed", wf.SUBMITTED: "Submitted on FBR IRIS",
	wf.FILING_ERROR: "Filing in progress", wf.ACKNOWLEDGED: "Filed — acknowledgment received", wf.CLOSED: "Filed",
}
QUESTIONS = ("has_salary", "has_business", "has_property_income", "has_capital_gains", "has_profit_on_debt",
	"has_foreign_income", "has_other_income", "owns_property", "owns_vehicle", "first_time_filer")
EDITABLE_BY_CLIENT = (wf.DOCUMENTS_PENDING, wf.DRAFT, wf.CHANGES_REQUIRED)


def my_client(required=True):
	user = frappe.session.user
	name = frappe.db.get_value("Tax Client", {"portal_user": user}, "name") if user != "Guest" else None
	if not name and required:
		frappe.throw(_("No client profile is linked to this account."), frappe.PermissionError)
	return frappe.get_doc("Tax Client", name) if name else None


def my_return(tax_return):
	client = my_client()
	doc = frappe.get_doc("Tax Return", tax_return)
	if doc.tax_client != client.name:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return client, doc


def step_dates(tax_return: str, tax_client: str | None = None) -> list:
	"""When each step of the client journey was first reached (from the audit trail); None = not reached yet."""
	dates = [None] * len(STEPS)
	if tax_client:
		dates[0] = str(frappe.db.get_value("Tax Client", tax_client, "creation") or "") or None
	created = frappe.db.get_value("Tax Return", tax_return, "creation")
	if created:
		dates[1] = str(created)
	for e in frappe.get_all("Tax Audit Event", filters={"reference_doctype": "Tax Return", "reference_name": tax_return,
			"event_type": ("in", ("Create", "Status Change"))}, fields=["to_state", "timestamp"], order_by="timestamp asc"):
		step = STEP_OF.get(e.to_state)
		if step is None:
			continue
		for i in range(1, step + 1):  # reaching a step implies the earlier ones are behind it
			dates[i] = dates[i] or str(e.timestamp)
	return dates


def _return_card(r):
	return {"name": r.name, "tax_year": r.tax_year, "return_type": r.return_type, "state": r.workflow_state,
		"status": CLIENT_STATUS.get(r.workflow_state, r.workflow_state), "step": STEP_OF.get(r.workflow_state, 1),
		"net_tax_payable": r.net_tax_payable, "refund_due": r.refund_due, "iris_acknowledgment_no": r.iris_acknowledgment_no,
		"has_receipt": bool(r.fbr_receipt), "action_needed": r.workflow_state in (wf.DOCUMENTS_PENDING, wf.AWAITING_CLIENT)}


@frappe.whitelist(methods=["GET"])
def dashboard():
	from pakistan_tax_consultancy.api.public import current_tax_year

	client = my_client()
	returns = frappe.get_all("Tax Return", filters={"tax_client": client.name}, order_by="tax_year desc, creation desc",
		fields=["name", "tax_year", "return_type", "workflow_state", "net_tax_payable", "refund_due",
			"iris_acknowledgment_no", "fbr_receipt"])
	docs = frappe.get_all("Tax Document", filters={"tax_client": client.name, "is_required": 1,
		"status": ("in", ("Requested", "Rejected"))}, fields=["status"])
	unread = frappe.db.count("Client Message", {"tax_client": client.name, "from_client": 0, "read_by_recipient": 0})
	year = current_tax_year()
	return {
		"steps": STEPS,
		"client": {"name": client.name, "client_name": client.client_name, "client_type": client.client_type,
			"cnic_masked": client.cnic_masked, "ntn": client.ntn, "mobile": client.mobile, "email": client.email,
			"email_verified": client.email_verified, "mobile_verified": client.mobile_verified,
			"consultant": frappe.utils.get_fullname(client.assigned_consultant) if client.assigned_consultant else None},
		"returns": [_return_card(r) for r in returns],
		"documents_to_upload": sum(1 for d in docs if d.status == "Requested"),
		"documents_rejected": sum(1 for d in docs if d.status == "Rejected"),
		"unread_messages": unread,
		"engagements": engagements(),
		"current_tax_year": year.name if year else None,
		"filing_deadline": str(year.return_due_date) if year and year.return_due_date else None,
	}


@frappe.whitelist(methods=["GET"])
def engagements():
	client = my_client()
	rows = frappe.get_all("Tax Engagement", filters={"tax_client": client.name}, order_by="creation desc",
		fields=["name", "service", "service_package", "tax_year", "agreed_fee", "discount", "net_fee", "payment_status",
			"sales_invoice", "tax_return", "status"])
	for r in rows:
		r["outstanding"] = flt(frappe.db.get_value("Sales Invoice", r.sales_invoice, "outstanding_amount")) \
			if r.sales_invoice else flt(r.net_fee or r.agreed_fee)
		r["proofs"] = frappe.get_all("Payment Proof", filters={"tax_engagement": r.name},
			fields=["name", "method", "amount", "reference", "status", "rejection_reason", "creation"], order_by="creation desc")
	return rows


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def order(package: str, tax_year: str | None = None, promo_code: str | None = None):
	"""Choose a package: creates the engagement and (for return filing) the draft return with its checklist."""
	from pakistan_tax_consultancy.api.public import current_tax_year
	from pakistan_tax_consultancy.audit import log_event
	from pakistan_tax_consultancy.services.billing import apply_promo

	client = my_client()
	pkg = frappe.get_doc("Service Package", package)
	if not pkg.active:
		frappe.throw(_("This package is not available."))
	tax_year = tax_year or (current_tax_year() or {}).get("name")
	if not frappe.db.exists("Tax Year", {"name": tax_year, "is_active": 1}):
		frappe.throw(_("Choose a valid tax year."))
	existing = frappe.db.get_value("Tax Engagement", {"tax_client": client.name, "service": pkg.service,
		"tax_year": tax_year, "status": ("!=", "Cancelled")}, "name")
	if existing:
		return {"engagement": existing, "tax_return": frappe.db.get_value("Tax Engagement", existing, "tax_return"),
			"existing": True}
	discount, error = apply_promo(promo_code, pkg.price, pkg.service)
	if error:
		frappe.throw(error)
	eng = frappe.get_doc({"doctype": "Tax Engagement", "tax_client": client.name, "service": pkg.service,
		"service_package": pkg.name, "tax_year": tax_year, "status": "Active", "engagement_date": getdate(),
		"assigned_consultant": client.assigned_consultant, "agreed_fee": pkg.price,
		"promo_code": ((promo_code or "").strip().upper() or None) if discount else None, "discount": discount,
		"net_fee": flt(pkg.price) - discount, "payment_status": "Unbilled"})
	eng.insert(ignore_permissions=True)
	tax_return = None
	if is_return_service(pkg.service):
		tr = frappe.get_doc({"doctype": "Tax Return", "tax_client": client.name, "tax_year": tax_year,
			"tax_engagement": eng.name, "return_type": "Original", "assigned_consultant": client.assigned_consultant})
		tr.insert(ignore_permissions=True)
		tax_return = tr.name
		eng.db_set("tax_return", tax_return, update_modified=False)
	log_event("Create", eng, details={"package": pkg.name, "discount": discount, "via": "portal"})
	return {"engagement": eng.name, "tax_return": tax_return, "net_fee": eng.net_fee}


def is_return_service(service):
	return "return" in (service or "").lower()


@frappe.whitelist(methods=["POST"])
def check_promo(package: str, promo_code: str):
	from pakistan_tax_consultancy.services.billing import apply_promo

	pkg = frappe.get_doc("Service Package", package)
	discount, error = apply_promo(promo_code, pkg.price, pkg.service)
	return {"discount": discount, "error": error, "net_fee": flt(pkg.price) - discount}


@frappe.whitelist(methods=["GET"])
def return_detail(tax_return: str):
	from pakistan_tax_consultancy.services.checklist import checklist

	_client, doc = my_return(tax_return)
	data = _return_card(doc)
	data.update({
		"questions": {q: cint(doc.get(q)) for q in QUESTIONS},
		"can_edit_answers": doc.workflow_state in EDITABLE_BY_CLIENT,
		"checklist": checklist(doc.name),
		"client_confirmed": cint(doc.client_confirmed), "client_confirmed_on": doc.client_confirmed_on,
		"step_dates": step_dates(doc.name, doc.tax_client),
		"client_details": frappe.parse_json(doc.client_details) if doc.client_details else None,
		"problem": doc.workflow_state in (wf.CHANGES_REQUIRED, wf.FILING_ERROR),
		"comments": [c for c in frappe.get_all("Review Comment", filters={"tax_return": doc.name},
			fields=["comment", "from_client", "visible_to_client", "creation", "stage"], order_by="creation asc")
			if c.from_client or c.visible_to_client],
	})
	if doc.workflow_state in (wf.AWAITING_CLIENT, wf.APPROVED) + wf.FILED_STATES:
		data["summary"] = summary(doc)
	return data


def summary(doc):
	by_category = {}
	for row in doc.income_sources:
		by_category[row.income_category] = by_category.get(row.income_category, 0) + flt(row.gross_amount)
	return {
		"income": [{"category": k, "amount": v} for k, v in by_category.items()],
		"total_income": doc.total_income, "total_deductions": doc.total_deductions, "taxable_income": doc.taxable_income,
		"tax_liability": doc.tax_liability, "total_tax_credits": doc.total_tax_credits,
		"total_tax_withheld": doc.total_tax_withheld, "total_advance_tax": doc.total_advance_tax,
		"net_tax_payable": doc.net_tax_payable, "refund_due": doc.refund_due,
		"total_assets": doc.total_assets, "total_liabilities": doc.total_liabilities, "net_wealth": doc.net_wealth,
		"withholding": [{"section": r.section, "payer": r.payer, "amount": r.amount} for r in doc.withholding_lines],
		"assets": [{"type": r.asset_type, "description": r.description, "value": r.cost_value} for r in doc.asset_lines],
	}


@frappe.whitelist(methods=["POST"])
def save_answers(tax_return: str, answers: str | dict):
	from pakistan_tax_consultancy.services.checklist import generate_checklist

	_client, doc = my_return(tax_return)
	if doc.workflow_state not in EDITABLE_BY_CLIENT:
		frappe.throw(_("Your return is already in review; message your consultant to change your answers."))
	answers = frappe.parse_json(answers) if isinstance(answers, str) else answers
	for q in QUESTIONS:
		if q in answers:
			doc.set(q, 1 if cint(answers[q]) else 0)
	doc.save(ignore_permissions=True)
	required = generate_checklist(doc)
	return {"required_documents": required}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=120, seconds=60 * 60)
def save_details(tax_return: str, details: str | dict):
	"""The client's plain-language answers about their year (salary, bank, property, car …)."""
	from pakistan_tax_consultancy.services.client_details import clean

	_client, doc = my_return(tax_return)
	if doc.workflow_state not in EDITABLE_BY_CLIENT:
		frappe.throw(_("Your return is already in review; message your consultant to change your details."))
	data = clean(frappe.parse_json(details) if isinstance(details, str) else details)
	frappe.db.set_value("Tax Return", doc.name, {"client_details": frappe.as_json(data),
		"client_details_updated_on": now_datetime()}, update_modified=False)
	return data


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=60, seconds=60 * 60)
def upload(tax_document: str):
	from pakistan_tax_consultancy.services.files import upload_tax_document

	client = my_client()
	if frappe.db.get_value("Tax Document", tax_document, "tax_client") != client.name:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return upload_tax_document(tax_document)


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=30, seconds=60 * 60)
def add_document(document_type: str, tax_return: str | None = None, note: str | None = None):
	"""An extra document the client wants to share (not on the checklist)."""
	client = my_client()
	if tax_return:
		my_return(tax_return)
	if not frappe.db.exists("Document Type", {"name": document_type, "is_active": 1}):
		frappe.throw(_("Unknown document type."))
	doc = frappe.get_doc({"doctype": "Tax Document", "tax_client": client.name, "tax_return": tax_return,
		"document_type": document_type, "document_name": document_type, "status": "Requested", "is_required": 0,
		"notes": (note or "")[:500]})
	doc.insert(ignore_permissions=True)
	return {"name": doc.name}


@frappe.whitelist(methods=["POST"])
def confirm(tax_return: str):
	from pakistan_tax_consultancy.audit import log_event

	_client, doc = my_return(tax_return)
	if doc.workflow_state != wf.AWAITING_CLIENT:
		frappe.throw(_("There is nothing to confirm right now."))
	doc.client_confirmed = 1
	doc.client_confirmed_on = now_datetime()
	doc.client_confirmed_by = frappe.session.user
	doc.client_confirmed_ip = getattr(frappe.local, "request_ip", None)
	doc.save(ignore_permissions=True)
	log_event("Approval", doc, details={"client_confirmed": True, "content_hash": doc.content_hash})
	from pakistan_tax_consultancy.services.notify import send, users_with_role

	send([doc.approver] if doc.approver else users_with_role("Tax Approver"),
		_("Client confirmed {0} — ready for approval").format(doc.name), f"<p>{doc.client_name} · {doc.tax_year}</p>", doc)
	return {"confirmed": True}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def ask_question(tax_return: str, question: str):
	_client, doc = my_return(tax_return)
	question = (question or "").strip()[:2000]
	if not question:
		frappe.throw(_("Type your question."))
	if doc.workflow_state == wf.AWAITING_CLIENT:
		doc.workflow_state = wf.CHANGES_REQUIRED
		doc.flags.workflow_comment = question
		doc.save(ignore_permissions=True)  # Frappe Workflow still checks the Client role may make this move
	else:
		frappe.get_doc({"doctype": "Review Comment", "tax_return": doc.name, "stage": doc.workflow_state,
			"user": frappe.session.user, "comment": question, "from_client": 1}).insert(ignore_permissions=True)
	return {"sent": True}


@frappe.whitelist(methods=["GET"])
def messages():
	client = my_client()
	rows = frappe.get_all("Client Message", filters={"tax_client": client.name},
		fields=["name", "message", "from_client", "sender", "creation", "tax_return"], order_by="creation asc", limit=500)
	for r in rows:
		r["sender_name"] = frappe.utils.get_fullname(r.sender)
	frappe.db.set_value("Client Message", {"tax_client": client.name, "from_client": 0, "read_by_recipient": 0},
		"read_by_recipient", 1, update_modified=False)
	return rows


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=60, seconds=60 * 60)
def send_message(message: str, tax_return: str | None = None):
	from pakistan_tax_consultancy.services.notify import send

	client = my_client()
	message = (message or "").strip()[:2000]
	if not message:
		frappe.throw(_("Type a message."))
	if tax_return:
		my_return(tax_return)
	msg = frappe.get_doc({"doctype": "Client Message", "tax_client": client.name, "tax_return": tax_return,
		"sender": frappe.session.user, "from_client": 1, "message": message})
	msg.insert(ignore_permissions=True)
	send([client.assigned_consultant], _("New message from {0}").format(client.client_name),
		f"<p>{frappe.utils.escape_html(message)}</p>", client)
	return {"name": msg.name}


@frappe.whitelist(methods=["POST"])
@rate_limit(limit=20, seconds=60 * 60)
def submit_payment(tax_engagement: str, method: str, amount: float, reference: str | None = None,
		paid_on: str | None = None):
	from pakistan_tax_consultancy.services.files import attach_private, read_upload
	from pakistan_tax_consultancy.services.notify import send, users_with_role

	client = my_client()
	eng = frappe.get_doc("Tax Engagement", tax_engagement)
	if eng.tax_client != client.name:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	if method not in ("Bank Transfer", "Raast", "JazzCash", "Easypaisa"):
		frappe.throw(_("Choose how you paid."))
	if flt(amount) <= 0:
		frappe.throw(_("Enter the amount you paid."))
	proof = frappe.get_doc({"doctype": "Payment Proof", "tax_engagement": eng.name, "tax_client": client.name,
		"method": method, "amount": flt(amount), "reference": (reference or "")[:140], "paid_on": paid_on or getdate(),
		"status": "Pending"})
	proof.insert(ignore_permissions=True)
	if getattr(frappe.request, "files", None) and frappe.request.files.get("file"):
		filename, content = read_upload()
		proof.db_set("proof_file", attach_private("Payment Proof", proof.name, "proof_file", filename, content))
	send(users_with_role("Tax Admin"), _("Payment proof to verify: {0}").format(client.client_name),
		f"<p>{method} · Rs {flt(amount):,.0f} · {frappe.utils.escape_html(reference or '')}</p>", proof)
	return {"name": proof.name, "status": proof.status}


@frappe.whitelist(methods=["GET"])
def profile():
	c = my_client()
	return {f: c.get(f) for f in ("client_name", "client_type", "cnic_masked", "ntn", "strn", "email", "mobile", "city",
		"province", "residential_address", "business_name", "business_address", "preferred_contact_method",
		"preferred_language", "fbr_registration_status", "email_verified", "mobile_verified", "whatsapp_opt_in")}


@frappe.whitelist(methods=["POST"])
def update_profile(**data):
	c = my_client()
	for f in ("city", "province", "residential_address", "business_name", "business_address", "preferred_contact_method",
			"preferred_language", "ntn"):
		if f in data:
			c.set(f, (data[f] or "").strip()[:500] if isinstance(data[f], str) else data[f])
	if "whatsapp_opt_in" in data and cint(data["whatsapp_opt_in"]) != cint(c.whatsapp_opt_in):
		c.whatsapp_opt_in = cint(data["whatsapp_opt_in"])
		c.whatsapp_opt_in_on = now_datetime() if c.whatsapp_opt_in else None
	c.flags.ignore_permissions = True
	c.save()
	return profile()


@frappe.whitelist(methods=["GET"])
def download(doctype: str, name: str, fieldname: str):
	from pakistan_tax_consultancy.services.files import stream

	stream(doctype, name, fieldname)


@frappe.whitelist(methods=["GET"])
def invoice_pdf(tax_engagement: str):
	client = my_client()
	eng = frappe.db.get_value("Tax Engagement", tax_engagement, ["tax_client", "sales_invoice"], as_dict=True)
	if not eng or eng.tax_client != client.name or not eng.sales_invoice:
		frappe.throw(_("No invoice yet."), frappe.PermissionError)
	frappe.local.response.filename = f"{eng.sales_invoice}.pdf"
	frappe.local.response.filecontent = frappe.get_print("Sales Invoice", eng.sales_invoice, as_pdf=True,
		no_letterhead=0)
	frappe.local.response.type = "pdf"
