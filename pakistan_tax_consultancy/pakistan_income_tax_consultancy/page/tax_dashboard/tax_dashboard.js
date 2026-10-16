// Copyright (c) 2026, maqmalak and contributors
// For license information, please see license.txt

frappe.pages['tax-dashboard'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Tax Dashboard'),
        single_column: true,
    });

    // Build HTML structure
    page.main.html(`
        <div class="tax-dashboard">
        <div class="dashboard-summary"></div>
        <div class="dashboard-totals"></div>
        <div class="dashboard-charts">
            <div class="chart-row">
                <div class="chart-box">
                    <h6 class="chart-title">Workflow Status Distribution</h6>
                    <div id="statusChart" class="chart-container"></div>
                </div>
                <div class="chart-box">
                    <h6 class="chart-title">Tax Liability Over Time (PKR)</h6>
                    <div id="taxChart" class="chart-container"></div>
                </div>
            </div>
        </div>
        <div class="dashboard-recent">
            <h5>Recent Filings</h5>
            <table class="table table-bordered recent-filings-table">
                <thead>
                    <tr>
                        <th>Return</th>
                        <th>Client</th>
                        <th>Year</th>
                        <th>Status</th>
                        <th>Net Payable</th>
                        <th>FBR Status</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
        </div>
    `);

    load_summary(page);
    load_charts(page);
    load_recent_filings(page);
};

function load_summary(page) {
    frappe.call({
        method: "pakistan_tax_consultancy.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_dashboard_summary",
        callback: function(r) {
            var d = r.message;
            var $summary = $(".dashboard-summary");
            $summary.empty();

            var cards = [
                {label: __("Total Returns"), value: d.total_returns, color: "blue"},
                {label: __("Documents Pending"), value: d.state_counts["Documents Pending"] || 0, color: "orange"},
                {label: __("In Preparation"), value: (d.state_counts.Draft || 0) + (d.state_counts["Changes Required"] || 0), color: "gray"},
                {label: __("In Review"), value: (d.state_counts["Pending Review"] || 0) + (d.state_counts["Under Review"] || 0) + (d.state_counts.Reviewed || 0), color: "blue"},
                {label: __("Awaiting Client"), value: d.state_counts["Awaiting Client Confirmation"] || 0, color: "orange"},
                {label: __("Approved"), value: d.state_counts.Approved || 0, color: "green"},
                {label: __("Submitted to FBR"), value: d.state_counts["Submitted to FBR"] || 0, color: "blue"},
                {label: __("Acknowledged"), value: (d.state_counts.Acknowledged || 0) + (d.state_counts.Closed || 0), color: "green"},
                {label: __("Filing Errors"), value: d.state_counts["Filing Error"] || 0, color: "red"},
            ];

            cards.forEach(function(c) {
                $summary.append(
                    $('<div class="summary-card">').append(
                        $('<div class="card-label">').text(c.label)
                    ).append(
                        $('<div class="card-value">').text(c.value).css("color", c.color)
                    )
                );
            });

            var $totals = $(".dashboard-totals");
            $totals.empty();
            $totals.append(
                $('<div class="total-item">').append(
                    $('<div class="total-label">').text(__("Total Tax Liability"))
                ).append(
                    $('<div class="total-value">').text(format_currency(d.total_liability))
                )
            );
            $totals.append(
                $('<div class="total-item">').append(
                    $('<div class="total-label">').text(__("Total Net Payable"))
                ).append(
                    $('<div class="total-value">').text(format_currency(d.total_net_payable))
                )
            );
            $totals.append(
                $('<div class="total-item">').append(
                    $('<div class="total-label">').text(__("Total Refund Due"))
                ).append(
                    $('<div class="total-value">').text(format_currency(d.total_refund_due))
                )
            );
        },
    });
}

function load_charts(page) {
    frappe.call({
        method: "pakistan_tax_consultancy.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_status_distribution",
        callback: function(r) {
            var d = r.message;
            if (d.labels.length > 0) {
                frappe.utils.make_chart($("#statusChart")[0], {
                    data: {
                        labels: d.labels,
                        datasets: [{
                            values: d.values,
                        }],
                    },
                    type: "donut",
                    height: 300,
                    colors: [
                        "#6c757d", "#fd7e14", "#0d6efd",
                        "#198754", "#20c997", "#dc3545"
                    ],
                    truncateLegends: 0,
                    maxSlices: 6,
                });
            } else {
                $("#statusChart").html(
                    '<p class="text-muted text-centered">' + __("No data yet") + "</p>"
                );
            }
        },
    });

    frappe.call({
        method: "pakistan_tax_consultancy.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_tax_over_time",
        callback: function(r) {
            var d = r.message;
            if (d.labels.length > 0) {
                frappe.utils.make_chart($("#taxChart")[0], {
                    data: {
                        labels: d.labels,
                        datasets: [{
                            name: __("Tax Liability (PKR)"),
                            values: d.values,
                        }],
                    },
                    type: "bar",
                    height: 300,
                    colors: ["#0d6efd"],
                    truncateLegends: 1,
                    axisOptions: {
                        xIsSeries: 1,
                        shortenYAxisNumbers: 1,
                        numberFormatter: frappe.utils.format_chart_axis_number,
                    },
                    tooltipOptions: {
                        formatTooltipY: function(value) {
                            return format_currency(value);
                        },
                    },
                });
            } else {
                $("#taxChart").html(
                    '<p class="text-muted text-centered">' + __("No data yet") + "</p>"
                );
            }
        },
    });
}

function load_recent_filings(page) {
    frappe.call({
        method: "pakistan_tax_consultancy.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_dashboard_summary",
        callback: function(r) {
            var d = r.message;
            var $table = $(".recent-filings-table tbody");
            $table.empty();

            d.recent_filings.forEach(function(f) {
                var $row = $('<tr>');
                $row.append($('<td>').text(f.name));
                $row.append($('<td>').text(f.client_name || f.tax_client));
                $row.append($('<td>').text(f.tax_year || ""));
                $row.append($('<td>').append(
                    $('<span class="badge">').text(f.workflow_state || "Draft")
                        .addClass(get_badge_class(f.workflow_state))
                ));
                $row.append($('<td>').text(format_currency(f.net_tax_payable || 0)));
                $row.append($('<td>').text(f.fbr_submission_status || ""));
                $table.append($row);
            });
        },
    });
}

function get_badge_class(state) {
    switch (state) {
        case "Draft": return "bg-secondary";
        case "Submitted": return "bg-warning";
        case "Under Review": return "bg-info";
        case "Approved": return "bg-success";
        case "Filed": return "bg-success";
        case "Rejected": return "bg-danger";
        default: return "bg-secondary";
    }
}

function format_currency(value) {
    if (value === null || value === undefined) return "0.00";
    // Delegate to Frappe's global formatter (the local name shadows the
    // global inside this script, so access it via window explicitly).
    return window.format_currency(flt(value), undefined, 2);
}
