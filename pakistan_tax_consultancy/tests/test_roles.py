# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Roles & permissions page: overview, switching one right, reset, guardrails, admin only."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import roles
from pakistan_tax_consultancy.tests.test_permission_isolation import make_user


class TestRolesPage(IntegrationTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_overview_lists_roles_and_firm_doctypes(self):
		data = roles.overview()
		self.assertIn("Tax Consultant", [r["role"] for r in data["roles"]])
		types = {d["doctype"] for d in data["doctypes"]}
		self.assertIn("Tax Return", types)
		self.assertNotIn("Tax Return Income Source", types)  # child tables are not listed

	def test_switch_and_reset(self):
		consultant = frappe.db.exists("User", "roles.consultant@example.com") or make_user("roles.consultant@example.com", ["Tax Consultant"]).name
		self.assertFalse(frappe.has_permission("Tax Client", "export", user=consultant))
		rule = roles.set_permission("Tax Client", "Tax Consultant", "export", 1)
		self.assertEqual((rule["export"], rule["read"]), (1, 1))
		frappe.clear_cache(doctype="Tax Client")
		self.assertTrue(frappe.has_permission("Tax Client", "export", user=consultant))
		roles.reset("Tax Client")
		frappe.clear_cache(doctype="Tax Client")
		self.assertFalse(frappe.db.exists("Custom DocPerm", {"parent": "Tax Client"}))
		self.assertFalse(frappe.has_permission("Tax Client", "export", user=consultant))

	def test_read_off_removes_everything(self):
		roles.set_permission("Tax Year", "Field Officer", "read", 0)
		self.assertNotIn("Field Officer", roles._rules("Tax Year"))
		roles.reset("Tax Year")

	def test_guardrails(self):
		for doctype, role in (("Tax Client", "Client"), ("Tax Client", "Tax Admin"), ("Tax Client", "System Manager"), ("User", "Tax Consultant")):
			self.assertRaises(frappe.ValidationError, roles.set_permission, doctype, role, "write", 1)
		self.assertRaises(frappe.ValidationError, roles.set_permission, "Tax Client", "Tax Consultant", "submit", 1)  # not submittable

	def test_admin_only(self):
		user = frappe.db.exists("User", "roles.reviewer@example.com") or make_user("roles.reviewer@example.com", ["Tax Reviewer"]).name
		frappe.set_user(user)
		self.assertRaises(frappe.PermissionError, roles.overview)
		self.assertRaises(frappe.PermissionError, roles.set_permission, "Tax Year", "Field Officer", "write", 1)
