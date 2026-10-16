from frappe import _

from pakistan_tax_consultancy.www_helpers import firm, page


sitemap = 1


def get_context(context):
	page(context, _("Salary Tax Calculator"), _("Estimate the income tax on your salary and your monthly take-home pay in Pakistan."))
	f = firm()
	context.tax_year, context.tax_years = f.tax_year, f.tax_years
	return context
