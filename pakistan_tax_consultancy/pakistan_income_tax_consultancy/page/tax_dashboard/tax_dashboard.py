# Copyright (c) 2026, maqmalak and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

# Note: Frappe `Page` documents do not use a Python controller class.
# Page assets (tax_dashboard.js / tax_dashboard.css) are loaded automatically
# by Page.load_assets from this folder based on the page name "tax-dashboard".
# Only the whitelisted API methods below are called from the client script.


@frappe.whitelist()
def get_dashboard_summary():
    """Return summary statistics for the dashboard."""
    user = frappe.session.user
    roles = frappe.get_roles(user)

    # Build filters based on user scope
    filters = {}
    if "Tax Admin" not in roles and "System Manager" not in roles:
        # Consultant/reviewer/etc - need client-based filtering
        pass

    total_returns = frappe.db.count("Tax Return")

    states = ["Draft", "Submitted", "Under Review", "Approved", "Filed", "Rejected"]
    state_counts = {}
    for state in states:
        state_counts[state] = frappe.db.count("Tax Return", {"workflow_state": state})

    total_liability = frappe.db.sql(
        "SELECT COALESCE(SUM(tax_liability), 0) FROM `tabTax Return`"
    )[0][0]

    total_net_payable = frappe.db.sql(
        "SELECT COALESCE(SUM(net_tax_payable), 0) FROM `tabTax Return`"
    )[0][0]

    total_refund_due = frappe.db.sql(
        "SELECT COALESCE(SUM(refund_due), 0) FROM `tabTax Return`"
    )[0][0]

    # Recent filings
    recent = frappe.get_all(
        "Tax Return",
        fields=["name", "tax_client", "client_name", "tax_year", "workflow_state",
                "net_tax_payable", "fbr_submission_status", "creation"],
        order_by="creation desc",
        limit=10,
    )

    return {
        "total_returns": total_returns,
        "state_counts": state_counts,
        "total_liability": flt(total_liability),
        "total_net_payable": flt(total_net_payable),
        "total_refund_due": flt(total_refund_due),
        "recent_filings": recent,
    }


@frappe.whitelist()
def get_status_distribution():
    """Return workflow state distribution for charts."""
    states = ["Draft", "Submitted", "Under Review", "Approved", "Filed", "Rejected"]
    labels = []
    values = []
    for state in states:
        count = frappe.db.count("Tax Return", {"workflow_state": state})
        if count > 0:
            labels.append(state)
            values.append(count)
    return {"labels": labels, "values": values}


@frappe.whitelist()
def get_tax_over_time():
    """Return monthly tax liability trend."""
    rows = frappe.db.sql("""
        SELECT DATE_FORMAT(creation, '%%Y-%%m') as month,
               COALESCE(SUM(tax_liability), 0) as total_liability
        FROM `tabTax Return`
        GROUP BY DATE_FORMAT(creation, '%%Y-%%m')
        ORDER BY month ASC
        LIMIT 12
    """, as_dict=True)
    labels = [r.month for r in rows]
    values = [flt(r.total_liability) for r in rows]
    return {"labels": labels, "values": values}
