"""Workflow state transitions for Tax Return and related DocTypes.

Defines role-gated state machine:

    Draft -> Submitted -> Under Review -> Approved -> Filed

Transitions are enforced here (server-side) so the frontend cannot
bypass them via direct writes.
"""

import frappe
from frappe import _
from frappe.utils import now


# Valid transitions: current_state -> list of allowed next states
VALID_TRANSITIONS = {
    "Draft": ["Submitted"],
    "Submitted": ["Under Review"],
    "Under Review": ["Approved", "Rejected"],
    "Rejected": ["Draft"],
    "Approved": ["Filed"],
    "Filed": [],
}

# Role required to perform each transition
TRANSITION_ROLES = {
    "Draft -> Submitted": {"Tax Consultant", "Tax Consultant Admin"},
    "Submitted -> Under Review": {"Tax Consultant", "Tax Consultant Admin"},
    "Under Review -> Approved": {"Tax Reviewer", "Tax Consultant Admin"},
    "Under Review -> Rejected": {"Tax Reviewer", "Tax Consultant Admin"},
    "Rejected -> Draft": {"Tax Consultant", "Tax Consultant Admin"},
    "Approved -> Filed": {"Filing Officer", "Tax Consultant Admin"},
}


def _require_transition(current, target):
    allowed = VALID_TRANSITIONS.get(current, [])
    if target not in allowed:
        frappe.throw(
            _("Invalid transition from {0} to {1}").format(current, target),
            frappe.ValidationError,
        )


def _require_role(current, target):
    key = "{} -> {}".format(current, target)
    required = TRANSITION_ROLES.get(key, set())
    if not required:
        return
    user_roles = set(frappe.get_roles())
    if not (user_roles & required):
        frappe.throw(
            _("You do not have permission to move {0} to {1}").format(current, target),
            frappe.PermissionError,
        )


@frappe.whitelist()
def transition_tax_return(tax_return, target_state, comments=None):
    """Advance a Tax Return through the workflow.

    Parameters
    ----------
    tax_return : str
        Name of the Tax Return document.
    target_state : str
        Desired next workflow_state.
    comments : str | None
        Optional comment recorded on the transition.
    """
    doc = frappe.get_doc("Tax Return", tax_return)
    current = doc.workflow_state or "Draft"

    from pakistan_tax_consultancy.permissions import get_scope, can_access_client
    scope = get_scope()
    if scope not in ("all", "consultant", "reviewer", "approver", "filing officer"):
        frappe.throw(_("Insufficient role for workflow transition."), frappe.PermissionError)

    _require_transition(current, target_state)
    _require_role(current, target_state)

    # Scope checks
    if scope == "consultant" and not can_access_client(doc.tax_client):
        frappe.throw(_("You cannot access client {0}").format(doc.tax_client), frappe.PermissionError)

    # State-specific requirements
    if target_state == "Submitted":
        if not doc.tax_client or not doc.tax_year:
            frappe.throw(_("Tax Client and Tax Year are required before submitting."))
        # Must have at least one calculation
        if not frappe.db.exists("Tax Calculation", {"tax_return": doc.name}):
            frappe.throw(_("Calculate tax before submitting the return."))
    if target_state == "Approved":
        if not frappe.db.exists("Tax Review", {"tax_return": doc.name}):
            frappe.throw(_("Tax Return must be reviewed before approval."))
    if target_state == "Filed":
        if not doc.latest_calculation:
            frappe.throw(_("A Tax Calculation is required before filing."))

    doc.workflow_state = target_state
    if comments:
        doc.review_comments = (doc.review_comments or "") + "\n[" + now() + "] " + comments
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    # Log an approval/review record when appropriate
    if target_state == "Approved":
        frappe.get_doc({
            "doctype": "Tax Approval",
            "tax_return": doc.name,
            "tax_client": doc.tax_client,
            "client_name": doc.client_name,
            "approver": frappe.session.user,
            "decision": "Approved",
            "approval_timestamp": now(),
        }).insert(ignore_permissions=True)
        frappe.db.commit()

    # Auto-submit to FBR when filing if FBR API is configured
    if target_state == "Filed":
        settings = frappe.get_single("Tax Consultancy Settings")
        if (settings.filing_adapter == "FBR API"
                and settings.fbr_api_enabled
                and settings.fbr_api_base_url):
            from pakistan_tax_consultancy.api.fbr_filing import file_return_to_fbr
            file_return_to_fbr(doc.name)

    return doc.as_dict()


@frappe.whitelist()
def get_workflow_state(tax_return):
    """Return the current workflow_state of a Tax Return."""
    doc = frappe.get_doc("Tax Return", tax_return)
    return {"workflow_state": doc.workflow_state or "Draft"}
