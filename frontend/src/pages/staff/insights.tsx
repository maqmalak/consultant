/**
 * Season insights: KPIs, monthly trends, the stage funnel, where work is waiting, time per step, team performance and
 * the client mix. Scoped like the rest of the portal (a consultant sees their own clients). Charts use the validated
 * viz palette (≤ 3 series each, one axis, legend for ≥ 2 series, tooltips on hover).
 */
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CheckCircle2, Clock, FileCheck2, Gauge, MapPin, TrendingUp, Users, Wallet,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorState, Loading } from "@/components/common/states";
import { SelectInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface Trend { month: string; label: string; new_clients: number; returns_started: number; returns_filed: number; visits: number; conversions: number; collections: number }
interface Overview {
  tax_year: string; scope: string; generated: string;
  kpis: Record<string, number | null>;
  trend: Trend[];
  funnel: { state: string; count: number }[];
  stages: { state: string; count: number; avg_days: number; late: number; sla_days: number }[];
  step_time: { state: string; avg_days: number; n: number }[];
  team: { user: string; name: string; open: number; filed: number; avg_days: number | null; payable: number }[];
  people: { user: string; name: string; reviewed: number; approved: number; filed: number }[];
  mix: { client_type: Mix[]; city: Mix[]; source: Mix[]; packages: { name: string; count: number; fees: number }[] };
}
interface Mix { name: string; count: number }

const SHORT: Record<string, string> = { "Documents Pending": "Documents", "Pending Review": "Pending review", "Under Review": "In review",
  "Awaiting Client Confirmation": "Client confirm", "Submitted to FBR": "Submitted", "Changes Required": "Changes req.", "Filing Error": "Filing error" };
const short = (s: string) => SHORT[s] ?? s;
const lakh = (v: number) => (v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(v));
const AXIS = { tick: { fontSize: 11 }, className: "fill-muted-foreground", stroke: "hsl(var(--border))" };
const TIP = { contentStyle: { borderRadius: 12, fontSize: 12, background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", color: "hsl(var(--popover-foreground))" },
  cursor: { fill: "hsl(var(--muted))", opacity: 0.5 } };

function Card({ title, hint, icon: Icon, children, className, action }: { title: string; hint?: string; icon?: LucideIcon; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">{Icon && <Icon className="h-4 w-4 text-primary" />}{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, icon: Icon, delta, good }: { label: string; value: string; sub?: string; icon: LucideIcon; delta?: number | null; good?: "up" | "down" }) {
  const better = delta == null || delta === 0 ? null : (delta > 0) === (good !== "down");
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        {delta != null && delta !== 0 && (
          <span className={cn("inline-flex items-center font-semibold", better ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {delta > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{Math.abs(delta)}
          </span>
        )}
        {sub}
      </div>
    </div>
  );
}

/** Horizontal bars for one measure (single hue = magnitude). */
function HBars({ rows, value, label, fmt = String, max }: { rows: Record<string, any>[]; value: string; label: string; fmt?: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r[label]} title={`${r[label]}: ${fmt(Number(r[value]) || 0)}`}>
          <div className="flex justify-between gap-3 text-sm"><span className="truncate">{r[label]}</span><span className="shrink-0 font-semibold tabular-nums">{fmt(Number(r[value]) || 0)}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${((Number(r[value]) || 0) * 100) / top}%`, background: "var(--seq)" }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function InsightsPage() {
  const site = useApi<{ tax_year?: string; tax_years?: string[] }>("pakistan_tax_consultancy.api.public.site_info");
  const [year, setYear] = useState("");
  const [months, setMonths] = useState("6");
  const { data, error, isLoading } = useApi<Overview>("pakistan_tax_consultancy.api.insights.overview", { tax_year: year || undefined, months });
  const years = site.data?.tax_years ?? [];
  if (isLoading && !data) return <Loading />;
  if (error || !data) return <div className="page-container"><ErrorState error={error} /></div>;
  const k = data.kpis;
  const start = data.funnel[0]?.count || 1;
  return (
    <div className="viz page-container max-w-[1600px] space-y-5">
      <div className="hero-dark relative overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-[#d4af37]/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]"><TrendingUp className="h-6 w-6" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f3d77a]">Insights · Tax year {data.tax_year}</p>
              <h1 className="font-display text-2xl font-semibold">How the season is going</h1>
              <p className="text-sm text-white/60">{data.scope === "all" ? "Whole firm" : data.scope === "consultant" ? "Your clients" : "Your registrations"} · updated {new Date(data.generated).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SelectInput aria-label="Tax year" className="h-10 w-32 border-white/15 bg-white/5 text-white" value={year || data.tax_year} onChange={(e) => setYear(e.target.value)}>
              {(years.length ? years : [data.tax_year]).map((y) => <option key={y} value={y} className="text-foreground">TY{y}</option>)}</SelectInput>
            <SelectInput aria-label="Months" className="h-10 w-44 border-white/15 bg-white/5 text-white" value={months} onChange={(e) => setMonths(e.target.value)}>
              {[["3", "Last 3 months"], ["6", "Last 6 months"], ["12", "Last 12 months"]].map(([v, l]) => <option key={v} value={v} className="text-foreground">{l}</option>)}</SelectInput>
            <Link to="/staff/reports" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#b8912a] px-4 text-sm font-semibold text-[#141416]"><BarChart3 className="h-4 w-4" /> Report center</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi label="Active clients" icon={Users} value={String(k.clients ?? 0)} delta={(k.new_clients_month ?? 0) - (k.new_clients_prev ?? 0)} sub={`${k.new_clients_month} new this month`} />
        <Kpi label="Returns filed" icon={FileCheck2} value={`${k.filed} / ${k.returns}`} sub={`${k.filed_pct}% of the year · ${k.in_progress} in progress`} />
        <Kpi label="Avg days to file" icon={Clock} value={k.avg_days_to_file == null ? "—" : `${k.avg_days_to_file} d`} sub="order → IRIS acknowledgment" />
        <Kpi label="Collected this month" icon={Wallet} value={money(k.collected_month)} sub={`last month ${money(k.collected_prev)}`} />
        <Kpi label="Fees outstanding" icon={Gauge} value={money(k.outstanding)} sub={`${money(k.collected, { compact: true })} of ${money(k.billed, { compact: true })} collected`} />
        <Kpi label="Visit conversion" icon={MapPin} value={k.visit_conversion == null ? "—" : `${k.visit_conversion}%`} sub="closed field visits that became clients" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Season trend" hint="Returns started and filed, and new clients, per month" icon={TrendingUp}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis allowDecimals={false} {...AXIS} />
                <Tooltip {...TIP} cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" formatter={(v) => <span className="text-muted-foreground">{v}</span>} />
                <Line type="monotone" dataKey="returns_started" name="Returns started" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="returns_filed" name="Returns filed" stroke="var(--series-2)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="new_clients" name="New clients" stroke="var(--series-3)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Collections" hint="Verified fee payments per month" icon={Wallet}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis tickFormatter={lakh} {...AXIS} />
                <Tooltip {...TIP} formatter={(v: number) => [money(v), "Collected"]} />
                <Bar dataKey="collections" name="Collected" fill="var(--seq)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Filing funnel" hint="Returns that have reached each step this tax year" icon={FileCheck2}>
          <ul className="space-y-2">
            {data.funnel.map((f) => (
              <li key={f.state} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-3 text-sm" title={`${f.state}: ${f.count} (${Math.round((f.count * 100) / start)}%)`}>
                <span className="truncate text-muted-foreground">{short(f.state)}</span>
                <div className="h-6 overflow-hidden rounded-md bg-muted"><div className="flex h-full items-center rounded-md px-2 text-[11px] font-semibold text-white" style={{ width: `${Math.max(4, (f.count * 100) / start)}%`, background: "var(--seq)" }}>{f.count}</div></div>
                <span className="text-end text-xs tabular-nums text-muted-foreground">{Math.round((f.count * 100) / start)}%</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Where work is waiting" hint="Open returns per step, how long they have waited, and how many are past the target" icon={AlertTriangle}
          action={<Link to="/staff/returns" className="text-xs font-semibold text-primary hover:underline">Open returns →</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-2 text-start font-semibold">Step</th><th className="py-2 text-end font-semibold">Open</th><th className="py-2 text-end font-semibold">Avg wait</th><th className="py-2 text-end font-semibold">Target</th><th className="py-2 text-end font-semibold">Late</th></tr></thead>
              <tbody>
                {data.stages.filter((s) => s.count).map((s) => (
                  <tr key={s.state} className="border-b last:border-0">
                    <td className="py-2">{s.state}</td>
                    <td className="py-2 text-end font-semibold tabular-nums">{s.count}</td>
                    <td className="py-2 text-end tabular-nums">{s.avg_days} d</td>
                    <td className="py-2 text-end tabular-nums text-muted-foreground">{s.sla_days} d</td>
                    <td className="py-2 text-end">{s.late ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3 w-3" /> {s.late}</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> on time</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Time per step" hint="Average days a return spends in each finished step" icon={Clock}>
          <HBars rows={data.step_time.map((s) => ({ ...s, label: short(s.state) }))} value="avg_days" label="label" fmt={(v) => `${v} d`} />
        </Card>
        <Card title="Field visits" hint="Visits and conversions to clients per month" icon={MapPin}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} margin={{ top: 8, right: 4, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis allowDecimals={false} {...AXIS} />
                <Tooltip {...TIP} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" formatter={(v) => <span className="text-muted-foreground">{v}</span>} />
                <Bar dataKey="visits" name="Visits" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
                <Bar dataKey="conversions" name="Became clients" fill="var(--series-3)" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Packages sold" hint="Engagements and fees this tax year" icon={Wallet}>
          <HBars rows={data.mix.packages} value="fees" label="name" fmt={(v) => money(v, { compact: true })} />
          <p className="mt-3 text-xs text-muted-foreground">{data.mix.packages.map((p) => `${p.name}: ${p.count}`).join(" · ")}</p>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card title="Consultants" hint="Open and filed returns, and average days from order to acknowledgment" icon={Users}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground"><th className="py-2 text-start font-semibold">Consultant</th><th className="py-2 text-end font-semibold">Open</th><th className="py-2 text-end font-semibold">Filed</th><th className="py-2 font-semibold">Progress</th><th className="py-2 text-end font-semibold">Avg days</th><th className="py-2 text-end font-semibold">Tax payable</th></tr></thead>
              <tbody>
                {data.team.map((t) => {
                  const total = t.open + t.filed || 1;
                  return (
                    <tr key={t.user} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{t.name}</td>
                      <td className="py-2.5 text-end tabular-nums">{t.open}</td>
                      <td className="py-2.5 text-end tabular-nums">{t.filed}</td>
                      <td className="w-40 px-3 py-2.5"><div className="h-2 overflow-hidden rounded-full bg-muted" title={`${Math.round((t.filed * 100) / total)}% filed`}><div className="h-full rounded-full" style={{ width: `${(t.filed * 100) / total}%`, background: "var(--seq)" }} /></div></td>
                      <td className="py-2.5 text-end tabular-nums">{t.avg_days ?? "—"}</td>
                      <td className="py-2.5 text-end tabular-nums">{money(t.payable, { compact: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.people.length > 0 && (
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {data.people.map((p) => (
                <div key={p.user} className="rounded-xl bg-muted/50 px-3 py-2.5">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{[p.reviewed && `${p.reviewed} reviewed`, p.approved && `${p.approved} approved`, p.filed && `${p.filed} filed`].filter(Boolean).join(" · ")}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Who the clients are" hint="Returns this tax year by client type, city and how they came" icon={Users}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client type</p><HBars rows={data.mix.client_type} value="count" label="name" /></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">City</p><HBars rows={data.mix.city} value="count" label="name" /></div>
            <div className="sm:col-span-2"><p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Came through</p><HBars rows={data.mix.source} value="count" label="name" /></div>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Total tax payable (clients)</p><p className="mt-1 text-xl font-bold tabular-nums">{money(k.payable)}</p></div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Refunds due to clients</p><p className="mt-1 text-xl font-bold tabular-nums">{money(k.refund)}</p></div>
        <div className="rounded-2xl border bg-card p-4 shadow-sm"><p className="text-xs text-muted-foreground">Needs attention (changes / filing errors)</p><p className="mt-1 flex items-center gap-2 text-xl font-bold tabular-nums">{k.needs_attention}{(k.needs_attention ?? 0) > 0 && <AlertTriangle className="h-5 w-5 text-amber-500" />}</p></div>
      </div>
    </div>
  );
}
