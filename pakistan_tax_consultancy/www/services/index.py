from frappe import _

from pakistan_tax_consultancy.api import public
from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Services"), _("Income tax returns, NTN and sales tax registration, company registration and tax advice."))
	context.services = public.services()
	return context
