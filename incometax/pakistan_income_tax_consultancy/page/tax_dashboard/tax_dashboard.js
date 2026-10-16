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
                <canvas id="statusChart" style="max-height: 300px;"></canvas>
                <canvas id="taxChart" style="max-height: 300px;"></canvas>
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
        method: "incometax.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_dashboard_summary",
        callback: function(r) {
            var d = r.message;
            var $summary = $(".dashboard-summary");
            $summary.empty();

            var cards = [
                {label: __("Total Returns"), value: d.total_returns, color: "blue"},
                {label: __("Draft"), value: d.state_counts.Draft || 0, color: "gray"},
                {label: __("Submitted"), value: d.state_counts.Submitted || 0, color: "orange"},
                {label: __("Under Review"), value: d.state_counts["Under Review"] || 0, color: "blue"},
                {label: __("Approved"), value: d.state_counts.Approved || 0, color: "green"},
                {label: __("Filed"), value: d.state_counts.Filed || 0, color: "green"},
                {label: __("Rejected"), value: d.state_counts.Rejected || 0, color: "red"},
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
        method: "incometax.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_status_distribution",
        callback: function(r) {
            var d = r.message;
            if (d.labels.length > 0) {
                new Chart(document.getElementById("statusChart"), {
                    type: "doughnut",
                    data: {
                        labels: d.labels,
                        datasets: [{
                            data: d.values,
                            backgroundColor: [
                                "#6c757d", "#fd7e14", "#0d6efd",
                                "#198754", "#20c997", "#dc3545"
                            ],
                        }],
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {display: true, text: __('Workflow Status Distribution')},
                            legend: {position: "bottom"},
                        },
                    },
                });
            }
        },
    });

    frappe.call({
        method: "incometax.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_tax_over_time",
        callback: function(r) {
            var d = r.message;
            if (d.labels.length > 0) {
                new Chart(document.getElementById("taxChart"), {
                    type: "bar",
                    data: {
                        labels: d.labels,
                        datasets: [{
                            label: __('Tax Liability (PKR)'),
                            data: d.values,
                            backgroundColor: "#0d6efd",
                        }],
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {display: true, text: __('Tax Liability Over Time')},
                        },
                        scales: {
                            y: {beginAtZero: true},
                        },
                    },
                });
            }
        },
    });
}

function load_recent_filings(page) {
    frappe.call({
        method: "incometax.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_dashboard_summary",
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
    return accounting.format_value(flt(value), { precision: 2 });
}
