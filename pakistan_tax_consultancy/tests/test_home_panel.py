# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Staff home side panel: inbox groups follow the user's roles and scope; attention and activity have the right shape."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import home
from pakistan_tax_consultancy.tests.test_permission_isolation import make_user


class TestHomePanel(IntegrationTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_admin_panel_shape(self):
		data = home.panel()
		self.assertEqual(data["inbox_total"], sum(g["count"] for g in data["inbox"]))
		for g in data["inbox"]:
			self.assertLessEqual(len(g["items"]), home.INBOX_LIMIT)
		self.assertLessEqual(len(data["activity"]), 12)
		self.assertTrue(all(a["tone"] in ("critical", "serious", "warning", "info") for a in data["attention"]))

	def test_new_consultant_sees_only_own_work(self):
		user = frappe.db.exists("User", "panel.consultant@example.com") or make_user("panel.consultant@example.com", ["Tax Consultant"]).name
		frappe.set_user(user)
		data = home.panel()
		self.assertEqual(data["inbox"], [])  # no clients assigned yet
		self.assertEqual(data["activity"], [])

	def test_reviewer_gets_review_groups_only(self):
		user = frappe.db.exists("User", "panel.reviewer@example.com") or make_user("panel.reviewer@example.com", ["Tax Reviewer"]).name
		frappe.set_user(user)
		keys = {g["key"] for g in home.panel()["inbox"]}
		self.assertTrue(keys <= {"review", "in_review"})
