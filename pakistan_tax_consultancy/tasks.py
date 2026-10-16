"""Scheduled tasks for the Pakistan Income Tax Consultancy app.

Run via bench scheduler or manually:
    bench --site consultant execute pakistan_tax_consultancy.tasks.send_filing_reminders
"""

import frappe
from frappe import _
from frappe.utils import getdate, add_days, nowdate


def daily():
    """Daily scheduled tasks."""
    send_filing_reminders()


def send_filing_reminders():
    """Email consultants and filing officers about returns due soon or overdue."""
    today = getdate(nowdate())
    # Find Tax Returns due within 7 days or already overdue, not yet Filed
    returns = frappe.get_all(
        "Tax Return",
        filters={
            "workflow_state": ("not in", ("Filed",)),
            "period_to": ("<=", add_days(today, 7)),
        },
        fields=["name", "tax_client", "client_name", "tax_year", "period_to",
                "workflow_state", "assigned_consultant", "filing_officer"],
    )

    for r in returns:
        due_date = getdate(r.period_to) if r.period_to else today
        days_until = (due_date - today).days
        overdue = days_until < 0

        recipients = []
        if r.assigned_consultant:
            user = frappe.db.get_value("User", {"email": r.assigned_consultant}, "name")
            if user:
                recipients.append(user)
        if r.filing_officer:
            user = frappe.db.get_value("User", {"email": r.filing_officer}, "name")
            if user and user not in recipients:
                recipients.append(user)

        if not recipients:
            continue

        subject = _("Overdue Tax Return {0}") if overdue else _("Tax Return Due Soon: {0}")
        subject = subject.format(r.name)

        message = (
            _("Tax Return {0} for client {1} (Year {2}) is ").format(
                r.name, r.client_name, r.tax_year
            )
            + _("overdue by {0} days.").format(abs(days_until))
            if overdue else
            _("due on {0} ({1} days away).").format(due_date.strftime("%d %b %Y"), days_until)
        )
        message += "\nCurrent state: " + (r.workflow_state or "Draft")
        message += "\nPlease log in to ERPNext and complete filing."

        try:
            frappe.sendmail(
                recipients=recipients,
                subject=subject,
                message=message,
                reference_doctype="Tax Return",
                reference_name=r.name,
            )
        except Exception as exc:  # pragma: no cover - email may not be configured
            frappe.log_error(
                message=str(exc),
                title="pakistan_tax_consultancy filing reminder failed",
            )


# Keep old function name for backward compatibility
all = daily
