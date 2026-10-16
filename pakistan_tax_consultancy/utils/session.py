"""Running a block as another user inside a request without signing the caller out."""

from contextlib import contextmanager

import frappe


@contextmanager
def as_system():
	"""Run as Administrator — only after the caller's own permission checks passed.

	frappe.set_user alone replaces the session id and data, so the caller would be signed out at the end of the
	request; the session is put back intact afterwards.
	"""
	session, form_dict = frappe.local.session, frappe.local.form_dict
	saved = frappe._dict(user=session.user, sid=session.sid, data=session.data)
	frappe.set_user("Administrator")
	try:
		yield
	finally:
		frappe.set_user(saved.user)
		frappe.local.session.update(saved)
		frappe.local.form_dict = form_dict
