"""WhatsApp broadcast: one approved template to a list of clients or CRM leads / deals (ported from the realestate
RE Broadcast). Runs in the background at a set pace; numbers without consent are skipped, never messaged:
clients must have opted in to WhatsApp (Tax Client.whatsapp_opt_in) and anyone who replied STOP is skipped.

Business-initiated WhatsApp messages must use a template Meta has approved; templates are filled from the
recipient's record (e.g. {{client_name}} from the Tax Client), so a template belongs to one record type.
"""

import time

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

# audience -> record type the template must be built on
AUDIENCES = {
	"Clients - All Opted In": "Tax Client",
	"Clients - Return Not Filed": "Tax Client",
	"Clients - Documents Pending": "Tax Client",
	"Leads": "CRM Lead",
	"Deals": "CRM Deal",
}
FILED = ("Submitted to FBR", "Acknowledged", "Closed")
FOOTER = "VVS Consultants · reply STOP to opt out"
# label, record type, category, body, {variable: field}
STARTER_TEMPLATES = [
	("VVS Filing Reminder", "Tax Client", "Utility",
		"Dear {{client_name}}, a reminder from VVS Consultants: the income tax return deadline is near. "
		"Please send your documents today — reply to this message or upload them in your client portal.", {"client_name": "client_name"}),
	("VVS Documents Reminder", "Tax Client", "Utility",
		"Dear {{client_name}}, we still need a few documents to prepare your income tax return. "
		"Please upload them in your client portal or send a clear photo here.", {"client_name": "client_name"}),
	("VVS Lead Introduction", "CRM Lead", "Marketing",
		"Assalam-o-Alaikum {{first_name}}, thank you for your interest in VVS Consultants. We prepare and file income tax "
		"returns for salaried people, businesses and companies on FBR IRIS. Reply to this message and a consultant will guide you.",
		{"first_name": "first_name"}),
	("VVS Deal Follow Up", "CRM Deal", "Marketing",
		"Assalam-o-Alaikum {{first_name}}, following up on your income tax return with VVS Consultants. "
		"Reply to this message whenever you are ready — we are happy to help.", {"first_name": "first_name"}),
]


def default_account():
	return frappe.db.get_single_value("WhatsApp Settings", "default_account")


def create_starter_templates():
	"""The four starter templates (submitted to Meta for approval; approved at once in test mode). Re-run safe."""
	from pakistan_tax_consultancy.services.wa_inbox import is_mock

	account = default_account()
	if not account:
		frappe.throw(_("Set up WhatsApp first (Settings → WhatsApp)."))
	if not frappe.db.exists("WhatsApp Language", "en"):
		frappe.get_doc({"doctype": "WhatsApp Language", "language_code": "en", "language_name": "English"}).insert(ignore_permissions=True)
	if is_mock():
		from pakistan_tax_consultancy.services.wa_inbox import install_mock

		install_mock()
	made = []
	for label, ref, category, body, variables in STARTER_TEMPLATES:
		if frappe.db.exists("WhatsApp Template", {"template_label": label}):
			continue
		doc = frappe.get_doc({"doctype": "WhatsApp Template", "template_label": label, "template_type": category, "language": "en",
			"reference_doctype": ref, "whatsapp_account": account, "message": body, "variable_format": "Named", "footer": FOOTER,
			"template_variables": [{"variable_name": k, "variable_field": v, "variable_example": "Ahmed"} for k, v in variables.items()]})
		doc.insert(ignore_permissions=True)
		made.append(doc.name)
	return made


# ---------------------------------------------------------------- audience
def _consent_ok(party_type, party, phone):
	"""None when the number may be messaged, else the reason to skip it."""
	from pakistan_tax_consultancy.services.wa_inbox import phone_key

	if not phone:
		return _("No mobile number")
	key = phone_key(phone)
	opted_out = frappe.db.sql("""select 1 from `tabClient Conversation` where opted_out = 1
		and RIGHT(REGEXP_REPLACE(IFNULL(phone, ''), '[^0-9]', ''), 10) = %s limit 1""", key)
	if opted_out:
		return _("Opted out (replied STOP)")
	if party_type == "Tax Client" and not cint(frappe.db.get_value("Tax Client", party, "whatsapp_opt_in")):
		return _("Has not agreed to WhatsApp messages")
	return None


def audience_rows(doc):
	rows = []
	aud = doc.audience
	if aud.startswith("Clients"):
		clients = frappe.get_all("Tax Client", {"status": "Active"}, ["name", "client_name", "mobile_e164", "mobile"])
		if aud == "Clients - Return Not Filed":
			year = doc.tax_year or frappe.db.get_value("Tax Year", {"is_active": 1}, "name", order_by="end_date desc")
			filed = set(frappe.get_all("Tax Return", {"tax_year": year, "workflow_state": ("in", FILED)}, pluck="tax_client"))
			clients = [c for c in clients if c.name not in filed]
		elif aud == "Clients - Documents Pending":
			waiting = set(frappe.get_all("Tax Return", {"workflow_state": "Documents Pending",
				**({"tax_year": doc.tax_year} if doc.tax_year else {})}, pluck="tax_client"))
			clients = [c for c in clients if c.name in waiting]
		for c in clients:
			rows.append({"party_type": "Tax Client", "party": c.name, "party_name": c.client_name, "phone": c.mobile_e164 or c.mobile})
	elif aud == "Leads":
		filters = {"converted": 0, "status": ("not in", ["Junk"])}
		if doc.lead_status:
			filters["status"] = doc.lead_status
		if doc.lead_source:
			filters["source"] = doc.lead_source
		for d in frappe.get_all("CRM Lead", filters, ["name", "lead_name", "mobile_no"]):
			rows.append({"party_type": "CRM Lead", "party": d.name, "party_name": d.lead_name, "phone": d.mobile_no})
	elif aud == "Deals":
		filters = {"status": doc.deal_status} if doc.deal_status else {"status": ("not in", ["Engaged", "Lost"])}
		for d in frappe.get_all("CRM Deal", filters, ["name", "lead_name", "mobile_no"]):
			rows.append({"party_type": "CRM Deal", "party": d.name, "party_name": d.lead_name, "phone": d.mobile_no})
	seen, out = set(), []
	for r in rows:  # one message per number
		key = "".join(ch for ch in (r["phone"] or "") if ch.isdigit())[-10:] or r["party"]
		if key in seen:
			continue
		seen.add(key)
		reason = _consent_ok(r["party_type"], r["party"], r["phone"])
		out.append({**r, "status": "Skipped" if reason else "Pending", "error": reason})
	return out


def validate_template(doc):
	t = frappe.db.get_value("WhatsApp Template", doc.template, ["status", "reference_doctype", "template_label"], as_dict=True)
	if not t:
		frappe.throw(_("Choose a WhatsApp template."))
	if t.status != "Approved":
		frappe.throw(_("Template {0} is {1} — Meta must approve it before it can be broadcast.").format(t.template_label, (t.status or "pending").lower()))
	need = AUDIENCES[doc.audience]
	if t.reference_doctype and t.reference_doctype != need:
		frappe.throw(_("Template {0} is filled from a {1}; this audience needs a {2} template.").format(t.template_label, t.reference_doctype, need))


def set_counts(doc):
	doc.total_recipients = len(doc.recipients)
	for status, field in (("Sent", "sent_count"), ("Failed", "failed_count"), ("Skipped", "skipped_count")):
		doc.set(field, sum(1 for r in doc.recipients if r.status == status))


# ---------------------------------------------------------------- send
def send_template(template, phone, reference_doctype=None, reference_name=None):
	"""One template message (ported from realestate.whatsapp.channel.send_template); it shows in the inbox and on the record."""
	from pakistan_tax_consultancy.services.wa_inbox import profile_for

	profile = profile_for(phone)
	if not profile:
		frappe.throw(_("Invalid WhatsApp number"))
	msg = frappe.get_doc({"doctype": "WhatsApp Message", "direction": "Outgoing", "to": profile, "is_template": 1,
		"whatsapp_template": template, "message": frappe.db.get_value("WhatsApp Template", template, "message") or "Template message",
		"reference_doctype": reference_doctype, "reference_docname": reference_name})
	msg.flags.ignore_permissions = True
	msg.insert()
	msg.submit()
	return msg.name


def run(broadcast, pace=True):
	from pakistan_tax_consultancy.services.wa_inbox import install_mock

	install_mock()
	frappe.flags.ptc_system_send = True
	doc = frappe.get_doc("WhatsApp Broadcast", broadcast)
	pause = 60.0 / max(1, min(cint(doc.rate_per_minute) or 30, 120))
	doc.db_set({"status": "Running", "started_on": now_datetime()})
	if not frappe.flags.in_test:
		frappe.db.commit()
	for row in doc.recipients:
		if frappe.db.get_value("WhatsApp Broadcast", broadcast, "status") == "Cancelled":
			break
		if row.status != "Pending":
			continue
		reason = _consent_ok(row.party_type, row.party, row.phone)  # consent may have changed since the list was made
		if reason:
			row.status, row.error = "Skipped", reason
		else:
			frappe.db.savepoint("ptc_broadcast_row")
			try:
				row.whatsapp_message = send_template(doc.template, row.phone, row.party_type, row.party)
				row.status = "Failed" if frappe.db.get_value("WhatsApp Message", row.whatsapp_message, "status") == "Failed" else "Sent"
			except Exception as e:
				frappe.db.rollback(save_point="ptc_broadcast_row")  # undo only this recipient's half-made message
				row.status, row.error = "Failed", str(e)[:500]
			if pace:
				time.sleep(pause)
		row.db_update()
		set_counts(doc)
		doc.db_update()
		if not frappe.flags.in_test:
			frappe.db.commit()
		frappe.publish_realtime("ptc_broadcast", {"name": doc.name, "sent": doc.sent_count, "failed": doc.failed_count,
			"skipped": doc.skipped_count, "total": doc.total_recipients})
	if frappe.db.get_value("WhatsApp Broadcast", broadcast, "status") != "Cancelled":
		doc.db_set({"status": "Completed", "completed_on": now_datetime()})
	if not frappe.flags.in_test:
		frappe.db.commit()
