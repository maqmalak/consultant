from frappe import _

from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Terms of Service"), _("Terms of Service"))
	return context
