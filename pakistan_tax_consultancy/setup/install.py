"""Idempotent site setup run after install and every migrate, so a fresh site needs no manual steps.

Creates the fiscal year in progress, a bank account, the Pakistani payment modes and the fee item, and points
Tax Consultancy Settings at them. Never overwrites a value an admin already set.
"""

import frappe
from frappe.utils import getdate

FEE_ITEM = "Tax Professional Fee"
MODES = ("Bank Transfer", "Raast", "JazzCash", "Easypaisa")


def after_migrate():
	try:
		ensure_billing_setup()
		ensure_workflow()
		ensure_website()
	except Exception:
		print(frappe.get_traceback())
		frappe.log_error(title="pakistan_tax_consultancy setup")
	try:
		from pakistan_tax_consultancy.services.documents import setup as setup_documents

		setup_documents()
	except Exception:
		print(frappe.get_traceback())
		frappe.log_error(title="pakistan_tax_consultancy document templates")
	try:
		from pakistan_tax_consultancy.services.crm import setup as setup_crm

		setup_crm()
	except Exception:
		print(frappe.get_traceback())
		frappe.log_error(title="pakistan_tax_consultancy CRM setup")


def ensure_fiscal_years(company):
	"""Pakistan's fiscal year runs 1 July – 30 June; make sure the current one exists."""
	today = getdate()
	start_year = today.year if today.month >= 7 else today.year - 1
	for y in (start_year,):
		name = f"{y}-{y + 1}"
		if frappe.db.exists("Fiscal Year", name) or frappe.db.exists("Fiscal Year", {"year_start_date": f"{y}-07-01"}):
			continue
		fy = frappe.get_doc({"doctype": "Fiscal Year", "year": name, "year_start_date": f"{y}-07-01",
			"year_end_date": f"{y + 1}-06-30", "companies": [{"company": company}]})
		fy.insert(ignore_permissions=True)


def ensure_bank_account(company, abbr):
	name = f"Bank Account - {abbr}"
	if frappe.db.exists("Account", name):
		return name
	parent = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 1}, "name") or \
		frappe.db.get_value("Account", {"company": company, "account_name": "Bank Accounts", "is_group": 1}, "name")
	if not parent:
		return None
	frappe.get_doc({"doctype": "Account", "account_name": "Bank Account", "parent_account": parent, "company": company,
		"account_type": "Bank", "account_currency": "PKR"}).insert(ignore_permissions=True)
	return name


def ensure_billing_setup():
	settings = frappe.get_single("Tax Consultancy Settings")
	company = settings.company or frappe.db.get_single_value("Global Defaults", "default_company") or \
		frappe.db.get_value("Company", {}, "name")
	if not company:
		return
	abbr = frappe.db.get_value("Company", company, "abbr")
	ensure_fiscal_years(company)
	bank = ensure_bank_account(company, abbr)
	for mode in MODES:
		if not frappe.db.exists("Mode of Payment", mode):
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mode, "type": "Bank",
				"accounts": [{"company": company, "default_account": bank}] if bank else []}).insert(ignore_permissions=True)
	if not frappe.db.exists("Item", FEE_ITEM):
		frappe.get_doc({"doctype": "Item", "item_code": FEE_ITEM, "item_name": FEE_ITEM, "item_group": "Services",
			"stock_uom": "Nos", "is_stock_item": 0, "include_item_in_manufacturing": 0,
			"description": "Professional fee for tax services"}).insert(ignore_permissions=True)
	changed = False
	for field, value in (("company", company), ("fee_item", FEE_ITEM), ("default_receivable_mode", "Bank Transfer")):
		if not settings.get(field):
			settings.set(field, value)
			changed = True
	if changed:
		settings.flags.ignore_permissions = True
		settings.save()


def ensure_workflow():
	"""Build the Tax Return Workflow from services/workflow.py (single source of truth for states/transitions)."""
	from pakistan_tax_consultancy.services import workflow as wf

	for state, style, _roles in wf.STATES:
		if not frappe.db.exists("Workflow State", state):
			frappe.get_doc({"doctype": "Workflow State", "workflow_state_name": state, "style": style}).insert(
				ignore_permissions=True)
	for _f, action, _t, _roles, _self in wf.TRANSITIONS:
		if not frappe.db.exists("Workflow Action Master", action):
			frappe.get_doc({"doctype": "Workflow Action Master", "workflow_action_name": action}).insert(ignore_permissions=True)
	name = "Tax Return Workflow"
	doc = frappe.get_doc("Workflow", name) if frappe.db.exists("Workflow", name) else frappe.new_doc("Workflow")
	doc.update({"workflow_name": name, "document_type": "Tax Return", "workflow_state_field": "workflow_state",
		"is_active": 1, "send_email_alert": 0, "override_status": 0})
	doc.set("states", [])
	for state, _style, roles in wf.STATES:
		for role in roles:  # one row per role that may edit in this state
			doc.append("states", {"state": state, "doc_status": "0", "allow_edit": role})
	doc.set("transitions", [])
	for f, action, t, roles, self_ok in wf.TRANSITIONS:
		for role in roles:
			doc.append("transitions", {"state": f, "action": action, "next_state": t, "allowed": role,
				"allow_self_approval": self_ok})
	doc.flags.ignore_permissions = True
	doc.save()


def ensure_website():
	"""Urdu available for the website toggle; robots.txt keeps the desk, portal and API out of search engines."""
	if frappe.db.exists("Language", "ur") and not frappe.db.get_value("Language", "ur", "enabled"):
		frappe.db.set_value("Language", "ur", "enabled", 1)
	ws = frappe.get_single("Website Settings")
	if not (ws.robots_txt or "").strip():
		from frappe.utils import get_url

		ws.robots_txt = ("User-agent: *\nDisallow: /app\nDisallow: /portal\nDisallow: /api\nDisallow: /private\n"
			f"Sitemap: {get_url('/sitemap.xml')}\n")
		ws.flags.ignore_permissions = True
		ws.save()
