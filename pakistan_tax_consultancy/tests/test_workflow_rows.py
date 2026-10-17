# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt
"""The Tax Return workflow has no repeated rows, and a user with many roles sees each next step once."""

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.setup.install import ensure_workflow


class TestWorkflowRows(IntegrationTestCase):
	def test_no_duplicate_rows(self):
		ensure_workflow()
		wf = frappe.get_doc("Workflow", "Tax Return Workflow")
		rows = [(t.state, t.action, t.next_state, t.allowed) for t in wf.transitions]
		self.assertEqual(len(rows), len(set(rows)))
		states = [(s.state, s.allow_edit) for s in wf.states]
		self.assertEqual(len(states), len(set(states)))

	def test_each_action_once_for_multi_role_user(self):
		from pakistan_tax_consultancy.api.staff import return_overview

		name = frappe.db.get_value("Tax Return", {"workflow_state": ("is", "set")}, "name")
		if not name:
			self.skipTest("no return on this site")
		actions = [(t["action"], t["next_state"]) for t in return_overview(name)["transitions"]]  # Administrator: every role
		self.assertEqual(len(actions), len(set(actions)))
