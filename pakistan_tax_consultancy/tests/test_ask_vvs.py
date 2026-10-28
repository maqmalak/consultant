# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Ask VVS wrapper: safe HTML, portal context and links, reply shaping, who may switch access on."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import ask_vvs


class TestAskVvs(IntegrationTestCase):
	def setUp(self):
		if "ask_alyf" not in frappe.get_installed_apps():
			self.skipTest("ask_alyf is not installed on this site")
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_model_output_is_sanitised(self):
		html = ask_vvs._html("**ok** <script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))\n\n| a |\n|---|\n| 1 |")
		self.assertIn("<strong>ok</strong>", html)
		self.assertIn("<table", html)
		for bad in ("<script", "onerror", "javascript:"):
			self.assertNotIn(bad, html)

	def test_portal_context_and_links(self):
		name = frappe.db.get_value("Tax Return", {}, "name")
		if name:
			ctx = ask_vvs._context(f"/staff/returns/{name}")
			self.assertEqual((ctx["current_doctype"], ctx["current_docname"]), ("Tax Return", name))
		self.assertNotIn("current_doctype", ask_vvs._context("/staff/returns/does-not-exist"))
		self.assertEqual(ask_vvs._portal_link(["Form", "Tax Client", "C-1"])["to"], "/staff/clients/C-1")
		self.assertEqual(ask_vvs._portal_link("List/Tax Return")["to"], "/staff/returns")
		self.assertIsNone(ask_vvs._portal_link(["Form", "Item", "X"]))

	def test_conversation_shape(self):
		out = ask_vvs._conversation({"name": "c", "title": "t", "messages": [
			{"id": "1", "role": "user", "content": "<b>hi</b>"},
			{"id": "2", "role": "assistant", "content": "done", "metadata": {"frappe_charts": [{"type": "bar"}], "tool_calls": [{"label": "Reading"}]}}],
			"pending_operations": [{"kind": "backend_action", "call_id": "k", "summary": "Update"}, {"kind": "frontend_action", "call_id": "f"}]})
		self.assertEqual(out["messages"][0]["text"], "<b>hi</b>")  # user text is shown as text, never as HTML
		self.assertNotIn("html", out["messages"][0])
		self.assertEqual(out["messages"][1]["charts"], [{"type": "bar"}])
		self.assertEqual([p["call_id"] for p in out["pending"]], ["k"])  # browser actions are settled server-side

	def test_only_admins_switch_access(self):
		staff = frappe.db.get_value("Has Role", {"role": "Filing Officer", "parenttype": "User", "parent": ("like", "%@demo.taxportal.example")}, "parent")
		consultant = frappe.db.get_value("Has Role", {"role": "Tax Consultant", "parenttype": "User", "parent": ("like", "%@demo.taxportal.example")}, "parent")
		if not (staff and consultant):
			self.skipTest("needs demo staff")
		frappe.set_user(consultant)
		self.assertRaises(frappe.PermissionError, ask_vvs.set_access, staff, 1)
		frappe.set_user("Administrator")
		self.assertTrue(ask_vvs.set_access(staff, 1)["enabled"])
		self.assertFalse(ask_vvs.set_access(staff, 0)["enabled"])
		client = frappe.db.get_value("Has Role", {"role": "Client", "parenttype": "User"}, "parent")
		if client:
			self.assertRaises(frappe.ValidationError, ask_vvs.set_access, client, 1)
