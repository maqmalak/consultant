# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import hashlib

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

from pakistan_tax_consultancy.utils import validators as v


def cnic_hash(cnic: str | None) -> str | None:
	"""Deterministic hash of the CNIC digits used for indexed duplicate lookup.

	Keeps the raw CNIC out of non-permlevel columns while still allowing exact-match search.
	"""
	if not cnic:
		return None
	return hashlib.sha256(v.digits_only(cnic).encode()).hexdigest()


def get_settings():
	return frappe.get_cached_doc("Tax Consultancy Settings")


class TaxClient(Document):
	def validate(self):
		self.normalize_identifiers()
		self.check_duplicates()
		self.set_consent()

	def normalize_identifiers(self):
		settings = get_settings()
		try:
			self.cnic = v.normalize_cnic(self.cnic)
			mobile = v.normalize_mobile(self.mobile)
			self.ntn_normalized = v.normalize_ntn(self.ntn, settings.ntn_regex)
		except ValueError as e:
			frappe.throw(_(str(e)), title=_("Invalid Identifier"))
		self.cnic_hash = cnic_hash(self.cnic)
		self.cnic_masked = v.mask_cnic(self.cnic)
		self.mobile_e164 = mobile
		self.mobile = v.format_mobile_display(mobile)
		self.email = v.normalize_email(self.email)
		self.email_normalized = self.email
		if (self.client_type or "").startswith("Individual") and not (self.cnic or self.ntn):
			frappe.msgprint(_("CNIC or NTN is recommended for individual clients."), indicator="orange",
				alert=True)

	def check_duplicates(self):
		settings = get_settings()
		checks = [
			("cnic_hash", self.cnic_hash, settings.enforce_unique_cnic, _("CNIC")),
			("ntn_normalized", self.ntn_normalized, settings.enforce_unique_ntn, _("NTN")),
			("email_normalized", self.email_normalized, settings.block_duplicate_email, _("Email")),
			("mobile_e164", self.mobile_e164, settings.block_duplicate_mobile, _("Mobile")),
		]
		for field, value, block, label in checks:
			if not value:
				continue
			existing = frappe.db.get_value("Tax Client", {field: value, "name": ("!=", self.name or "")}, "name")
			if not existing:
				continue
			if block:
				frappe.throw(_("A client with this {0} already exists.").format(label),
					frappe.DuplicateEntryError, title=_("Duplicate Client"))
			frappe.msgprint(_("Another client already uses this {0}.").format(label), indicator="orange",
				alert=True)

	def set_consent(self):
		if self.consent_given and not self.consent_timestamp:
			self.consent_timestamp = now_datetime()
			self.consent_terms_version = get_settings().privacy_terms_version or "v1"
		if not self.consent_given:
			self.consent_timestamp = None
			self.consent_terms_version = None

	def on_update(self):
		self.sync_portal_user_permission()

	def sync_portal_user_permission(self):
		"""Restrict the portal user to this Tax Client via a User Permission."""
		before = self.get_doc_before_save()
		old_user = before.portal_user if before else None
		if old_user and old_user != self.portal_user:
			frappe.db.delete("User Permission", {"user": old_user, "allow": "Tax Client", "for_value": self.name})
		if self.portal_user and not frappe.db.exists("User Permission",
				{"user": self.portal_user, "allow": "Tax Client", "for_value": self.name}):
			frappe.get_doc({
				"doctype": "User Permission", "user": self.portal_user, "allow": "Tax Client",
				"for_value": self.name, "apply_to_all_doctypes": 1,
			}).insert(ignore_permissions=True)
