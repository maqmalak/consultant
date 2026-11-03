/** Staff logins and their roles, in plain words (Tax Admin only). */
import { Bot, Copy, FileText, LayoutGrid, List, KeyRound, Mail, Pencil, Phone, Search, ShieldCheck, UserCheck, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/field";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/cn";

const initials = (n: string) => n.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
import { apiCall } from "@/services/frappe";
import { look } from "@/pages/staff/roles";

const S = "pakistan_tax_consultancy.api.settings";
const ROLES: [string, string][] = [
  ["Tax Admin", "Runs the office: payments, website, settings, team"],
  ["Tax Consultant", "Prepares returns for their own clients"],
  ["Tax Reviewer", "Checks returns before they go to the client"],
  ["Tax Approver", "Approves returns the client confirmed"],
  ["Filing Officer", "Files on FBR IRIS and records the acknowledgment"],
  ["Field Officer", "Registers new clients on visits"],
  ["Data Entry Officer", "Only enters client details and records client approval — every role can also do this"],
];

const ROLE_ORDER = ROLES.map(([r]) => r);
const sortRoles = (roles: string[]) => ROLE_ORDER.filter((r) => roles.includes(r)).concat(roles.filter((r) => !ROLE_ORDER.includes(r)));
const VIEW_KEY = "vvs.team.view";

function AskSwitch({ on, name, onClick }: { on: boolean; name: string; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={`Ask VVS for ${name}`} onClick={onClick}
      title={on ? "Can use the Ask VVS assistant" : "No Ask VVS access"}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", on ? "bg-[#d4af37]" : "bg-muted-foreground/30")}>
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

interface Member { name: string; full_name: string; enabled: number; mobile_no: string | null; roles: string[]; open_returns: number; ask_vvs?: boolean }

function MemberDialog({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: (link?: string | null) => void }) {
  const [email, setEmail] = useState(member?.name ?? "");
  const [name, setName] = useState(member?.full_name ?? "");
  const [mobile, setMobile] = useState(member?.mobile_no ?? "");
  const [roles, setRoles] = useState<string[]>(member?.roles ?? ["Tax Consultant"]);
  const [enabled, setEnabled] = useState(member ? !!member.enabled : true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Dialog open onClose={onClose} title={member ? `Edit ${member.full_name}` : "Add a team member"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const r = await apiCall<{ link: string | null }>(`${S}.save_member`, { email, full_name: name, roles, mobile_no: mobile, enabled: enabled ? 1 : 0 });
            onSaved(r.link);
          } catch (e) { setErr(e); } finally { setBusy(false); }
        }}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Full name" required>{(id) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Email (login)" required>{(id) => <TextInput id={id} type="email" disabled={!!member} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Mobile">{(id) => <TextInput id={id} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} />}</Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold">What do they do?</legend>
          {ROLES.map(([role, hint]) => {
            const l = look(role);
            const on = roles.includes(role);
            return (
              <label key={role} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-2.5 text-sm transition", on ? cn("bg-gradient-to-br border-transparent ring-1 ring-[#d4af37]/40", l.cover) : "hover:bg-accent")}>
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br shadow-sm", l.tile)}><l.icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><b>{role}</b><span className="block text-xs text-muted-foreground">{hint}</span></span>
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#d4af37]" checked={on}
                  onChange={(e) => setRoles(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))} />
              </label>);
          })}
        </fieldset>
        {member && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Can log in</label>}
        <InlineError error={err} />
      </div>
    </Dialog>
  );
}

export function TeamPage() {
  const { data, error, isLoading, mutate } = useApi<Member[]>(`${S}.team`);
  const [editing, setEditing] = useState<Member | null | "new">(null);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [view, setViewState] = useState<"cards" | "list">(() => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "cards"; } catch { return "cards"; } });
  const setView = (v: "cards" | "list") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  const members = data ?? [];
  const shown = useMemo(() => members.filter((m) => (!roleFilter || m.roles.includes(roleFilter))
    && (!q || `${m.full_name} ${m.name} ${m.roles.join(" ")}`.toLowerCase().includes(q.toLowerCase()))), [members, q, roleFilter]);
  const stats = [
    { icon: Users, label: "Members", value: members.length, color: "#0ea5e9" },
    { icon: UserCheck, label: "Can log in", value: members.filter((m) => m.enabled).length, color: "#10b981" },
    { icon: Bot, label: "Ask VVS on", value: members.filter((m) => m.ask_vvs).length, color: "#8b5cf6" },
    { icon: FileText, label: "Open returns", value: members.reduce((n, m) => n + (m.open_returns || 0), 0), color: "#d4af37" },
  ];
  const toggleAsk = (m: Member) => apiCall("pakistan_tax_consultancy.api.ask_vvs.set_access", { user: m.name, enabled: m.ask_vvs ? 0 : 1 }).then(() => mutate()).catch(setErr);
  const resetLink = (m: Member) => apiCall<{ link: string }>(`${S}.reset_link`, { email: m.name }).then((r) => setLink(r.link)).catch(setErr);

  return (
    <div className="page-container space-y-5">
      <section className="relative overflow-hidden rounded-2xl hero-dark px-5 py-5 text-white shadow-md sm:px-6">
        <div aria-hidden className="pointer-events-none absolute -end-10 -top-16 h-52 w-52 rounded-full bg-[#d4af37]/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416] shadow-md ring-1 ring-white/20"><Users className="size-6" strokeWidth={2.2} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#d4af37]">Team</div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Who works at the firm</h1>
            <p className="text-sm text-white/60">Logins, roles and Ask VVS access. What each role may do is on <Link to="/staff/roles" className="text-[#f3d77a] hover:underline">Roles & permissions</Link>.</p>
          </div>
          <button type="button" onClick={() => setEditing("new")}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#b8912a] px-4 text-sm font-semibold text-[#141416] shadow-md transition hover:brightness-105">
            <UserPlus className="h-4 w-4" /> Add member</button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((t) => (
            <div key={t.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 backdrop-blur">
              <span className="grid size-9 place-items-center rounded-lg shadow-md ring-1 ring-white/20" style={{ background: `linear-gradient(135deg, ${t.color}, ${t.color}aa)` }}><t.icon className="size-4 text-white" /></span>
              <div><div className="font-display text-xl font-semibold tabular-nums leading-none">{t.value}</div><div className="mt-0.5 text-[11px] text-white/55">{t.label}</div></div>
            </div>))}
        </div>
      </section>

      <InlineError error={err} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.length && <Empty title="No staff yet" />}
      {data && data.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border bg-card px-3 shadow-sm focus-within:ring-4 focus-within:ring-[#d4af37]/20">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input aria-label="Find a team member" className="h-9 w-56 bg-transparent text-sm outline-none" placeholder="Find by name, email or role" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {[["", `All · ${members.length}`], ...ROLES.map(([r]) => [r, `${r} · ${members.filter((m) => m.roles.includes(r)).length}`])].map(([r, l]) => (
              <button key={r || "all"} type="button" onClick={() => setRoleFilter(r)}
                className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  roleFilter === r ? "border-[#d4af37] bg-[#d4af37]/10 text-[#9c7a22] dark:text-[#f3d77a]" : "text-muted-foreground hover:bg-accent")}>
                {r && <span className={cn("size-2 rounded-full", look(r).dot)} />}{l}</button>))}
            <div className="ms-auto inline-flex rounded-xl border bg-card p-1 shadow-sm" role="radiogroup" aria-label="View">
              {([["cards", "Cards", LayoutGrid], ["list", "List", List]] as const).map(([k, l, I]) => (
                <button key={k} type="button" role="radio" aria-checked={view === k} onClick={() => setView(k)}
                  className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    view === k ? "bg-[#d4af37] text-[#141416] shadow" : "text-muted-foreground hover:text-foreground")}><I className="h-3.5 w-3.5" />{l}</button>))}
            </div>
          </div>

          {view === "list" ? (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
              <table className="w-full min-w-[820px] text-sm">
                <thead><tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-start font-semibold">Member</th><th className="px-3 py-3 text-start font-semibold">Roles</th>
                  <th className="px-3 py-3 text-end font-semibold">Open returns</th><th className="px-3 py-3 text-center font-semibold">Ask VVS</th>
                  <th className="px-3 py-3 text-start font-semibold">Status</th><th className="px-4 py-3 text-end font-semibold">Actions</th></tr></thead>
                <tbody>
                  {shown.map((m) => {
                    const mine = sortRoles(m.roles);
                    const main = look(mine[0] ?? "Tax Consultant");
                    return (
                      <tr key={m.name} className={cn("border-b transition-colors last:border-0 hover:bg-muted/30", !m.enabled && "opacity-70")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-sm font-bold shadow-sm", main.tile)}>{initials(m.full_name || m.name)}</span>
                            <div className="min-w-0"><div className="truncate font-semibold">{m.full_name}</div>
                              <div className="truncate text-xs text-muted-foreground">{m.name}{m.mobile_no ? ` · ${m.mobile_no}` : ""}</div></div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><div className="flex max-w-md flex-wrap gap-1">
                          {mine.length ? mine.map((r) => <span key={r} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium"><span className={cn("size-1.5 rounded-full", look(r).dot)} />{r}</span>)
                            : <span className="text-xs text-muted-foreground">No role yet</span>}</div></td>
                        <td className="px-3 py-2.5 text-end font-semibold tabular-nums">{m.open_returns || "—"}</td>
                        <td className="px-3 py-2.5"><div className="flex justify-center"><AskSwitch on={!!m.ask_vvs} name={m.full_name} onClick={() => void toggleAsk(m)} /></div></td>
                        <td className="px-3 py-2.5"><span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          m.enabled ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/15 text-rose-600 dark:text-rose-400")}>
                          <span className={cn("size-1.5 rounded-full", m.enabled ? "bg-emerald-500" : "bg-rose-500")} />{m.enabled ? "Active" : "Disabled"}</span></td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-end">
                          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Edit ${m.full_name}`} onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></button>
                          <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Set-password link for ${m.full_name}`} title="New set-password link" onClick={() => void resetLink(m)}><KeyRound className="h-4 w-4" /></button>
                        </td>
                      </tr>);
                  })}
                </tbody>
              </table>
            </div>
          ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((m) => {
              const mine = sortRoles(m.roles);
              const main = look(mine[0] ?? "Tax Consultant");
              return (
                <article key={m.name} className={cn("group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl", !m.enabled && "opacity-70")}>
                  <div className={cn("relative flex h-20 items-start justify-between bg-gradient-to-br p-3", main.cover)}>
                    <span className={cn("inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm",
                      m.enabled ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-400")}>
                      <span className={cn("size-1.5 rounded-full", m.enabled ? "bg-emerald-500" : "bg-rose-500")} />{m.enabled ? "Active" : "Disabled"}</span>
                    <div className="flex gap-1">
                      <button type="button" className="rounded-lg bg-background/85 p-1.5 text-muted-foreground shadow-sm hover:text-foreground" aria-label={`Edit ${m.full_name}`} onClick={() => setEditing(m)}><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" className="rounded-lg bg-background/85 p-1.5 text-muted-foreground shadow-sm hover:text-foreground" aria-label={`Set-password link for ${m.full_name}`} title="New set-password link" onClick={() => void resetLink(m)}><KeyRound className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <div className="-mt-9 flex flex-1 flex-col px-4 pb-4">
                    <span className={cn("grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br text-lg font-bold shadow-lg ring-4 ring-card transition-transform duration-200 group-hover:scale-105", main.tile)}>{initials(m.full_name || m.name)}</span>
                    <h3 className="mt-3 truncate font-semibold">{m.full_name}</h3>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><Mail className="h-3 w-3 shrink-0" />{m.name}</p>
                    {m.mobile_no && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{m.mobile_no}</p>}
                    <div className="mt-3 flex flex-wrap gap-1">
                      {mine.length ? mine.map((r) => (
                        <span key={r} className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium"><span className={cn("size-1.5 rounded-full", look(r).dot)} />{r}</span>))
                        : <span className="text-xs text-muted-foreground">No role yet</span>}
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 mt-4">
                      <div className="text-xs"><span className="text-lg font-bold tabular-nums">{m.open_returns || 0}</span><span className="ms-1 text-muted-foreground">open returns</span></div>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldCheck className={cn("h-3.5 w-3.5", m.ask_vvs ? "text-[#d4af37]" : "")} />Ask VVS
                        <AskSwitch on={!!m.ask_vvs} name={m.full_name} onClick={() => void toggleAsk(m)} />
                      </label>
                    </div>
                  </div>
                </article>);
            })}
          </div>
          )}
          {!shown.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nobody matches.</div>}
        </>
      )}
      {editing && <MemberDialog member={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={(l) => { setEditing(null); if (l) setLink(l); void mutate(); }} />}
      <Dialog open={!!link} onClose={() => setLink(null)} title="Set-password link">
        <p className="mb-2 text-sm">Send this link to the team member (email is not set up yet, so share it on WhatsApp). It works once.</p>
        <div className="flex items-center gap-2 rounded-md bg-muted p-2"><code className="flex-1 break-all text-xs">{link}</code>
          <Button size="sm" variant="ghost" aria-label="Copy" onClick={() => void navigator.clipboard?.writeText(link ?? "")}><Copy className="h-4 w-4" /></Button></div>
      </Dialog>
    </div>
  );
}
