/**
 * New lead (styled after the wise CRM LeadFormPage): section cards — person, business, how they found us, first note —
 * with a live preview card and a duplicate check (same mobile or email) before saving.
 */
import { AlertTriangle, ArrowLeft, Briefcase, Compass, Mail, NotebookPen, Phone, Save, UserPlus, UserRound, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InlineError } from "@/components/common/states";
import { CRM_COLORS } from "@/components/crm/kanban-board";
import { RichTextEditor } from "@/components/forms/rich-text-editor";
import { Button } from "@/components/ui/button";
import { SelectInput } from "@/components/ui/field";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall, humanizeError } from "@/services/frappe";

const C = "pakistan_tax_consultancy.api.crm";
interface Options { sources: string[]; statuses: { name: string; color: string }[]; industries: string[]; territories: string[]; organizations: string[];
  salutations: string[]; owners: { name: string; full_name: string }[] }
const CLIENT_TYPES: [string, string][] = [["Individual-Salaried", "Salaried person"], ["Individual-Business", "Business owner / freelancer"], ["AOP", "Partnership (AOP)"], ["Company", "Company"], ["Other", "Other"]];

function Section({ icon: Icon, title, hint, children }: { icon: LucideIcon; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="flex items-center gap-2.5 font-semibold"><span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>{title}</h2>
      {hint && <p className="mt-1 ps-[42px] text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
function L({ label, children, wide, required }: { label: string; children: ReactNode; wide?: boolean; required?: boolean }) {
  return <label className={cn("block text-sm font-medium", wide && "sm:col-span-2")}>{label}{required && <span className="text-rose-500"> *</span>}<div className="mt-1.5">{children}</div></label>;
}

export function NewLeadPage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const opts = useApi<Options>(`${C}.lead_form_options`);
  const [f, setF] = useState<Record<string, string>>({ salutation: "", first_name: "", last_name: "", mobile: "", email: "", job_title: "", organization: "",
    website: "", industry: "", territory: "", client_type: "Individual-Salaried", source: "Walk In", status: "New", lead_owner: me?.user ?? "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [dup, setDup] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => { setF({ ...f, [k]: e.target.value }); setDup(null); };
  const name = [f.salutation, f.first_name, f.last_name].filter(Boolean).join(" ");
  const status = opts.data?.statuses.find((s) => s.name === f.status);
  const valid = !!f.first_name.trim() && !!(f.mobile.trim() || f.email.trim());

  const save = async (allow = false) => {
    setBusy(true); setErr(null);
    try {
      const lead = await apiCall<string>(`${C}.save_lead`, { data: JSON.stringify({ ...f, allow_duplicate: allow ? 1 : 0 }) });
      navigate(`/crm/leads/${lead}`);
    } catch (e) {
      const m = humanizeError(e) ?? "";
      const hit = m.match(/already exists: (\S+)/);
      if (hit) setDup(hit[1]); else setErr(e);
    } finally { setBusy(false); }
  };

  return (
    <div className="page-container space-y-5">
      <Link to="/crm/leads" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Leads</Link>
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]"><UserPlus className="h-5 w-5" /></span>
        <div><h1 className="text-2xl font-semibold">New lead</h1><p className="text-sm text-muted-foreground">Someone who may need tax help — add what you know; the rest can come later.</p></div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <Section icon={UserRound} title="Person" hint="A first name and a mobile or email is enough to start.">
            <div className="grid grid-cols-[6rem_1fr] gap-2 sm:col-span-2 sm:grid-cols-[6rem_1fr_1fr]">
              <L label="Title"><SelectInput value={f.salutation} onChange={set("salutation")}><option value="" />{opts.data?.salutations.map((s) => <option key={s}>{s}</option>)}</SelectInput></L>
              <L label="First name" required><input className="field" value={f.first_name} onChange={set("first_name")} autoFocus /></L>
              <div className="col-span-2 sm:col-span-1"><L label="Last name"><input className="field" value={f.last_name} onChange={set("last_name")} /></L></div>
            </div>
            <L label="Mobile"><input className="field" inputMode="tel" placeholder="03xx-xxxxxxx" value={f.mobile} onChange={set("mobile")} /></L>
            <L label="Email"><input className="field" type="email" value={f.email} onChange={set("email")} /></L>
            <L label="Job title"><input className="field" value={f.job_title} onChange={set("job_title")} placeholder="e.g. Accountant, Owner" /></L>
            <L label="Client type"><SelectInput value={f.client_type} onChange={set("client_type")}>{CLIENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectInput></L>
          </Section>

          <Section icon={Briefcase} title="Business" hint="For business owners, AOPs and companies.">
            <L label="Business / company"><input className="field" list="ptc-orgs" value={f.organization} onChange={set("organization")} />
              <datalist id="ptc-orgs">{opts.data?.organizations.map((o) => <option key={o} value={o} />)}</datalist></L>
            <L label="Website"><input className="field" value={f.website} onChange={set("website")} placeholder="example.pk" /></L>
            <L label="Industry"><SelectInput value={f.industry} onChange={set("industry")}><option value="">—</option>{opts.data?.industries.map((s) => <option key={s}>{s}</option>)}</SelectInput></L>
            <L label="Territory"><SelectInput value={f.territory} onChange={set("territory")}><option value="">—</option>{opts.data?.territories.map((s) => <option key={s}>{s}</option>)}</SelectInput></L>
          </Section>

          <Section icon={Compass} title="How they found us">
            <L label="Source" wide>
              <div className="flex flex-wrap gap-1.5">
                {opts.data?.sources.map((s) => (
                  <button type="button" key={s} onClick={() => setF({ ...f, source: s })}
                    className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", f.source === s ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}>{s}</button>
                ))}
              </div>
            </L>
            <L label="Status"><SelectInput value={f.status} onChange={set("status")}>{opts.data?.statuses.map((s) => <option key={s.name}>{s.name}</option>)}</SelectInput></L>
            <L label="Owner"><SelectInput value={f.lead_owner} onChange={set("lead_owner")}>{opts.data?.owners.map((o) => <option key={o.name} value={o.name}>{o.full_name}</option>)}</SelectInput></L>
          </Section>

          <Section icon={NotebookPen} title="First note" hint="What do they need? What did you promise?">
            <div className="sm:col-span-2"><RichTextEditor value={f.note} onChange={(html) => setF((x) => ({ ...x, note: html }))} minHeight={180} placeholder="e.g. Salaried, two employers this year; wants a refund of bank WHT. Call back Monday." /></div>
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="hero-dark px-5 py-6 text-white">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-lg font-bold text-[#141416]">
                {(f.first_name[0] ?? "?").toUpperCase()}{(f.last_name[0] ?? "").toUpperCase()}</span>
              <p className="mt-3 font-display text-xl font-semibold">{name || "New lead"}</p>
              <p className="text-sm text-white/60">{[f.job_title, f.organization].filter(Boolean).join(" · ") || CLIENT_TYPES.find(([v]) => v === f.client_type)?.[1]}</p>
            </div>
            <div className="space-y-2 p-5 text-sm">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{f.mobile || <span className="text-muted-foreground">No mobile</span>}</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{f.email || <span className="text-muted-foreground">No email</span>}</p>
              <p className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", CRM_COLORS[status?.color ?? "gray"])} />{f.status} · via {f.source}</p>
            </div>
          </div>
          {dup && (
            <div className="space-y-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <p className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" /> This person may already be a lead</p>
              <div className="flex flex-wrap gap-2">
                <Link className="font-semibold text-primary hover:underline" to={`/crm/leads/${dup}`}>Open {dup} →</Link>
                <button className="text-muted-foreground hover:text-foreground" onClick={() => void save(true)}>Save anyway</button>
              </div>
            </div>
          )}
          <InlineError error={err} />
          <Button className="w-full" size="default" loading={busy} disabled={!valid} onClick={() => void save()}>{!busy && <Save className="h-4 w-4" />} Save lead</Button>
          {!valid && <p className="text-center text-xs text-muted-foreground">A first name and a mobile or email are needed.</p>}
        </aside>
      </div>
    </div>
  );
}
