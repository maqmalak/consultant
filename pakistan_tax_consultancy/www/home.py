import frappe
from frappe import _

from pakistan_tax_consultancy.api import public
from pakistan_tax_consultancy.www_helpers import firm, page

no_cache = 0


sitemap = 1


def get_context(context):
	f = firm()
	page(context, f.hero_headline or _("Income tax return filing"), f.hero_subtext or "")
	context.packages = public.packages()
	context.services = public.services()[:6]
	context.testimonials = public.testimonials()
	context.tax_year = f.tax_year
	context.tax_years = f.tax_years
	context.deadline = f.filing_deadline
	context.home = 1
	return context
