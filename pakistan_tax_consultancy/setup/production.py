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


def set_all_passwords():
	"""Give every enabled user (staff and clients) the password in USERS_PASSWORD; Administrator too when
	INCLUDE_ADMINISTRATOR=1. Used by deploy/set-passwords.sh. Every session of those users is logged out."""
	password = os.environ.get("USERS_PASSWORD") or ""
	if len(password) < 8:
		frappe.throw("Set USERS_PASSWORD (8+ characters) in the environment.")
	skip = {"Guest"} | (set() if os.environ.get("INCLUDE_ADMINISTRATOR") == "1" else {"Administrator"})
	users = [u for u in frappe.get_all("User", filters={"enabled": 1}, pluck="name") if u not in skip]
	for user in users:
		update_password(user, password, logout_all_sessions=True)
	frappe.db.commit()
	print(f"users with the new password: {len(users)}")
