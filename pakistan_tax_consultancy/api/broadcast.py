"""WhatsApp broadcasts and templates for the CRM app (Tax Admin / Sales Manager run broadcasts)."""

import frappe
from frappe import _
from frappe.utils import cint

from pakistan_tax_consultancy.services import broadcast as svc
from pakistan_tax_consultancy.services.wa_inbox import is_mock

MANAGERS = {"System Manager", "Tax Admin", "Sales Manager"}
TEMPLATE_DOCTYPES = ("Tax Client", "CRM Lead", "CRM Deal")


def _guard(manage=False):
	roles = set(frappe.get_roles())
	if frappe.session.user != "Administrator" and not (roles & MANAGERS or (not manage and roles & {"Tax Consultant", "Sales User"})):
		frappe.throw(_("Only a Tax Admin or Sales Manager can send broadcasts."), frappe.PermissionError)


# ---------------------------------------------------------------- templates
def templates_fields():
	return {"Tax Client": ["client_name", "business_name", "city"], "CRM Lead": ["first_name", "last_name", "lead_name", "organization"],
		"CRM Deal": ["first_name", "last_name", "lead_name", "organization_name"]}

@frappe.whitelist(methods=["GET"])
def templates():
	_guard()
	rows = frappe.get_all("WhatsApp Template", ["name", "template_label", "template_name", "status", "template_type", "language",
		"message", "footer", "reference_doctype", "header_text", "modified"], order_by="status asc, template_label asc")
	for r in rows:
		r.variables = frappe.get_all("Template Variable", {"parent": r.name}, ["variable_name", "variable_field", "variable_example"], order_by="idx")
	# only harmless personalisation fields: never CNIC, NTN, bank details or internal notes in a WhatsApp message
	fields = templates_fields()
	return {"templates": rows, "fields": fields, "mock": is_mock(), "account": svc.default_account(), "audiences": svc.AUDIENCES}


@frappe.whitelist(methods=["POST"])
def create_template(label: str, category: str, body: str, reference_doctype: str, variables: str | dict | None = None,
		footer: str | None = None):
	"""A new template, submitted to Meta for approval (pending until Meta reviews it; approved at once in test mode)."""
	_guard(manage=True)
	import re

	from pakistan_tax_consultancy.services.wa_inbox import install_mock

	if reference_doctype not in TEMPLATE_DOCTYPES:
		frappe.throw(_("Choose who it is for: client, lead or deal."))
	allowed = templates_fields()[reference_doctype]
	if category not in ("Utility", "Marketing"):
		frappe.throw(_("Category must be Utility or Marketing."))
	if not (label or "").strip() or not (body or "").strip():
		frappe.throw(_("Give the template a name and a message."))
	account = svc.default_account()
	if not account:
		frappe.throw(_("Set up WhatsApp first (Settings → WhatsApp)."))
	variables = frappe.parse_json(variables) if isinstance(variables, str) else (variables or {})
	used = re.findall(r"\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}", body)
	missing = [v for v in used if not variables.get(v)]
	if any(variables.get(v) not in allowed for v in used if variables.get(v)):
		frappe.throw(_("Only these fields can fill a template: {0}").format(", ".join(allowed)))
	if missing:
		frappe.throw(_("Choose which field fills {0}.").format(", ".join("{{" + m + "}}" for m in missing)))
	install_mock()
	doc = frappe.get_doc({"doctype": "WhatsApp Template", "template_label": label.strip()[:140], "template_type": category, "language": "en",
		"reference_doctype": reference_doctype, "whatsapp_account": account, "message": body.strip(), "variable_format": "Named",
		"footer": (footer or svc.FOOTER)[:60],
		"template_variables": [{"variable_name": v, "variable_field": variables[v], "variable_example": "Ahmed"} for v in dict.fromkeys(used)]})
	doc.insert()
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def update_template(name: str, label: str, body: str, variables: str | dict | None = None, footer: str | None = None):
	"""Edit a template's wording. Meta reviews the change again (status goes back to Pending until approved — instant in
	test mode); its category, language and record type stay as they are, and Meta limits how often an approved
	template can be edited."""
	_guard(manage=True)
	import re

	from pakistan_tax_consultancy.services.wa_inbox import install_mock

	doc = frappe.get_doc("WhatsApp Template", name)
	if not (label or "").strip() or not (body or "").strip():
		frappe.throw(_("Give the template a name and a message."))
	variables = frappe.parse_json(variables) if isinstance(variables, str) else (variables or {})
	allowed = templates_fields().get(doc.reference_doctype, [])
	used = list(dict.fromkeys(re.findall(r"\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}", body)))
	missing = [v for v in used if not variables.get(v)]
	if missing:
		frappe.throw(_("Choose which field fills {0}.").format(", ".join("{{" + m + "}}" for m in missing)))
	if allowed and any(variables[v] not in allowed for v in used):
		frappe.throw(_("Only these fields can fill a template: {0}").format(", ".join(allowed)))
	unchanged = doc.message == body.strip() and (doc.footer or "") == (footer or "") and \
		{v.variable_name: v.variable_field for v in doc.template_variables} == {v: variables[v] for v in used}
	doc.template_label = label.strip()[:140]
	if unchanged:  # only the label changed: nothing to send to Meta
		doc.db_set("template_label", doc.template_label)
		return {"name": doc.name, "status": doc.status}
	install_mock()
	doc.message = body.strip()
	doc.footer = (footer or "")[:60]
	doc.set("template_variables", [{"variable_name": v, "variable_field": variables[v], "variable_example": "Ahmed"} for v in used])
	doc.save(ignore_permissions=True)
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist(methods=["POST"])
def starter_templates():
	_guard(manage=True)
	return svc.create_starter_templates()


@frappe.whitelist(methods=["POST"])
def sync_templates():
	"""Pull template status (Pending → Approved / Rejected) and templates made in WhatsApp Manager from Meta."""
	_guard(manage=True)
	from whatsapp.whatsapp.doctype.whatsapp_template.whatsapp_template import sync_all

	from pakistan_tax_consultancy.services.wa_inbox import install_mock

	install_mock()
	return sync_all()


# ---------------------------------------------------------------- broadcasts
FIELDS = ["name", "title", "template", "status", "audience", "total_recipients", "sent_count", "failed_count", "skipped_count",
	"started_on", "completed_on", "creation", "owner"]


@frappe.whitelist(methods=["GET"])
def broadcasts():
	_guard()
	rows = frappe.get_all("WhatsApp Broadcast", fields=FIELDS, order_by="creation desc", limit=100)
	labels = dict(frappe.get_all("WhatsApp Template", fields=["name", "template_label"], as_list=True))
	for r in rows:
		r.template_label = labels.get(r.template, r.template)
	return rows


def _draft(data):
	doc = frappe.new_doc("WhatsApp Broadcast")
	doc.update({k: data.get(k) for k in ("title", "template", "audience", "tax_year", "lead_status", "deal_status", "lead_source")})
	doc.rate_per_minute = max(1, min(cint(data.get("rate_per_minute")) or 30, 120))
	if doc.audience not in svc.AUDIENCES:
		frappe.throw(_("Choose an audience."))
	doc.title = (doc.title or "").strip() or f"{frappe.db.get_value('WhatsApp Template', doc.template, 'template_label') or 'Broadcast'} · {doc.audience}"
	svc.validate_template(doc)
	doc.set("recipients", svc.audience_rows(doc))
	svc.set_counts(doc)
	return doc


@frappe.whitelist(methods=["POST"])
def preview(data: str | dict):
	"""How many would get it, how many are skipped and why — nothing is saved or sent."""
	_guard(manage=True)
	doc = _draft(frappe.parse_json(data) if isinstance(data, str) else data)
	reasons = {}
	for r in doc.recipients:
		if r.status == "Skipped":
			reasons[r.error] = reasons.get(r.error, 0) + 1
	t = frappe.db.get_value("WhatsApp Template", doc.template, ["message", "reference_doctype"], as_dict=True)
	sample = next((r for r in doc.recipients if r.status == "Pending"), None)
	text = t.message
	if sample and t.reference_doctype:
		ref = frappe.get_doc(t.reference_doctype, sample.party)
		for v in frappe.get_all("Template Variable", {"parent": doc.template}, ["variable_name", "variable_field"]):
			text = text.replace("{{" + v.variable_name + "}}", str(ref.get(v.variable_field) or ""))
	return {"total": doc.total_recipients, "will_send": sum(1 for r in doc.recipients if r.status == "Pending"),
		"skipped": reasons, "sample": [{"name": r.party_name, "phone": r.phone, "status": r.status, "reason": r.error} for r in doc.recipients[:8]],
		"preview_text": text, "minutes": round(sum(1 for r in doc.recipients if r.status == "Pending") / doc.rate_per_minute, 1)}


@frappe.whitelist(methods=["POST"])
def start(data: str | dict):
	_guard(manage=True)
	doc = _draft(frappe.parse_json(data) if isinstance(data, str) else data)
	if not any(r.status == "Pending" for r in doc.recipients):
		frappe.throw(_("Nobody in this audience can receive WhatsApp messages."))
	doc.status = "Queued"
	if not _workers():
		if not is_mock():
			frappe.throw(_("The background worker is not running, so a broadcast cannot be sent now. Ask the administrator to start it (bench worker)."))
		doc.insert()
		if not frappe.flags.in_test:
			frappe.db.commit()
		svc.run(doc.name, pace=False)  # test mode on a bench without workers: send straight away
		return doc.name
	doc.insert()
	frappe.enqueue(svc.run, queue="long", timeout=6 * 3600, broadcast=doc.name, enqueue_after_commit=True)
	return doc.name


def _workers():
	try:
		from frappe.utils.background_jobs import get_workers

		return bool(get_workers())
	except Exception:
		return False


@frappe.whitelist(methods=["GET"])
def progress(name: str):
	_guard()
	doc = frappe.get_doc("WhatsApp Broadcast", name)
	return {**{f: doc.get(f) for f in FIELDS},
		"recipients": [{"name": r.party_name, "party_type": r.party_type, "party": r.party, "phone": r.phone, "status": r.status,
			"reason": r.error} for r in doc.recipients]}


@frappe.whitelist(methods=["POST"])
def cancel(name: str):
	_guard(manage=True)
	doc = frappe.get_doc("WhatsApp Broadcast", name)
	if doc.status in ("Queued", "Running"):
		doc.db_set("status", "Cancelled")


@frappe.whitelist(methods=["GET"])
def insights(name: str):
	"""One broadcast: delivery funnel (sent → delivered → read), replies after it went out, why people were skipped or
	failed, sends per minute, and every recipient with their message status."""
	_guard()
	doc = frappe.get_doc("WhatsApp Broadcast", name)
	t = frappe.db.get_value("WhatsApp Template", doc.template, ["template_label", "message", "footer", "template_type", "reference_doctype"], as_dict=True) or {}
	msgs = {m.name: m for m in frappe.get_all("WhatsApp Message", {"name": ("in", [r.whatsapp_message for r in doc.recipients if r.whatsapp_message] or [""])},
		["name", "status", "creation", "to"])}
	state = {}
	for m in msgs.values():
		state[(m.status or "Sent").title()] = state.get((m.status or "Sent").title(), 0) + 1
	read = state.get("Read", 0)
	delivered = state.get("Delivered", 0) + read
	since = doc.started_on or doc.creation
	replied, recipients = 0, []
	for r in doc.recipients:
		m = msgs.get(r.whatsapp_message) if r.whatsapp_message else None
		reply = None
		if m:
			reply = frappe.db.get_value("WhatsApp Message", {"to": m.to, "direction": "Incoming", "creation": (">", since)},
				["message", "creation"], as_dict=True, order_by="creation asc")
			replied += 1 if reply else 0
		recipients.append({"name": r.party_name, "party_type": r.party_type, "party": r.party, "phone": r.phone, "status": r.status,
			"reason": r.error, "message_status": (m.status if m else None), "sent_at": m.creation if m else None,
			"reply": (reply.message or "")[:160] if reply else None, "replied_at": reply.creation if reply else None})
	reasons = {}
	for r in doc.recipients:
		if r.status in ("Skipped", "Failed"):
			key = f"{r.status}: {(r.error or 'unknown')[:80]}"
			reasons[key] = reasons.get(key, 0) + 1
	per_minute = {}
	for m in msgs.values():
		k = str(m.creation)[:16]
		per_minute[k] = per_minute.get(k, 0) + 1
	sent = doc.sent_count or 0
	duration = (frappe.utils.time_diff_in_seconds(doc.completed_on, doc.started_on) if doc.completed_on and doc.started_on else None)
	return {**{f: doc.get(f) for f in FIELDS}, "rate_per_minute": doc.rate_per_minute, "lead_status": doc.lead_status, "lead_source": doc.lead_source,
		"deal_status": doc.deal_status, "tax_year": doc.tax_year, "template_info": t, "mock": is_mock(),
		"funnel": {"recipients": doc.total_recipients, "sent": sent, "delivered": delivered, "read": read, "replied": replied},
		"rates": {"delivery": round(100 * delivered / sent) if sent else None, "read": round(100 * read / sent) if sent else None,
			"reply": round(100 * replied / sent) if sent else None, "reach": round(100 * sent / doc.total_recipients) if doc.total_recipients else None},
		"message_states": state, "reasons": sorted(({"reason": k, "count": v} for k, v in reasons.items()), key=lambda x: -x["count"]),
		"timeline": [{"minute": k[11:], "count": v} for k, v in sorted(per_minute.items())], "duration_seconds": duration,
		"recipients": recipients}
