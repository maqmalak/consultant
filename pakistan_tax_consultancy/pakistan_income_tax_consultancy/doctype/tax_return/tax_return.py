# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate


class TaxReturn(Document):
	"""Tax return filed for a client in a given tax year."""

	def validate(self):
		if not self.tax_client:
			frappe.throw(_("Tax Client is required"))

		if not frappe.db.exists("Tax Client", self.tax_client):
			frappe.throw(_("Tax Client {0} does not exist.").format(self.tax_client))

		if not self.tax_year:
			frappe.throw(_("Tax Year is required"))

		if not frappe.db.exists("Tax Year", self.tax_year):
			frappe.throw(_("Tax Year {0} does not exist.").format(self.tax_year))

		if self.tax_engagement and not frappe.db.exists(
			"Tax Engagement", self.tax_engagement
		):
			frappe.throw(
				_("Tax Engagement {0} does not exist.").format(self.tax_engagement)
			)

		if self.tax_regime and not frappe.db.exists("Tax Regime", self.tax_regime):
			frappe.throw(_("Tax Regime {0} does not exist.").format(self.tax_regime))

		# prevent duplicate return for the same client + year + type (unless amending)
		filters = {
			"tax_client": self.tax_client,
			"tax_year": self.tax_year,
			"name": ("!=", self.name or ""),
		}
		if self.return_type:
			filters["return_type"] = self.return_type
		existing = frappe.db.get_value("Tax Return", filters, "name")
		if existing:
			frappe.throw(
				_("A Tax Return already exists for this client, year and type."),
				frappe.DuplicateEntryError,
				title=_("Duplicate Return"),
			)


class TaxReturn(Document):
	pass
