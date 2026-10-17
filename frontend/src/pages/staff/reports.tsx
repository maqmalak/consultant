/**
 * Report center: the firm's reports grouped by what they answer, run inside the portal with simple filters, shown as a
 * sortable, searchable table and exported to CSV. The desk's report engine and role rules decide who may run what;
 * "Open in desk" stays available for the full report tools.
 */
import {
  ArrowDown, ArrowUp, BarChart3, ChevronLeft, Contact, Download, ExternalLink, FileWarning, Hourglass, Layers, MapPin, Phone, Play,
  Scale, Search, Send, TrendingUp, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { SelectInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const R = "pakistan_tax_consultancy.api.reports";
interface FilterSpec { fieldname: string; label: string; type: "tax_year" | "select" | "check"; options?: string[] }
interface ReportMeta { name: string; group: string; icon: string; description: string; filters: FilterSpec[] }
interface Catalog { reports: ReportMeta[]; groups: string[]; tax_years: string[]; default_year: string | null }
interface Column { label: string; fieldname: string; fieldtype: string; options?: string }
interface Result { columns: Column[]; rows: Record<string, any>[] }

const ICONS: Record<string, LucideIcon> = { layers: Layers, hourglass: Hourglass, users: Users, "file-warning": FileWarning, send: Send,
  scale: Scale, wallet: Wallet, contact: Contact, "map-pin": MapPin, phone: Phone };
const GROUP_LOOK: Record<string, string> = {
  Returns: "from-sky-400 to-sky-600", Money: "from-emerald-400 to-emerald-600", Clients: "from-violet-400 to-violet-600",
  Team: "from-amber-300 to-amber-500", Filing: "from-indigo-400 to-indigo-600",
};

export function ReportsPage() {
  const { data, error, isLoading } = useApi<Catalog>(`${R}.catalog`);
  const [q, setQ] = useState("");
  if (isLoading) return <Loading />;
  if (error || !data) return <div className="page-container"><ErrorState error={error} /></div>;
  const shown = data.reports.filter((r) => !q || `${r.name} ${r.description}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page-container max-w-[1600px] space-y-5">
      <div className="hero-dark relative overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-[#d4af37]/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]"><BarChart3 className="h-6 w-6" /></span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f3d77a]">Report center</p>
              <h1 className="font-display text-2xl font-semibold">Every report, one click away</h1>
              <p className="text-sm text-white/60">Run in the portal, filter, sort and download as CSV — {data.reports.length} reports you can open.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3">
              <Search className="h-4 w-4 text-white/60" />
              <input className="h-10 w-52 bg-transparent text-sm text-white outline-none placeholder:text-white/40" placeholder="Find a report" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <Link to="/staff/insights" className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#b8912a] px-4 text-sm font-semibold text-[#141416]"><TrendingUp className="h-4 w-4" /> Insights</Link>
          </div>
        </div>
      </div>
      {data.groups.map((g) => {
        const rows = shown.filter((r) => r.group === g);
        if (!rows.length) return null;
        return (
          <section key={g}>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <span className={cn("h-2.5 w-2.5 rounded-full bg-gradient-to-br", GROUP_LOOK[g])} />{g}<span className="rounded-full bg-muted px-2">{rows.length}</span></h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {rows.map((r) => {
                const Icon = ICONS[r.icon] ?? BarChart3;
                return (
                  <Link key={r.name} to={`/staff/reports/${encodeURIComponent(r.name)}`}
                    className="group flex flex-col rounded-2xl border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <span className={cn("grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm", GROUP_LOOK[g])}><Icon className="h-5 w-5" /></span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary opacity-0 transition group-hover:opacity-100"><Play className="h-3 w-3" /> Run</span>
                    </div>
                    <p className="mt-3 font-semibold">{r.name}</p>
                    <p className="mt-1 flex-1 text-sm text-muted-foreground">{r.description}</p>
                    {r.filters.length > 0 && <p className="mt-3 text-[11px] text-muted-foreground">Filter by {r.filters.map((f) => f.label.toLowerCase()).join(", ")}</p>}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
      {!shown.length && <Empty title="No report matches" hint="Try another word." />}
    </div>
  );
}

const isMoney = (c: Column) => c.fieldtype === "Currency";
const isNum = (c: Column) => ["Currency", "Int", "Float", "Percent"].includes(c.fieldtype);
function cell(c: Column, v: any) {
  if (v == null || v === "") return "—";
  if (isMoney(c)) return money(Number(v));
  if (c.fieldtype === "Int" || c.fieldtype === "Float") return Number(v).toLocaleString("en-PK");
  if (c.fieldtype === "Percent") return `${Number(v).toFixed(1)}%`;
  if (c.fieldtype === "Check") return Number(v) ? "Yes" : "No";
  if (c.fieldtype === "Date") return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (c.fieldtype === "Datetime") return new Date(v).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  return String(v);
}
function link(c: Column, v: any) {
  if (!v || c.fieldtype !== "Link") return null;
  if (c.options === "Tax Return") return `/staff/returns/${v}`;
  if (c.options === "Tax Client") return `/staff/clients/${v}`;
  return null;
}

export function ReportViewer() {
  const { name = "" } = useParams();
  const report = decodeURIComponent(name);
  const navigate = useNavigate();
  const cat = useApi<Catalog>(`${R}.catalog`);
  const meta = cat.data?.reports.find((r) => r.name === report);
  const [filters, setFilters] = useState<Record<string, any> | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const f = filters ?? (meta ? Object.fromEntries(meta.filters.map((x) => [x.fieldname, x.type === "tax_year" ? cat.data?.default_year ?? "" : x.type === "check" ? 0 : ""])) : {});
  const run = async (use = f) => {
    setBusy(true); setErr(null);
    try { setRes(await apiCall<Result>(`${R}.run`, { report, filters: JSON.stringify(use) })); } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  // first run as soon as the catalog (and so the default filters) is known
  const ready = !!meta;
  useEffect(() => { if (ready) void run(); }, [ready, report]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!res) return [];
    let out = res.rows.filter((r) => !q || Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q.toLowerCase())));
    if (sort) out = [...out].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""))) * sort.dir;
    });
    return out;
  }, [res, q, sort]);
  const totals = res ? res.columns.filter(isMoney).map((c) => [c.fieldname, rows.reduce((s, r) => s + (Number(r[c.fieldname]) || 0), 0)] as [string, number]) : [];

  const exportCsv = () => {
    if (!res) return;
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [res.columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => res.columns.map((c) => esc(r[c.fieldname])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${report.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (cat.isLoading) return <Loading />;
  if (cat.error) return <div className="page-container"><ErrorState error={cat.error} /></div>;
  if (!meta) return <div className="page-container"><Empty title="Report not available" hint="It may not exist, or your role may not open it." /></div>;
  const Icon = ICONS[meta.icon] ?? BarChart3;
  return (
    <div className="page-container max-w-[1800px] space-y-4">
      <button type="button" onClick={() => navigate("/staff/reports")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Report center</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br text-white shadow-sm", GROUP_LOOK[meta.group])}><Icon className="h-5 w-5" /></span>
          <div><h1 className="text-xl font-semibold sm:text-2xl">{meta.name}</h1><p className="text-sm text-muted-foreground">{meta.description}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={!res?.rows.length} onClick={exportCsv}><Download className="h-4 w-4" /> CSV</Button>
          <a href={`/app/query-report/${encodeURIComponent(meta.name)}`} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent">Open in desk <ExternalLink className="h-3.5 w-3.5" /></a>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-3 shadow-sm">
        {meta.filters.map((x) => (
          <label key={x.fieldname} className="text-xs font-medium text-muted-foreground">
            {x.type !== "check" && <span className="mb-1 block">{x.label}</span>}
            {x.type === "tax_year" ? (
              <SelectInput className="h-9 w-36" value={f[x.fieldname] ?? ""} onChange={(e) => { const n = { ...f, [x.fieldname]: e.target.value }; setFilters(n); void run(n); }}>
                <option value="">All years</option>{(cat.data?.tax_years ?? []).map((y) => <option key={y} value={y}>TY{y}</option>)}</SelectInput>
            ) : x.type === "select" ? (
              <SelectInput className="h-9 w-48" value={f[x.fieldname] ?? ""} onChange={(e) => { const n = { ...f, [x.fieldname]: e.target.value }; setFilters(n); void run(n); }}>
                {(x.options ?? []).map((o) => <option key={o} value={o}>{o || "All"}</option>)}</SelectInput>
            ) : (
              <span className="flex h-9 items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={!!f[x.fieldname]}
                onChange={(e) => { const n = { ...f, [x.fieldname]: e.target.checked ? 1 : 0 }; setFilters(n); void run(n); }} /> {x.label}</span>
            )}
          </label>
        ))}
        <label className="ms-auto flex items-center gap-2 rounded-lg border bg-input-bg px-2.5 focus-within:ring-2 focus-within:ring-ring/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="h-9 w-56 bg-transparent text-sm outline-none" placeholder="Search in results" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <Button variant="outline" loading={busy} onClick={() => void run()}>{!busy && <Play className="h-4 w-4" />} Run</Button>
      </div>
      <InlineError error={err} />

      {res && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-full bg-muted px-3 py-1 font-semibold">{rows.length} {rows.length === 1 ? "row" : "rows"}{q && res.rows.length !== rows.length ? ` of ${res.rows.length}` : ""}</span>
            {totals.map(([k, v]) => (
              <span key={k} className="rounded-full bg-primary/10 px-3 py-1 text-primary"><b>{res.columns.find((c) => c.fieldname === k)?.label}</b> {money(v)}</span>
            ))}
          </div>
          {rows.length ? (
            <div className="max-h-[70vh] overflow-auto rounded-2xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
                  <tr>
                    {res.columns.map((c) => (
                      <th key={c.fieldname} className={cn("whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", isNum(c) ? "text-end" : "text-start")}>
                        <button type="button" className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={() => setSort((s) => (s?.key === c.fieldname ? (s.dir === 1 ? { key: c.fieldname, dir: -1 } : null) : { key: c.fieldname, dir: 1 }))}>
                          {c.label}{sort?.key === c.fieldname && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      {res.columns.map((c) => {
                        const href = link(c, r[c.fieldname]);
                        return (
                          <td key={c.fieldname} className={cn("whitespace-nowrap px-3 py-2", isNum(c) && "text-end tabular-nums")}>
                            {href ? <Link to={href} className="font-medium text-primary hover:underline">{cell(c, r[c.fieldname])}</Link> : cell(c, r[c.fieldname])}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No rows" hint="Change the filters or clear the search." />}
        </>
      )}
      {!res && busy && <Loading />}
    </div>
  );
}
