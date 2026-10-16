"""Rename DocTypes and roles to the names used in TAX_PORTAL_AGENT_PROMPT.md (runs before model sync).

Inside a patch Frappe renames the table and every Link/Table reference but leaves the files alone; the code was
already moved to the new folders.
"""

import frappe

DOCTYPES = [
	("Client Visit Document", "Site Visit Document"),
	("Client Visit Service", "Site Visit Service"),
	("Client Visit", "Site Visit"),
	("Tax Service Type", "Service"),
	("Tax Document Category", "Document Type"),
	("Tax Filing Record", "Filing Record"),
	("Tax Slab Rule", "Tax Slab Setting"),
	("Tax Return Income", "Tax Return Income Source"),
]
ROLES = [("Tax Consultant Admin", "Tax Admin"), ("Tax Client User", "Client")]


def execute():
	for old, new in DOCTYPES:
		if frappe.db.exists("DocType", old) and not frappe.db.exists("DocType", new):
			frappe.rename_doc("DocType", old, new, force=True)

	for old, new in ROLES:
		if frappe.db.exists("Role", old) and not frappe.db.exists("Role", new):
			frappe.rename_doc("Role", old, new, force=True)
			frappe.db.set_value("Role", new, "role_name", new, update_modified=False)

	# earlier test runs deleted their users but left the role rows behind, which breaks saving those roles
	frappe.db.sql(
		"""delete hr from `tabHas Role` hr left join `tabUser` u on u.name = hr.parent
		where hr.parenttype = 'User' and u.name is null"""
	)
	# and left the same role on a user many times over; keep one row per (user, role)
	frappe.db.sql(
		"""delete hr from `tabHas Role` hr
		join `tabHas Role` keep on keep.parent = hr.parent and keep.parenttype = hr.parenttype
			and keep.role = hr.role and keep.name < hr.name
		where hr.parenttype = 'User'"""
	)
