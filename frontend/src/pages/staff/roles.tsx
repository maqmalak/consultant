/**
 * Roles & permissions (Tax Admin): who does what at the firm. Roles with their people and data scope; a permission
 * grid per role (switch read / write / create / … per record type, reset to the app's defaults); an overview of every
 * role side by side; and "check a user" — what one login can actually do. Tax Admin, System Manager and Client rules
 * are fixed so nobody locks the firm out or opens client data to the portal.
 */
import {
  BadgeCheck, Briefcase, Check, ClipboardCheck, Eye, FileCheck2, Keyboard, Lock, MapPin, RotateCcw, Search, Send, ShieldCheck, ShieldHalf, UserCog,
  UserRound, Users, Wrench, X, type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { ColorTabs } from "@/components/ui/color-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const R = "pakistan_tax_consultancy.api.roles";
type Rules = Record<string, Record<string, number>>;
interface RoleRow { role: string; description: string; scope: string; scope_label: string; editable: boolean; count: number; members: { user: string; full_name: string }[] }
interface DocRow { doctype: string; area: string; submittable: number; customized: boolean; rules: Rules }
interface Overview { roles: RoleRow[]; ptypes: string[]; doctypes: DocRow[]; editable_roles: string[]; scopes: Record<string, string> }
interface UserCheck { user: string; full_name: string; enabled: number; roles: string[]; scope: string; scope_label: string;
  rights: { doctype: string; area: string; read: boolean; write: boolean; create: boolean; delete: boolean }[] }

const ROLE_LOOK: Record<string, { icon: LucideIcon; tile: string; dot: string }> = {
  "System Manager": { icon: Wrench, tile: "from-slate-500 to-slate-700 text-white", dot: "bg-slate-500" },
  "Tax Admin": { icon: ShieldCheck, tile: "from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]", dot: "bg-[#d4af37]" },
  "Tax Consultant": { icon: Briefcase, tile: "from-sky-400 to-sky-600 text-white", dot: "bg-sky-500" },
  "Tax Reviewer": { icon: ClipboardCheck, tile: "from-violet-400 to-violet-600 text-white", dot: "bg-violet-500" },
  "Tax Approver": { icon: BadgeCheck, tile: "from-emerald-400 to-emerald-600 text-white", dot: "bg-emerald-500" },
  "Filing Officer": { icon: Send, tile: "from-indigo-400 to-indigo-600 text-white", dot: "bg-indigo-500" },
  "Field Officer": { icon: MapPin, tile: "from-orange-400 to-orange-600 text-white", dot: "bg-orange-500" },
  "Data Entry Officer": { icon: Keyboard, tile: "from-teal-400 to-teal-600 text-white", dot: "bg-teal-500" },
  Client: { icon: UserRound, tile: "from-rose-400 to-rose-600 text-white", dot: "bg-rose-500" },
};
const look = (role: string) => ROLE_LOOK[role] ?? ROLE_LOOK["Tax Consultant"];
const PT_LABEL: Record<string, string> = { read: "Read", write: "Edit", create: "Create", delete: "Delete", submit: "Submit", print: "Print", export: "Export", report: "Report" };
const SCOPE_TONE: Record<string, string> = {
  all: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", consultant: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  field: "bg-orange-500/15 text-orange-700 dark:text-orange-300", client: "bg-rose-500/15 text-rose-700 dark:text-rose-300", none: "bg-muted text-muted-foreground",
};
const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

function Toggle({ on, disabled, busy, onClick, label }: { on: boolean; disabled?: boolean; busy?: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled || busy} onClick={onClick}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        on ? "bg-emerald-500" : "bg-muted-foreground/25", (disabled || busy) && "cursor-not-allowed opacity-50")}>
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px] rtl:-translate-x-[18px]" : "translate-x-0.5 rtl:-translate-x-0.5")} />
    </button>
  );
}

export function RolesPage() {
  const { data, error, isLoading, mutate } = useApi<Overview>(`${R}.overview`);
  const [tab, setTab] = useState<"roles" | "grid" | "compare" | "user">("roles");
  const [role, setRole] = useState("Tax Consultant");
  if (isLoading) return <Loading />;
  if (error || !data) return <div className="page-container"><ErrorState error={error} /></div>;
  const customized = data.doctypes.filter((d) => d.customized).length;
  return (
    <div className="page-container space-y-5">
      <PageHeader title="Roles & permissions" icon={<ShieldHalf className="h-5 w-5" />}
        subtitle="What each role may do, and on whose records. Add or remove people on the Team page."
        actions={<Link to="/staff/team" className="inline-flex h-9 items-center gap-1.5 rounded-md border-[1.5px] border-input bg-input-bg px-3 text-sm font-medium hover:bg-accent"><UserCog className="h-4 w-4" /> Team</Link>} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Staff roles" value={String(data.roles.filter((r) => r.role !== "Client").length)} hint={`${data.roles.filter((r) => r.role !== "Client").reduce((n, r) => n + r.count, 0)} role assignments`} tone="bg-sky-500/15 text-sky-600 dark:text-sky-400" />
        <Stat icon={FileCheck2} label="Record types" value={String(data.doctypes.length)} hint={customized ? `${customized} changed by the firm` : "all on the app defaults"} tone="bg-[#d4af37]/15 text-[#b8912a] dark:text-[#f3d77a]" />
        <Stat icon={Lock} label="Fixed roles" value="3" hint="System Manager · Tax Admin · Client" tone="bg-rose-500/15 text-rose-600 dark:text-rose-400" />
      </div>

      <ColorTabs value={tab} onChange={setTab} tabs={[
        { key: "roles", label: "Roles", icon: Users, tone: "gold" },
        { key: "grid", label: "Permissions", icon: ShieldCheck, tone: "emerald" },
        { key: "compare", label: "All roles side by side", icon: Eye, tone: "indigo" },
        { key: "user", label: "Check a user", icon: Search, tone: "sky" },
      ]} />

      {tab === "roles" && <RoleCards data={data} onOpen={(r) => { setRole(r); setTab("grid"); }} />}
      {tab === "grid" && <RoleGrid data={data} role={role} setRole={setRole} onChanged={() => void mutate()} />}
      {tab === "compare" && <Compare data={data} />}
      {tab === "user" && <CheckUser />}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
      <span className={cn("grid h-11 w-11 place-items-center rounded-xl", tone)}><Icon className="h-5 w-5" /></span>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{hint}</p></div>
    </div>
  );
}

function RoleCards({ data, onOpen }: { data: Overview; onOpen: (role: string) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {data.roles.map((r) => {
        const l = look(r.role);
        const reach = data.doctypes.filter((d) => d.rules[r.role]?.read).length;
        return (
          <button key={r.role} type="button" onClick={() => onOpen(r.role)}
            className="group flex flex-col rounded-2xl border bg-card p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
            <div className="flex items-start justify-between gap-2">
              <span className={cn("grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br shadow-sm", l.tile)}><l.icon className="h-5 w-5" /></span>
              {r.editable ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Editable</span>
                : <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><Lock className="h-3 w-3" /> Fixed</span>}
            </div>
            <p className="mt-3 font-semibold">{r.role}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
            <p className={cn("mt-2 inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium", SCOPE_TONE[r.scope])}>{r.scope_label}</p>
            <div className="mt-auto flex items-center justify-between pt-4">
              <div className="flex -space-x-2 rtl:space-x-reverse">
                {r.members.slice(0, 4).map((m) => (
                  <span key={m.user} title={m.full_name} className={cn("grid h-7 w-7 place-items-center rounded-full border-2 border-card text-[10px] font-bold text-white", l.dot)}>{initials(m.full_name)}</span>
                ))}
                {r.role !== "Client" && r.count > 4 && <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-muted text-[10px] font-bold">+{r.count - 4}</span>}
                {!r.members.length && <span className="text-xs text-muted-foreground">{r.role === "Client" ? `${r.count} portal users` : "Nobody yet"}</span>}
              </div>
              <span className="text-[11px] text-muted-foreground">{reach} record types</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function RoleGrid({ data, role, setRole, onChanged }: { data: Overview; role: string; setRole: (r: string) => void; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [local, setLocal] = useState<Record<string, Record<string, number>>>({});
  const editable = data.editable_roles.includes(role);
  const meta = data.roles.find((r) => r.role === role);
  const areas = useMemo(() => {
    const out = new Map<string, DocRow[]>();
    data.doctypes.filter((d) => d.doctype.toLowerCase().includes(q.toLowerCase())).forEach((d) => out.set(d.area, [...(out.get(d.area) ?? []), d]));
    return [...out];
  }, [data, q]);
  const rule = (d: DocRow) => local[`${d.doctype}|${role}`] ?? d.rules[role] ?? {};
  const flip = async (d: DocRow, ptype: string) => {
    const key = `${d.doctype}|${role}`;
    setBusy(`${key}|${ptype}`); setErr(null);
    try {
      const res = await apiCall<Record<string, number>>(`${R}.set_permission`, { doctype: d.doctype, role, ptype, value: rule(d)[ptype] ? 0 : 1 });
      setLocal((x) => ({ ...x, [key]: res })); onChanged();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  };
  const reset = async (d: DocRow) => {
    if (!window.confirm(`Put every role's permissions on ${d.doctype} back to the app defaults?`)) return;
    setBusy(`${d.doctype}|reset`); setErr(null);
    try {
      await apiCall(`${R}.reset`, { doctype: d.doctype });
      setLocal((x) => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith(`${d.doctype}|`)))); onChanged();
    } catch (e) { setErr(e); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {data.roles.map((r) => {
          const l = look(r.role);
          return (
            <button key={r.role} type="button" onClick={() => { setRole(r.role); setLocal({}); }}
              className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
                role === r.role ? "border-transparent bg-foreground text-background shadow" : "hover:border-primary/50")}>
              <span className={cn("h-2.5 w-2.5 rounded-full", l.dot)} />{r.role}{!r.editable && <Lock className="h-3 w-3 opacity-60" />}
            </button>
          );
        })}
      </div>
      {meta && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
          {(() => { const l = look(role); return <span className={cn("grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br", l.tile)}><l.icon className="h-5 w-5" /></span>; })()}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{role}</p>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", SCOPE_TONE[meta.scope])}>Sees: {meta.scope_label}</span>
          {!editable && <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"><Lock className="h-3.5 w-3.5" /> Fixed — shown for reference</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 rounded-md border bg-input-bg px-2.5 focus-within:ring-2 focus-within:ring-ring/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="h-9 w-56 bg-transparent text-sm outline-none" placeholder="Find a record type" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <p className="text-xs text-muted-foreground">Edit, create and the rest switch Read on too; switching Read off removes everything. Which records they see follows the scope above.</p>
      </div>
      <InlineError error={err} />
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-start font-semibold">Record type</th>
              {data.ptypes.map((p) => <th key={p} className="px-2 py-2.5 text-center font-semibold">{PT_LABEL[p] ?? p}</th>)}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {areas.map(([area, rows]) => [
              <tr key={`a-${area}`} className="bg-muted/20"><td colSpan={data.ptypes.length + 2} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">{area}</td></tr>,
              ...rows.map((d) => {
                const r = rule(d);
                return (
                  <tr key={d.doctype} className={cn("border-b last:border-0 hover:bg-muted/30", !r.read && "text-muted-foreground")}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-foreground">{d.doctype}</span>
                      {d.customized && <span className="ms-2 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">Changed</span>}
                    </td>
                    {data.ptypes.map((p) => (
                      <td key={p} className="px-2 py-2 text-center">
                        {p === "submit" && !d.submittable ? <span className="text-xs text-muted-foreground/50">—</span>
                          : <span className="inline-flex"><Toggle on={!!r[p]} disabled={!editable} busy={busy === `${d.doctype}|${role}|${p}`}
                              onClick={() => void flip(d, p)} label={`${role} ${PT_LABEL[p]} ${d.doctype}`} /></span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-end">
                      {d.customized && <button type="button" onClick={() => void reset(d)} disabled={busy === `${d.doctype}|reset`}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" /> Default</button>}
                    </td>
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Every role side by side: R = read only, E = edit, C = create, D = delete (strongest letters shown). */
function Compare({ data }: { data: Overview }) {
  const cell = (rules?: Record<string, number>) => {
    if (!rules?.read) return null;
    return ["read", "write", "create", "delete"].filter((p) => rules[p]).map((p) => ({ read: "R", write: "E", create: "C", delete: "D" }[p]!));
  };
  const tone: Record<string, string> = { R: "bg-sky-500/15 text-sky-700 dark:text-sky-300", E: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    C: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", D: "bg-rose-500/15 text-rose-700 dark:text-rose-300" };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {Object.entries({ R: "Read", E: "Edit", C: "Create", D: "Delete" }).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("rounded px-1.5 font-bold", tone[k])}>{k}</span>{v}</span>)}
        <span>· empty = no access</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-4 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Record type</th>
              {data.roles.map((r) => {
                const l = look(r.role);
                return <th key={r.role} className="px-2 py-2.5 text-center"><span className="inline-flex flex-col items-center gap-1 text-[11px] font-semibold">
                  <span className={cn("grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br", l.tile)}><l.icon className="h-3.5 w-3.5" /></span>{r.role}</span></th>;
              })}
            </tr>
          </thead>
          <tbody>
            {data.doctypes.map((d) => (
              <tr key={d.doctype} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-1.5 font-medium">{d.doctype}</td>
                {data.roles.map((r) => {
                  const letters = cell(d.rules[r.role]);
                  return <td key={r.role} className="px-2 py-1.5 text-center">
                    {letters ? <span className="inline-flex gap-0.5">{letters.map((x) => <span key={x} className={cn("rounded px-1 text-[11px] font-bold", tone[x])}>{x}</span>)}</span>
                      : <span className="text-muted-foreground/40">·</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckUser() {
  const [q, setQ] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const list = useApi<{ name: string; full_name: string; user_type: string }[]>(`${R}.users`, { q });
  const res = useApi<UserCheck>(user ? `${R}.check_user` : null, { user });
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[18rem_1fr]">
      <div className="space-y-2 rounded-2xl border bg-card p-3 shadow-sm">
        <label className="flex items-center gap-2 rounded-md border bg-input-bg px-2.5 focus-within:ring-2 focus-within:ring-ring/30">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input className="h-9 w-full bg-transparent text-sm outline-none" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="max-h-[28rem] space-y-0.5 overflow-y-auto">
          {(list.data ?? []).map((u) => (
            <button key={u.name} type="button" onClick={() => setUser(u.name)}
              className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm hover:bg-accent", user === u.name && "bg-primary/10 ring-1 ring-primary/30")}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold">{initials(u.full_name || u.name)}</span>
              <span className="min-w-0"><span className="block truncate font-medium">{u.full_name || u.name}</span><span className="block truncate text-[11px] text-muted-foreground">{u.name}</span></span>
              <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">{u.user_type === "Website User" ? "Client" : "Staff"}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        {!user ? <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Pick someone to see exactly what they can open and change.</p>
          : res.isLoading ? <Loading /> : res.error ? <ErrorState error={res.error} /> : res.data && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-sm font-bold text-[#141416]">{initials(res.data.full_name)}</span>
              <div className="min-w-0 flex-1"><p className="font-semibold">{res.data.full_name}{!res.data.enabled && <span className="ms-2 text-xs text-rose-500">disabled</span>}</p><p className="text-xs text-muted-foreground">{res.data.user}</p></div>
              <div className="flex flex-wrap gap-1.5">{res.data.roles.length ? res.data.roles.map((r) => <span key={r} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs"><span className={cn("h-2 w-2 rounded-full", look(r).dot)} />{r}</span>)
                : <span className="text-xs text-muted-foreground">No firm role</span>}</div>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", SCOPE_TONE[res.data.scope])}>Sees: {res.data.scope_label}</span>
            </div>
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 text-start font-semibold">Record type</th>{["Read", "Edit", "Create", "Delete"].map((h) => <th key={h} className="px-3 py-2.5 text-center font-semibold">{h}</th>)}</tr></thead>
                <tbody>
                  {res.data.rights.map((r) => (
                    <tr key={r.doctype} className={cn("border-b last:border-0", !r.read && "text-muted-foreground")}>
                      <td className="px-4 py-1.5 font-medium">{r.doctype}<span className="ms-2 text-[11px] font-normal text-muted-foreground">{r.area}</span></td>
                      {(["read", "write", "create", "delete"] as const).map((p) => (
                        <td key={p} className="px-3 py-1.5 text-center">{r[p] ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <X className="mx-auto h-4 w-4 text-muted-foreground/40" />}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
