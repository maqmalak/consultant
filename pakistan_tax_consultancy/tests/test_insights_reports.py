# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Insights dashboard and report center: shapes, scope (a consultant sees only their clients), report permissions."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import insights, reports
from pakistan_tax_consultancy.tests.test_permission_isolation import make_user


class TestInsightsReports(IntegrationTestCase):
	def tearDown(self):
		frappe.set_user("Administrator")

	def test_overview_shape_and_funnel(self):
		data = insights.overview(months=6)
		self.assertEqual(len(data["trend"]), 6)
		counts = [f["count"] for f in data["funnel"]]
		self.assertEqual(counts, sorted(counts, reverse=True))  # cumulative funnel never grows
		self.assertGreaterEqual(data["kpis"]["returns"], data["kpis"]["filed"])
		self.assertIn("client_type", data["mix"])

	def test_consultant_sees_own_clients_only(self):
		user = frappe.db.exists("User", "insights.consultant@example.com") or make_user("insights.consultant@example.com", ["Tax Consultant"]).name
		frappe.set_user(user)
		data = insights.overview()
		self.assertEqual(data["scope"], "consultant")
		self.assertEqual(data["kpis"]["returns"], 0)  # nobody is assigned to this new consultant
		self.assertEqual([t for t in data["team"] if t["user"] != user], [])

	def test_reports_catalog_and_run(self):
		cat = reports.catalog()
		names = {r["name"] for r in cat["reports"]}
		self.assertIn("Returns by Status", names)
		res = reports.run("Returns by Status", {"tax_year": cat["default_year"], "ignored": "x"})
		self.assertTrue(res["columns"])
		self.assertNotIn("ignored", res["filters"])
		self.assertRaises(frappe.ValidationError, reports.run, "Not A Report")

	def test_report_roles_respected(self):
		user = frappe.db.exists("User", "insights.field@example.com") or make_user("insights.field@example.com", ["Field Officer"]).name
		frappe.set_user(user)
		names = {r["name"] for r in reports.catalog()["reports"]}
		self.assertNotIn("Fees and Collections", names)
		self.assertRaises(frappe.PermissionError, reports.run, "Fees and Collections")
