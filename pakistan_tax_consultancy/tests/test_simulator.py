# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Tax simulator: levers scale the right lines, add-backs are taxed, last year is found, scenarios save and print."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.services import simulator, tax_calc

SNAP = {"tax_year": "2027", "taxpayer_type": "Salaried Individual", "tax_regime": None,
	"income": [{"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": 1_000_000, "exempt_amount": 0, "taxable_amount": 1_000_000, "tax_rate_percent": 0},
		{"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": 500_000, "exempt_amount": 0, "taxable_amount": 500_000, "tax_rate_percent": 0},
		{"income_category": "Profit on Debt", "tax_treatment": "Separate Block", "gross_amount": 100_000, "exempt_amount": 0, "taxable_amount": 100_000, "tax_rate_percent": 15}],
	"deductions": [{"deduction_type": "Zakat", "amount": 20_000}], "credits": [],
	"withholding": [{"section": "149", "amount": 30_000}], "advance_tax": []}
SLABS = [{"from_amount": 0, "to_amount": 600_000, "fixed_tax": 0, "rate_percent": 0},
	{"from_amount": 600_000, "to_amount": None, "fixed_tax": 0, "rate_percent": 10}]


class TestSimulatorMath(IntegrationTestCase):
	def test_levers_group_lines(self):
		amounts = simulator.amounts(SNAP)
		self.assertEqual(amounts["inc|Salary|Normal"], 1_500_000)
		self.assertEqual(amounts["inc|Profit on Debt|Separate Block"], 100_000)
		self.assertEqual(amounts["ded|Zakat"], 20_000)
		self.assertEqual(amounts["addback"], 0)

	def test_apply_scales_and_adds_back(self):
		s = simulator.apply(SNAP, {"inc|Salary|Normal": 3_000_000, "addback": 200_000, "ded|Zakat": 0, "wht": 50_000})
		salary = [r["taxable_amount"] for r in s["income"] if r["income_category"] == "Salary"]
		self.assertEqual(salary, [2_000_000, 1_000_000])  # proportional
		result = tax_calc.compute(s, SLABS)
		# (3,000,000 + 200,000 add-back - 0) taxable; 10 % above 600,000; separate block 15 % of 100,000
		self.assertEqual(result["taxable_income"], 3_200_000)
		self.assertEqual(result["tax_liability"], 260_000 + 15_000)
		self.assertEqual(result["tax_paid"], 50_000)
		self.assertEqual(SNAP["income"][0]["gross_amount"], 1_000_000)  # the original is untouched

	def test_new_line_keeps_last_year_rate(self):
		now = {**SNAP, "income": SNAP["income"][:2]}
		s = simulator.apply(now, {"inc|Profit on Debt|Separate Block": 200_000}, SNAP)
		line = [r for r in s["income"] if r["income_category"] == "Profit on Debt"][0]
		self.assertEqual((line["gross_amount"], line["tax_rate_percent"]), (200_000, 15))


class TestSimulatorRecords(IntegrationTestCase):
	def test_scenario_round_trip(self):
		from pakistan_tax_consultancy.api import simulator as api

		tr = frappe.db.get_value("Tax Return", {"workflow_state": ("is", "set"), "tax_year": "2026"}, "name")
		if not tr:
			self.skipTest("no TY2026 return on this site")
		ctx = api.context(tr)
		self.assertTrue(ctx["levers"])
		values = {lv["key"]: lv["base"] for lv in ctx["levers"]}
		values["addback"] = 100_000
		sim = api.simulate(tr, frappe.as_json(values))
		self.assertGreaterEqual(sim["tax_liability"], ctx["actual"]["tax_liability"])
		name = api.save_scenario(tr, "Test add-back", frappe.as_json(values), "test note")
		self.assertEqual(frappe.db.get_value("Tax Scenario", name, "tax_liability"), sim["tax_liability"])
		self.assertIn(name, [s.name for s in api.scenarios(tr)])
		report = simulator.ptc_scenario_report(name)
		self.assertEqual(report["scenario"].title, "Test add-back")
		self.assertTrue(any(c["key"] == "addback" for c in report["changes"]))
		api.delete_scenario(name)
		self.assertFalse(frappe.db.exists("Tax Scenario", name))
