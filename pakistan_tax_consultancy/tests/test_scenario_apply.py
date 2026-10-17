# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Applying the final tax-planning scenario to its return: same tax as simulated, evidence requested, one at a time, undo."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.api import simulator as api
from pakistan_tax_consultancy.services import scenario_apply, workflow as wf


class TestScenarioApply(IntegrationTestCase):
	def setUp(self):
		self.tr = frappe.db.get_value("Tax Return", {"workflow_state": ("in", scenario_apply.EDITABLE), "tax_year": "2027"}, "name") \
			or frappe.db.get_value("Tax Return", {"workflow_state": ("in", scenario_apply.EDITABLE)}, "name")
		if not self.tr:
			self.skipTest("no return being prepared on this site")

	def scenario(self, title, **change):
		ctx = api.context(self.tr)
		values = {lv["key"]: lv["base"] for lv in ctx["levers"]}
		values.update(change)
		return api.save_scenario(self.tr, title, frappe.as_json(values)), api.simulate(self.tr, frappe.as_json(values))

	def test_apply_matches_simulation_and_requests_evidence(self):
		name, sim = self.scenario("Test apply", **{"ded|Zakat": 90_000, "cr|Charitable Donation": 50_000, "addback": 120_000})
		preview = api.apply_preview(name)
		self.assertEqual(preview["after"]["tax_liability"], sim["tax_liability"])
		res = api.apply_scenario(name)
		self.assertAlmostEqual(res["tax_liability"], sim["tax_liability"], delta=1)
		doc = frappe.get_doc("Tax Return", self.tr)
		self.assertEqual(sum(r.amount for r in doc.deduction_lines if r.deduction_type == "Zakat"), 90_000)
		self.assertEqual(sum(r.gross_amount for r in doc.income_sources if r.is_addback), 120_000)
		self.assertTrue(frappe.db.get_value("Tax Scenario", name, "applied_calculation"))
		asked = frappe.get_all("Tax Document", {"tax_return": self.tr, "requested_reason": ("like", "%Test apply%")}, pluck="document_type")
		self.assertIn("Zakat Deduction Certificate", asked)
		self.assertIn("Donation Receipts", asked)
		# the evidence blocks Submit for Review until it is verified
		self.assertTrue(wf.required_documents_status(self.tr)["pending"])
		# simulator now reads the applied add-back as the add-back lever, not as business income
		levers = {lv["key"]: lv["base"] for lv in api.context(self.tr)["levers"]}
		self.assertEqual(levers["addback"], 120_000)

	def test_one_at_a_time_and_undo(self):
		before = frappe.get_doc("Tax Return", self.tr)
		lines = scenario_apply._lines(before)
		a, _sim = self.scenario("Test A", **{"ded|Zakat": 70_000})
		b, _sim = self.scenario("Test B", **{"ded|Zakat": 60_000})
		api.apply_scenario(a)
		self.assertRaises(frappe.ValidationError, api.apply_scenario, b)
		api.undo_scenario(a)
		after = frappe.get_doc("Tax Return", self.tr)
		self.assertEqual(scenario_apply._lines(after), lines)
		self.assertFalse(frappe.db.get_value("Tax Scenario", a, "applied_on"))
		self.assertFalse(frappe.get_all("Tax Document", {"tax_return": self.tr, "requested_reason": ("like", "%Test A%")}))

	def test_not_after_review(self):
		name, _sim = self.scenario("Test locked", **{"ded|Zakat": 75_000})
		frappe.db.set_value("Tax Return", self.tr, "workflow_state", wf.UNDER_REVIEW)
		self.assertRaises(frappe.ValidationError, api.apply_scenario, name)
