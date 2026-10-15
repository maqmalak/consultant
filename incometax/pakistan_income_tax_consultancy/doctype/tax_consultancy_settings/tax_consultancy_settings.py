# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document


class TaxConsultancySettings(Document):
	"""Singleton settings for the tax consultancy app."""

	def validate(self):
		if self.ntn_regex:
			import re

			try:
				re.compile(self.ntn_regex)
			except re.error:
				frappe.throw(_("NTN Regex is not a valid regular expression"))

	def on_update(self):
		frappe.clear_cache(doctype="Tax Consultancy Settings")


class TaxConsultancySettings(Document):
	pass
