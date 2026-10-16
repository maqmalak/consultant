import frappe
from frappe import _

from pakistan_tax_consultancy.api import public
from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Frequently Asked Questions"), _("Answers about filing your income tax return, documents, payments and privacy."))
	context.faqs = public.faqs("ur" if frappe.local.lang == "ur" else "en") or public.faqs("en")
	return context
