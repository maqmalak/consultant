/**
 * Staff dashboard in the Guide Book look: a dark hero with gold glow and headline figures (with 12-month sparklines),
 * "needs attention" tiles, the monthly trend, returns by status, the pipeline by stage, consultant workload and the
 * latest returns. Everything is scoped on the server to what the signed-in person may see.
 */
import {
  AlarmClock, ArrowRight, BadgeDollarSign, CalendarClock, CheckCircle2, FileCheck2, FileText, LayoutDashboard, PhoneCall, RefreshCw,
  Undo2, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Sector, Tooltip, XAxis, YAxis } from "recharts";
import { Avatar, C, ChartCard, ChartTip, Delta, Highlights, Segmented, Sparkline, STATUS_TONE, axisShort, type Highlight } from "@/components/analytics/kit";
import { StateBadge } from "@/components/common/state-badge";
import { ErrorState, Loading } from "@/components/common/states";
import { useAuth } from "@/hooks/useAuth";
import { M } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money, num } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface Month { month: string; opened: number; filed: number; clients: number; collected: number }
interface Dash {
  trend: Month[];
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

const GOLD = "#d4af37";
const STAGES: { label: string; states: string[]; color: string }[] = [
  { label: "Intake", states: ["Documents Pending", "Draft"], color: C.slate },
  { label: "Review", states: ["Pending Review", "Under Review", "Changes Required", "Reviewed"], color: C.amber },
  { label: "Client", states: ["Awaiting Client Confirmation"], color: C.violet },
  { label: "Filing", states: ["Approved", "Submitted to FBR", "Filing Error"], color: C.sky },
  { label: "Done", states: ["Acknowledged", "Closed"], color: C.green },
];
const DONE = new Set(["Acknowledged", "Closed"]);

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Change from the month before last to last month (the current month is still running), in %. */
function change(series: number[]): number | null {
  const [a, b] = [series.at(-3), series.at(-2)];
  if (a === undefined || b === undefined || !a) return b ? 100 : null;
  return ((b - a) * 100) / a;
}

function HeroStat({ icon: I, label, value, sub, spark, delta, color }: {
  icon: LucideIcon; label: string; value: string; sub: string; spark: number[]; delta: number | null; color: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur transition hover:border-[#d4af37]/40 hover:bg-white/[0.09]">
      <div className="flex items-center justify-between gap-2">
        <span className="grid size-8 place-items-center rounded-lg shadow-md ring-1 ring-white/20" style={{ background: `linear-gradient(135deg, ${color}, ${color}aa)` }}>
          <I className="size-4 text-white" strokeWidth={2.2} /></span>
        <Delta value={delta} className="!bg-white/10 !text-white/80" />
      </div>
      <div className="mt-3 truncate font-display text-2xl font-semibold tabular-nums sm:text-3xl">{value}</div>
      <div className="text-xs text-white/60">{label}</div>
      <div className="-mx-1 mt-2 opacity-90"><Sparkline data={spark} color={color} height={32} /></div>
      <div className="mt-1 truncate text-[11px] text-white/45">{sub}</div>
    </div>
  );
}

function AttentionCard({ icon: I, label, hint, value, to, color }: { icon: LucideIcon; label: string; hint: string; value: number; to?: string; color: string }) {
  const body = (
    <div className={cn("group relative flex h-full items-center gap-3 overflow-hidden rounded-2xl border bg-card p-4 shadow-sm transition",
      to && "hover:-translate-y-0.5 hover:border-[#d4af37]/50 hover:shadow-lg")}>
      <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-[0.14] blur-2xl" style={{ background: color }} />
      <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white shadow-md" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}>
        <I className="size-5" strokeWidth={2.2} /></span>
      <div className="min-w-0 flex-1">
        <div className="text-2xl font-bold tabular-nums leading-none">{num(value)}</div>
        <div className="mt-1 truncate text-xs font-medium">{label}</div>
        <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
      </div>
      {to && <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{body}</Link> : body;
}

type View = "returns" | "clients" | "fees";

function TrendChart({ data, view }: { data: Month[]; view: View }) {
  const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 11, tickLine: false, axisLine: false } as const;
  return (
    <ResponsiveContainer>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="dash-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOLD} stopOpacity={0.4} /><stop offset="100%" stopColor={GOLD} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="dash-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.sky} stopOpacity={0.95} /><stop offset="100%" stopColor={C.sky} stopOpacity={0.45} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" />
        <XAxis dataKey="month" {...axis} />
        <YAxis {...axis} allowDecimals={false} tickFormatter={view === "fees" ? axisShort : undefined} width={44} />
        <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
          content={<ChartTip fmt={(v) => (view === "fees" ? money(v) : num(v))} />} />
        {view === "returns" && <>
          <Bar dataKey="opened" name="Returns opened" fill="url(#dash-bar)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Line dataKey="filed" name="Filed on IRIS" type="monotone" stroke={GOLD} strokeWidth={2.5} dot={{ r: 3, fill: GOLD }} activeDot={{ r: 5 }} />
        </>}
        {view === "clients" && <Area dataKey="clients" name="New clients" type="monotone" stroke={C.violet} strokeWidth={2.5} fill={C.violet} fillOpacity={0.15} />}
        {view === "fees" && <Area dataKey="collected" name="Fees collected" type="monotone" stroke={GOLD} strokeWidth={2.5} fill="url(#dash-gold)" />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function StaffDashboard() {
  const { me } = useAuth();
  const { data, error, isLoading, mutate } = useApi<Dash>(`${M.STAFF}.dashboard`);
  const [view, setView] = useState<View>("returns");

  const d = useMemo(() => {
    if (!data) return null;
    const t = data.trend ?? [];
    const col = (k: keyof Omit<Month, "month">) => t.map((m) => m[k]);
    const count = (s: string) => data.by_state.find((x) => x.state === s)?.count ?? 0;
    const done = data.by_state.filter((s) => DONE.has(s.state)).reduce((a, s) => a + s.count, 0);
    const stages = STAGES.map((g) => ({ ...g, count: g.states.reduce((a, s) => a + count(s), 0) }));
    const fees12 = col("collected").reduce((a, v) => a + v, 0);
    const last = t.at(-2);
    const highlights: Highlight[] = [];
    if (data.overdue) highlights.push({ tone: "bad", text: `${data.overdue} return${data.overdue === 1 ? " is" : "s are"} past the FBR due date and not yet filed.` });
    if (count("Filing Error")) highlights.push({ tone: "warn", text: `${count("Filing Error")} return${count("Filing Error") === 1 ? "" : "s"} failed on IRIS — retry from the Filing Errors queue.` });
    const busiest = stages.filter((s) => s.label !== "Done").sort((a, b) => b.count - a.count)[0];
    if (busiest?.count) highlights.push({ tone: "info", text: `Most open work is in ${busiest.label} (${busiest.count} return${busiest.count === 1 ? "" : "s"}).` });
    if (last && last.filed) highlights.push({ tone: "good", text: `${last.filed} return${last.filed === 1 ? "" : "s"} filed on IRIS in ${last.month}.` });
    if (data.documents_to_verify) highlights.push({ tone: "warn", text: `${data.documents_to_verify} client upload${data.documents_to_verify === 1 ? "" : "s"} waiting to be verified.` });
    return { t, col, done, stages, fees12, last, highlights, open: data.total_returns - done };
  }, [data]);

  const first = (me?.full_name ?? "").split(" ")[0];

  return (
    <div className="page-container space-y-6">
      <section className="relative overflow-hidden rounded-3xl hero-dark p-6 text-white sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-16 h-72 w-72 rounded-full bg-[#d4af37]/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 start-1/4 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416] shadow-md ring-1 ring-white/20">
                <LayoutDashboard className="size-6" strokeWidth={2.2} /></span>
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37]">Dashboard</div>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{greeting()}{first ? `, ${first}` : ""}</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/65">Your clients, returns and queues at a glance — scoped to what you may see.</p>
          </div>
          <button type="button" onClick={() => void mutate()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-semibold text-white/80 backdrop-blur transition hover:border-[#d4af37]/60 hover:text-white">
            <RefreshCw className={cn("size-4", isLoading && "animate-spin")} /> Refresh</button>
        </div>
        {data && d && (
          <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Link to="/staff/clients" className="block"><HeroStat icon={Users} label="Clients" value={num(data.clients)} color={C.violet} spark={d.col("clients")}
              delta={change(d.col("clients"))} sub={d.last ? `${d.last.clients} new in ${d.last.month}` : "New clients per month"} /></Link>
            <Link to="/staff/returns" className="block"><HeroStat icon={FileText} label="Tax returns" value={num(data.total_returns)} color={C.sky} spark={d.col("opened")}
              delta={change(d.col("opened"))} sub={`${num(d.open)} open · ${d.last ? `${d.last.opened} opened in ${d.last.month}` : ""}`} /></Link>
            <HeroStat icon={CheckCircle2} label="Filed & acknowledged" value={num(d.done)} color={C.green} spark={d.col("filed")}
              delta={change(d.col("filed"))} sub={data.total_returns ? `${Math.round((d.done * 100) / data.total_returns)}% of all returns` : "No returns yet"} />
            <HeroStat icon={BadgeDollarSign} label="Fees collected · 12 months" value={money(d.fees12, { compact: true })} color={GOLD} spark={d.col("collected")}
              delta={change(d.col("collected"))} sub={`${money(data.collected_this_month, { compact: true })} so far this month`} />
          </div>
        )}
      </section>

      {isLoading && !data && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && d && (
        <>
          <section>
            <SectionTitle n={1} title="Needs attention" sub="Click a card to open its queue" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              <AttentionCard icon={FileCheck2} label="Documents to verify" hint="Client uploads to check" value={data.documents_to_verify} to="/staff/queue/documents" color={C.teal} />
              <AttentionCard icon={AlarmClock} label="Overdue returns" hint="Past the FBR due date" value={data.overdue} to="/staff/returns" color={C.rose} />
              <AttentionCard icon={CalendarClock} label="Follow-ups due" hint="Site visits to call back" value={data.followups_due} to="/staff/visits" color={C.indigo} />
              <AttentionCard icon={Wallet} label="Payments to verify" hint="Proofs → invoice" value={data.payments_to_verify} to="/staff/payments" color={C.amber} />
              <AttentionCard icon={PhoneCall} label="New consultations" hint="Website bookings" value={data.consultations_new} to="/staff/consultations" color={C.slate} />
            </div>
          </section>

          {d.highlights.length > 0 && <Highlights items={d.highlights} />}

          <section>
            <SectionTitle n={2} title="Trends" sub="Last 12 months" />
            <div className="grid gap-6 lg:grid-cols-5">
              <ChartCard className="lg:col-span-3" bodyClass="h-80"
                title={view === "returns" ? "Returns opened vs filed" : view === "clients" ? "New clients" : "Fees collected"}
                sub={view === "returns" ? "Bars: opened · gold line: filed on IRIS" : view === "clients" ? "Clients registered each month" : "Verified payments each month"}
                actions={<Segmented value={view} onChange={setView} options={[["returns", "Returns"], ["clients", "Clients"], ["fees", "Fees"]]} />}
                insight={d.last && (view === "returns" ? `${d.last.month}: ${d.last.opened} opened, ${d.last.filed} filed.`
                  : view === "clients" ? `${d.last.clients} new client${d.last.clients === 1 ? "" : "s"} in ${d.last.month}.`
                  : `${money(d.last.collected)} collected in ${d.last.month}.`)}>
                <TrendChart data={d.t} view={view} />
              </ChartCard>
              <ChartCard className="lg:col-span-2" title="Returns by status" bodyClass="h-auto"
                sub={`${money(data.total_payable, { compact: true })} payable · ${money(data.total_refund, { compact: true })} refunds`}>
                {data.total_returns ? (
                  <StatusDonut rows={data.by_state.filter((r) => r.count)} total={data.total_returns} />
                ) : <Empty text="No returns yet." />}
              </ChartCard>
            </div>
          </section>

          <section>
            <SectionTitle n={3} title="Pipeline & team" sub="Where the work is and who has it" />
            <div className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Pipeline by stage" sub={`${num(d.open)} open · ${num(d.done)} done`} bodyClass="h-auto">
                <div className="space-y-4 px-1 py-2">
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                    {d.stages.filter((s) => s.count).map((s) => (
                      <div key={s.label} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count * 100) / Math.max(data.total_returns, 1)}%`, background: s.color }} />))}
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-5">
                    {d.stages.map((s) => (
                      <li key={s.label} className="rounded-xl border bg-muted/30 px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.label}</div>
                        <div className="mt-1 text-xl font-bold tabular-nums">{s.count}</div>
                        <div className="text-[11px] text-muted-foreground">{data.total_returns ? Math.round((s.count * 100) / data.total_returns) : 0}%</div>
                      </li>))}
                  </ul>
                </div>
              </ChartCard>
              <ChartCard title="Consultant workload" sub="Open returns per consultant" bodyClass="h-auto">
                {data.workload.length ? (
                  <ul className="space-y-2.5 px-1 py-2">
                    {data.workload.slice(0, 7).map((w, i) => {
                      const max = data.workload[0].count || 1;
                      return (
                        <li key={w.user} className="flex items-center gap-3">
                          <Avatar name={w.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-medium">{w.name}</span>
                              <span className="font-semibold tabular-nums">{w.count}</span></div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full" style={{ width: `${(w.count * 100) / max}%`,
                                background: i === 0 ? `linear-gradient(90deg, #9c7a22, ${GOLD}, #f3d77a)` : C.sky }} /></div>
                          </div>
                        </li>);
                    })}
                  </ul>
                ) : <Empty text="Nothing open." />}
              </ChartCard>
            </div>
          </section>

          <section>
            <SectionTitle n={4} title="Recently updated returns" sub="Last 8" action={<Link to="/staff/returns" className="text-xs font-semibold text-[#9c7a22] hover:underline dark:text-[#f3d77a]">All returns →</Link>} />
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <ul className="divide-y">
                {data.recent.map((r) => (
                  <li key={r.name}>
                    <Link to={`/staff/returns/${r.name}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-muted/40">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_TONE[r.workflow_state] ?? C.slate }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.client_name}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.name} · TY {r.tax_year}</div>
                      </div>
                      <StateBadge state={r.workflow_state} />
                      <span className="w-28 text-end text-sm font-semibold tabular-nums">{money(r.net_tax_payable)}</span>
                    </Link>
                  </li>))}
                {!data.recent.length && <li className="p-8 text-center text-sm text-muted-foreground">No returns yet.</li>}
              </ul>
            </div>
          </section>

          {data.total_refund > 0 && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Undo2 className="h-3.5 w-3.5" /> Refund figures are estimates until FBR processes them.</p>}
        </>
      )}
    </div>
  );
}

function SectionTitle({ n, title, sub, action }: { n: number; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-sm font-bold text-[#141416] shadow-md">{n}</span>
      <h2 className="text-lg font-semibold">{title}</h2>
      {sub && <span className="hidden text-xs text-muted-foreground sm:inline">{sub}</span>}
      <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      {action}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="grid h-full place-items-center py-10 text-center text-sm text-muted-foreground">{text}</p>;
}

/** Pie with separated, rounded slices; the hovered slice pops out. Percentages sit on slices of 6% or more, and the
 *  legend sits underneath (11 statuses don't fit beside it). */
function StatusDonut({ rows, total }: { rows: { state: string; count: number }[]; total: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover !== null ? rows[hover] : null;
  const RAD = Math.PI / 180;
  const label = ({ cx, cy, midAngle, outerRadius, percent }: { cx: number; cy: number; midAngle: number; outerRadius: number; percent: number }) => {
    if (percent < 0.06) return null;
    const r = outerRadius * 0.62;
    return (
      <text x={cx + r * Math.cos(-midAngle * RAD)} y={cy + r * Math.sin(-midAngle * RAD)} textAnchor="middle" dominantBaseline="central"
        className="pointer-events-none fill-white text-[11px] font-bold" style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,.25)", strokeWidth: 2 }}>
        {Math.round(percent * 100)}%</text>
    );
  };
  const pop = (props: { cx: number; cy: number; innerRadius: number; outerRadius: number; startAngle: number; endAngle: number; fill: string; midAngle: number }) => {
    const shift = 8;
    const dx = shift * Math.cos(-props.midAngle * RAD), dy = shift * Math.sin(-props.midAngle * RAD);
    return <Sector {...props} cx={props.cx + dx} cy={props.cy + dy} outerRadius={props.outerRadius + 4} cornerRadius={6}
      stroke="hsl(var(--card))" strokeWidth={2} style={{ filter: `drop-shadow(0 6px 12px ${props.fill}66)` }} />;
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{shown ? shown.state : "All returns"}</p>
          <p className="text-2xl font-bold tabular-nums">{shown ? shown.count : total}
            {shown && total > 0 && <span className="ms-2 text-sm font-semibold text-muted-foreground">{Math.round((shown.count * 100) / total)}%</span>}</p>
        </div>
        {shown && <span className="size-3 rounded-full ring-4 ring-muted" style={{ background: STATUS_TONE[shown.state] ?? C.slate }} />}
      </div>
      <div className="mx-auto h-60 w-60">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="state" outerRadius="88%" paddingAngle={1.5} cornerRadius={6}
              stroke="hsl(var(--card))" strokeWidth={2} labelLine={false} label={label} startAngle={90} endAngle={-270}
              activeIndex={hover ?? undefined} activeShape={pop as never}
              onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)} isAnimationActive animationDuration={700}>
              {rows.map((r, i) => <Cell key={r.state} fill={STATUS_TONE[r.state] ?? C.slate} opacity={hover === null || hover === i ? 1 : 0.4} className="cursor-pointer outline-none" />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        {rows.map((r, i) => (
          <li key={r.state} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={`${r.state}: ${r.count}`}
            className={cn("flex cursor-default items-center gap-2 rounded-lg px-2 py-1 text-xs transition", hover === i && "bg-muted")}>
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: STATUS_TONE[r.state] ?? C.slate }} />
            <span className="min-w-0 flex-1 truncate">{r.state}</span>
            <span className="font-semibold tabular-nums">{r.count}</span>
            <span className="w-8 text-end tabular-nums text-muted-foreground">{total ? Math.round((r.count * 100) / total) : 0}%</span>
          </li>))}
      </ul>
    </div>
  );
}
