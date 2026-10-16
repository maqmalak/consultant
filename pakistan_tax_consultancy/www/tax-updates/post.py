import frappe

from pakistan_tax_consultancy.www_helpers import page


def get_context(context):
	slug = frappe.form_dict.slug
	name = frappe.db.get_value("Tax Update", {"published": 1, "route": ("in", (slug, f"tax-updates/{slug}"))}, "name")
	if not name:
		raise frappe.PageDoesNotExistError
	post = frappe.get_doc("Tax Update", name)
	page(context, post.title, post.meta_description or post.summary or post.title)
	context.post = post
	return context
