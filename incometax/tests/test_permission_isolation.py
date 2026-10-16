# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Permission-isolation tests for the incometax app.

Verifies that each role can (or cannot) access Tax Client and client-linked records
according to the Phase 0 permission matrix:

  all             -> System Manager, Tax Consultant Admin, Tax Reviewer,
                     Tax Approver, Filing Officer
  consultant      -> Tax Consultant  (own/assigned clients only)
  field           -> Field Officer   (own registered clients only)
  client          -> Tax Client User (own portal client only)
  none            -> any other role  (no rows)
"""

import frappe
from frappe.tests import IntegrationTestCase

from incometax.utils.validators import normalize_cnic, normalize_mobile


def make_user(email, roles, first_name=None):
	"""Create (or reuse) a User with the given roles."""
	user = frappe.get_doc({
		"doctype": "User",
		"email": email,
		"first_name": first_name or email.split("@")[0],
		"send_welcome_email": 0,
		"roles": [{"role": r} for r in roles],
	})
	user.insert(ignore_permissions=True)
	return user


def make_client(name_suffix, consultant=None, field_officer=None, portal_user=None, status="Active", cnic=None):
	cnic = cnic or f"42{name_suffix.zfill(11)}"  # 13 digits -> 42xxxxxxxxx
	mobile = f"+92300{name_suffix.zfill(7)}"[-12:]  # crude E.164-ish for the test
	return frappe.get_doc({
		"doctype": "Tax Client",
		"client_name": f"Test Client {name_suffix}",
		"client_type": "Individual",
		"cnic": normalize_cnic(cnic),
		"mobile": normalize_mobile(mobile),
		"email": f"client{name_suffix}@example.com",
		"assigned_consultant": consultant,
		"field_officer": field_officer,
		"portal_user": portal_user,
		"status": status,
	}).insert(ignore_permissions=True)


class TestPermissionIsolation(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.consultant_a = make_user("consultant.a@example.com", ["Tax Consultant"], "Consultant A")
		cls.consultant_b = make_user("consultant.b@example.com", ["Tax Consultant"], "Consultant B")
		cls.field_officer = make_user("field.officer@example.com", ["Field Officer"], "Field Officer")
		cls.client_user = make_user("client.one@example.com", ["Tax Client User"], "Client One")
		cls.reviewer = make_user("reviewer@example.com", ["Tax Reviewer"], "Reviewer")
		cls.approver = make_user("tax.approver@example.com", ["Tax Approver"], "Approver")
		cls.filing_officer = make_user("filing@example.com", ["Filing Officer"], "Filing Officer")
		cls.other = make_user("other@example.com", ["Sales User"], "Other")

		# Clients: two assigned to consultant A, one to B, one registered by field officer,
		# one linked to the client user's portal account.
		cls.client_a1 = make_client("0001", consultant=cls.consultant_a.name)
		cls.client_a2 = make_client("0002", consultant=cls.consultant_a.name)
		cls.client_b = make_client("0003", consultant=cls.consultant_b.name)
		cls.client_field = make_client("0004", field_officer=cls.field_officer.name)
		cls.client_portal = make_client("0005", portal_user=cls.client_user.name)

	@classmethod
	def tearDownClass(cls):
		# Delete only the users created by this test — an unfiltered
		# db.delete("User") would also wipe Guest/Administrator.
		test_users = [
			cls.consultant_a.name, cls.consultant_b.name, cls.field_officer.name,
			cls.client_user.name, cls.reviewer.name, cls.approver.name,
			cls.filing_officer.name, cls.other.name,
		]
		# Only remove clients created by make_client (they are named "Test Client ...").
		frappe.db.delete("Tax Client", {"client_name": ["like", "Test Client%"]})
		frappe.db.delete("User", {"name": ("in", test_users)})
		frappe.db.commit()

	def set_user(self, user):
		frappe.set_user(user.email if hasattr(user, "email") else user)

	def test_consultant_accesses_own_clients_only(self):
		"""A Tax Consultant sees only clients assigned to them."""
		self.set_user(self.consultant_a)
		names = {d.name for d in frappe.get_list("Tax Client")}
		self.assertIn(self.client_a1.name, names)
		self.assertIn(self.client_a2.name, names)
		self.assertNotIn(self.client_b.name, names)
		self.assertNotIn(self.client_field.name, names)
		self.assertNotIn(self.client_portal.name, names)

		# Direct doc access: own client OK, another consultant's client denied.
		doc = frappe.get_doc("Tax Client", self.client_a1.name)
		self.assertEqual(doc.name, self.client_a1.name)
		self.assertFalse(
			frappe.has_permission("Tax Client", doc=frappe.get_doc("Tax Client", self.client_b.name))
		)

	def test_field_officer_accesses_own_clients_only(self):
		"""A Field Officer sees only clients they registered."""
		self.set_user(self.field_officer)
		names = {d.name for d in frappe.get_list("Tax Client")}
		self.assertIn(self.client_field.name, names)
		self.assertNotIn(self.client_a1.name, names)
		self.assertNotIn(self.client_b.name, names)

		self.assertFalse(
			frappe.has_permission("Tax Client", doc=frappe.get_doc("Tax Client", self.client_a1.name))
		)

	def test_client_user_sees_only_own_portal_client(self):
		"""A Tax Client User sees only the Tax Client linked to their portal user."""
		self.set_user(self.client_user)
		names = {d.name for d in frappe.get_list("Tax Client")}
		self.assertIn(self.client_portal.name, names)
		self.assertNotIn(self.client_a1.name, names)

		# Cannot create a Tax Client directly.
		with self.assertRaises(frappe.PermissionError):
			frappe.get_doc({
				"doctype": "Tax Client",
				"client_name": "Should Not Exist",
				"client_type": "Individual",
				"cnic": normalize_cnic("1234567890123"),
				"mobile": normalize_mobile("+923000000000"),
			}).insert()

	def test_client_can_update_own_portal_client(self):
		"""A Tax Client User can write to their own portal client (permlevel 0)."""
		self.set_user(self.client_user)
		doc = frappe.get_doc("Tax Client", self.client_portal.name)
		doc.mobile = "+92 300 9999999"
		doc.save()
		frappe.db.commit()
		updated = frappe.get_doc("Tax Client", self.client_portal.name)
		self.assertEqual(updated.mobile, "+92 300 9999999")

	def test_cnic_normalization_and_masking(self):
		"""CNIC is stored normalized and masked; hash is present for lookup."""
		client = make_client("0099")
		self.assertEqual(client.cnic, normalize_cnic(client.cnic))
		self.assertTrue(client.cnic_masked.startswith("*****"))
		self.assertTrue(client.cnic_hash)
		client.delete()

	def test_mobile_normalization(self):
		"""Mobile is stored E.164 internally and formatted for display."""
		client = make_client("0088")
		self.assertTrue(client.mobile_e164.startswith("+923"))
		client.delete()

	def test_duplicate_cnic_blocked(self):
		"""A duplicate CNIC raises DuplicateEntryError when blocking is enabled."""
		cnic = normalize_cnic("4210199999999")
		make_client("0077", cnic=cnic)  # force the same CNIC
		with self.assertRaises(frappe.DuplicateEntryError):
			frappe.get_doc({
				"doctype": "Tax Client",
				"client_name": "Duplicate",
				"client_type": "Individual",
				"cnic": cnic,
			}).insert(ignore_permissions=True)

	def test_all_scope_roles_see_everyone(self):
		"""Reviewer, Approver, Filing Officer and Admin see all clients."""
		for user in (self.reviewer, self.approver, self.filing_officer):
			self.set_user(user)
			names = {d.name for d in frappe.get_list("Tax Client")}
			for c in (self.client_a1, self.client_a2, self.client_b, self.client_field,
					  self.client_portal):
				self.assertIn(c.name, names, f"{user.first_name} could not see {c.client_name}")

	def test_client_user_sees_only_own_portal_client(self):
		"""A Tax Client User sees only the Tax Client linked to their portal user."""
		self.set_user(self.client_user)
		names = {d.name for d in frappe.get_list("Tax Client")}
		self.assertIn(self.client_portal.name, names)
		self.assertNotIn(self.client_a1.name, names)

	def test_other_role_sees_nothing(self):
		"""A user with an unrelated role sees no Tax Client rows (get_list denies)."""
		self.set_user(self.other)
		with self.assertRaises(frappe.PermissionError):
			frappe.get_list("Tax Client")

	def test_administrator_sees_all(self):
		"""Administrator bypasses all restrictions."""
		self.set_user("Administrator")
		names = {d.name for d in frappe.get_list("Tax Client")}
		for c in (self.client_a1, self.client_a2, self.client_b, self.client_field,
				  self.client_portal):
			self.assertIn(c.name, names)
