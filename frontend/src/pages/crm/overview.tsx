/**
 * Staff CRM (ported from the realestate CRM pages) on Frappe CRM records: dashboard, leads and the deal pipeline board.
 * Everything else — activity, notes, calls, email, tasks — opens in the full Frappe CRM at /crm.
 */
import {
  ArrowRightLeft, BadgeCheck, CalendarClock, ExternalLink, Handshake, MessageCircle, Plus, Search, Target, TrendingUp, Trophy, UserPlus, Users,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChartCard } from "@/components/charts/chart-card";
import { DonutChart } from "@/components/charts/charts";
import { StateBadge } from "@/components/common/state-badge";
import { StatCard } from "@/components/common/stat-card";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { CRM_COLORS, KanbanBoard } from "@/components/crm/kanban-board";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectInput, TextArea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const C = "pakistan_tax_consultancy.api.crm";
interface Lead { name: string; person: string; mobile_no: string | null; email: string | null; status: string; source: string | null;
  owner_name: string | null; organization: string | null; creation: string; converted: number; tax_client: string | null; ptc_client_type: string | null; deal?: string | null }
interface Deal { name: string; lead: string | null; person: string; mobile_no: string | null; status: string; owner_name: string | null; deal_owner: string | null;
  expected_deal_value: number; deal_value: number; modified: string; tax_client: string | null; service_package: string | null; next_step: string | null; source: string | null }
interface Stage { name: string; type: string; color: string; probability: number }
interface Meta { statuses: { name: string; color: string; type: string }[]; sources: string[]; lost_reasons: string[]; pipeline_view: string | number | null }
interface Dash {
  new_leads_7d: number; open_leads: number; open_deals: number; pipeline_value: number; won_month: number; won_value_month: number;
  win_rate: number | null; lead_conversion: number | null;
  stages: { status: string; color: string; type: string; count: number; value: number }[];
  by_source: { source: string; count: number }[];
  tasks: { name: string; title: string; due_date: string; priority: string; reference_doctype: string; reference_docname: string }[];
  recent_leads: Lead[];
}

const day = (v: string) => new Date(v.replace(" ", "T")).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const age = (v: string) => { const d = Math.floor((Date.now() - new Date(v.replace(" ", "T")).getTime()) / 86_400_000); return d <= 0 ? "today" : `${d}d`; };
const crmUrl = (doctype: "leads" | "deals", name: string) => `/crm/${doctype}/${encodeURIComponent(name)}`;
const waLink = (m: string | null) => (m ? `https://wa.me/${m.replace(/\D/g, "")}` : null);
const COLOR_HEX: Record<string, string> = { gray: "#94a3b8", blue: "#0ea5e9", amber: "#f59e0b", violet: "#8b5cf6", green: "#10b981", red: "#f43f5e",
  orange: "#f97316", teal: "#14b8a6", purple: "#a855f7", pink: "#ec4899", cyan: "#06b6d4", yellow: "#facc15", black: "#0f172a" };
const SOURCE_COLORS = ["#d4af37", "#0ea5e9", "#10b981", "#8b5cf6", "#f97316", "#f43f5e", "#14b8a6", "#64748b"];

// ------------------------------------------------------------------------------------------------ new lead
function NewLeadDialog({ open, onClose, meta, onDone }: { open: boolean; onClose: () => void; meta?: Meta; onDone: () => void }) {
  const [f, setF] = useState({ full_name: "", mobile: "", email: "", source: "Walk In", client_type: "Individual-Salaried", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setErr(null);
    try { await apiCall(`${C}.create_lead`, f); onDone(); onClose(); setF({ ...f, full_name: "", mobile: "", email: "", note: "" }); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="New lead"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f.full_name.trim() || !(f.mobile || f.email)} onClick={() => void save()}>Save lead</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-medium">Name<input className="field mt-1" value={f.full_name} onChange={set("full_name")} placeholder="Person or business" autoFocus /></label>
        <label className="text-sm font-medium">Mobile<input className="field mt-1" value={f.mobile} onChange={set("mobile")} placeholder="03xx-xxxxxxx" inputMode="tel" /></label>
        <label className="text-sm font-medium">Email<input className="field mt-1" value={f.email} onChange={set("email")} type="email" /></label>
        <label className="text-sm font-medium">Source
          <SelectInput className="mt-1" value={f.source} onChange={set("source")}>{(meta?.sources ?? ["Walk In"]).map((s) => <option key={s}>{s}</option>)}</SelectInput></label>
        <label className="text-sm font-medium">Client type
          <SelectInput className="mt-1" value={f.client_type} onChange={set("client_type")}>
            {["Individual-Salaried", "Individual-Business", "AOP", "Company", "Other"].map((s) => <option key={s}>{s}</option>)}</SelectInput></label>
        <label className="sm:col-span-2 text-sm font-medium">Note<TextArea className="mt-1" rows={3} value={f.note} onChange={set("note")} placeholder="What do they need?" /></label>
      </div>
      <InlineError error={err} />
    </Dialog>
  );
}

// ------------------------------------------------------------------------------------------------ dashboard
function Dashboard() {
  const { data, error, isLoading, mutate } = useApi<Dash>(`${C}.dashboard`, undefined, { refreshInterval: 60_000 });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  const open = data.stages.filter((s) => s.type === "Open" || s.type === "Ongoing");
  const max = Math.max(1, ...open.map((s) => s.count));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="New leads · 7 days" value={data.new_leads_7d} icon={<UserPlus className="h-4 w-4" />} tone="sky" />
        <StatCard label="Open leads" value={data.open_leads} icon={<Users className="h-4 w-4" />} tone="indigo" />
        <StatCard label="Open deals" value={data.open_deals} icon={<Handshake className="h-4 w-4" />} tone="amber" />
        <StatCard label="Pipeline value" value={money(data.pipeline_value, { compact: true })} icon={<TrendingUp className="h-4 w-4" />} tone="primary" />
        <StatCard label="Engaged this month" value={data.won_month} valueSuffix={money(data.won_value_month, { compact: true })} icon={<Trophy className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Win rate · 90 days" value={data.win_rate === null ? "—" : `${data.win_rate}%`} icon={<Target className="h-4 w-4" />} tone="teal" />
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <ChartCard title="Pipeline" subtitle="Open deals by stage" className="lg:col-span-3">
          <div className="space-y-3">
            {open.map((s) => (
              <Link key={s.status} to="/crm/pipeline" className="block rounded-lg p-1 hover:bg-accent/50">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium"><span className={cn("h-2.5 w-2.5 rounded-full", CRM_COLORS[s.color] ?? CRM_COLORS.gray)} />{s.status}</span>
                  <span className="tabular-nums text-muted-foreground">{s.count} · {money(s.value, { compact: true })}</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all" style={{ width: `${(100 * s.count) / max}%`, background: COLOR_HEX[s.color] ?? "#94a3b8" }} />
                </div>
              </Link>
            ))}
            {data.lead_conversion !== null && <p className="pt-1 text-xs text-muted-foreground">{data.lead_conversion}% of leads in the last 90 days became deals.</p>}
          </div>
        </ChartCard>
        <ChartCard title="Where leads come from" subtitle="Last 90 days" className="lg:col-span-2">
          {data.by_source.length
            ? <DonutChart data={data.by_source.map((s, i) => ({ label: s.source, value: s.count, color: SOURCE_COLORS[i % SOURCE_COLORS.length] }))} height={240} />
            : <Empty title="No leads yet" />}
        </ChartCard>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="My follow-ups due" subtitle="Tasks assigned to you" actions={<Link className="text-xs font-medium text-primary hover:underline" to="/crm/follow-ups">All follow-ups →</Link>}>
          {data.tasks.length ? (
            <ul className="divide-y">
              {data.tasks.map((t) => (
                <li key={t.name}><Link className="flex items-center gap-3 py-2.5 hover:text-primary" to={crmUrl(t.reference_doctype === "CRM Deal" ? "deals" : "leads", t.reference_docname)}>
                  <CalendarClock className={cn("h-4 w-4 shrink-0", t.priority === "High" ? "text-rose-500" : "text-muted-foreground")} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{day(t.due_date)}</span></Link></li>
              ))}
            </ul>
          ) : <Empty title="Nothing due" hint="You're up to date." />}
        </ChartCard>
        <ChartCard title="Newest leads" actions={<Link className="text-xs font-medium text-primary hover:underline" to="/crm/leads">All leads →</Link>}>
          <ul className="divide-y">
            {data.recent_leads.map((l) => (
              <li key={l.name}><Link className="flex items-center gap-3 py-2.5" to={crmUrl("leads", l.name)}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{l.person.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{l.person}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.source ?? "—"} · {l.owner_name ?? "unassigned"}</span></span>
                <StateBadge state={l.status} /></Link></li>
            ))}
          </ul>
        </ChartCard>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ leads
function Leads({ meta, onPipeline }: { meta?: Meta; onPipeline: () => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [showConverted, setShowConverted] = useState(false);
  const { data, error, isLoading, mutate } = useApi<Lead[]>(`${C}.leads`,
    { q: q || undefined, status: status || undefined, source: source || undefined, include_converted: showConverted ? 1 : 0 });
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ person: string; deal: string } | null>(null);
  const convert = async (l: Lead) => {
    setBusy(l.name); setErr(null); setMoved(null);
    try { const deal = await apiCall<string>(`${C}.convert`, { lead: l.name }); setMoved({ person: l.person, deal }); void mutate(); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  };
  const chip = (on: boolean) => cn("rounded-full px-3 py-1 text-xs font-medium", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input aria-label="Search leads" className="field h-9 ps-8 text-sm" placeholder="Name, mobile, email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SelectInput aria-label="Source" className="h-9 w-40" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>{meta?.sources.map((s) => <option key={s}>{s}</option>)}</SelectInput>
        <div className="flex flex-wrap gap-1.5">
          <button className={chip(!status)} onClick={() => setStatus("")}>All</button>
          {meta?.statuses.filter((s) => s.name !== "Converted").map((s) => <button key={s.name} className={chip(status === s.name)} onClick={() => setStatus(s.name)}>{s.name}</button>)}
        </div>
        <label className="ms-auto flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showConverted} onChange={(e) => setShowConverted(e.target.checked)} /> Show leads already in the pipeline</label>
      </div>
      {moved && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
          <ArrowRightLeft className="h-5 w-5 text-primary" /> <span><b>{moved.person}</b> is now a deal in <b>Enquiry</b>.</span>
          <button className="font-semibold text-primary hover:underline" onClick={onPipeline}>View pipeline →</button>
          <Link className="text-primary hover:underline" to={crmUrl("deals", moved.deal)}>Open deal →</Link>
          <button className="ms-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setMoved(null)}>Dismiss</button>
        </div>
      )}
      <InlineError error={err} />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => void mutate()} /> : !data?.length ? <Empty title="No leads" hint="Leads arrive from the website, WhatsApp, bookings and site visits — or add one." /> : (
        <Table>
          <thead><tr><TH>Lead</TH><TH>Source</TH><TH>Status</TH><TH>Owner</TH><TH>Added</TH><TH className="text-end">Actions</TH></tr></thead>
          <tbody>{data.map((l) => (
            <TR key={l.name}>
              <TD><Link className="font-medium hover:text-primary" to={crmUrl("leads", l.name)}>{l.person}</Link>
                <span className="block text-xs text-muted-foreground">{l.mobile_no ?? l.email ?? ""}{l.ptc_client_type ? ` · ${l.ptc_client_type}` : ""}</span></TD>
              <TD>{l.source ?? "—"}</TD>
              <TD><StateBadge state={l.status} /></TD>
              <TD className="text-sm">{l.owner_name ?? "—"}</TD>
              <TD className="text-sm text-muted-foreground">{day(l.creation)}</TD>
              <TD className="text-end">
                <div className="flex justify-end gap-1.5">
                  {waLink(l.mobile_no) && <a className="rounded-md border p-1.5 text-[#128C7E] hover:bg-accent dark:text-[#25D366]" href={waLink(l.mobile_no)!} target="_blank" rel="noopener" aria-label="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                  {l.converted
                    ? l.deal ? <Link className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300" to={crmUrl("deals", l.deal)}>Deal ✓</Link>
                      : <span className="text-xs text-muted-foreground">Converted</span>
                    : <Button size="sm" variant="outline" loading={busy === l.name} onClick={() => void convert(l)}><ArrowRightLeft className="h-3.5 w-3.5" /> To deal</Button>}
                  <a className="rounded-md border p-1.5 hover:bg-accent" href={crmUrl("leads", l.name)} aria-label="Open in Frappe CRM" title="Open in Frappe CRM"><ExternalLink className="h-4 w-4" /></a>
                </div>
              </TD>
            </TR>
          ))}</tbody>
        </Table>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ pipeline
function Pipeline({ meta }: { meta?: Meta }) {
  const { me } = useAuth();
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const { data, error, isLoading, mutate } = useApi<{ statuses: Stage[]; deals: Deal[] }>(`${C}.pipeline`,
    { q: q || undefined, owner: mine ? me?.user : undefined });
  const [lost, setLost] = useState<{ deal: Deal; reason: string } | null>(null);
  const [notice, setNotice] = useState<{ client: string; person: string } | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const move = async (deal: Deal, status: string, reason?: string) => {
    setErr(null);
    // optimistic: show the card in its new column straight away
    void mutate((d) => d && { ...d, deals: d.deals.map((x) => (x.name === deal.name ? { ...x, status } : x)) }, { revalidate: false });
    try {
      const r = await apiCall<{ tax_client: string | null }>(`${C}.move_deal`, { deal: deal.name, status, lost_reason: reason });
      if (r.tax_client && !deal.tax_client) setNotice({ client: r.tax_client, person: deal.person });
    } catch (e) { setErr(e); }
    void mutate();
  };
  const columns = useMemo(() => (data?.statuses ?? []).map((s) => {
    const rows = (data?.deals ?? []).filter((d) => d.status === s.name);
    const compact = s.type === "Won" || s.type === "Lost";
    return { value: s.name, color: s.color, compact,
      footer: `${money(rows.reduce((n, d) => n + (d.deal_value || d.expected_deal_value || 0), 0), { compact: true })}${s.probability && !compact ? ` · ${s.probability}%` : ""}` };
  }), [data]);
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64"><Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input aria-label="Search deals" className="field h-9 ps-8 text-sm" placeholder="Name or mobile" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> My deals only</label>
        <p className="ms-auto text-xs text-muted-foreground">Drag a card to move it. Moving to <b>Engaged</b> creates the tax client.</p>
      </div>
      <InlineError error={err} />
      {notice && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
          <BadgeCheck className="h-5 w-5 text-emerald-600" /> <span><b>{notice.person}</b> is now a client.</span>
          <Link className="font-semibold text-primary hover:underline" to={`/staff/clients/${notice.client}`}>Open client & start the return →</Link>
          <button className="ms-auto text-xs text-muted-foreground hover:text-foreground" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}
      <KanbanBoard columns={columns} rows={data?.deals ?? []} groupField="status" rowKey={(d) => d.name} loading={isLoading}
        emptyHint="Turn a lead into a deal from the Leads tab."
        onCardMove={(d, status) => (data?.statuses.find((s) => s.name === status)?.type === "Lost" ? setLost({ deal: d, reason: meta?.lost_reasons[0] ?? "" }) : move(d, status))}
        renderCompact={(d) => (
          <div className="rounded-lg border bg-card px-2.5 py-2 shadow-sm">
            <Link className="block truncate text-sm font-medium hover:text-primary" to={crmUrl("deals", d.name)} draggable={false}>{d.person}</Link>
            <div className="mt-0.5 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
              <span className="tabular-nums">{money(d.deal_value || d.expected_deal_value || 0, { compact: true })}</span>
              {d.tax_client && <Link to={`/staff/clients/${d.tax_client}`} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400" draggable={false}>Client ✓</Link>}
            </div>
          </div>
        )}
        renderCard={(d) => (
          <div className="rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow">
            <div className="flex items-start justify-between gap-2">
              <Link className="min-w-0 font-medium leading-tight hover:text-primary" to={crmUrl("deals", d.name)} draggable={false}>{d.person}</Link>
              <span className="shrink-0 text-[11px] text-muted-foreground">{age(d.modified)}</span>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{d.service_package ?? d.source ?? ""}{d.mobile_no ? ` · ${d.mobile_no}` : ""}</p>
            {d.next_step && <p className="mt-1.5 truncate rounded-md bg-muted/60 px-2 py-1 text-xs">→ {d.next_step}</p>}
            <select aria-label={`Move ${d.person} to`} value="" draggable={false} onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => { const s = e.target.value; if (!s) return; if (data?.statuses.find((x) => x.name === s)?.type === "Lost") setLost({ deal: d, reason: meta?.lost_reasons[0] ?? "" }); else void move(d, s); }}
              className="mt-2 h-7 w-full cursor-pointer rounded-md border bg-background px-1.5 text-xs text-muted-foreground hover:text-foreground">
              <option value="">Move to…</option>
              {data?.statuses.filter((s) => s.name !== d.status).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold tabular-nums">{money(d.deal_value || d.expected_deal_value || 0)}</span>
              {d.tax_client
                ? <Link to={`/staff/clients/${d.tax_client}`} className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300" draggable={false}>Client ✓</Link>
                : <span className="truncate text-muted-foreground">{d.owner_name ?? ""}</span>}
            </div>
          </div>
        )} />
      <Dialog open={!!lost} onClose={() => setLost(null)} title="Why was this deal lost?"
        footer={<><Button variant="ghost" onClick={() => setLost(null)}>Cancel</Button>
          <Button onClick={() => { if (lost) void move(lost.deal, "Lost", lost.reason); setLost(null); }}>Mark lost</Button></>}>
        <p className="mb-2 text-sm text-muted-foreground">{lost?.deal.person}</p>
        <SelectInput value={lost?.reason ?? ""} onChange={(e) => lost && setLost({ ...lost, reason: e.target.value })}>
          {meta?.lost_reasons.map((r) => <option key={r}>{r}</option>)}</SelectInput>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ page
/** Shared header for the CRM app pages: title, Frappe CRM link and New lead. */
function CrmHeader({ title, subtitle, icon, meta, onAdded }: { title: string; subtitle: string; icon: ReactNode; meta?: Meta; onAdded?: () => void }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} icon={icon}
        actions={<>
          <a href={meta?.pipeline_view ? `/crm/deals/view/kanban?view=${meta.pipeline_view}` : "/crm"} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"><ExternalLink className="h-4 w-4" /> Frappe CRM</a>
          <Button size="default" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New lead</Button>
        </>} />
      <NewLeadDialog open={adding} onClose={() => setAdding(false)} meta={meta} onDone={() => onAdded?.()} />
    </>
  );
}

export function CrmDashboardPage() {
  const meta = useApi<Meta>(`${C}.lead_statuses`);
  const [stamp, setStamp] = useState(0);
  return (
    <div className="page-container space-y-5">
      <CrmHeader title="CRM dashboard" subtitle="Leads and deals — from first enquiry to engaged client" icon={<Handshake className="h-5 w-5" />}
        meta={meta.data} onAdded={() => setStamp((s) => s + 1)} />
      <Dashboard key={stamp} />
    </div>
  );
}

export function CrmLeadsPage() {
  const meta = useApi<Meta>(`${C}.lead_statuses`);
  const navigate = useNavigate();
  const [stamp, setStamp] = useState(0);
  return (
    <div className="page-container space-y-5">
      <CrmHeader title="Leads" subtitle="Everyone who asked about our services" icon={<Users className="h-5 w-5" />} meta={meta.data} onAdded={() => setStamp((s) => s + 1)} />
      <Leads key={stamp} meta={meta.data} onPipeline={() => navigate("/crm/pipeline")} />
    </div>
  );
}

export function CrmPipelinePage() {
  const meta = useApi<Meta>(`${C}.lead_statuses`);
  return (
    <div className="page-container max-w-none space-y-5">
      <CrmHeader title="Pipeline" subtitle="Drag a deal to its next stage" icon={<Target className="h-5 w-5" />} meta={meta.data} />
      <Pipeline meta={meta.data} />
    </div>
  );
}
