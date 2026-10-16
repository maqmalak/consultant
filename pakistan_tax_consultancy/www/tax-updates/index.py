from frappe import _

from pakistan_tax_consultancy.api import public
from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Tax Updates"), _("Deadlines, FBR notices and plain-language guides on Pakistan income tax."))
	context.posts = public.tax_updates(limit=50)
	return context
