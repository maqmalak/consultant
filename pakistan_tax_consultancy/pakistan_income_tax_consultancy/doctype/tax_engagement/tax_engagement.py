# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class TaxEngagement(Document):
	"""Engagement of a client for a tax service in a given tax year."""

	def validate(self):
		if not self.tax_client:
			frappe.throw(_("Tax Client is required"))

		if not frappe.db.exists("Tax Client", self.tax_client):
			frappe.throw(_("Tax Client {0} does not exist.").format(self.tax_client))

		if self.period_from and self.period_to:
			if getdate(self.period_to) < getdate(self.period_from):
				frappe.throw(_("Period To must be after Period From"))

		if self.service_type and not frappe.db.exists("Tax Service Type", self.service_type):
			frappe.throw(_("Tax Service Type {0} does not exist.").format(self.service_type))

		if self.tax_year and not frappe.db.exists("Tax Year", self.tax_year):
			frappe.throw(_("Tax Year {0} does not exist.").format(self.tax_year))


class TaxEngagement(Document):
	pass
