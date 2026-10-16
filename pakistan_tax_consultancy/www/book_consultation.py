import frappe
from frappe import _

from pakistan_tax_consultancy.api import public
from pakistan_tax_consultancy.www_helpers import page


sitemap = 1


def get_context(context):
	page(context, _("Book a Consultation"), _("Book a call, video meeting or office visit with a tax consultant."))
	context.services = public.services()
	context.selected = frappe.form_dict.service
	context.today = frappe.utils.nowdate()
	return context
