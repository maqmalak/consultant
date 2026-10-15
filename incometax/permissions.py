"""Record-level isolation for incometax DocTypes.

Wired in hooks.py via ``permission_query_conditions`` (list/report queries) and
``has_permission`` (single-document access). DocPerm decides *what kind* of access a role
has; these hooks decide *which records*. Hooks can only deny, never grant.

Scopes (broadest wins when a user has several roles):
  all        System Manager, Tax Consultant Admin, Tax Reviewer, Tax Approver, Filing Officer
  consultant Tax Consultant  -> Assigned Consultant or assignee (_assign)
  field      Field Officer   -> records they registered (field_officer / owner)
  client     Tax Client User -> Tax Client whose portal_user is them, plus linked records
  none       no rows
"""

import frappe
from frappe import _

ALL_SCOPE_ROLES = {"System Manager", "Tax Consultant Admin", "Tax Reviewer", "Tax Approver", "Filing Officer"}
CLIENT_LINKED = ("Tax Engagement", "Tax Document", "Tax Return", "Tax Calculation", "Tax Review",
	"Tax Approval", "Tax Filing Record")
OWN_ASSIGNMENT = ("Tax Return", "Tax Engagement")


def get_scope(user=None):
	user = user or frappe.session.user
	if user == "Administrator":
		return "all"
	roles = set(frappe.get_roles(user))
	if roles & ALL_SCOPE_ROLES:
		return "all"
	if "Tax Consultant" in roles:
		return "consultant"
	if "Field Officer" in roles:
		return "field"
	if "Tax Client User" in roles:
		return "client"
	return "none"


def _assign_like(user):
	return frappe.db.escape(f'%"{user}"%')


def _client_condition(scope, user):
	u = frappe.db.escape(user)
	t = "`tabTax Client`"
	if scope == "consultant":
		return f"({t}.assigned_consultant = {u} or {t}._assign like {_assign_like(user)})"
	if scope == "field":
		return f"({t}.field_officer = {u} or {t}.owner = {u})"
	if scope == "client":
		return f"({t}.portal_user = {u})"
	return "1=0"


def tax_client_query(user=None, doctype=None):
	user = user or frappe.session.user
	scope = get_scope(user)
	return "" if scope == "all" else _client_condition(scope, user)


def client_linked_query(user=None, doctype=None):
	user = user or frappe.session.user
	scope = get_scope(user)
	if scope == "all":
		return ""
	if scope == "none":
		return "1=0"
	t = f"`tab{doctype}`"
	cond = (f"{t}.tax_client in (select `tabTax Client`.name from `tabTax Client` "
		f"where {_client_condition(scope, user)})")
	if scope == "consultant" and doctype in OWN_ASSIGNMENT:
		u = frappe.db.escape(user)
		cond = f"({cond} or {t}.assigned_consultant = {u} or {t}._assign like {_assign_like(user)})"
	return cond


def client_visit_query(user=None, doctype=None):
	user = user or frappe.session.user
	scope = get_scope(user)
	if scope == "all":
		return ""
	u = frappe.db.escape(user)
	t = "`tabClient Visit`"
	if scope == "consultant":
		return f"({t}.assigned_consultant = {u} or {t}._assign like {_assign_like(user)})"
	if scope == "field":
		return f"({t}.field_officer = {u} or {t}.owner = {u})"
	return "1=0"


# --------------------------------------------------------------------------- document checks
def _assignees(doc):
	try:
		return frappe.parse_json(doc.get("_assign") or "[]") or []
	except Exception:
		return []


def _match_client(client, scope, user):
	if scope == "consultant":
		return client.get("assigned_consultant") == user or user in _assignees(client)
	if scope == "field":
		return user in (client.get("field_officer"), client.get("owner"))
	if scope == "client":
		return client.get("portal_user") == user
	return False


def can_access_client(tax_client, user=None):
	user = user or frappe.session.user
	scope = get_scope(user)
	if scope == "all":
		return True
	if not tax_client:
		return False
	client = frappe.db.get_value("Tax Client", tax_client,
		["name", "assigned_consultant", "field_officer", "portal_user", "owner", "_assign"], as_dict=True)
	return bool(client) and _match_client(client, scope, user)


def _is_new(doc):
	return bool(doc.get("__islocal")) or not doc.name or not frappe.db.exists(doc.doctype, doc.name)


def tax_client_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	scope = get_scope(user)
	if scope == "all":
		return True
	if scope == "client":
		# self-registration goes through a server API; clients never create/delete clients directly
		return ptype not in ("create", "delete") and doc.get("portal_user") == user
	if ptype == "create" and _is_new(doc):
		return scope in ("consultant", "field")
	return _match_client(doc, scope, user)


def client_linked_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	scope = get_scope(user)
	if scope == "all":
		return True
	if scope == "none":
		return False
	if scope == "client" and ptype == "delete":
		return False
	if scope == "consultant" and doc.doctype in OWN_ASSIGNMENT:
		if doc.get("assigned_consultant") == user or user in _assignees(doc):
			return True
	if not doc.get("tax_client"):
		# unsaved form without a client yet; the link is enforced again on save
		return ptype == "create" and _is_new(doc)
	return can_access_client(doc.get("tax_client"), user)


def client_visit_has_permission(doc, ptype=None, user=None, debug=False):
	user = user or frappe.session.user
	scope = get_scope(user)
	if scope == "all":
		return True
	if ptype == "create" and _is_new(doc):
		return scope in ("consultant", "field")
	if scope == "consultant":
		return doc.get("assigned_consultant") == user or user in _assignees(doc)
	if scope == "field":
		return user in (doc.get("field_officer"), doc.get("owner"))
	return False


def validate_client_link(doc, method=None):
	"""doc_events validate: users may only link records to clients they can access.

	Stops a client uploading a document against another client's ID, or a consultant
	creating a return for an unassigned client, even through the REST API.
	"""
	if doc.flags.ignore_permissions or frappe.flags.in_install or frappe.flags.in_migrate:
		return
	tax_client = doc.get("tax_client")
	if tax_client and not can_access_client(tax_client):
		frappe.throw(_("You are not permitted to access client {0}").format(tax_client), frappe.PermissionError)

