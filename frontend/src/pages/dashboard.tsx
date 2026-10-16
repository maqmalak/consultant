import { useFrappeGetCall } from "frappe-react-sdk";
import { Link } from "react-router-dom";
import { Users, FileText, ClipboardCheck, BadgeCheck, Send, AlertTriangle } from "lucide-react";
import type { DashboardSummary, RecentFiling } from "@/types";
import { formatCurrency, formatDate, unwrap } from "@/lib/format";
import { Badge, stateVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyRow, Table, TD, TH, TR } from "@/components/ui/table";
import { humanizeError } from "@/services/frappe";

const SUMMARY_METHOD =
  "incometax.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_dashboard_summary";

interface Stat {
  label: string;
  value: number | undefined;
  icon: typeof Users;
  hint?: string;
}

function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <s.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-500">{s.label}</p>
              <p className="text-lg font-semibold text-slate-900">{s.value ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentReturns({ rows }: { rows: RecentFiling[] }) {
  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Recent returns</CardTitle>
        <Link to="/returns" className="text-xs font-medium text-brand-700 hover:underline">
          View all
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="border-0 shadow-none">
          <thead>
            <tr>
              <TH>Client</TH>
              <TH>Year</TH>
              <TH>State</TH>
              <TH className="text-right">Payable</TH>
              <TH>Updated</TH>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={5} message="No returns created yet." />
            ) : (
              rows.map((r) => (
                <TR key={r.name}>
                  <TD className="font-medium text-slate-900">{r.client_name || r.tax_client}</TD>
                  <TD>{r.tax_year || "—"}</TD>
                  <TD>
                    <Badge variant={stateVariant(r.workflow_state)}>
                      {r.workflow_state || "—"}
                    </Badge>
                  </TD>
                  <TD className="text-right">{formatCurrency(r.net_tax_payable)}</TD>
                  <TD>{formatDate(r.creation)}</TD>
                </TR>
              ))
            )}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  const {
    data: summaryData,
    error: summaryError,
    isLoading,
    mutate,
  } = useFrappeGetCall<DashboardSummary>(SUMMARY_METHOD, undefined, "itax.dashboard.summary");

  const { data: clientCountData } = useFrappeGetCall<number>(
    "frappe.client.get_count",
    { doctype: "Tax Client" },
    "itax.count.tax_client",
  );

  const summary = unwrap<DashboardSummary>(summaryData);
  const clientCount = unwrap<number>(clientCountData);
  const counts = summary?.state_counts ?? {};

  const stats: Stat[] = [
    { label: "Active clients", value: clientCount, icon: Users, hint: "All Tax Client records" },
    { label: "Total returns", value: summary?.total_returns, icon: FileText },
    { label: "Awaiting review", value: counts["Submitted"], icon: ClipboardCheck },
    { label: "Under review", value: counts["Under Review"], icon: ClipboardCheck },
    { label: "Approved for filing", value: counts["Approved"], icon: BadgeCheck },
    { label: "Filed", value: counts["Filed"], icon: Send },
    { label: "Rejected / errors", value: counts["Rejected"], icon: AlertTriangle },
  ];

  const money = [
    { label: "Total tax liability", value: summary?.total_liability },
    { label: "Net payable", value: summary?.total_net_payable },
    { label: "Refund due", value: summary?.total_refund_due },
  ];

  const distribution = Object.entries(counts).filter(([, v]) => (v ?? 0) > 0);
  const maxCount = Math.max(1, ...distribution.map(([, v]) => v ?? 0));

  if (summaryError) {
    return (
      <div className="page-container">
        <PageHeader title="Management Dashboard" />
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {humanizeError(summaryError)}{" "}
          <button className="underline" onClick={() => void mutate()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Management Dashboard"
        subtitle="Live server-side aggregates across clients, returns and filing status"
        actions={
          <button
            onClick={() => void mutate()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : (
        <>
          <StatCards stats={stats} />

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {money.map((m) => (
              <Card key={m.label}>
                <CardContent>
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">
                    {formatCurrency(m.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Workflow distribution */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Returns by workflow state</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {distribution.length === 0 ? (
                  <p className="text-sm text-slate-400">No returns yet.</p>
                ) : (
                  distribution.map(([state, count]) => (
                    <div key={state}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-slate-600">{state}</span>
                        <span className="font-medium text-slate-800">{count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-brand-500"
                          style={{ width: `${Math.round(((count ?? 0) / maxCount) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <RecentReturns rows={summary?.recent_filings ?? []} />
          </div>
        </>
      )}
    </div>
  );
}

