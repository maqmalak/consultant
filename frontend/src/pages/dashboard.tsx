import { useFrappeGetCall } from "frappe-react-sdk";
import { Link } from "react-router-dom";
import { Users, FileText, ClipboardCheck, BadgeCheck, Send, AlertTriangle, LayoutDashboard, RefreshCw, Wallet, Receipt, Undo2 } from "lucide-react";
import type { DashboardSummary, RecentFiling } from "@/types";
import { formatCurrency, formatDate, unwrap } from "@/lib/format";
import { Badge, stateVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard, STAT_TONES } from "@/components/common/stat-card";
import { ChartCard } from "@/components/charts/chart-card";
import { BarGauge, DonutChart } from "@/components/charts/charts";
import { STATUS_TONE } from "@/components/analytics/kit";
import { Spinner } from "@/components/ui/spinner";
import { EmptyRow, Table, TD, TH, TR } from "@/components/ui/table";
import { humanizeError } from "@/services/frappe";

const SUMMARY_METHOD =
  "pakistan_tax_consultancy.pakistan_income_tax_consultancy.page.tax_dashboard.tax_dashboard.get_dashboard_summary";

interface Stat {
  label: string;
  value: number | undefined;
  icon: typeof Users;
  tone: keyof typeof STAT_TONES;
}

function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
      {stats.map((s) => (
        <StatCard key={s.label} label={s.label} value={s.value ?? "—"} icon={<s.icon className="h-4 w-4" />} tone={s.tone} />
      ))}
    </div>
  );
}

function RecentReturns({ rows }: { rows: RecentFiling[] }) {
  return (
    <Card className="overflow-hidden lg:col-span-3">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Recent returns</CardTitle>
        <Link to="/returns" className="text-xs font-medium text-primary hover:underline">
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
                  <TD className="font-medium text-foreground">{r.client_name || r.tax_client}</TD>
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
    { label: "Active clients", value: clientCount, icon: Users, tone: "primary" },
    { label: "Total returns", value: summary?.total_returns, icon: FileText, tone: "sky" },
    { label: "Awaiting review", value: counts["Submitted"], icon: ClipboardCheck, tone: "amber" },
    { label: "Under review", value: counts["Under Review"], icon: ClipboardCheck, tone: "indigo" },
    { label: "Approved for filing", value: counts["Approved"], icon: BadgeCheck, tone: "teal" },
    { label: "Filed", value: counts["Filed"], icon: Send, tone: "emerald" },
    { label: "Rejected / errors", value: counts["Rejected"], icon: AlertTriangle, tone: "rose" },
  ];

  const money = [
    { label: "Total tax liability", value: summary?.total_liability, icon: Receipt, tone: "indigo" as const },
    { label: "Net payable", value: summary?.total_net_payable, icon: Wallet, tone: "amber" as const },
    { label: "Refund due", value: summary?.total_refund_due, icon: Undo2, tone: "emerald" as const },
  ];

  const distribution = Object.entries(counts)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([state, v]) => ({ label: state, value: v ?? 0, color: STATUS_TONE[state] }));

  if (summaryError) {
    return (
      <div className="page-container">
        <PageHeader title="Management Dashboard" />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
        icon={<LayoutDashboard className="h-5 w-5" />}
        actions={
          <Button variant="outline" size="default" onClick={() => void mutate()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-primary" />
        </div>
      ) : (
        <>
          <StatCards stats={stats} />

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {money.map((m) => (
              <StatCard key={m.label} label={m.label} value={formatCurrency(m.value)} icon={<m.icon className="h-4 w-4" />} tone={m.tone} />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <ChartCard title="Returns by workflow state" subtitle="Share of all returns" className="lg:col-span-2">
              {distribution.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No returns yet.</p>
              ) : (
                <div className="space-y-5">
                  <DonutChart data={distribution} height={240} />
                  <BarGauge data={distribution} format={(v) => String(v)} />
                </div>
              )}
            </ChartCard>

            <RecentReturns rows={summary?.recent_filings ?? []} />
          </div>
        </>
      )}
    </div>
  );
}

