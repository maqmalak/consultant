"""The "Guide Book" icon on the Desk start page (/desk): opens the portal help centre (manuals, PDF guides, videos).

Created on every migrate; only the firm's team sees it (clients use the Guide Book link in their portal menu).
"""

import frappe

NAME = "Guide Book"
LINK = "/portal/staff/help"
LOGO = "/assets/pakistan_tax_consultancy/images/guide-book.svg"
ROLES = ("System Manager", "Tax Admin", "Tax Consultant", "Tax Reviewer", "Tax Approver", "Filing Officer",
	"Field Officer", "Data Entry Officer")


def apply():
	doc = frappe.get_doc("Desktop Icon", NAME) if frappe.db.exists("Desktop Icon", NAME) else frappe.new_doc("Desktop Icon")
	doc.update({"label": NAME, "icon_type": "App", "link_type": "External", "link": LINK, "logo_url": LOGO,
		"app": "pakistan_tax_consultancy", "standard": 1, "hidden": 0, "idx": doc.idx or 0})
	have = {r.role for r in doc.roles}
	for role in ROLES:
		if role not in have and frappe.db.exists("Role", role):
			doc.append("roles", {"role": role})
	frappe.flags.in_import = True  # don't write a desktop_icon/*.json export in developer mode
	try:
		doc.save(ignore_permissions=True) if not doc.is_new() else doc.insert(ignore_permissions=True, set_name=NAME)
	finally:
		frappe.flags.in_import = False
	frappe.cache.delete_key("desktop_icons")
	frappe.cache.delete_key("bootinfo")
