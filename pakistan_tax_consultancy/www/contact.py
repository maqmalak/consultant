from frappe import _

from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Contact"), _("Phone, WhatsApp, email and office address."))
	return context
