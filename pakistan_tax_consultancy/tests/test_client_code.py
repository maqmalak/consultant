# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""Client code: a permanent C-00000 reference with its own counter, unique, set once, searchable by staff."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.pakistan_income_tax_consultancy.doctype.tax_client.tax_client import CLIENT_CODE_SERIES


def _client(name, mobile):
	return frappe.get_doc({"doctype": "Tax Client", "client_name": name, "client_type": "Individual-Salaried",
		"mobile": mobile, "status": "Active"}).insert(ignore_permissions=True)


class TestClientCode(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_new_clients_get_the_next_code(self):
		current = frappe.db.get_value("Series", CLIENT_CODE_SERIES, "current", order_by="name")
		first, second = _client("Code Test A", "03009990101"), _client("Code Test B", "03009990102")
		self.assertEqual(first.client_code, f"C-{int(current) + 1:05d}")
		self.assertEqual(second.client_code, f"C-{int(current) + 2:05d}")

	def test_existing_clients_have_unique_codes(self):
		total, coded, distinct = frappe.db.sql(
			"select count(*), count(client_code), count(distinct client_code) from `tabTax Client`")[0]
		self.assertEqual(total, coded)
		self.assertEqual(coded, distinct)

	def test_code_is_kept_on_save_and_not_copied(self):
		c = _client("Code Test C", "03009990103")
		code = c.client_code
		c.city = "Faisalabad"
		c.save(ignore_permissions=True)
		self.assertEqual(frappe.db.get_value("Tax Client", c.name, "client_code"), code)
		copy = frappe.copy_doc(c)
		copy.mobile, copy.cnic, copy.email = "03009990105", None, None
		copy.insert(ignore_permissions=True)
		self.assertNotEqual(copy.client_code, code)

	def test_staff_search_finds_the_code(self):
		from pakistan_tax_consultancy.api.staff import search_clients

		c = _client("Code Test D", "03009990104")
		self.assertIn(c.name, [r.name for r in search_clients(q=c.client_code)])
