"""Roles & permissions page (staff portal, Tax Admin): what each role may do on the firm's records.

Two layers decide access, and the page shows both:
- the *kind* of access (read / write / create / …) per role and record type — Frappe DocPerm, editable here through
  Custom DocPerm exactly as the desk's Role Permission Manager does (reset returns to the app's defaults);
- *which records* — the data scope from permissions.get_scope (all / assigned clients / own registrations / own
  portal). Scope is fixed in code and only shown.

Guardrails: only this app's record types, only staff roles below Tax Admin (Tax Admin, System Manager and Client
rules cannot be changed here, so nobody locks the firm out or opens client data to the portal), every change is
audited.
"""

import frappe
from frappe import _
from frappe.utils import cint

from pakistan_tax_consultancy.api.settings import STAFF_ROLES, require_admin

MODULE = "Pakistan Income Tax Consultancy"
PTYPES = ("read", "write", "create", "delete", "submit", "print", "export", "report")
LOCKED_ROLES = ("System Manager", "Tax Admin", "Client")
EDITABLE_ROLES = tuple(r for r in STAFF_ROLES if r not in LOCKED_ROLES)
SHOWN_ROLES = ("System Manager", *STAFF_ROLES, "Client")

ROLE_INFO = {
	"System Manager": ("Technical administrator (ERPNext). Full access everywhere.", "all"),
	"Tax Admin": ("Runs the firm: settings, team, payments, every client and return.", "all"),
	"Tax Consultant": ("Prepares returns for the clients assigned to them.", "consultant"),
	"Tax Reviewer": ("Checks prepared returns and sends them back or on for approval.", "all"),
	"Tax Approver": ("Gives the final approval before filing (never their own work).", "all"),
	"Filing Officer": ("Files approved returns on FBR IRIS and records the acknowledgment.", "all"),
	"Field Officer": ("Registers prospects and clients met in the field.", "field"),
	"Data Entry Officer": ("Only enters what the client told us and records the client's approval (every team member can also do this).", "all"),
	"Client": ("A taxpayer using the client portal.", "client"),
}
SCOPES = {
	"all": _("All clients and their records"),
	"consultant": _("Clients assigned to them (and returns assigned to them)"),
	"field": _("Clients and visits they registered"),
	"client": _("Only their own profile, returns and documents — never internal review work"),
	"none": _("No records"),
}
# record types grouped the way the firm thinks about them
AREAS = (
	("Clients & work", ("Tax Client", "Tax Engagement", "Site Visit", "Consultation Request", "Lead Prospect")),
	("Returns", ("Tax Return", "Tax Calculation", "Tax Scenario", "Tax Review", "Tax Approval", "Filing Record", "Review Comment")),
	("Documents & messages", ("Tax Document", "Generated Document", "Client Message", "Client Conversation", "WhatsApp Broadcast")),
	("Money", ("Payment Proof",)),
	("Rules & content", ("Tax Year", "Tax Slab Setting", "Tax Credit Rule", "Tax Regime", "Withholding Tax Section", "Document Type",
		"Document Requirement Rule", "Service", "Service Package", "Promo Code", "Tax Update", "FAQ", "Testimonial", "Quick Reply")),
)


def _doctypes():
	"""This app's record types (no child tables, no single settings), in page order."""
	own = set(frappe.get_all("DocType", {"module": MODULE, "istable": 0, "issingle": 0}, pluck="name"))
	out, seen = [], set()
	for area, names in AREAS:
		for dt in names:
			if dt in own:
				out.append((area, dt))
				seen.add(dt)
	out += [("Other", dt) for dt in sorted(own - seen)]
	return out


def _rules(doctype):
	"""Role -> {ptype: 0/1} for permlevel 0 (Custom DocPerm when the firm changed this type, else the app default)."""
	table = "Custom DocPerm" if frappe.db.exists("Custom DocPerm", {"parent": doctype}) else "DocPerm"
	rows = frappe.get_all(table, {"parent": doctype, "permlevel": 0, "if_owner": 0}, ["role", *PTYPES])
	return {r.role: {p: cint(r[p]) for p in PTYPES} for r in rows}


@frappe.whitelist(methods=["GET"])
def overview():
	require_admin()
	members = {}
	for r in frappe.get_all("Has Role", {"role": ("in", SHOWN_ROLES), "parenttype": "User"}, ["parent", "role"]):
		members.setdefault(r.role, []).append(r.parent)
	enabled = set(frappe.get_all("User", {"enabled": 1, "name": ("in", [u for us in members.values() for u in us] or [""])}, pluck="name"))
	names = dict(frappe.get_all("User", {"name": ("in", list(enabled) or [""])}, ["name", "full_name"], as_list=True))
	roles = []
	for role in SHOWN_ROLES:
		desc, scope = ROLE_INFO.get(role, ("", "none"))
		people = [u for u in members.get(role, []) if u in enabled and u not in ("Administrator", "Guest")]
		roles.append({"role": role, "description": _(desc), "scope": scope, "scope_label": SCOPES[scope],
			"editable": role in EDITABLE_ROLES, "count": len(people),
			"members": [{"user": u, "full_name": names.get(u) or u} for u in people[:6]] if role != "Client" else []})
	doctypes = []
	for area, dt in _doctypes():
		meta = frappe.get_meta(dt)
		doctypes.append({"doctype": dt, "area": area, "submittable": cint(meta.is_submittable),
			"customized": bool(frappe.db.exists("Custom DocPerm", {"parent": dt})), "rules": _rules(dt)})
	return {"roles": roles, "ptypes": PTYPES, "doctypes": doctypes, "editable_roles": EDITABLE_ROLES, "scopes": SCOPES}


def _check(doctype, role, ptype):
	require_admin()
	if doctype not in {dt for _a, dt in _doctypes()}:
		frappe.throw(_("Only this firm's record types can be changed here."))
	if role not in EDITABLE_ROLES:
		frappe.throw(_("{0} permissions are fixed (so nobody is locked out and client data stays private).").format(role))
	if ptype not in PTYPES:
		frappe.throw(_("Unknown permission {0}").format(ptype))


@frappe.whitelist(methods=["POST"])
def set_permission(doctype: str, role: str, ptype: str, value: int):
	"""Switch one permission for a role on a record type (creates the firm's own copy of the rules on first change)."""
	from frappe.core.doctype.doctype.doctype import clear_permissions_cache, validate_permissions_for_doctype
	from frappe.permissions import setup_custom_perms

	from pakistan_tax_consultancy.audit import log_event

	_check(doctype, role, ptype)
	value = 1 if cint(value) else 0
	if ptype == "submit" and value and not frappe.get_meta(doctype).is_submittable:
		frappe.throw(_("{0} records are not submitted.").format(doctype))
	setup_custom_perms(doctype)
	name = frappe.db.get_value("Custom DocPerm", {"parent": doctype, "role": role, "permlevel": 0, "if_owner": 0})
	if name:
		perm = frappe.get_doc("Custom DocPerm", name)
	elif value:
		perm = frappe.get_doc({"doctype": "Custom DocPerm", "parent": doctype, "parenttype": "DocType", "parentfield": "permissions",
			"role": role, "permlevel": 0})
	else:
		return _rules(doctype).get(role, {})
	perm.set(ptype, value)
	if value and ptype != "read":
		perm.read = 1  # every other right needs read
	if not value and ptype == "read":
		for p in PTYPES:
			perm.set(p, 0)
	if not any(cint(perm.get(p)) for p in PTYPES):
		if not perm.is_new():
			frappe.delete_doc("Custom DocPerm", perm.name, ignore_permissions=True, force=True)
	else:
		perm.save(ignore_permissions=True)
	validate_permissions_for_doctype(doctype, alert=False)
	clear_permissions_cache(doctype)
	log_event("Update", frappe.get_doc("DocType", doctype), details={"permission": ptype, "role": role, "value": value})
	return _rules(doctype).get(role, {})


@frappe.whitelist(methods=["POST"])
def reset(doctype: str):
	"""Back to the app's default rules for one record type."""
	from frappe.core.doctype.doctype.doctype import clear_permissions_cache
	from frappe.permissions import reset_perms

	from pakistan_tax_consultancy.audit import log_event

	require_admin()
	if doctype not in {dt for _a, dt in _doctypes()}:
		frappe.throw(_("Only this firm's record types can be reset here."))
	reset_perms(doctype)
	clear_permissions_cache(doctype)
	log_event("Update", frappe.get_doc("DocType", doctype), details={"permissions": "reset to default"})
	return _rules(doctype)


@frappe.whitelist(methods=["GET"])
def check_user(user: str):
	"""What one person can actually do: their roles, data scope and effective rights per record type."""
	from pakistan_tax_consultancy.permissions import get_scope

	require_admin()
	if not frappe.db.exists("User", user):
		frappe.throw(_("No such user."))
	roles = [r for r in frappe.get_roles(user) if r in SHOWN_ROLES]
	scope = get_scope(user)
	rights = []
	for area, dt in _doctypes():
		rights.append({"doctype": dt, "area": area,
			**{p: bool(frappe.has_permission(dt, p, user=user)) for p in ("read", "write", "create", "delete")}})
	return {"user": user, "full_name": frappe.utils.get_fullname(user), "enabled": cint(frappe.db.get_value("User", user, "enabled")),
		"roles": roles, "scope": scope, "scope_label": SCOPES.get(scope, ""), "rights": rights}


@frappe.whitelist(methods=["GET"])
def users(q: str | None = None):
	"""Staff and client logins for the 'check a user' picker."""
	require_admin()
	filters = {"enabled": 1, "name": ("not in", ("Guest", "Administrator"))}
	or_filters = {"name": ("like", f"%{q}%"), "full_name": ("like", f"%{q}%")} if q else None
	return frappe.get_all("User", filters=filters, or_filters=or_filters, fields=["name", "full_name", "user_type"],
		order_by="user_type asc, full_name asc", limit=20)
