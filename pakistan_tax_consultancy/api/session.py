import frappe
from frappe.sessions import get_csrf_token


@frappe.whitelist()
def get_csrf_token_for_session() -> str:
	"""Expose the current session's CSRF token to the React SPA.

	Frappe injects ``window.csrf_token`` only into pages it renders itself and
	``frappe.sessions.get_csrf_token`` is not whitelisted. The React app is
	served by Vite (dev) or the web server (prod), so it fetches the token
	here. Guest-accessible by design: it only returns the caller's own token.
	"""
	return get_csrf_token()
