from frappe import _

from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Refund Policy"), _("Refund Policy"))
	return context
