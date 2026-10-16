# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

"""Unit tests for FBR e-Filing integration (sandbox mode)."""

import frappe
from frappe.tests import UnitTestCase

from incometax.api.fbr_filing import (
    FBRFilingClient,
    _get_fbr_settings,
    _require_fbr_configured,
)


class TestFBRFilingClient(UnitTestCase):
    """Tests for the FBRFilingClient in sandbox mode."""

    def setUp(self):
        self.settings = {
            "filing_adapter": "FBR API",
            "fbr_api_enabled": 1,
            "fbr_environment": "Sandbox",
            "fbr_api_base_url": "https://sandbox.fbr.gov.pk/api",
            "fbr_api_username": "test_user",
            "fbr_api_password": "test_pass",
        }

    def test_client_initialization(self):
        client = FBRFilingClient(self.settings)
        self.assertEqual(client.environment, "Sandbox")
        self.assertEqual(client.base_url, "https://sandbox.fbr.gov.pk/api")
        self.assertIsNotNone(client.session)

    def test_sandbox_submit(self):
        client = FBRFilingClient(self.settings)
        return_data = {
            "tax_return": "TAX-RET-00001",
            "tax_client": "TC-00001",
            "total_income": 1000000,
            "tax_liability": 50000,
        }
        result = client.submit(return_data)

        self.assertIn("submission_id", result)
        self.assertIn("acknowledgment_number", result)
        self.assertEqual(result["status"], "Submitted")
        self.assertTrue(result["submission_id"].startswith("FBR-SANDBOX-"))
        self.assertTrue(result["acknowledgment_number"].startswith("ACK-"))

    def test_sandbox_check_status(self):
        client = FBRFilingClient(self.settings)
        result = client.check_status("FBR-SANDBOX-ABCDE12345")

        self.assertEqual(result["status"], "Filed")
        self.assertEqual(result["acknowledgment_number"], "FBR-SANDBOX-ABCDE12345")

    def test_require_fbr_configured_manual(self):
        original = frappe.get_single
        frappe.get_single = lambda dt: type(
            "S", (), {"filing_adapter": "Manual", "fbr_api_enabled": 0,
                      "fbr_environment": "Sandbox",
                      "fbr_api_base_url": "", "fbr_api_username": "",
                      "fbr_api_password": ""}
        )()
        try:
            with self.assertRaises(frappe.PermissionError):
                _require_fbr_configured()
        finally:
            frappe.get_single = original

    def test_require_fbr_configured_enabled(self):
        original = frappe.get_single
        frappe.get_single = lambda dt: type(
            "S", (), {"filing_adapter": "FBR API", "fbr_api_enabled": 1,
                      "fbr_environment": "Sandbox",
                      "fbr_api_base_url": "https://sandbox.fbr.gov.pk/api",
                      "fbr_api_username": "u", "fbr_api_password": "p"}
        )()
        try:
            result = _require_fbr_configured()
            self.assertEqual(result["filing_adapter"], "FBR API")
            self.assertTrue(result["fbr_api_enabled"])
        finally:
            frappe.get_single = original


class TestFBRSettingsStatus(UnitTestCase):
    """Tests for get_fbr_settings_status."""

    def test_returns_settings_dict(self):
        result = frappe.call("incometax.api.fbr_filing.get_fbr_settings_status")
        self.assertIn("filing_adapter", result)
        self.assertIn("fbr_api_enabled", result)
        self.assertIn("fbr_environment", result)
        self.assertIn("is_configured", result)
        self.assertIsInstance(result["is_configured"], bool)


class TestFBRFileReturnToFBRValidation(UnitTestCase):
    """Validation tests for file_return_to_fbr."""

    def test_requires_existing_tax_return(self):
        """file_return_to_fbr should raise for non-existent return."""
        with self.assertRaises(frappe.DoesNotExistError):
            frappe.call(
                "incometax.api.fbr_filing.file_return_to_fbr",
                tax_return="NONEXISTENT-001",
            )


class TestFBRCheckFilingStatusValidation(UnitTestCase):
    """Validation tests for check_filing_status."""

    def test_requires_existing_tax_return(self):
        """check_filing_status should raise for non-existent return."""
        with self.assertRaises(frappe.DoesNotExistError):
            frappe.call(
                "incometax.api.fbr_filing.check_filing_status",
                tax_return="NONEXISTENT-001",
            )
