/** One WhatsApp broadcast: summary, delivery funnel, replies, why people were skipped, and every recipient. */
import { ArrowLeft, Ban, CheckCheck, CheckCircle2, Clock, Eye, FlaskConical, MessageCircleReply, Send, Timer, Users, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChartCard } from "@/components/charts/chart-card";
import { BarChart, DonutChart } from "@/components/charts/charts";
import { StatCard } from "@/components/common/stat-card";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ColorTabs } from "@/components/ui/color-tabs";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const B = "pakistan_tax_consultancy.api.broadcast";
interface Recipient { name: string; party_type: string; party: string; phone: string | null; status: string; reason: string | null;
  message_status: string | null; sent_at: string | null; reply: string | null; replied_at: string | null }
interface Insights {
  name: string; title: string; status: string; audience: string; template_label?: string; started_on: string | null; completed_on: string | null;
  creation: string; rate_per_minute: number; lead_status: string | null; lead_source: string | null; deal_status: string | null; tax_year: string | null;
  template_info: { template_label: string; message: string; footer: string | null; template_type: string }; mock: boolean;
  funnel: { recipients: number; sent: number; delivered: number; read: number; replied: number };
  rates: { delivery: number | null; read: number | null; reply: number | null; reach: number | null };
  message_states: Record<string, number>; reasons: { reason: string; count: number }[]; timeline: { minute: string; count: number }[];
  duration_seconds: number | null; recipients: Recipient[];
}

const when = (v: string | null) => (v ? new Date(v.replace(" ", "T")).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const TONE: Record<string, string> = { Sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300", Delivered: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  Read: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", Failed: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  Skipped: "bg-muted text-muted-foreground", Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
const path = (r: Recipient) => r.party_type === "CRM Lead" ? `/crm/leads/${r.party}` : r.party_type === "CRM Deal" ? `/crm/deals/${r.party}` : `/staff/clients/${r.party}`;

export function BroadcastDetailPage() {
  const { name = "" } = useParams();
  const { data: d, error, isLoading, mutate } = useApi<Insights>(`${B}.insights`, { name },
    { refreshInterval: (x?: Insights) => (x && ["Queued", "Running"].includes(x.status) ? 3000 : 0) });
  const [filter, setFilter] = useState<"all" | "sent" | "replied" | "skipped" | "failed">("all");
  const [err, setErr] = useState<unknown>(null);
  if (isLoading) return <Loading />;
  if (error || !d) return <div className="page-container"><ErrorState error={error} onRetry={() => void mutate()} /></div>;
  const f = d.funnel;
  const rows = d.recipients.filter((r) => filter === "all" || (filter === "sent" ? r.status === "Sent" : filter === "replied" ? !!r.reply : r.status.toLowerCase() === filter));
  const steps: [string, number, string][] = [["Recipients", f.recipients, "#94a3b8"], ["Sent", f.sent, "#0ea5e9"], ["Delivered", f.delivered, "#6366f1"], ["Read", f.read, "#10b981"], ["Replied", f.replied, "#d4af37"]];
  const live = ["Queued", "Running"].includes(d.status);
  const mins = d.duration_seconds ? Math.max(1, Math.round(d.duration_seconds / 60)) : null;

  return (
    <div className="page-container space-y-5">
      <Link to="/crm/broadcast" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Broadcasts</Link>
      <div className="overflow-hidden rounded-3xl bg-[#0b0b0c] text-white">
        <div className="relative p-6 sm:p-8">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(600px_240px_at_90%_0%,rgba(37,211,102,0.22),transparent_60%)]" />
          <div className="relative flex flex-wrap items-start gap-6">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#25D366]">WhatsApp broadcast · {d.name}</p>
              <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{d.title}</h1>
              <p className="mt-2 text-sm text-white/65">{d.audience}{d.lead_status ? ` · ${d.lead_status}` : ""}{d.lead_source ? ` · ${d.lead_source}` : ""}{d.deal_status ? ` · ${d.deal_status}` : ""}{d.tax_year ? ` · TY${d.tax_year}` : ""}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{when(d.started_on ?? d.creation)}</span>
                {mins && <span className="flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{mins} min · {d.rate_per_minute}/min</span>}
                <span className="rounded-full bg-white/10 px-2 py-0.5 font-semibold text-white">{d.status}</span>
              </p>
              {live && <Button size="sm" variant="outline" className="mt-3 border-white/30 bg-transparent text-white hover:bg-white/10" onClick={() => void apiCall(`${B}.cancel`, { name }).then(() => mutate()).catch(setErr)}><XCircle className="h-4 w-4" /> Stop sending</Button>}
            </div>
            <div className="w-full max-w-sm rounded-2xl bg-[#efeae2] p-3 dark:bg-[#0b141a] sm:w-80">
              <div className="rounded-2xl rounded-ss-sm bg-[#DCF8C6] px-3.5 py-2.5 text-sm text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
                <p className="whitespace-pre-wrap">{d.template_info.message}</p>
                {d.template_info.footer && <p className="mt-1.5 text-[11px] opacity-60">{d.template_info.footer}</p>}
              </div>
              <p className="mt-1.5 text-center text-[11px] text-[#54656f]">{d.template_info.template_label} · {d.template_info.template_type}</p>
            </div>
          </div>
        </div>
      </div>
      {d.mock && <p className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"><FlaskConical className="h-4 w-4" /> Test mode: messages were logged only, so delivered / read stay at zero.</p>}
      <InlineError error={err} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Recipients" value={f.recipients} icon={<Users className="h-4 w-4" />} tone="slate" />
        <StatCard label="Sent" value={f.sent} valueSuffix={pct(d.rates.reach)} icon={<Send className="h-4 w-4" />} tone="sky" />
        <StatCard label="Delivered" value={f.delivered} valueSuffix={pct(d.rates.delivery)} icon={<CheckCheck className="h-4 w-4" />} tone="indigo" />
        <StatCard label="Read" value={f.read} valueSuffix={pct(d.rates.read)} icon={<Eye className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Replied" value={f.replied} valueSuffix={pct(d.rates.reply)} icon={<MessageCircleReply className="h-4 w-4" />} tone="amber" />
        <StatCard label="Skipped / failed" value={(d.recipients.filter((r) => r.status === "Skipped").length) + (d.recipients.filter((r) => r.status === "Failed").length)} icon={<Ban className="h-4 w-4" />} tone="rose" />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Delivery funnel" subtitle="From the list to a reply" className="lg:col-span-3">
          <div className="space-y-3">
            {steps.map(([label, n, color]) => (
              <div key={label}>
                <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{n}{f.recipients ? ` · ${Math.round((100 * n) / f.recipients)}%` : ""}</span></div>
                <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${f.recipients ? (100 * n) / f.recipients : 0}%`, background: color }} /></div>
              </div>
            ))}
          </div>
        </ChartCard>
        <ChartCard title="Message status" className="lg:col-span-2">
          {Object.keys(d.message_states).length
            ? <DonutChart data={Object.entries(d.message_states).map(([k, v]) => ({ label: k, value: v, color: { Sent: "#0ea5e9", Delivered: "#6366f1", Read: "#10b981", Failed: "#f43f5e" }[k] }))} height={220} />
            : <Empty title="Nothing sent yet" />}
        </ChartCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Sends per minute" subtitle="Pace of the broadcast">
          {d.timeline.length ? <BarChart data={d.timeline} xKey="minute" series={[{ key: "count", label: "Messages", color: "#25D366" }]} height={200} /> : <Empty title="No sends yet" />}
        </ChartCard>
        <ChartCard title="Why some were not reached">
          {d.reasons.length ? (
            <ul className="space-y-2.5">
              {d.reasons.map((r) => (
                <li key={r.reason} className="flex items-center gap-3 text-sm">
                  {r.reason.startsWith("Failed") ? <XCircle className="h-4 w-4 shrink-0 text-rose-500" /> : <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">{r.reason.replace(/^(Skipped|Failed): /, "")}</span><span className="font-semibold tabular-nums">{r.count}</span>
                </li>
              ))}
            </ul>
          ) : <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Everyone on the list was reached.</p>}
        </ChartCard>
      </div>

      <section className="space-y-3">
        <ColorTabs value={filter} onChange={setFilter} tabs={[
          { key: "all", label: "All", icon: Users, tone: "slate", count: d.recipients.length },
          { key: "sent", label: "Sent", icon: Send, tone: "sky", count: d.recipients.filter((r) => r.status === "Sent").length },
          { key: "replied", label: "Replied", icon: MessageCircleReply, tone: "gold", count: f.replied },
          { key: "skipped", label: "Skipped", icon: Ban, tone: "amber", count: d.recipients.filter((r) => r.status === "Skipped").length },
          { key: "failed", label: "Failed", icon: XCircle, tone: "rose", count: d.recipients.filter((r) => r.status === "Failed").length },
        ]} />
        {!rows.length ? <Empty title="Nobody here" /> : (
          <Table>
            <thead><tr><TH>Recipient</TH><TH>Status</TH><TH>Sent</TH><TH>Reply</TH></tr></thead>
            <tbody>{rows.map((r) => (
              <TR key={r.party + r.phone}>
                <TD><Link className="font-medium hover:text-primary" to={path(r)}>{r.name}</Link><span className="block text-xs text-muted-foreground">{r.phone ?? "—"} · {r.party_type.replace("CRM ", "")}</span></TD>
                <TD><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", TONE[r.message_status && r.status === "Sent" ? r.message_status : r.status] ?? "bg-muted")}>
                  {r.status === "Sent" ? (r.message_status ?? "Sent") : r.status}</span>
                  {r.reason && <span className="mt-1 block text-xs text-muted-foreground">{r.reason}</span>}</TD>
                <TD className="text-sm text-muted-foreground">{when(r.sent_at)}</TD>
                <TD className="max-w-xs text-sm">{r.reply ? <><p className="line-clamp-2">“{r.reply}”</p><span className="text-xs text-muted-foreground">{when(r.replied_at)}</span></> : <span className="text-muted-foreground">—</span>}</TD>
              </TR>
            ))}</tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
