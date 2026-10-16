import frappe
from frappe import _

from pakistan_tax_consultancy.api import public
from pakistan_tax_consultancy.www_helpers import page


def get_context(context):
	slug = frappe.form_dict.slug
	try:
		svc = public.service(slug)
	except frappe.DoesNotExistError:
		raise frappe.PageDoesNotExistError
	page(context, svc["title"], svc["summary"] or svc["title"])
	context.service = svc
	context.packages = svc["packages"]
	return context
