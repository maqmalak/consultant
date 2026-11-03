# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Excel import: the template, the preview saves nothing, new and existing clients (only empty fields are filled),
filed history vs. returns in progress, and the rows that must be refused."""

import io

import frappe
from frappe.tests import IntegrationTestCase
from openpyxl import load_workbook

from pakistan_tax_consultancy.services import excel_import as ei


def workbook(clients=(), returns=()) -> bytes:
	wb = load_workbook(io.BytesIO(ei.template()))
	for row in clients:
		wb["Clients"].append(list(row))
	for row in returns:
		wb["Returns"].append(list(row))
	buf = io.BytesIO()
	wb.save(buf)
	return buf.getvalue()


class TestExcelImport(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self.existing = frappe.get_doc({"doctype": "Tax Client", "client_name": "Excel Existing", "client_type":
			"Individual-Salaried", "mobile": "03009990301", "city": "Multan", "status": "Active"}).insert(ignore_permissions=True)

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_template_has_the_sheets_and_text_columns(self):
		wb = load_workbook(io.BytesIO(ei.template()))
		self.assertEqual(wb.sheetnames[:3], ["Instructions", "Clients", "Returns"])
		self.assertEqual(wb["Clients"]["A1"].value, "Client name *")
		self.assertEqual(wb["Clients"].column_dimensions["C"].number_format, "@")  # CNIC keeps its digits
		self.assertEqual(wb["Clients"].max_row, 1)

	def test_preview_saves_nothing(self):
		before = frappe.db.count("Tax Client")
		out = ei.run("x.xlsx", workbook(clients=[("Excel New", "Individual-Salaried", "35202-7000001-1")]), commit=False)
		self.assertEqual(out["summary"]["clients"]["new"], 1)
		self.assertEqual(frappe.db.count("Tax Client"), before)

	def test_existing_client_only_gets_empty_fields(self):
		out = ei.run("x.xlsx", workbook(clients=[("Excel Existing", "", "", "", "03009990301", "", "Lahore", "Punjab")]),
			commit=True)
		row = out["clients"][0]
		self.assertEqual((row["status"], row["name"]), ("update", self.existing.name))
		self.assertTrue(any("kept" in m for m in row["messages"]))  # city differs: reported, not overwritten
		self.assertEqual(frappe.db.get_value("Tax Client", self.existing.name, ["city", "province"]), ("Multan", "Punjab"))

	def test_filed_history_and_return_in_progress(self):
		out = ei.run("x.xlsx", workbook(
			clients=[("Excel History", "Individual-Business", "35202-7000002-2", "", "3009990302")],
			returns=[("35202-7000002-2", "", "", "", "2019", "Filed", "IRIS-19-1", "28-09-2019", "1,200,000", "", "", "", "30000"),
				("", "", "03009990302", "", "2026", "In progress")]), commit=True)
		self.assertEqual(out["summary"]["clients"]["new"], 1)
		filed, current = (r["name"] for r in out["returns"])
		self.assertEqual(frappe.db.get_value("Tax Return", filed, ["workflow_state", "is_imported", "iris_acknowledgment_no",
			"total_income", "net_tax_payable"]), ("Acknowledged", 1, "IRIS-19-1", 1200000, 30000))
		self.assertEqual(frappe.db.count("Tax Document", {"tax_return": filed}), 0)  # history: no checklist
		self.assertTrue(frappe.db.exists("Tax Year", "2019"))
		self.assertEqual(frappe.db.get_value("Tax Return", current, "is_imported"), 0)
		self.assertNotEqual(frappe.db.get_value("Tax Return", current, "workflow_state"), "Acknowledged")
		client = frappe.db.get_value("Tax Return", filed, "tax_client")
		self.assertEqual(frappe.db.get_value("Tax Client", client, "registration_source"), "Import")

	def test_rows_that_are_refused(self):
		out = ei.run("x.xlsx", workbook(
			clients=[("", "Company"), ("Bad Type", "Shop")],
			returns=[("", "", "", self.existing.client_code, "2025", "Filed"),  # no acknowledgment / date
				("99999-0000000-9", "", "", "", "2025", "In progress"),  # unknown client
				("", "", "", self.existing.client_code, "2026", "Done")]), commit=True)
		self.assertEqual([r["status"] for r in out["clients"]], ["error", "error"])
		self.assertEqual([r["status"] for r in out["returns"]], ["error", "error", "error"])
		self.assertIn("IRIS acknowledgment", " ".join(out["returns"][0]["messages"]))

	def test_only_staff_who_may_import(self):
		from pakistan_tax_consultancy.api.staff import _require_importer

		client_user = frappe.db.get_value("Has Role", {"role": "Client", "parenttype": "User"}, "parent")
		if not client_user:
			self.skipTest("needs a client user")
		frappe.set_user(client_user)
		self.assertRaises(frappe.PermissionError, _require_importer)
