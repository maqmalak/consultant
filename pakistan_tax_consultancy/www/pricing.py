from frappe import _

from pakistan_tax_consultancy.api import public
from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Pricing"), _("Fixed prices for income tax return filing and registrations."))
	context.packages = public.packages()
	context.services = [s for s in public.services() if s.price_from]
	return context
