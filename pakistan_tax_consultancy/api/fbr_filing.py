"""FBR e-Filing integration for Pakistan Income Tax Consultancy.

Provides a client for submitting Tax Returns to Pakistan's Federal Board
of Revenue (FBR) e-Filing portal, with sandbox and production environments.

All functions are ``@frappe.whitelist()`` so they can be called from the
frontend or REST API.  In sandbox mode the client simulates a successful
submission so the full filing flow can be tested without an official FBR
API connection.
"""

import frappe
from frappe import _
from frappe.utils import now
import requests
import json


# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------

def _get_fbr_settings():
    """Return the Tax Consultancy Settings singleton as a dict."""
    settings = frappe.get_single("Tax Consultancy Settings")
    return {
        "filing_adapter": settings.filing_adapter or "Manual",
        "fbr_api_enabled": bool(settings.fbr_api_enabled),
        "fbr_environment": settings.fbr_environment or "Sandbox",
        "fbr_api_base_url": settings.fbr_api_base_url or "",
        "fbr_api_username": settings.fbr_api_username or "",
        "fbr_api_password": settings.fbr_api_password or "",
    }


def _require_fbr_configured():
    """Raise if FBR API is not enabled / configured."""
    s = _get_fbr_settings()
    if s["filing_adapter"] != "FBR API":
        frappe.throw(
            _("FBR e-Filing is not enabled. Set Filing Adapter to 'FBR API' in Tax Consultancy Settings."),
            frappe.PermissionError,
        )
    if not s["fbr_api_enabled"]:
        frappe.throw(
            _("FBR API is locked. Enable it in Tax Consultancy Settings after verifying an official FBR API connection."),
            frappe.PermissionError,
        )
    if not s["fbr_api_base_url"]:
        frappe.throw(_("FBR API Base URL is required."))
    return s


# ---------------------------------------------------------------------------
# FBR client
# ---------------------------------------------------------------------------

class FBRFilingClient:
    """Thin client around the FBR e-Filing API."""

    def __init__(self, settings):
        self.settings = settings
        self.environment = settings["fbr_environment"]
        self.base_url = settings["fbr_api_base_url"].rstrip("/")
        self.username = settings["fbr_api_username"]
        self.password = settings["fbr_api_password"]
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )

    def _auth_headers(self):
        if self.username and self.password:
            import base64
            token = base64.b64encode(
                f"{self.username}:{self.password}".encode()
            ).decode()
            return {"Authorization": f"Basic {token}"}
        return {}

    def submit(self, return_data):
        """Submit a tax return to FBR."""
        if self.environment == "Sandbox":
            return self._sandbox_submit(return_data)
        url = f"{self.base_url}/api/v1/returns/submit"
        headers = self._auth_headers()
        try:
            resp = self.session.post(
                url, headers=headers, data=json.dumps(return_data), timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "submission_id": data.get("submission_id") or data.get("id"),
                "acknowledgment_number": data.get("acknowledgment_number"),
                "status": data.get("status", "Submitted"),
                "received_at": now(),
                "raw_response": data,
            }
        except requests.RequestException as exc:
            frappe.throw(
                _("FBR submission failed: {0}").format(str(exc)),
                frappe.ValidationError,
            )

    def _sandbox_submit(self, return_data):
        import random
        import string
        submission_id = "FBR-SANDBOX-" + "".join(
            random.choices(string.ascii_uppercase + string.digits, k=10)
        )
        acknowledgment = "ACK-" + "".join(
            random.choices(string.ascii_uppercase + string.digits, k=12)
        )
        return {
            "submission_id": submission_id,
            "acknowledgment_number": acknowledgment,
            "status": "Submitted",
            "received_at": now(),
            "raw_response": {
                "message": "Sandbox simulation – return accepted",
                "submission_id": submission_id,
                "acknowledgment_number": acknowledgment,
            },
        }

    def check_status(self, submission_id):
        """Poll FBR for the status of a submission."""
        if self.environment == "Sandbox":
            return self._sandbox_status(submission_id)
        url = f"{self.base_url}/api/v1/returns/{submission_id}/status"
        headers = self._auth_headers()
        try:
            resp = self.session.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            return {
                "status": data.get("status", "Unknown"),
                "acknowledgment_number": data.get("acknowledgment_number"),
                "filed_at": data.get("filed_at"),
                "raw_response": data,
            }
        except requests.RequestException as exc:
            frappe.throw(
                _("FBR status check failed: {0}").format(str(exc)),
                frappe.ValidationError,
            )

    def _sandbox_status(self, submission_id):
        return {
            "status": "Filed",
            "acknowledgment_number": submission_id,
            "filed_at": now(),
            "raw_response": {"message": "Sandbox simulation – return filed"},
        }


# ---------------------------------------------------------------------------
# Whitelisted API methods
# ---------------------------------------------------------------------------

@frappe.whitelist()
def file_return_to_fbr(tax_return):
    """Submit an Approved Tax Return to FBR."""
    doc = frappe.get_doc("Tax Return", tax_return)

    if doc.workflow_state != "Approved":
        frappe.throw(
            _("Only Approved returns can be filed to FBR. Current state: {0}").format(
                doc.workflow_state or "Draft"
            )
        )

    if not doc.latest_calculation:
        frappe.throw(_("A Tax Calculation is required before filing."))

    settings = _require_fbr_configured()
    client = FBRFilingClient(settings)

    calc_name = doc.latest_calculation
    calc = frappe.get_doc("Tax Calculation", calc_name) if calc_name else None

    return_data = {
        "tax_return": doc.name,
        "tax_client": doc.tax_client,
        "client_name": doc.client_name,
        "tax_year": doc.tax_year,
        "return_type": doc.return_type,
        "taxpayer_type": doc.taxpayer_type,
        "period_from": doc.period_from,
        "period_to": doc.period_to,
        "total_income": flt(doc.total_income),
        "total_deductions": flt(doc.total_deductions),
        "taxable_income": flt(doc.taxable_income),
        "tax_liability": flt(doc.tax_liability),
        "net_tax_payable": flt(doc.net_tax_payable),
        "refund_due": flt(doc.refund_due),
        "submitted_on": now(),
        "submitted_by": frappe.session.user,
    }
    if calc:
        return_data["calculation"] = {
            "name": calc.name,
            "version": calc.calculation_version,
            "tax_on_taxable_income": flt(calc.tax_on_taxable_income),
            "total_tax_credits": flt(calc.total_tax_credits),
            "tax_already_paid": flt(calc.tax_already_paid),
            "net_payable": flt(calc.net_payable),
        }

    result = client.submit(return_data)

    doc.fbr_submission_status = result["status"]
    doc.iris_acknowledgment_no = result.get("acknowledgment_number")
    doc.submission_timestamp = result.get("received_at") or now()
    if result.get("raw_response"):
        doc.filing_error_notes = ""
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "submission_id": result["submission_id"],
        "acknowledgment_number": result.get("acknowledgment_number"),
        "status": result["status"],
        "received_at": result.get("received_at"),
    }


@frappe.whitelist()
def check_filing_status(tax_return):
    """Poll FBR for the latest filing status of a Tax Return."""
    doc = frappe.get_doc("Tax Return", tax_return)

    if not doc.iris_acknowledgment_no and not doc.fbr_submission_status:
        frappe.throw(_("This return has not been filed to FBR yet."))

    settings = _require_fbr_configured()
    client = FBRFilingClient(settings)

    submission_id = doc.iris_acknowledgment_no or doc.fbr_submission_status
    result = client.check_status(submission_id)

    doc.fbr_submission_status = result["status"]
    if result.get("acknowledgment_number"):
        doc.iris_acknowledgment_no = result["acknowledgment_number"]
    if result.get("filed_at"):
        doc.submission_timestamp = result["filed_at"]
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    return {
        "status": result["status"],
        "acknowledgment_number": result.get("acknowledgment_number"),
        "filed_at": result.get("filed_at"),
    }


@frappe.whitelist()
def get_fbr_settings_status():
    """Return whether FBR e-Filing is enabled and configured."""
    s = _get_fbr_settings()
    return {
        "filing_adapter": s["filing_adapter"],
        "fbr_api_enabled": s["fbr_api_enabled"],
        "fbr_environment": s["fbr_environment"],
        "is_configured": bool(
            s["filing_adapter"] == "FBR API"
            and s["fbr_api_enabled"]
            and s["fbr_api_base_url"]
        ),
    }


from frappe.utils import flt  # noqa: E402