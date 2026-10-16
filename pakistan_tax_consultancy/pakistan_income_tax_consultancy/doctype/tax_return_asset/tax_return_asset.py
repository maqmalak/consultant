# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class TaxReturnAsset(Document):
	"""Asset entry within a tax return."""

	def validate(self):
		if not self.asset_type:
			frappe.throw(_("Asset Type is required"))

		if self.cost_value is not None and self.cost_value < 0:
			frappe.throw(_("Cost Value cannot be negative"))

		if self.acquisition_date and self.cost_value is None:
			frappe.throw(_("Cost Value is required when Acquisition Date is set"))
