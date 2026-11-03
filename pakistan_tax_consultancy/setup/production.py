"""Production steps run by deploy/install-production.sh (each can be re-run).

    bench --site <site> execute pakistan_tax_consultancy.setup.production.harden
    DEMO_PASSWORD=… bench --site <site> execute pakistan_tax_consultancy.setup.production.reset_demo_passwords

The demo password is read from the environment so it never shows up in the process list or the shell history.
"""

import os

import frappe
from frappe.utils.password import update_password

DEMO_DOMAIN = "@demo.taxportal.example"


def harden():
	"""Settings a public server needs: portal users never see stack traces."""
	frappe.db.set_single_value("System Settings", "allow_error_traceback", 0)
	frappe.db.commit()
	print("System Settings: error tracebacks hidden")


def reset_demo_passwords():
	"""Give every demo user (…@demo.taxportal.example) the password in DEMO_PASSWORD.

	The demo data ships with passwords that are written in the docs and the demo videos; on a public server those
	accounts (including a Tax Admin) would be open to anyone."""
	password = os.environ.get("DEMO_PASSWORD") or ""
	if len(password) < 12:
		frappe.throw("Set DEMO_PASSWORD (12+ characters) in the environment.")
	users = frappe.get_all("User", filters={"name": ("like", f"%{DEMO_DOMAIN}")}, pluck="name")
	for user in users:
		update_password(user, password, logout_all_sessions=True)
	frappe.db.commit()
	print(f"demo users with the new password: {len(users)}")
