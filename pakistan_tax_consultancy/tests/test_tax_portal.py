"""End-to-end tests for the spec (§16): calculation, OTP sign-up, checklist guard, every workflow transition and its
rule, client isolation, private files, approval cancellation, filing evidence and payment verification.

Run: bench --site consultant run-tests --app pakistan_tax_consultancy
Everything runs inside the test transaction and is rolled back afterwards; identifiers are fake.
"""

import io
import types

import frappe
from frappe.tests import IntegrationTestCase

from pakistan_tax_consultancy.services import tax_calc
from pakistan_tax_consultancy.services import workflow as wf

def _pdf():
	from pypdf import PdfWriter

	w = PdfWriter()
	w.add_blank_page(72, 72)
	buf = io.BytesIO()
	w.write(buf)
	return buf.getvalue()


PDF = _pdf()
SLABS = [
	{"from_amount": 0, "to_amount": 600000, "fixed_tax": 0, "rate_percent": 0},
	{"from_amount": 600000, "to_amount": 1200000, "fixed_tax": 0, "rate_percent": 1},
	{"from_amount": 1200000, "to_amount": 2200000, "fixed_tax": 6000, "rate_percent": 11},
	{"from_amount": 2200000, "to_amount": None, "fixed_tax": 116000, "rate_percent": 23},
]


def make_user(email, roles):
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, force=True, ignore_permissions=True)
	user = frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0,
		"user_type": "Website User" if roles == ["Client"] else "System User", "roles": [{"role": r} for r in roles]})
	user.insert(ignore_permissions=True)
	return user.name


def fake_upload(content=PDF, filename="doc.pdf"):
	frappe.local.request = types.SimpleNamespace(files={"file": types.SimpleNamespace(filename=filename,
		stream=io.BytesIO(content))}, method="POST", host="consultant", scheme="http", path="/api/method/upload",
		url="http://consultant/api/method/upload", headers={}, host_url="http://consultant/")


def as_user(user):
	frappe.set_user(user)


class TestTaxCalc(IntegrationTestCase):
	def test_slab_boundaries(self):
		self.assertEqual(tax_calc.slab_tax(600000, SLABS)[0], 0)
		self.assertEqual(tax_calc.slab_tax(1200000, SLABS)[0], 6000)  # 1% of 600,000
		self.assertAlmostEqual(tax_calc.slab_tax(1500000, SLABS)[0], 6000 + 300000 * 0.11)
		self.assertAlmostEqual(tax_calc.slab_tax(3000000, SLABS)[0], 116000 + 800000 * 0.23)

	def test_compute_payable_refund_and_separate_block(self):
		inputs = {"income": [
			{"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": 1500000, "exempt_amount": 0,
				"taxable_amount": 1500000},
			{"income_category": "Profit on Debt", "tax_treatment": "Separate Block", "gross_amount": 100000,
				"exempt_amount": 0, "taxable_amount": 100000, "tax_rate_percent": 15}],
			"deductions": [{"amount": 0}], "credits": [], "withholding": [{"amount": 30000}], "advance_tax": [{"amount": 5000}]}
		r = tax_calc.compute(inputs, SLABS)
		self.assertAlmostEqual(r["normal_tax"], 39000)
		self.assertAlmostEqual(r["separate_tax"], 15000)
		self.assertAlmostEqual(r["tax_liability"], 54000)
		self.assertAlmostEqual(r["net_payable"], 19000)
		inputs["withholding"] = [{"amount": 70000}]
		r = tax_calc.compute(inputs, SLABS)
		self.assertAlmostEqual(r["refund_due"], 21000)
		self.assertEqual(r["net_payable"], 0)

	def test_credits_never_exceed_normal_tax(self):
		inputs = {"income": [{"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": 700000,
			"exempt_amount": 0, "taxable_amount": 700000}], "deductions": [], "withholding": [], "advance_tax": [],
			"credits": [{"credit_type": "x", "credit_rule": None, "eligible_amount": 0, "credit_amount": 99999}]}
		r = tax_calc.compute(inputs, SLABS)
		self.assertEqual(r["total_tax_credits"], 1000)
		self.assertEqual(r["tax_liability"], 0)

	def test_salary_calculator_uses_configured_slabs(self):
		from pakistan_tax_consultancy.api.public import salary_calculator

		r = salary_calculator(100000, "2026")  # 1.2M a year
		self.assertEqual(r["annual_salary"], 1200000)
		self.assertIn("Estimate only", r["disclaimer"])
		self.assertTrue(r["rules_are_demo"])


class TestTaxPortalFlow(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		frappe.local.request_ip = "127.0.0.1"
		frappe.cache.delete_keys("rl:")  # rate-limit counters survive between test runs
		cls.consultant = make_user("t.consultant@example.com", ["Tax Consultant"])
		cls.consultant2 = make_user("t.consultant2@example.com", ["Tax Consultant"])
		cls.reviewer = make_user("t.reviewer@example.com", ["Tax Reviewer"])
		cls.approver = make_user("t.approver@example.com", ["Tax Approver"])
		cls.filer = make_user("t.filer@example.com", ["Filing Officer"])
		cls.admin = make_user("t.admin@example.com", ["Tax Admin"])
		frappe.db.set_single_value("Tax Consultancy Settings", "default_consultant", cls.consultant)
		frappe.db.set_single_value("Firm Website Settings", "work_before_payment", 1)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.local.request = None

	# ------------------------------------------------------------------------------------------- helpers
	def signup(self, mobile, email, cnic):
		from pakistan_tax_consultancy.api import auth
		from pakistan_tax_consultancy.services import otp

		frappe.set_user("Guest")
		req = otp.issue(mobile)
		code = None
		# the console SMS provider cannot be read back, so find the code by brute force over the hash (test only)
		stored = frappe.db.get_value("OTP Request", req, "otp_hash")
		norm = frappe.db.get_value("OTP Request", req, "mobile")
		for n in range(1_000_000):
			c = f"{n:06d}"
			if otp._hash(norm, c) == stored:
				code = c
				break
		self.assertFalse(otp.verify(req, mobile, "000000" if code != "000000" else "111111"))
		self.assertTrue(otp.verify(req, mobile, code))
		frappe.local.login_manager = types.SimpleNamespace(login_as=lambda user: frappe.set_user(user))
		res = auth.signup(full_name="Test Client", mobile=mobile, email=email, password="Str0ng!Passw0rd#2026",
			client_type="Individual-Salaried", otp_request=req, consent=1, cnic=cnic, city="Lahore")
		return res

	def new_return(self, client):
		as_user(self.consultant)
		tr = frappe.get_doc({"doctype": "Tax Return", "tax_client": client, "tax_year": "2026", "return_type": "Original"})
		tr.insert()
		return tr

	def answer_and_upload(self, client_user, tax_return):
		from pakistan_tax_consultancy.api import portal

		as_user(client_user)
		portal.save_answers(tax_return, {"has_salary": 1})
		detail = portal.return_detail(tax_return)
		for item in detail["checklist"]:
			if item["is_required"]:
				fake_upload()
				portal.upload(item["name"])
		frappe.local.request = None
		return detail

	def verify_all(self, tax_return):
		from pakistan_tax_consultancy.api import staff

		as_user(self.consultant)
		for d in frappe.get_all("Tax Document", {"tax_return": tax_return, "status": "Pending"}, pluck="name"):
			staff.verify_document(d, "Verified")

	def prepare(self, tax_return):
		as_user(self.consultant)
		tr = frappe.get_doc("Tax Return", tax_return)
		tr.append("income_sources", {"income_category": "Salary", "tax_treatment": "Normal", "gross_amount": 1500000})
		tr.append("withholding_lines", {"payer": "Employer", "amount": 30000})
		tr.save()
		tax_calc.calculate_return(frappe.get_doc("Tax Return", tax_return))

	def move(self, user, tax_return, action, comment=None):
		from pakistan_tax_consultancy.api import staff

		as_user(user)
		return staff.transition(tax_return, action, comment)["workflow_state"]

	def review_pass(self, tax_return):
		from pakistan_tax_consultancy.api import staff

		as_user(self.reviewer)
		self.assertEqual(self.move(self.reviewer, tax_return, "Start Review"), wf.UNDER_REVIEW)
		as_user(self.reviewer)
		review = staff.start_review(tax_return)
		items = [{"check_item": c, "result": "Pass"} for c in staff.REVIEW_CHECKLIST]
		staff.save_review(review, items, calculation_verified=1)
		self.assertEqual(self.move(self.reviewer, tax_return, "Mark Reviewed"), wf.REVIEWED)
		self.assertEqual(self.move(self.reviewer, tax_return, "Send to Client"), wf.AWAITING_CLIENT)

	# ------------------------------------------------------------------------------------------- tests
	def test_full_flow_draft_to_acknowledged(self):
		from pakistan_tax_consultancy.api import portal, staff

		res = self.signup("03001110001", "t.client1@example.com", "00000-0000000-1")
		client, client_user = res["client"], res["user"]
		self.assertEqual(frappe.db.get_value("Tax Client", client, "portal_user"), client_user)

		tr = self.new_return(client)
		self.assertEqual(tr.workflow_state, wf.DOCUMENTS_PENDING)
		detail = self.answer_and_upload(client_user, tr.name)
		self.assertTrue(any(i["document_type"] == "Salary Certificate" for i in detail["checklist"]))

		# Draft cannot be reached while required documents are unverified
		as_user(self.consultant)
		with self.assertRaises(frappe.ValidationError):
			staff.transition(tr.name, "Documents Complete")
		self.verify_all(tr.name)
		self.assertEqual(frappe.db.get_value("Tax Return", tr.name, "workflow_state"), wf.DRAFT)

		# review needs a current calculation
		with self.assertRaises(frappe.ValidationError):
			self.move(self.consultant, tr.name, "Submit for Review")
		self.prepare(tr.name)
		self.assertEqual(self.move(self.consultant, tr.name, "Submit for Review"), wf.PENDING_REVIEW)

		# Changes Required needs a comment
		self.move(self.reviewer, tr.name, "Start Review")
		with self.assertRaises(frappe.ValidationError):
			self.move(self.reviewer, tr.name, "Request Changes")
		self.move(self.reviewer, tr.name, "Request Changes", "Add the bank profit certificate")
		self.move(self.consultant, tr.name, "Resume Preparation")
		self.move(self.consultant, tr.name, "Submit for Review")
		self.review_pass(tr.name)

		# approver cannot approve before the client confirms
		with self.assertRaises(frappe.ValidationError):
			self.move(self.approver, tr.name, "Approve")
		as_user(client_user)
		summary = portal.return_detail(tr.name)["summary"]
		self.assertGreater(summary["tax_liability"], 0)
		portal.confirm(tr.name)
		self.assertEqual(self.move(self.approver, tr.name, "Approve"), wf.APPROVED)
		self.assertTrue(frappe.db.get_value("Tax Return", tr.name, "approved_content_hash"))

		# filing: Filing Record created; acknowledgment needs number + receipt
		self.assertEqual(self.move(self.filer, tr.name, "Mark Submitted on IRIS"), wf.SUBMITTED)
		self.assertTrue(frappe.db.exists("Filing Record", {"tax_return": tr.name}))
		with self.assertRaises(frappe.ValidationError):
			self.move(self.filer, tr.name, "Record Acknowledgment")
		as_user(self.filer)
		fake_upload(filename="receipt.pdf")
		staff.upload_receipt(tr.name, "IRIS-ACK-0001")
		frappe.local.request = None
		self.assertEqual(self.move(self.filer, tr.name, "Record Acknowledgment"), wf.ACKNOWLEDGED)
		self.assertEqual(frappe.db.get_value("Filing Record", {"tax_return": tr.name}, "status"), "Acknowledged")

		# a filed return never changes
		as_user(self.admin)
		doc = frappe.get_doc("Tax Return", tr.name)
		doc.income_sources[0].gross_amount = 999
		with self.assertRaises(frappe.ValidationError):
			doc.save()
		# client sees the acknowledgment
		as_user(client_user)
		card = portal.dashboard()["returns"][0]
		self.assertEqual(card["step"], 6)
		self.assertEqual(card["iris_acknowledgment_no"], "IRIS-ACK-0001")

	def test_approval_cancelled_after_material_change(self):
		from pakistan_tax_consultancy.api import portal

		res = self.signup("03001110002", "t.client2@example.com", "00000-0000000-2")
		tr = self.new_return(res["client"])
		self.answer_and_upload(res["user"], tr.name)
		self.verify_all(tr.name)
		self.prepare(tr.name)
		self.move(self.consultant, tr.name, "Submit for Review")
		self.review_pass(tr.name)
		as_user(res["user"])
		portal.confirm(tr.name)
		self.move(self.approver, tr.name, "Approve")

		as_user(self.admin)
		doc = frappe.get_doc("Tax Return", tr.name)
		doc.income_sources[0].gross_amount = 1600000
		doc.save()
		doc.reload()
		self.assertEqual(doc.workflow_state, wf.PENDING_REVIEW)
		self.assertEqual(doc.approval_status, "Invalidated")
		self.assertFalse(doc.client_confirmed)
		self.assertFalse(frappe.db.get_value("Tax Approval", {"tax_return": tr.name}, "is_valid"))

	def test_four_eyes_preparer_cannot_approve(self):
		from frappe.model.workflow import has_approval_access

		res = self.signup("03001110003", "t.client3@example.com", "00000-0000000-3")
		tr = self.new_return(res["client"])  # owner = consultant
		t = [x for x in frappe.get_doc("Workflow", "Tax Return Workflow").transitions if x.action == "Approve"][0]
		self.assertFalse(has_approval_access(self.consultant, tr, t))
		self.assertTrue(has_approval_access(self.approver, tr, t))

	def test_client_isolation_and_private_files(self):
		from pakistan_tax_consultancy.api import portal

		a = self.signup("03001110004", "t.client4@example.com", "00000-0000000-4")
		b = self.signup("03001110005", "t.client5@example.com", "00000-0000000-5")
		tr = self.new_return(a["client"])
		self.answer_and_upload(a["user"], tr.name)
		doc_name = frappe.get_all("Tax Document", {"tax_return": tr.name, "status": "Pending"}, pluck="name")[0]

		as_user(b["user"])
		with self.assertRaises(frappe.PermissionError):
			portal.return_detail(tr.name)
		with self.assertRaises(frappe.PermissionError):
			portal.download("Tax Document", doc_name, "file")
		with self.assertRaises(frappe.PermissionError):
			fake_upload()
			portal.upload(doc_name)
		self.assertEqual(frappe.get_list("Tax Return", filters={"name": tr.name}), [])
		self.assertEqual(frappe.get_list("Tax Document", filters={"name": doc_name}), [])
		# internal review records are never visible to clients, even their own
		as_user(a["user"])
		self.assertEqual(frappe.get_list("Tax Calculation"), [])
		portal.download("Tax Document", doc_name, "file")
		self.assertEqual(frappe.local.response.filecontent, PDF)  # byte-for-byte, not decoded
		self.assertTrue(frappe.db.exists("Tax Audit Event", {"reference_name": doc_name, "event_type": "Download"}))

		# a consultant sees only assigned clients
		as_user(self.consultant2)
		self.assertEqual(frappe.get_list("Tax Client", filters={"name": a["client"]}), [])

	def test_upload_rejects_wrong_content(self):
		from pakistan_tax_consultancy.api import portal

		a = self.signup("03001110006", "t.client6@example.com", "00000-0000000-6")
		tr = self.new_return(a["client"])
		as_user(a["user"])
		item = portal.return_detail(tr.name)["checklist"][0]
		fake_upload(content=b"MZ\x90\x00 not a pdf", filename="x.pdf")
		with self.assertRaises(frappe.ValidationError):
			portal.upload(item["name"])

	def test_duplicate_signup_blocked(self):
		self.signup("03001110007", "t.client7@example.com", "00000-0000000-7")
		with self.assertRaises(frappe.ValidationError):
			self.signup("03001110007", "t.client7b@example.com", "00000-0000000-8")

	def test_payment_verification_creates_invoice_and_payment(self):
		from pakistan_tax_consultancy.api import portal, staff

		a = self.signup("03001110009", "t.client9@example.com", "00000-0000000-9")
		as_user(a["user"])
		order = portal.order("Basic Filing", "2026")
		self.assertTrue(order["tax_return"])
		fake_upload(filename="paid.png", content=b"\x89PNG\r\n\x1a\nfake")
		proof = portal.submit_payment(order["engagement"], "Raast", order["net_fee"], "RAAST-123")
		frappe.local.request = None
		with self.assertRaises(frappe.PermissionError):
			staff.verify_payment(proof["name"], "Verified")  # a client cannot verify
		as_user(self.consultant)
		with self.assertRaises(frappe.PermissionError):
			staff.verify_payment(proof["name"], "Verified")  # nor a consultant
		as_user(self.admin)
		res = staff.verify_payment(proof["name"], "Verified")
		self.assertEqual(res["payment_status"], "Paid")
		self.assertEqual(frappe.db.get_value("Sales Invoice", res["sales_invoice"], "outstanding_amount"), 0)
		self.assertEqual(frappe.db.get_value("Payment Entry", res["payment_entry"], "docstatus"), 1)

	def test_work_waits_for_payment_when_configured(self):
		from pakistan_tax_consultancy.api import portal

		frappe.db.set_single_value("Firm Website Settings", "work_before_payment", 0)
		try:
			a = self.signup("03001110010", "t.client10@example.com", "00000-0000001-0")
			as_user(a["user"])
			order = portal.order("Basic Filing", "2026")
			self.answer_and_upload(a["user"], order["tax_return"])
			self.verify_all(order["tax_return"])  # verification succeeds but the return stays waiting
			self.assertEqual(frappe.db.get_value("Tax Return", order["tax_return"], "workflow_state"), wf.DOCUMENTS_PENDING)
		finally:
			frappe.db.set_single_value("Firm Website Settings", "work_before_payment", 1)
