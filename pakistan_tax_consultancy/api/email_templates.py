"""Email templates (Frappe's own Email Template doctype) for the CRM app: write once with {{ variables }}, pick one on a
lead / deal / client and it is filled in for that person before you send."""

import frappe
from frappe import _
from frappe.utils import strip_html
from frappe.utils.html_utils import sanitize_html

from pakistan_tax_consultancy.api.crm import _guard

MANAGERS = {"System Manager", "Tax Admin", "Sales Manager"}


def _manage():
	"""Email Template is System-Manager-only in Frappe; Tax Admins and Sales Managers manage them through this API."""
	_guard()
	if frappe.session.user != "Administrator" and not MANAGERS & set(frappe.get_roles()):
		frappe.throw(_("Only a Tax Admin or Sales Manager can change email templates."), frappe.PermissionError)

# variables offered in the editor: (jinja expression, label, sample)
VARIABLES = [
	("first_name", "First name", "Ahmed"), ("full_name", "Full name", "Ahmed Raza"), ("organization", "Business / company", "Raza Traders"),
	("mobile", "Mobile", "+92 300 0000001"), ("email", "Email", "ahmed@example.com"), ("tax_year", "Current tax year", "2026"),
	("filing_deadline", "Filing deadline", "31 October 2026"), ("firm_name", "Firm name", "Vision Vault Solutions"),
	("partner_name", "Partner name", "Faizan Chaudhary"), ("firm_phone", "Firm phone", "+92 321 8605360"),
	("portal_link", "Client portal link", "https://…/portal"),
]
STARTERS = [
	("Welcome — how we work", "Thank you for contacting {{ firm_name }}",
		"<p>Dear {{ first_name }},</p><p>Thank you for your interest in <strong>{{ firm_name }}</strong>. We prepare and file income tax "
		"returns for salaried people, businesses and companies on FBR IRIS.</p><p><strong>How it works</strong></p><ol><li>Choose a package and "
		"upload your documents in the client portal.</li><li>We prepare your return and a second consultant reviews it.</li><li>You confirm "
		"the summary, then we file and send you the IRIS acknowledgment.</li></ol><p>Start here: <a href=\"{{ portal_link }}\">{{ portal_link }}</a></p>"
		"<p>Regards,<br>{{ partner_name }}<br>{{ firm_name }} · {{ firm_phone }}</p>"),
	("Deadline reminder", "Income tax return deadline: {{ filing_deadline }}",
		"<p>Dear {{ first_name }},</p><p>A reminder that the income tax return deadline for Tax Year {{ tax_year }} is "
		"<strong>{{ filing_deadline }}</strong>. Send us your documents this week so we can file well before the last-day rush on IRIS.</p>"
		"<p>Regards,<br>{{ partner_name }}<br>{{ firm_name }} · {{ firm_phone }}</p>"),
	("Documents checklist", "Documents we need for your tax return",
		"<p>Dear {{ first_name }},</p><p>To prepare your Tax Year {{ tax_year }} return, please send:</p><ul><li>CNIC</li>"
		"<li>Salary / tax deduction certificate</li><li>Bank statement and profit / withholding certificates (1 July – 30 June)</li>"
		"<li>Property, vehicle and investment documents</li><li>Utility, phone and internet tax deductions</li></ul>"
		"<p>Upload them in your portal: <a href=\"{{ portal_link }}\">{{ portal_link }}</a></p><p>Regards,<br>{{ partner_name }}<br>{{ firm_name }}</p>"),
]


def _context(doctype=None, name=None):
	from pakistan_tax_consultancy.www_helpers import firm

	f = firm()
	ctx = {"firm_name": f.firm_name, "partner_name": f.partner_name, "firm_phone": f.phone, "tax_year": f.tax_year,
		"filing_deadline": frappe.utils.formatdate(f.filing_deadline, "dd MMMM yyyy") if f.filing_deadline else "",
		"portal_link": frappe.utils.get_url("/portal")}
	if doctype and name:
		doc = frappe.get_doc(doctype, name)
		doc.check_permission("read")
		if doctype == "Tax Client":
			full = doc.client_name
			ctx.update(mobile=doc.mobile, email=doc.email, organization=doc.business_name)
		else:
			full = " ".join(filter(None, [doc.get("first_name"), doc.get("last_name")])) or doc.get("lead_name")
			ctx.update(mobile=doc.get("mobile_no"), email=doc.get("email"), organization=doc.get("organization") or doc.get("organization_name"))
		ctx.update(full_name=full, first_name=(full or "").split(" ")[0])
	return ctx


@frappe.whitelist(methods=["GET"])
def templates():
	_guard()
	rows = frappe.get_all("Email Template", ["name", "subject", "response", "response_html", "use_html", "modified", "owner"], order_by="modified desc")
	for r in rows:
		r.body = r.response_html if r.use_html else r.response
		r.excerpt = strip_html(r.body or "")[:180]
	return {"templates": rows, "variables": [{"key": k, "label": l, "sample": s} for k, l, s in VARIABLES]}


@frappe.whitelist(methods=["POST"])
def save(title: str, subject: str, body: str, name: str | None = None):
	_manage()
	if not (title or "").strip() or not (subject or "").strip() or not strip_html(body or "").strip():
		frappe.throw(_("Give the template a name, a subject and a message."))
	html = sanitize_html(body)
	# sanitising must not break the {{ variables }}: they are plain text and survive as-is
	if name:
		doc = frappe.get_doc("Email Template", name)
		doc.update({"subject": subject.strip(), "response": html, "use_html": 0})
		doc.save(ignore_permissions=True)
		if title.strip() != name:
			name = frappe.rename_doc("Email Template", name, title.strip(), ignore_permissions=True)
		return name
	doc = frappe.get_doc({"doctype": "Email Template", "name": title.strip(), "subject": subject.strip(), "response": html, "use_html": 0})
	doc.insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist(methods=["POST"])
def delete(name: str):
	_manage()
	frappe.delete_doc("Email Template", name, ignore_permissions=True)


@frappe.whitelist(methods=["POST"])
def starters():
	_manage()
	made = []
	for title, subject, body in STARTERS:
		if not frappe.db.exists("Email Template", title):
			frappe.get_doc({"doctype": "Email Template", "name": title, "subject": subject, "response": body, "use_html": 0}).insert(ignore_permissions=True)
			made.append(title)
	return made


@frappe.whitelist(methods=["POST"])
def render(template: str | None = None, subject: str | None = None, body: str | None = None, doctype: str | None = None,
		name: str | None = None, sample: int = 0):
	"""Fill a template (or an unsaved subject / body) for one record — or with sample values for the editor preview."""
	_guard()
	if template:
		t = frappe.get_doc("Email Template", template)
		subject, body = t.subject, (t.response_html if t.use_html else t.response)
	ctx = {k: s for k, _l, s in VARIABLES} if frappe.utils.cint(sample) else _context(doctype, name)
	try:
		return {"subject": frappe.render_template(subject or "", ctx), "body": sanitize_html(frappe.render_template(body or "", ctx))}
	except Exception as e:
		frappe.throw(_("The template has an error near {0}").format(str(e)[:120]))
