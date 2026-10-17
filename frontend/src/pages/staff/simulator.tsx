/**
 * Tax simulator for one return (pattern of the solar P&L simulator): a slider per income group, add-backs, deductions,
 * credits and tax paid; the tax recalculates on the server with the year's own slabs (rates never live in the browser)
 * and shows next to this year's actual figures and last year's return. Scenarios are saved, compared side by side and
 * printed as a "Tax Planning Report" into the client's document vault. Everything here is an estimate.
 */
import {
  ArrowDownRight, ArrowLeft, ArrowUpRight, Banknote, Check, Download, FileText, FlaskConical, GitCompareArrows, History, Landmark, Lock, Minus,
  Percent, Plus, Receipt, RotateCcw, Save, Scale, SlidersHorizontal, Trash2, TrendingDown, Upload, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ColorTabs, type TabTone } from "@/components/ui/color-tabs";
import { Dialog } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const S = "pakistan_tax_consultancy.api.simulator";

type Group = "income" | "addback" | "deduction" | "credit" | "paid";
interface Lever { key: string; label: string; group: Group; base: number; last_year: number | null; hint: string | null; max: number }
type Result = Record<string, number | null> & { tax_liability: number; effective_rate: number };
interface Scenario { name: string; title: string; notes: string | null; levers: Record<string, number>; result: Result; owner_name: string; creation: string;
  applied_on: string | null; applied_by: string | null; applied_calculation: string | null }
interface ApplyPlan { changes: { key: string; label: string; group: string; old: number; new: number }[]; evidence: { document_type: string; label: string; amount: number }[];
  before: Result; after: Result; editable: boolean; state: string; applied: { name: string; title: string } | null }
const EDITABLE = ["Documents Pending", "Draft", "Changes Required"];
interface Ctx {
  tax_return: string; tax_client: string; client_name: string; tax_year: string; taxpayer_type: string; workflow_state: string;
  rules_are_demo: boolean; groups: Record<Group, string>; metrics: [string, string][]; wealth_metrics: [string, string][];
  levers: Lever[]; actual: Result; wealth: Record<string, number>;
  last_year: { tax_return: string; tax_year: string; workflow_state: string; result: Result; wealth: Record<string, number> } | null;
  scenarios: Scenario[];
}

const GROUP_STYLE: Record<Group, { icon: LucideIcon; tone: TabTone; bar: string; text: string }> = {
  income: { icon: Banknote, tone: "gold", bar: "accent-[#d4af37]", text: "text-[#b8912a] dark:text-[#f3d77a]" },
  addback: { icon: Plus, tone: "rose", bar: "accent-rose-500", text: "text-rose-500" },
  deduction: { icon: Minus, tone: "sky", bar: "accent-sky-500", text: "text-sky-500" },
  credit: { icon: Receipt, tone: "emerald", bar: "accent-emerald-500", text: "text-emerald-500" },
  paid: { icon: Landmark, tone: "violet", bar: "accent-violet-500", text: "text-violet-500" },
};
// lower is better for these (shown green when they fall)
const LOWER_BETTER = new Set(["taxable_income", "normal_tax", "separate_tax", "tax_liability", "net_payable", "effective_rate"]);
const short = (v: number | null | undefined) => money(v, { compact: true });

function Delta({ value, metric, pct }: { value: number; metric: string; pct?: boolean }) {
  if (Math.abs(value) < 0.5) return <span className="text-xs text-muted-foreground">—</span>;
  const good = LOWER_BETTER.has(metric) ? value < 0 : metric === "refund_due" || metric === "total_tax_credits" || metric === "total_deductions" ? value > 0 : null;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-semibold tabular-nums",
      good === null ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
      <Icon className="h-3 w-3" />{pct ? `${Math.abs(value).toFixed(2)} pts` : short(Math.abs(value))}
    </span>
  );
}

function LeverRow({ lever, value, onChange }: { lever: Lever; value: number; onChange: (v: number) => void }) {
  const st = GROUP_STYLE[lever.group];
  const max = Math.max(lever.max, value);
  const step = max > 5_000_000 ? 10_000 : max > 500_000 ? 1_000 : 100;
  const changed = Math.abs(value - lever.base) >= 1;
  const chips: [string, number][] = [["−20%", lever.base * 0.8], ["−10%", lever.base * 0.9], ["+10%", lever.base * 1.1], ["+20%", lever.base * 1.2]];
  return (
    <div className={cn("rounded-xl border bg-card p-3.5 transition", changed && "border-primary/50 shadow-sm ring-1 ring-primary/20")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{lever.label}</p>
          <p className="text-[11px] text-muted-foreground">
            This year {money(lever.base)}{lever.last_year !== null && <> · last year {money(lever.last_year)}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changed && <Delta value={value - lever.base} metric={lever.group === "income" || lever.group === "addback" ? "taxable_income" : "refund_due"} />}
          <span className="flex items-center rounded-md border bg-input-bg focus-within:ring-2 focus-within:ring-ring/30">
            <span className="ps-2 text-xs text-muted-foreground">Rs</span>
            <input aria-label={`${lever.label} amount`} inputMode="numeric" className="h-8 w-28 bg-transparent px-1.5 text-end text-sm font-semibold tabular-nums outline-none"
              value={Math.round(value).toLocaleString("en-PK")} onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} />
          </span>
        </div>
      </div>
      <input type="range" min={0} max={max} step={step} value={value} aria-label={lever.label}
        onChange={(e) => onChange(Number(e.target.value))} className={cn("mt-2 w-full cursor-pointer", st.bar)} />
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {lever.base > 0 && chips.map(([l, v]) => (
          <button key={l} type="button" onClick={() => onChange(Math.round(v))} className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground">{l}</button>
        ))}
        {lever.last_year !== null && Math.abs(lever.last_year - value) >= 1 && (
          <button type="button" onClick={() => onChange(lever.last_year ?? 0)} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground">
            <History className="h-3 w-3" /> Last year</button>
        )}
        {changed && (
          <button type="button" onClick={() => onChange(lever.base)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-primary hover:underline">
            <RotateCcw className="h-3 w-3" /> Actual</button>
        )}
      </div>
      {lever.hint && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{lever.hint}</p>}
    </div>
  );
}

function Kpi({ label, icon: Icon, value, sub, tone }: { label: string; icon: LucideIcon; value: string; sub?: ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tone)}><Icon className="h-4 w-4" /></span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <div className="mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

/** Metrics × columns with the change of the highlighted column against "Actual". */
function CompareTable({ ctx, columns }: { ctx: Ctx; columns: { title: string; result: Result; main?: boolean; tone?: string }[] }) {
  const actual = ctx.actual;
  const main = columns.find((c) => c.main);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="py-2 text-start font-semibold" />
            {columns.map((c) => <th key={c.title} className={cn("px-2 py-2 text-end font-semibold leading-tight", c.main && "text-primary")}>{c.title}</th>)}
            {main && <th className="py-2 ps-2 text-end font-semibold">vs actual</th>}
          </tr>
        </thead>
        <tbody>
          {[...ctx.metrics, ["effective_rate", "Effective rate"] as [string, string]].map(([key, label]) => {
            const strong = key === "tax_liability";
            return (
              <tr key={key} className={cn("border-b last:border-0", strong && "bg-primary/5 font-semibold")}>
                <td className="py-1.5 pe-2 text-muted-foreground">{label}</td>
                {columns.map((c) => {
                  const v = c.result?.[key];
                  return <td key={c.title} className={cn("whitespace-nowrap px-2 py-1.5 text-end tabular-nums", c.main && "font-semibold text-foreground")}>
                    {v === null || v === undefined ? "—" : key === "effective_rate" ? `${Number(v).toFixed(2)}%` : money(v)}</td>;
                })}
                {main && <td className="py-1.5 ps-2 text-end"><Delta value={Number(main.result?.[key] ?? 0) - Number(actual[key] ?? 0)} metric={key} pct={key === "effective_rate"} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const BAR_COLORS = ["#94a3b8", "#d4af37", "#6366f1", "#10b981", "#f43f5e", "#0ea5e9"];
function CompareChart({ columns }: { columns: { title: string; result: Result }[] }) {
  const rows = [["taxable_income", "Taxable income"], ["tax_liability", "Tax liability"], ["tax_paid", "Paid"], ["net_payable", "Payable"], ["refund_due", "Refund"]]
    .map(([k, l]) => ({ metric: l, ...Object.fromEntries(columns.map((c) => [c.title, Number(c.result?.[k] ?? 0)])) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis dataKey="metric" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
          <YAxis tickFormatter={(v: number) => (v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${Math.round(v / 1e5)}L` : `${Math.round(v / 1e3)}k`)}
            tick={{ fontSize: 11 }} width={40} className="fill-muted-foreground" />
          <Tooltip formatter={(v: number) => money(v)} contentStyle={{ borderRadius: 12, fontSize: 12 }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {columns.map((c, i) => <Bar key={c.title} dataKey={c.title} fill={BAR_COLORS[i % BAR_COLORS.length]} radius={[6, 6, 0, 0]} maxBarSize={34} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SimulatorPage() {
  const { name = "" } = useParams();
  const { data: ctx, error, isLoading, mutate } = useApi<Ctx>(`${S}.context`, { tax_return: name });
  const [values, setValues] = useState<Record<string, number>>({});
  const [sim, setSim] = useState<Result | null>(null);
  const [simErr, setSimErr] = useState<unknown>(null);
  const [group, setGroup] = useState<Group | "all">("all");
  const [view, setView] = useState<"live" | "scenarios">("live");
  const [picked, setPicked] = useState<string[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loaded, setLoaded] = useState<Scenario | null>(null);
  const seq = useRef(0);

  // start from the actual figures
  useEffect(() => {
    if (ctx && !Object.keys(values).length) setValues(Object.fromEntries(ctx.levers.map((l) => [l.key, l.base])));
  }, [ctx, values]);

  // live recalculation (server-side, debounced; stale answers dropped)
  useEffect(() => {
    if (!ctx || !Object.keys(values).length) return;
    const id = ++seq.current;
    const t = setTimeout(() => {
      apiCall<Result>(`${S}.simulate`, { tax_return: name, values: JSON.stringify(values) })
        .then((r) => { if (id === seq.current) { setSim(r); setSimErr(null); } })
        .catch((e) => { if (id === seq.current) setSimErr(e); });
    }, 180);
    return () => clearTimeout(t);
  }, [values, ctx, name]);

  const changed = useMemo(() => (ctx?.levers ?? []).filter((l) => Math.abs((values[l.key] ?? l.base) - l.base) >= 1), [ctx, values]);
  if (isLoading) return <Loading />;
  if (error || !ctx) return <div className="page-container"><ErrorState error={error} /></div>;

  const result = sim ?? ctx.actual;
  const ly = ctx.last_year;
  const groups = (Object.keys(ctx.groups) as Group[]).filter((g) => ctx.levers.some((l) => l.group === g));
  const shown = ctx.levers.filter((l) => group === "all" || l.group === group);
  const set = (key: string) => (v: number) => setValues((x) => ({ ...x, [key]: Math.max(0, Math.round(v)) }));
  const reset = () => { setValues(Object.fromEntries(ctx.levers.map((l) => [l.key, l.base]))); setLoaded(null); };
  const toLastYear = () => setValues(Object.fromEntries(ctx.levers.map((l) => [l.key, l.last_year ?? l.base])));
  const saving = ctx.actual.tax_liability - result.tax_liability;
  const vsLy = ly?.result ? result.tax_liability - (ly.result.tax_liability ?? 0) : null;
  const liveColumns = [
    ...(ly?.result ? [{ title: `TY${ly.tax_year} filed`, result: ly.result }] : []),
    { title: `TY${ctx.tax_year} actual`, result: ctx.actual },
    { title: loaded ? loaded.title : "Simulated", result, main: true },
  ];

  return (
    <div className="page-container space-y-5">
      <Link to={`/staff/returns/${name}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> {name}</Link>

      {/* hero */}
      <div className="hero-dark overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]"><SlidersHorizontal className="h-6 w-6" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f3d77a]">Tax simulator · TY{ctx.tax_year}</p>
              <h1 className="font-display text-2xl font-semibold">{ctx.client_name}</h1>
              <p className="text-sm text-white/60">{ctx.taxpayer_type} · {ctx.workflow_state}{ly ? ` · compared with TY${ly.tax_year} (${ly.workflow_state})` : " · no return for last year"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ly && <Button size="default" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={toLastYear}><History className="h-4 w-4" /> Last year's figures</Button>}
            <Button size="default" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={reset} disabled={!changed.length}><RotateCcw className="h-4 w-4" /> Reset</Button>
            <Button size="default" onClick={() => setSaveOpen(true)}><Save className="h-4 w-4" /> Save scenario</Button>
          </div>
        </div>
        {ctx.rules_are_demo && <p className="mt-4 flex items-center gap-2 rounded-lg bg-amber-400/15 px-3 py-1.5 text-xs text-amber-200"><FlaskConical className="h-3.5 w-3.5" /> Demo tax rates — results are illustrative until the Finance Act rates are verified.</p>}
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Simulated tax liability" icon={Scale} tone="bg-[#d4af37]/15 text-[#b8912a] dark:text-[#f3d77a]" value={money(result.tax_liability)}
          sub={<span className="text-muted-foreground">actual {money(ctx.actual.tax_liability)}</span>} />
        <Kpi label={saving >= 0 ? "Saving vs actual" : "Extra tax vs actual"} icon={TrendingDown} tone={saving >= 0 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400"}
          value={money(Math.abs(saving))} sub={<span className="text-muted-foreground">{changed.length} lever{changed.length === 1 ? "" : "s"} moved</span>} />
        <Kpi label={result.refund_due ? "Refund" : "Payable"} icon={Receipt} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400"
          value={money(result.refund_due ? result.refund_due : result.net_payable)} sub={<span className="text-muted-foreground">after {money(result.tax_paid)} already paid</span>} />
        <Kpi label="Effective rate" icon={Percent} tone="bg-violet-500/15 text-violet-600 dark:text-violet-400" value={`${result.effective_rate.toFixed(2)}%`}
          sub={vsLy === null ? <span className="text-muted-foreground">no last-year return</span> : <span className="flex items-center gap-1 text-muted-foreground">vs TY{ly?.tax_year}: <Delta value={vsLy} metric="tax_liability" /></span>} />
      </div>

      <ColorTabs value={view} onChange={setView} tabs={[
        { key: "live", label: "Simulator", icon: SlidersHorizontal, tone: "gold" },
        { key: "scenarios", label: "Saved scenarios", icon: GitCompareArrows, tone: "indigo", count: ctx.scenarios.length },
      ]} />

      {view === "live" ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setGroup("all")} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", group === "all" ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}>All</button>
              {groups.map((g) => {
                const Icon = GROUP_STYLE[g].icon;
                return <button key={g} type="button" onClick={() => setGroup(g)} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold", group === g ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}>
                  <Icon className={cn("h-3.5 w-3.5", group !== g && GROUP_STYLE[g].text)} />{ctx.groups[g]}</button>;
              })}
            </div>
            {loaded && <p className="flex items-center gap-2 rounded-lg bg-indigo-500/10 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300"><Upload className="h-4 w-4" /> Loaded “{loaded.title}” — move the sliders and save again to update it.</p>}
            {(group === "all" ? groups : [group]).map((g) => (
              <section key={g} className="space-y-2">
                <h2 className={cn("flex items-center gap-2 pt-1 text-xs font-bold uppercase tracking-wider", GROUP_STYLE[g].text)}>
                  {(() => { const Icon = GROUP_STYLE[g].icon; return <Icon className="h-3.5 w-3.5" />; })()}{ctx.groups[g]}</h2>
                {shown.filter((l) => l.group === g).map((l) => <LeverRow key={l.key} lever={l} value={values[l.key] ?? l.base} onChange={set(l.key)} />)}
              </section>
            ))}
          </div>

          <div className="space-y-4 xl:sticky xl:top-20">
            <div className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Comparison</h2>
                {!ly && <span className="text-xs text-muted-foreground">No return for TY{Number(ctx.tax_year) - 1}</span>}
              </div>
              <InlineError error={simErr} />
              <CompareTable ctx={ctx} columns={liveColumns} />
            </div>
            <div className="rounded-2xl border bg-card p-4 shadow-sm"><CompareChart columns={liveColumns} /></div>
            {ly && <WealthCard ctx={ctx} />}
          </div>
        </div>
      ) : (
        <Scenarios ctx={ctx} picked={picked} setPicked={setPicked} onChanged={() => void mutate()}
          onLoad={(s) => { setValues({ ...Object.fromEntries(ctx.levers.map((l) => [l.key, l.base])), ...s.levers }); setLoaded(s); setView("live"); }} />
      )}

      <SaveDialog open={saveOpen} onClose={() => setSaveOpen(false)} taxReturn={name} values={values} loaded={loaded}
        changes={changed.map((l) => `${l.label}: ${money(l.base)} → ${money(values[l.key])}`)}
        onSaved={(n) => { setSaveOpen(false); void mutate(); setPicked((p) => (p.includes(n) ? p : [...p, n].slice(-3))); }} />
    </div>
  );
}

function WealthCard({ ctx }: { ctx: Ctx }) {
  const ly = ctx.last_year!;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="mb-2 font-semibold">Wealth statement · TY{ly.tax_year} → TY{ctx.tax_year}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ctx.wealth_metrics.map(([k, l]) => {
          const a = ly.wealth?.[k] ?? 0, b = ctx.wealth?.[k] ?? 0;
          return (
            <div key={k} className="rounded-xl bg-muted/50 p-2.5">
              <p className="text-[11px] text-muted-foreground">{l}</p>
              <p className="text-sm font-semibold tabular-nums">{short(b)}</p>
              <p className="text-[11px] text-muted-foreground">was {short(a)} {Math.abs(b - a) >= 1 && <span className={b > a ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>{b > a ? "▲" : "▼"}</span>}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SaveDialog({ open, onClose, taxReturn, values, loaded, changes, onSaved }: {
  open: boolean; onClose: () => void; taxReturn: string; values: Record<string, number>; loaded: Scenario | null; changes: string[]; onSaved: (name: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [asNew, setAsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => { if (open) { setTitle(loaded?.title ?? ""); setNotes(loaded?.notes ?? ""); setAsNew(!loaded); setErr(null); } }, [open, loaded]);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      onSaved(await apiCall<string>(`${S}.save_scenario`, { tax_return: taxReturn, title, notes, values: JSON.stringify(values), name: asNew ? undefined : loaded?.name }));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={loaded && !asNew ? "Update scenario" : "Save scenario"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!title.trim()} onClick={() => void save()}>{!busy && <Save className="h-4 w-4" />} Save</Button></>}>
      <div className="space-y-3">
        <label className="block text-sm font-medium">Name<input className="field mt-1.5" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pension contribution + Zakat" /></label>
        <label className="block text-sm font-medium">Notes for the client (printed on the report)<TextArea className="mt-1.5" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What the client would have to do for this to work" /></label>
        {loaded && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={asNew} onChange={(e) => setAsNew(e.target.checked)} /> Save as a new scenario (keep “{loaded.title}”)</label>}
        <div className="rounded-xl bg-muted/50 p-3 text-xs">
          <p className="mb-1 font-semibold">{changes.length ? "Changes from the actual figures" : "No lever moved — this saves the actual figures as a baseline."}</p>
          <ul className="space-y-0.5 text-muted-foreground">{changes.map((c) => <li key={c}>• {c}</li>)}</ul>
        </div>
        <InlineError error={err} />
      </div>
    </Dialog>
  );
}

/** Preview of what "Apply to return" will change, then the apply itself. */
function ApplyDialog({ s, taxReturn, onClose, onDone }: { s: Scenario; taxReturn: string; onClose: () => void; onDone: () => void }) {
  const plan = useApi<ApplyPlan>(`${S}.apply_preview`, { name: s.name });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<{ calculation: string; tax_liability: number } | null>(null);
  const p = plan.data;
  const apply = async () => {
    setBusy(true); setErr(null);
    try { setDone(await apiCall(`${S}.apply_scenario`, { name: s.name })); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open size="lg" onClose={done ? onDone : onClose} title={done ? "Scenario applied" : `Apply “${s.title}” to the return`}
      footer={done ? <><Link to={`/staff/returns/${taxReturn}`} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-accent">Open the return</Link><Button onClick={onDone}>Done</Button></>
        : <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!p?.editable || !p?.changes.length || !!p?.applied} onClick={() => void apply()}>{!busy && <Upload className="h-4 w-4" />} Apply to return</Button></>}>
      {plan.error ? <ErrorState error={plan.error} /> : !p ? <Loading /> : done ? (
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-emerald-700 dark:text-emerald-300"><Check className="h-4 w-4" />
            The return now uses these figures. Tax recalculated: <b>{money(done.tax_liability)}</b> (calculation {done.calculation}).</p>
          {p.evidence.length > 0 && <p>The client has been asked for {p.evidence.map((e) => e.document_type).join(", ")}. <b>Submit for Review</b> stays blocked until they are uploaded and verified.</p>}
          <p className="text-muted-foreground">Next: check the return, then <b>Submit for Review</b> as usual. The reviewer sees a note that it was prepared from this scenario.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {!p.editable && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">The return is {p.state} — it can't be changed now.</p>}
          {p.applied && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">“{p.applied.title}” is already applied. Undo it first.</p>}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Tax now</p><p className="font-bold tabular-nums">{money(p.before.tax_liability)}</p></div>
            <div className="rounded-xl bg-primary/10 p-3"><p className="text-[11px] text-muted-foreground">After applying</p><p className="font-bold tabular-nums text-primary">{money(p.after.tax_liability)}</p></div>
            <div className="rounded-xl bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Difference</p>
              <p className="font-bold"><Delta value={p.after.tax_liability - p.before.tax_liability} metric="tax_liability" /></p></div>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-3 py-2 text-start">Return line</th><th className="px-3 py-2 text-end">Now</th><th className="px-3 py-2 text-end">Will be</th></tr></thead>
              <tbody className="divide-y">
                {p.changes.map((c) => (
                  <tr key={c.key}><td className="px-3 py-2">{c.label}{c.old === 0 && <span className="ms-2 rounded bg-sky-500/15 px-1.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">new line</span>}</td>
                    <td className="px-3 py-2 text-end tabular-nums text-muted-foreground">{money(c.old)}</td><td className="px-3 py-2 text-end font-semibold tabular-nums">{money(c.new)}</td></tr>
                ))}
                {!p.changes.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Same figures as the return — nothing to apply.</td></tr>}
              </tbody>
            </table>
          </div>
          {p.evidence.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300"><FileText className="h-4 w-4" /> Evidence the client must upload</p>
              <ul className="mt-1.5 space-y-0.5 text-amber-900/80 dark:text-amber-200/80">{p.evidence.map((e) => <li key={e.document_type}>• {e.document_type} — for {e.label} {money(e.amount)}</li>)}</ul>
              <p className="mt-1.5 text-xs text-muted-foreground">Submit for Review stays blocked until these are verified.</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Lines in a group are adjusted together; a new item gets its own line marked “from scenario”. The tax is recalculated with the year's rates and a new calculation version is kept. You can undo while the return is being prepared.</p>
          <InlineError error={err} />
        </div>
      )}
    </Dialog>
  );
}

function Scenarios({ ctx, picked, setPicked, onChanged, onLoad }: {
  ctx: Ctx; picked: string[]; setPicked: (f: (p: string[]) => string[]) => void; onChanged: () => void; onLoad: (s: Scenario) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [docs, setDocs] = useState<Record<string, { file: string; version: number }>>({});
  const [applying, setApplying] = useState<Scenario | null>(null);
  const [undoing, setUndoing] = useState<Scenario | null>(null);
  const editable = EDITABLE.includes(ctx.workflow_state);
  const appliedOne = ctx.scenarios.find((x) => x.applied_on);
  const best = ctx.scenarios.length ? ctx.scenarios.reduce((a, b) => (b.result.tax_liability < a.result.tax_liability ? b : a)) : null;
  const chosen = ctx.scenarios.filter((s) => picked.includes(s.name));
  const columns = [
    ...(ctx.last_year?.result ? [{ title: `TY${ctx.last_year.tax_year} filed`, result: ctx.last_year.result }] : []),
    { title: `TY${ctx.tax_year} actual`, result: ctx.actual },
    ...chosen.map((s, i) => ({ title: s.title, result: s.result, main: i === 0 })),
  ];
  const generate = async (s: Scenario) => {
    setBusy(s.name); setErr(null);
    try { const r = await apiCall<{ file: string; version: number }>(`${S}.generate_report`, { name: s.name }); setDocs((d) => ({ ...d, [s.name]: r })); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  };
  const remove = async (s: Scenario) => {
    if (!window.confirm(`Delete the scenario “${s.title}”? Reports already generated stay in the vault.`)) return;
    setBusy(s.name);
    try { await apiCall(`${S}.delete_scenario`, { name: s.name }); setPicked((p) => p.filter((x) => x !== s.name)); onChanged(); }
    catch (e) { setErr(e); } finally { setBusy(null); }
  };
  if (!ctx.scenarios.length) return (
    <div className="rounded-2xl border border-dashed p-10 text-center">
      <GitCompareArrows className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-2 font-semibold">No saved scenarios yet</p>
      <p className="text-sm text-muted-foreground">Move the sliders in the simulator and press <b>Save scenario</b> to keep a what-if for this return.</p>
    </div>
  );
  return (
    <div className="space-y-5">
      <InlineError error={err} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ctx.scenarios.map((s) => {
          const on = picked.includes(s.name);
          const d = s.result.tax_liability - ctx.actual.tax_liability;
          const moved = ctx.levers.filter((l) => s.levers[l.key] !== undefined && Math.abs(s.levers[l.key] - l.base) >= 1);
          return (
            <div key={s.name} className={cn("flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition", on && "border-indigo-500/60 ring-2 ring-indigo-500/20")}>
              <div className="flex items-start justify-between gap-2">
                <label className="flex min-w-0 cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== s.name) : [...p, s.name].slice(-3)))} />
                  <span className="min-w-0"><span className="block truncate font-semibold">{s.title}</span>
                    <span className="text-[11px] text-muted-foreground">{s.owner_name} · {new Date(s.creation).toLocaleDateString()}</span></span>
                </label>
                {s.applied_on && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#d4af37]/20 px-2 py-0.5 text-[11px] font-bold text-[#8a6914] dark:text-[#f3d77a]"><Check className="h-3 w-3" /> Applied to return</span>}
                {!s.applied_on && best?.name === s.name && ctx.scenarios.length > 1 && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Lowest tax</span>}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div><p className="text-[11px] text-muted-foreground">Tax liability</p><p className="text-xl font-bold tabular-nums">{money(s.result.tax_liability)}</p></div>
                <Delta value={d} metric="tax_liability" />
              </div>
              {moved.length > 0 && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{moved.map((l) => `${l.label} ${money(s.levers[l.key])}`).join(" · ")}</p>}
              {s.notes && <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">{s.notes}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                {s.applied_on ? (
                  <Button size="sm" variant="outline" disabled={!editable} title={editable ? undefined : `The return is ${ctx.workflow_state} — reopen it to change figures`}
                    onClick={() => setUndoing(s)}><RotateCcw className="h-3.5 w-3.5" /> Undo</Button>
                ) : (
                  <Button size="sm" disabled={!editable || !!appliedOne}
                    title={!editable ? `Only while the return is being prepared (now: ${ctx.workflow_state})` : appliedOne ? `Undo “${appliedOne.title}” first` : "Write these figures into the return"}
                    onClick={() => setApplying(s)}><Upload className="h-3.5 w-3.5" /> Apply to return</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onLoad(s)}><SlidersHorizontal className="h-3.5 w-3.5" /> Load</Button>
                <Button size="sm" variant="outline" loading={busy === s.name} onClick={() => void generate(s)}>{busy !== s.name && <FileText className="h-3.5 w-3.5" />} Generate report</Button>
                {docs[s.name] && <a href={docs[s.name].file} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><Download className="h-3.5 w-3.5" /> v{docs[s.name].version} PDF</a>}
                <button type="button" onClick={() => void remove(s)} aria-label={`Delete ${s.title}`} className="ms-auto rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          );
        })}
      </div>

      {!editable && (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          <Lock className="h-4 w-4 shrink-0" /> The return is <b>{ctx.workflow_state}</b>. Scenarios can be applied or undone only while it is being prepared (Documents Pending, Draft or Changes Required).</p>
      )}
      {applying && <ApplyDialog s={applying} taxReturn={ctx.tax_return} onClose={() => setApplying(null)} onDone={() => { setApplying(null); onChanged(); }} />}
      <Dialog open={!!undoing} onClose={() => setUndoing(null)} title="Undo applied scenario?"
        footer={<><Button variant="ghost" onClick={() => setUndoing(null)}>Keep it</Button>
          <Button variant="danger" loading={busy === undoing?.name} onClick={() => {
            if (!undoing) return;
            setBusy(undoing.name); setErr(null);
            apiCall(`${S}.undo_scenario`, { name: undoing.name }).then(() => { setUndoing(null); onChanged(); }).catch(setErr).finally(() => setBusy(null));
          }}><RotateCcw className="h-4 w-4" /> Undo</Button></>}>
        <p className="text-sm">The return's income, deduction, credit and tax-paid lines go back exactly as they were before <b>“{undoing?.title}”</b> was applied, and the tax is recalculated. Any manual edits made to those lines since then are lost. Document requests it added are removed unless the client already uploaded them.</p>
      </Dialog>

      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><GitCompareArrows className="h-4 w-4 text-indigo-500" /> Compare</h2>
          <p className="text-xs text-muted-foreground">{chosen.length ? `${chosen.length} of 3 scenarios ticked · changes are for “${chosen[0].title}”` : "Tick up to 3 scenarios above"}</p>
        </div>
        {chosen.length ? <><CompareTable ctx={ctx} columns={columns} /><div className="mt-4"><CompareChart columns={columns} /></div></>
          : <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Check className="h-4 w-4" /> Ticked scenarios appear here next to this year's actual figures{ctx.last_year ? " and last year's return" : ""}.</p>}
      </div>
      <p className="text-xs text-muted-foreground">Generated reports go to the client's document vault (Document Vault → Tax Planning Report), where the client can download them.</p>
    </div>
  );
}
