import { AlarmClock, BadgeCheck, BadgeDollarSign, CalendarClock, ClipboardCheck, FileCheck2, FileText, LayoutDashboard, MapPin, MessageCircle, PhoneCall, ShieldCheck, RefreshCw, Send, Undo2, Upload, UserPlus, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { ChartCard } from "@/components/charts/chart-card";
import { BarGauge, DonutChart } from "@/components/charts/charts";
import { STATUS_TONE } from "@/components/analytics/kit";
import { StatCard } from "@/components/common/stat-card";
import { QuickActions, type QuickAction } from "@/components/common/quick-actions";
import { useAuth } from "@/hooks/useAuth";
import { StateBadge } from "@/components/common/state-badge";
import { ErrorState, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { M } from "@/lib/api";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface Dash {
  by_state: { state: string; count: number }[];
  total_returns: number;
  clients: number;
  documents_to_verify: number;
  followups_due: number;
  overdue: number;
  payments_to_verify: number;
  consultations_new: number;
  collected_this_month: number;
  total_payable: number;
  total_refund: number;
  workload: { user: string; name: string; count: number }[];
  recent: { name: string; client_name: string; tax_year: string; workflow_state: string; net_tax_payable: number; modified: string }[];
}

export function StaffDashboard() {
  const { data, error, isLoading, mutate } = useApi<Dash>(`${M.STAFF}.dashboard`);
  const { hasRole } = useAuth();
  const wa = useApi<Record<string, number>>(hasRole("Tax Admin", "Tax Consultant", "Tax Reviewer", "Field Officer", "System Manager") ? "pakistan_tax_consultancy.api.whatsapp.get_counts" : null, undefined, { refreshInterval: 30_000 });
  const prep = hasRole("Tax Admin", "Tax Consultant", "System Manager");
  const n = (state: string) => data?.by_state.find((s) => s.state === state)?.count ?? 0;
  const actions: (QuickAction | false)[] = [
    prep && { label: "New client", hint: "Office registration", icon: UserPlus, to: "/staff/clients/new" },
    hasRole("Tax Admin", "Tax Consultant", "Field Officer", "System Manager") && { label: "New site visit", hint: "Field lead", icon: MapPin, to: "/staff/visits/new", tone: "amber" },
    prep && { label: "Verify documents", hint: "Uploads to check", icon: FileCheck2, to: "/staff/queue/documents", tone: "sky", badge: data?.documents_to_verify || null },
    hasRole("Tax Reviewer", "Tax Admin", "System Manager") && { label: "Review queue", hint: "Ready for review", icon: ClipboardCheck, to: "/staff/queue/review", tone: "violet", badge: n("Pending Review") + n("Under Review") || null },
    hasRole("Tax Approver", "Tax Admin", "System Manager") && { label: "Approve", hint: "Client confirmed", icon: BadgeCheck, to: "/staff/queue/approval", tone: "emerald" },
    hasRole("Filing Officer", "Tax Admin", "System Manager") && { label: "File on IRIS", hint: "Approved returns", icon: Send, to: "/staff/queue/filing", tone: "primary", badge: n("Approved") || null },
    hasRole("Tax Admin", "System Manager") && { label: "Verify payments", hint: "Proofs to match", icon: Wallet, to: "/staff/payments", tone: "emerald", badge: data?.payments_to_verify || null },
    prep && { label: "Consultations", hint: "Website bookings", icon: PhoneCall, to: "/staff/consultations", tone: "rose", badge: data?.consultations_new || null },
    !!wa.data && { label: "WhatsApp inbox", hint: `${wa.data.mine ?? 0} mine · ${wa.data.unassigned ?? 0} unassigned`, icon: MessageCircle, to: "/staff/inbox", tone: "whatsapp", badge: wa.data.unread || null },
    { label: "Document vault", hint: "Files · generate letters", icon: ShieldCheck, to: "/staff/vault", tone: "amber" },
    prep && { label: "Import clients", hint: "CSV", icon: Upload, to: "/staff/import", tone: "slate" },
  ];
  return (
    <div className="page-container">
      <PageHeader title="Dashboard" subtitle="Your clients, returns and queues — scoped to what you may see"
        icon={<LayoutDashboard className="h-5 w-5" />}
        actions={<Button variant="outline" size="default" onClick={() => void mutate()}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && (
        <div className="space-y-6">
          <QuickActions actions={actions.filter((a): a is QuickAction => !!a)} />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Link to="/staff/clients" className="block rounded-lg transition hover:-translate-y-0.5"><StatCard label="Clients" value={data.clients} icon={<Users className="h-4 w-4" />} tone="primary" /></Link>
            <Link to="/staff/returns" className="block rounded-lg transition hover:-translate-y-0.5"><StatCard label="Returns" value={data.total_returns} icon={<FileText className="h-4 w-4" />} tone="sky" /></Link>
            <Link to="/staff/queue/documents" className="block rounded-lg transition hover:-translate-y-0.5"><StatCard label="Documents to verify" value={data.documents_to_verify} icon={<FileCheck2 className="h-4 w-4" />} tone="amber" /></Link>
            <StatCard label="Overdue returns" value={data.overdue} icon={<AlarmClock className="h-4 w-4" />} tone="rose" />
            <Link to="/staff/visits" className="block rounded-lg transition hover:-translate-y-0.5"><StatCard label="Follow-ups due" value={data.followups_due} icon={<CalendarClock className="h-4 w-4" />} tone="indigo" /></Link>
            <Link to="/staff/payments" className="block rounded-lg transition hover:-translate-y-0.5"><StatCard label="Payments to verify" value={data.payments_to_verify} icon={<Wallet className="h-4 w-4" />} tone="teal" /></Link>
            <Link to="/staff/consultations" className="block rounded-lg transition hover:-translate-y-0.5"><StatCard label="New consultations" value={data.consultations_new} icon={<PhoneCall className="h-4 w-4" />} tone="slate" /></Link>
            <StatCard label="Collected this month" value={money(data.collected_this_month, { compact: true })} icon={<BadgeDollarSign className="h-4 w-4" />} tone="emerald" />
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <ChartCard title="Returns by status" subtitle={`${money(data.total_payable, { compact: true })} payable · ${money(data.total_refund, { compact: true })} refunds`} className="lg:col-span-2">
              {data.total_returns ? (
                <DonutChart data={data.by_state.filter((s) => s.count).map((s) => ({ label: s.state, value: s.count, color: STATUS_TONE[s.state] }))} height={280} />
              ) : <p className="py-10 text-center text-sm text-muted-foreground">No returns yet.</p>}
            </ChartCard>
            <ChartCard title="Consultant workload" subtitle="Open returns per consultant" className="lg:col-span-3">
              {data.workload.length ? <BarGauge data={data.workload.map((w) => ({ label: w.name, value: w.count }))} format={(v) => String(v)} />
                : <p className="py-10 text-center text-sm text-muted-foreground">Nothing open.</p>}
            </ChartCard>
          </div>
          <ChartCard title="Recently updated returns" subtitle="Last 8">
            <Table>
              <thead><tr><TH>Return</TH><TH>Client</TH><TH>Year</TH><TH>Status</TH><TH className="text-end">Payable</TH></tr></thead>
              <tbody>
                {data.recent.map((r) => (
                  <TR key={r.name}>
                    <TD><Link className="font-medium text-primary hover:underline" to={`/staff/returns/${r.name}`}>{r.name}</Link></TD>
                    <TD>{r.client_name}</TD><TD>{r.tax_year}</TD><TD><StateBadge state={r.workflow_state} /></TD>
                    <TD className="text-end tabular-nums">{money(r.net_tax_payable)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </ChartCard>
          {data.total_refund > 0 && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Undo2 className="h-3.5 w-3.5" /> Refund figures are estimates until FBR processes them.</p>}
        </div>
      )}
    </div>
  );
}
