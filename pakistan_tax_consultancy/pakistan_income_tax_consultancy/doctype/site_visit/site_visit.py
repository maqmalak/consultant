# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

# import frappe
import frappe
from frappe import _
from frappe.model.document import Document

from pakistan_tax_consultancy.utils import validators as v


class SiteVisit(Document):
	"""Record of a visit to a tax client."""

	def validate(self):
		self.full_name = (self.full_name or "").strip()
		if not self.full_name:
			frappe.throw(_("Contact Person is required"))

		if self.mobile:
			try:
				self.mobile_e164 = v.normalize_mobile(self.mobile)
			except ValueError as e:
				frappe.throw(_(str(e)), title=_("Invalid Mobile"))

		if self.email:
			self.email = v.normalize_email(self.email)

		# client access is enforced by the linked Tax Client permission hook;
		# just make sure the client exists
		if self.tax_client and not frappe.db.exists("Tax Client", self.tax_client):
			frappe.throw(_("Tax Client {0} does not exist.").format(self.tax_client))

