"""Programmatic ERPNext setup wizard for the `consultant` site.

Run:  bench --site consultant execute pakistan_tax_consultancy.setup.wizard.run_setup_wizard
"""

import frappe

COMPANY = "Demo Tax Consultancy"


def run_setup_wizard():
	if frappe.db.get_single_value("System Settings", "setup_complete"):
		print("Setup wizard already completed; nothing to do.")
		return

	from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

	# Pakistan fiscal year: 1 July - 30 June (Tax Year 2026 = 1 Jul 2025 - 30 Jun 2026)
	args = {
		"language": "English",
		"country": "Pakistan",
		"timezone": "Asia/Karachi",
		"currency": "PKR",
		"full_name": "Administrator",
		"email": "admin@demo-tax.example",
		"company_name": COMPANY,
		"company_abbr": "DTC",
		"chart_of_accounts": "Standard",
		"fy_start_date": "2025-07-01",
		"fy_end_date": "2026-06-30",
		"setup_demo": 0,
	}
	result = setup_complete(args)
	frappe.db.commit()
	print("Setup wizard result:", result)
