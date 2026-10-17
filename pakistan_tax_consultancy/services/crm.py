"""Frappe CRM glue (ported from the realestate app's CRM setup, adapted to a tax firm).

Pipeline: CRM Lead (website contact, consultation booking, site visit, WhatsApp from an unknown number)
-> CRM Deal (Enquiry -> Consultation -> Proposal Sent -> Documents Pending) -> Engaged (won) -> Tax Client.
The full CRM runs at /crm; the staff portal shows a dashboard, leads and the pipeline board (api/crm.py).
"""

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.utils import nowdate, strip_html

# deal status, type, position, colour, probability
PIPELINE = [
	("Enquiry", "Open", 1, "gray", 10),
	("Consultation", "Ongoing", 2, "blue", 30),
	("Proposal Sent", "Ongoing", 3, "amber", 50),
	("Documents Pending", "Ongoing", 4, "violet", 75),
	("Engaged", "Won", 5, "green", 100),
	("Lost", "Lost", 6, "red", 0),
]
WON = "Engaged"
LEAD_SOURCES = ["Website", "Contact Form", "Consultation Booking", "WhatsApp", "Site Visit", "Referral", "Walk In", "Facebook", "Lead Finder"]
LOST_REASONS = ["Fee too high", "Filed with another consultant", "Not responding", "Not required to file", "Will file next year"]
# staff role -> CRM roles (Frappe CRM only opens for Sales User / Sales Manager / System Manager)
CRM_ROLES = {"Tax Admin": ("Sales Manager", "Sales User"), "Tax Consultant": ("Sales User",), "Field Officer": ("Sales User",),
	"Tax Reviewer": ("Sales User",)}
CLIENT_TYPES = "Individual-Salaried\nIndividual-Business\nAOP\nCompany\nOther"


def installed():
	return "crm" in frappe.get_installed_apps()


# ---------------------------------------------------------------- setup (after_migrate)
def setup():
	if not installed():
		return
	for name, kind, pos, colour, prob in PIPELINE:
		doc = frappe.get_doc("CRM Deal Status", name) if frappe.db.exists("CRM Deal Status", name) else frappe.new_doc("CRM Deal Status")
		doc.update({"deal_status": name, "type": kind, "position": pos, "color": colour, "probability": prob})
		doc.save(ignore_permissions=True)
	keep = {p[0] for p in PIPELINE}
	for name in frappe.get_all("CRM Deal Status", pluck="name"):
		if name not in keep and not frappe.db.exists("CRM Deal", {"status": name}):
			frappe.delete_doc("CRM Deal Status", name, ignore_permissions=True, force=True)
	for source in LEAD_SOURCES:
		if not frappe.db.exists("CRM Lead Source", source):
			frappe.get_doc({"doctype": "CRM Lead Source", "source_name": source}).insert(ignore_permissions=True)
	for reason in LOST_REASONS:
		if not frappe.db.exists("CRM Lost Reason", reason):
			frappe.get_doc({"doctype": "CRM Lost Reason", "lost_reason": reason}).insert(ignore_permissions=True)
	create_custom_fields({
		"CRM Lead": [
			{"fieldname": "ptc_client_type", "label": "Client Type", "fieldtype": "Select", "options": CLIENT_TYPES,
				"default": "Individual-Salaried", "insert_after": "organization"},
			{"fieldname": "tax_client", "label": "Tax Client", "fieldtype": "Link", "options": "Tax Client", "read_only": 1,
				"insert_after": "ptc_client_type"},
		],
		"CRM Deal": [
			{"fieldname": "ptc_client_type", "label": "Client Type", "fieldtype": "Select", "options": CLIENT_TYPES,
				"default": "Individual-Salaried", "insert_after": "organization"},
			{"fieldname": "service_package", "label": "Package", "fieldtype": "Link", "options": "Service Package",
				"insert_after": "ptc_client_type"},
			{"fieldname": "tax_client", "label": "Tax Client", "fieldtype": "Link", "options": "Tax Client", "read_only": 1,
				"insert_after": "service_package"},
		],
	}, update=True)
	pipeline_view()
	for user in frappe.get_all("Has Role", {"role": ("in", list(CRM_ROLES)), "parenttype": "User"}, pluck="parent", distinct=True):
		sync_roles(user)


PIPELINE_VIEW = "Tax Pipeline"


def pipeline_view():
	"""A public, pinned kanban in Frappe CRM: stages in pipeline order, cards titled by the person (not organization —
	most clients are individuals)."""
	import json

	name = pipeline_view_name()  # CRM View Settings are autoincrement-named: find ours by label
	doc = frappe.get_doc("CRM View Settings", name) if name else frappe.new_doc("CRM View Settings")
	doc.update({"label": PIPELINE_VIEW, "type": "kanban", "dt": "CRM Deal", "user": "", "public": 1, "pinned": 1, "route_name": "Deals",
		"column_field": "status", "title_field": "lead_name", "order_by": "modified desc", "filters": "{}",
		"kanban_columns": json.dumps([{"name": p[0], "color": p[3]} for p in PIPELINE]),
		"kanban_fields": json.dumps(["service_package", "mobile_no", "expected_deal_value", "deal_owner", "modified"]),
		"rows": json.dumps(["name", "lead_name", "status", "service_package", "mobile_no", "expected_deal_value", "deal_owner", "modified"])})
	doc.flags.ignore_permissions = True
	doc.save()


def pipeline_view_name():
	return frappe.db.get_value("CRM View Settings", {"label": PIPELINE_VIEW, "dt": "CRM Deal", "public": 1}, "name")


def sync_roles(user):
	"""Give a staff user the Frappe CRM roles their tax role needs (never removes roles)."""
	if not installed() or user in ("Administrator", "Guest"):
		return
	roles = set(frappe.get_roles(user))
	want = {r for staff_role, crm in CRM_ROLES.items() if staff_role in roles for r in crm} - roles
	if want:
		u = frappe.get_doc("User", user)
		u.flags.ignore_permissions = True
		u.add_roles(*sorted(want))


# ---------------------------------------------------------------- lead capture
def _key(mobile):
	digits = "".join(c for c in (mobile or "") if c.isdigit())
	return digits[-10:] if len(digits) >= 10 else digits


def find_lead(mobile=None, email=None):
	if not installed():
		return None
	key = _key(mobile)
	if len(key) >= 7:
		row = frappe.db.sql("""select name from `tabCRM Lead` where RIGHT(REGEXP_REPLACE(IFNULL(mobile_no, ''), '[^0-9]', ''), 10) = %s
			order by modified desc limit 1""", key)
		if row:
			return row[0][0]
	if email:
		return frappe.db.get_value("CRM Lead", {"email": email.strip().lower()}, "name")
	return None


def make_lead(full_name, mobile=None, email=None, source=None, note=None, owner=None, client_type=None):
	"""A CRM Lead for follow-up, reusing the open lead with the same mobile or email; the message is kept as a CRM note."""
	if not installed():
		return None
	name = find_lead(mobile, email)
	if name:
		lead = frappe.get_doc("CRM Lead", name)
	else:
		first, _sep, last = (full_name or "").strip().partition(" ")
		lead = frappe.get_doc({"doctype": "CRM Lead", "first_name": first or full_name or mobile, "last_name": last or None,
			"mobile_no": mobile, "email": (email or "").strip().lower() or None, "status": "New",
			"source": source if source and frappe.db.exists("CRM Lead Source", source) else None,
			"lead_owner": owner or frappe.db.get_single_value("Tax Consultancy Settings", "default_consultant"),
			"ptc_client_type": client_type or "Individual-Salaried"})
		lead.flags.ignore_permissions = True
		lead.flags.ignore_mandatory = True
		lead.insert()
	if note:
		add_note(lead.name, source or _("Website"), note)
	return lead.name


def add_note(lead, title, content, doctype="CRM Lead"):
	note = frappe.get_doc({"doctype": "FCRM Note", "title": title[:140], "content": frappe.utils.escape_html(strip_html(content))[:5000],
		"reference_doctype": doctype, "reference_docname": lead})
	note.flags.ignore_permissions = True
	note.insert()


def on_site_visit(doc, method=None):
	"""after_insert: a prospect met in the field becomes a CRM lead for the assigned consultant."""
	if doc.visit_type != "Prospect" or doc.tax_client:
		return
	make_lead(doc.full_name, doc.get("mobile"), doc.get("email"), source="Site Visit",
		note=doc.get("notes") or _("Site visit on {0}").format(doc.visit_date), owner=doc.assigned_consultant or doc.field_officer,
		client_type=doc.client_type)


# ---------------------------------------------------------------- won deal -> Tax Client
def _site_visit(mobile):
	"""The latest prospect visit for this number (matched on the last 10 digits), so a won deal keeps where we met them."""
	from pakistan_tax_consultancy.services.wa_inbox import phone_key

	key = phone_key(mobile) if mobile else None
	if not key:
		return None
	rows = frappe.db.sql("""select name, city, location_description, field_officer, converted_client from `tabSite Visit` where visit_type = 'Prospect'
		and RIGHT(REGEXP_REPLACE(IFNULL(mobile, ''), '[^0-9]', ''), 10) = %s order by creation desc limit 1""", key, as_dict=True)
	return rows[0] if rows else None


def on_deal_update(doc, method=None):
	"""CRM Deal on_update: reaching the won stage creates (or links) the Tax Client and hands it to the deal owner."""
	if doc.status != WON or doc.get("tax_client"):
		return
	from pakistan_tax_consultancy.services.wa_inbox import find_client
	from pakistan_tax_consultancy.utils.validators import normalize_mobile

	client = find_client(doc.mobile_no) if doc.mobile_no else None
	if not client and doc.email:
		client = frappe.db.get_value("Tax Client", {"email": doc.email}, "name")
	if not client:
		name = " ".join(filter(None, [doc.first_name, doc.last_name])) or doc.lead_name or doc.organization_name or doc.name
		try:
			mobile = normalize_mobile(doc.mobile_no) if doc.mobile_no else None
		except ValueError:
			frappe.throw(_("Fix the mobile number on this deal before marking it {0}: {1}").format(WON, doc.mobile_no))
		visit = _site_visit(doc.mobile_no)
		c = frappe.get_doc({"doctype": "Tax Client", "client_name": name, "client_type": doc.get("ptc_client_type") or "Individual-Salaried",
			"business_name": doc.organization_name if doc.get("ptc_client_type") not in (None, "Individual-Salaried") else None,
			"mobile": mobile, "email": doc.email, "assigned_consultant": doc.deal_owner,
			"registration_source": "Field Visit" if visit else "Office", "status": "Active",
			**({"city": visit.city, "residential_address": visit.location_description, "field_officer": visit.field_officer} if visit else {})})
		c.flags.ignore_permissions = True
		c.insert()
		client = c.name
	doc.db_set("tax_client", client)
	if doc.lead:
		frappe.db.set_value("CRM Lead", doc.lead, "tax_client", client)
	visit = _site_visit(doc.mobile_no)
	if visit and not visit.converted_client:
		frappe.db.set_value("Site Visit", visit.name, {"converted_client": client, "conversion_date": nowdate(), "status": "Converted"})
	frappe.get_doc("Tax Client", client).add_comment("Info", _("Client from CRM deal {0}").format(doc.name))
	frappe.msgprint(_("Tax client {0} is ready — open it to start the return.").format(client), alert=True)

