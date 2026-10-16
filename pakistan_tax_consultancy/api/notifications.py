"""The portal header: notification bell (Frappe's Notification Log, what the desk bell shows) and the awesome bar
(Ctrl+K search over clients, returns, documents and help). Ported from the realestate header, on this app's API."""

import frappe
from frappe.utils import cint, strip_html

from pakistan_tax_consultancy.permissions import get_scope


def _signed_in():
	if frappe.session.user == "Guest":
		frappe.throw(frappe._("Please sign in."), frappe.PermissionError)


def _href(doctype, name, client):
	"""Where a notification leads inside the React portal (None: no page for it)."""
	if not doctype or not name:
		return None
	if client:
		return {"Tax Return": f"/returns/{name}", "Tax Document": "/documents", "Client Message": "/messages",
			"Payment Proof": "/payments", "Tax Engagement": "/payments", "Generated Document": "/vault"}.get(doctype)
	return {"Tax Return": f"/staff/returns/{name}", "Tax Client": f"/staff/clients/{name}",
		"Client Conversation": f"/staff/inbox?view=all&c={name}", "Consultation Request": "/staff/consultations",
		"Payment Proof": "/staff/payments", "Site Visit": "/staff/visits", "Tax Document": "/staff/queue/documents",
		"Generated Document": "/staff/vault"}.get(doctype)


@frappe.whitelist(methods=["GET"])
def bell(limit: int = 20):
	_signed_in()
	client = get_scope() == "client"
	rows = frappe.get_all("Notification Log", {"for_user": frappe.session.user}, ["name", "subject", "email_content", "type",
		"document_type", "document_name", "read", "creation", "from_user"], order_by="creation desc", limit=min(cint(limit) or 20, 50))
	for r in rows:
		r.subject = strip_html(r.subject or "")[:200]
		r.email_content = strip_html(r.email_content or "")[:240]
		r.href = _href(r.document_type, r.document_name, client)
	unread = frappe.db.count("Notification Log", {"for_user": frappe.session.user, "read": 0})
	return {"items": rows, "unread": unread}


@frappe.whitelist(methods=["POST"])
def mark_read(name: str | None = None):
	_signed_in()
	filters = {"for_user": frappe.session.user, "read": 0}
	if name:
		filters["name"] = name
	for n in frappe.get_all("Notification Log", filters, pluck="name", limit=500):
		frappe.db.set_value("Notification Log", n, "read", 1, update_modified=False)


@frappe.whitelist(methods=["GET"])
def search(q: str = ""):
	"""Awesome bar results grouped by kind; every query runs through the caller's own record permissions."""
	_signed_in()
	q = (q or "").strip()
	if len(q) < 2:
		return []
	like = f"%{q}%"
	client = get_scope() == "client"
	out = []
	if not client:
		from pakistan_tax_consultancy.api.staff import search_clients

		for c in search_clients(q, page_length=6):
			out.append({"kind": "Client", "title": c.client_name, "hint": " · ".join(filter(None, [c.client_type, c.cnic_masked, c.mobile])),
				"href": f"/staff/clients/{c.name}"})
	for r in frappe.get_list("Tax Return", or_filters={"name": ("like", like), "client_name": ("like", like), "tax_year": ("like", like)},
			fields=["name", "client_name", "tax_year", "workflow_state"], order_by="modified desc", limit_page_length=6):
		out.append({"kind": "Tax return", "title": f"{r.client_name} · TY{r.tax_year}", "hint": f"{r.name} · {r.workflow_state}",
			"href": f"/returns/{r.name}" if client else f"/staff/returns/{r.name}"})
	for d in frappe.get_list("Tax Document", or_filters={"document_type": ("like", like), "document_name": ("like", like),
			"client_name": ("like", like)}, fields=["name", "document_type", "document_name", "client_name", "tax_year", "tax_client", "status"],
			order_by="modified desc", limit_page_length=6):
		out.append({"kind": "Document", "title": d.document_name or d.document_type, "hint": " · ".join(filter(None,
			[None if client else d.client_name, f"TY{d.tax_year}" if d.tax_year else None, d.status])),
			"href": "/vault" if client else f"/staff/vault?client={d.tax_client}"})
	for f in frappe.get_all("FAQ", {"published": 1, "question": ("like", like)}, ["name", "question"], limit=4):
		out.append({"kind": "Help", "title": f.question, "hint": "FAQ", "href": "/faq", "external": True})
	return out
