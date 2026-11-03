# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Help centre: each role sees its own manuals (clients only theirs), and a manual for another role is refused."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import help as h


def make_user(email, roles):
	if not frappe.db.exists("User", email):
		frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0,
			"roles": [{"role": r} for r in roles]}).insert(ignore_permissions=True)
	return email


class TestHelp(IntegrationTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def slugs(self, user):
		frappe.set_user(user)
		return {m["slug"] for m in h.manuals()}

	def test_every_manual_parses_and_renders(self):
		frappe.set_user("Administrator")
		listed = h.manuals()
		self.assertGreaterEqual(len(listed), 9)
		for m in listed:
			out = h.manual(m["slug"])
			self.assertTrue(out["html"].strip(), m["slug"])
			self.assertTrue(out["roles"], m["slug"])

	def test_roles_see_their_manuals(self):
		consultant = make_user("h.consultant@example.com", ["Tax Consultant"])
		client = make_user("h.client@example.com", ["Client"])
		self.assertEqual(self.slugs(client), {"client"})
		self.assertIn("consultant", self.slugs(consultant))
		self.assertIn("getting-started", self.slugs(consultant))
		self.assertNotIn("admin", self.slugs(consultant))
		self.assertNotIn("client", self.slugs(consultant))
		frappe.set_user(client)
		self.assertRaises(frappe.PermissionError, h.manual, "admin")
		self.assertRaises(frappe.DoesNotExistError, h.manual, "../hooks")

	def test_guides_only_list_files_on_this_server(self):
		frappe.set_user("Administrator")
		for g in h.guides():
			self.assertTrue(g["pdf_url"] or g["video_url"])
