import { BarChart3, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const REPORTS: [string, string][] = [
  ["Client Master", "Every client with identifiers (masked), type, consultant and portal status"],
  ["Site Visits and Follow-ups", "Field visits by status, officer and follow-up date"],
  ["Missing Documents", "Required documents not yet uploaded or rejected, by client"],
  ["Returns by Status", "Returns per tax year and workflow state"],
  ["Review and Approval Aging", "Days each return has spent waiting for review / approval"],
  ["Consultant Workload", "Open returns per consultant and state"],
  ["Filing Status and Errors", "Filing records, acknowledgments and errors"],
  ["Tax Payable and Refund Summary", "Liability, payable and refunds per tax year"],
  ["Fees and Collections", "Engagement fees, invoices, payments and outstanding"],
  ["Consultation Requests Report", "Website bookings by status and service"],
];

/** Reports run in the ERPNext desk (permission-controlled, with CSV / Excel export there). */
export function ReportsPage() {
  return (
    <div className="page-container">
      <PageHeader title="Reports" subtitle="Open in the desk to filter and export to CSV / Excel" icon={<BarChart3 className="h-5 w-5" />} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(([name, hint]) => (
          <a key={name} href={`/app/query-report/${encodeURIComponent(name)}`} target="_blank" rel="noopener" className="block">
            <Card className="h-full p-4 hover-lift">
              <p className="flex items-center justify-between gap-2 font-semibold">{name} <ExternalLink className="h-4 w-4 text-muted-foreground" /></p>
              <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
