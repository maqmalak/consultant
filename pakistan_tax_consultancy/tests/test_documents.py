# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Document vault and generated letters: versioning, availability rules, client isolation, session safety."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.services import documents as gen
from pakistan_tax_consultancy.tests.test_permission_isolation import make_client, make_user


class TestDocuments(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.client_user = make_user("vault.client@example.com", ["Client"], "Vault Client")
		cls.mine = make_client("0095001", portal_user=cls.client_user.name, cnic="0000000950011")
		cls.other = make_client("0095002", cnic="0000000950022")
		cls.my_return = cls.new_return(cls.mine.name)
		cls.other_return = cls.new_return(cls.other.name)

	@staticmethod
	def new_return(client):
		tr = frappe.get_doc({"doctype": "Tax Return", "tax_client": client, "tax_year": "2026", "return_type": "Original"})
		tr.insert(ignore_permissions=True)
		return tr

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_generate_is_versioned_and_stored(self):
		a = gen.generate("Document Checklist", self.my_return.name)
		b = gen.generate("Document Checklist", self.my_return.name)
		self.assertEqual((a["version"], b["version"]), (1, 2))
		doc = frappe.get_doc("Generated Document", b["name"])
		self.assertEqual(doc.tax_client, self.mine.name)
		self.assertTrue(doc.file and doc.file.startswith("/private/files/"))
		self.assertTrue(frappe.get_doc("File", {"file_url": doc.file}).get_content(encodings=[]).startswith(b"%PDF"))

	def test_filing_confirmation_needs_iris_acknowledgment(self):
		self.assertIsNotNone(gen.blocked_reason("Filing Confirmation", self.my_return))
		self.assertRaises(frappe.ValidationError, gen.generate, "Filing Confirmation", self.my_return.name)

	def test_client_sees_figures_only_when_ready(self):
		r = frappe.get_doc("Tax Return", self.my_return.name)
		r.latest_calculation = "dummy"  # pretend the tax was calculated; the state still hides it from the client
		self.assertIsNotNone(gen.blocked_reason("Tax Computation Summary", r, for_client=True))
		self.assertIsNone(gen.blocked_reason("Tax Computation Summary", r, for_client=False))

	def test_client_cannot_generate_for_another_client(self):
		from pakistan_tax_consultancy.api import vault

		frappe.set_user(self.client_user.name)
		self.assertRaises(frappe.PermissionError, vault.generate, "Document Checklist", self.other_return.name)
		self.assertEqual(vault.generate("Authority Letter", self.mine.name)["version"], 1)
		# the client sees and lists only their own generated documents
		frappe.set_user("Administrator")
		theirs = gen.generate("Document Checklist", self.other_return.name)["name"]
		frappe.set_user(self.client_user.name)
		self.assertFalse(frappe.get_doc("Generated Document", theirs).has_permission("read"))
		names = frappe.get_list("Generated Document", pluck="tax_client")
		self.assertTrue(names and set(names) == {self.mine.name})

	def test_generating_keeps_the_callers_session(self):
		frappe.set_user(self.client_user.name)
		sid, data = frappe.session.sid, frappe.session.data
		from pakistan_tax_consultancy.api import vault

		vault.generate("Document Checklist", self.my_return.name)
		self.assertEqual((frappe.session.user, frappe.session.sid), (self.client_user.name, sid))
		self.assertIs(frappe.session.data, data)

	def test_vault_lists_only_own_files(self):
		from pakistan_tax_consultancy.api import vault

		frappe.set_user(self.client_user.name)
		data = vault.my_vault()
		self.assertEqual(data["client"].name, self.mine.name)
		self.assertTrue(all(t["source"] in ("Tax Client", "Tax Engagement", "Tax Return") for t in data["generate"]))
		targets = {t["name"] for g in data["generate"] for t in g["targets"]}
		self.assertNotIn(self.other_return.name, targets)
