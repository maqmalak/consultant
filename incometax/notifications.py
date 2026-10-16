# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

"""Email notifications for Tax Return workflow state changes."""

import frappe
from frappe import _


def notify_workflow_state_change(doc, method=None):
    """Send email notification when a Tax Return workflow_state changes.

    Connected to Tax Return ``on_update`` via hooks.py doc_events.
    """
    if not doc.get("__islocal") and doc.doctype == "Tax Return":
        previous = doc.get_doc_before_save()
        if not previous:
            return

        old_state = previous.workflow_state or "Draft"
        new_state = doc.workflow_state or "Draft"

        if old_state == new_state:
            return

        # Determine recipients based on roles
        recipients = _get_notification_recipients(new_state, doc)

        if not recipients:
            return

        subject = _("Tax Return {0} moved to {1}").format(doc.name, new_state)
        message = _(
            "Tax Return <b>{0}</b> for client <b>{1}</b> has moved from "
            "<b>{2}</b> to <b>{3}</b>.<br><br>"
            "Tax Year: {4}<br>"
            "Net Payable: {5}<br><br>"
            "Please log in to the portal to review."
        ).format(
            doc.name,
            doc.client_name or doc.tax_client,
            old_state,
            new_state,
            doc.tax_year or "",
            frappe.format(doc.net_tax_payable or 0, {"dict": None, "currency": "PKR"}) or "0",
        )

        frappe.sendmail(
            recipients=recipients,
            subject=subject,
            message=message,
            reference_doctype=doc.doctype,
            reference_name=doc.name,
        )


def _get_notification_recipients(new_state, doc):
    """Return email addresses to notify for a given workflow state."""
    recipients = set()

    # Always notify the assigned consultant
    if doc.assigned_consultant:
        email = frappe.db.get_value("User", doc.assigned_consultant, "email")
        if email:
            recipients.add(email)

    # Notify reviewer/approver on review-related states
    if new_state in ("Under Review", "Approved", "Rejected"):
        if doc.reviewer:
            email = frappe.db.get_value("User", doc.reviewer, "email")
            if email:
                recipients.add(email)
        if doc.approver:
            email = frappe.db.get_value("User", doc.approver, "email")
            if email:
                recipients.add(email)

    # Notify filing officer on Filed
    if new_state == "Filed" and doc.filing_officer:
        email = frappe.db.get_value("User", doc.filing_officer, "email")
        if email:
            recipients.add(email)

    # Notify System Managers for all state changes
    managers = frappe.get_all(
        "Has Role",
        filters={"role": "System Manager", "parenttype": "User"},
        fields=["parent"],
    )
    for m in managers:
        email = frappe.db.get_value("User", m.parent, "email")
        if email:
            recipients.add(email)

    return list(recipients)