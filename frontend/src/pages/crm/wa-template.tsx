/** New / edit WhatsApp template (wide editor): message with {{fields}} on the left, a live phone preview on the right. */
import { ArrowLeft, Braces, Briefcase, CheckCheck, Handshake, Info, Megaphone, Send, Users, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { InlineError, Loading } from "@/components/common/states";
import { useSite } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { ColorTabs } from "@/components/ui/color-tabs";
import { SelectInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const B = "pakistan_tax_consultancy.api.broadcast";
type For = "Tax Client" | "CRM Lead" | "CRM Deal";
const STARTS: Record<For, { body: string; vars: Record<string, string> }> = {
  "Tax Client": { body: "Dear {{client_name}}, ", vars: { client_name: "client_name" } },
  "CRM Lead": { body: "Assalam-o-Alaikum {{first_name}}, ", vars: { first_name: "first_name" } },
  "CRM Deal": { body: "Assalam-o-Alaikum {{first_name}}, ", vars: { first_name: "first_name" } },
};
const SAMPLE: Record<string, string> = { client_name: "Ahmed Raza", first_name: "Ahmed", last_name: "Raza", lead_name: "Ahmed Raza", city: "Faisalabad",
  organization: "Raza Traders", business_name: "Raza Traders", mobile: "+92 300 0000001", email: "ahmed@example.com", ntn: "1234567-8" };

interface Existing { name: string; template_label: string; status: string; template_type: string; message: string; footer: string | null;
  reference_doctype: For | null; variables: { variable_name: string; variable_field: string }[] }

export function WhatsAppTemplateEditor() {
  const navigate = useNavigate();
  const { name } = useParams();
  const editing = !!name;
  const site = useSite().data;
  const tpl = useApi<{ fields: Record<string, string[]>; templates: Existing[] }>(`${B}.templates`);
  const existing = tpl.data?.templates.find((t) => t.name === name);
  const [loaded, setLoaded] = useState(false);
  const [who, setWho] = useState<For>("Tax Client");
  const [f, setF] = useState({ label: "", category: "Utility", body: STARTS["Tax Client"].body, footer: "VVS Consultants · reply STOP to opt out" });
  const [vars, setVars] = useState<Record<string, string>>(STARTS["Tax Client"].vars);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!editing || loaded || !existing) return;
    setWho((existing.reference_doctype ?? "Tax Client") as For);
    setF({ label: existing.template_label, category: existing.template_type, body: existing.message, footer: existing.footer ?? "" });
    setVars(Object.fromEntries(existing.variables.map((v) => [v.variable_name, v.variable_field])));
    setLoaded(true);
  }, [editing, existing, loaded]);
  const used = [...new Set([...f.body.matchAll(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g)].map((m) => m[1]))];
  const fields = tpl.data?.fields[who] ?? [];
  const preview = f.body.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (_m, v: string) => SAMPLE[vars[v] ?? v] ?? `[${v}]`);
  const issues = [
    f.body.length > 1024 && "Keep the message under 1,024 characters.",
    /^\s*\{\{/.test(f.body) && "Meta rejects a message that starts with a {{variable}}.",
    /\}\}\s*[.!?]?\s*$/.test(f.body) && "Meta rejects a message that ends with a {{variable}} — add a closing sentence.",
    used.some((v) => !vars[v]) && "Choose a field for every {{variable}}.",
  ].filter(Boolean) as string[];

  const switchWho = (w: For) => { if (editing) return; setWho(w); setF({ ...f, body: STARTS[w].body }); setVars(STARTS[w].vars); };
  const insert = (field: string) => {
    const name = field;
    const el = box.current;
    const token = `{{${name}}}`;
    if (!el) { setF({ ...f, body: f.body + token }); }
    else {
      const s = el.selectionStart ?? f.body.length, e = el.selectionEnd ?? s;
      setF({ ...f, body: f.body.slice(0, s) + token + f.body.slice(e) });
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
    }
    setVars((v) => ({ ...v, [name]: field }));
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (editing) await apiCall(`${B}.update_template`, { name, label: f.label, body: f.body, footer: f.footer, variables: JSON.stringify(vars) });
      else await apiCall(`${B}.create_template`, { label: f.label, category: f.category, body: f.body, reference_doctype: who, footer: f.footer, variables: JSON.stringify(vars) });
      navigate("/crm/broadcast?tab=templates");
    }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  if (tpl.isLoading || (editing && !loaded && !tpl.error && existing)) return <Loading />;
  if (editing && tpl.data && !existing) return <div className="page-container"><p className="text-muted-foreground">Template not found.</p></div>;

  return (
    <div className="page-container max-w-none space-y-5">
      <Link to="/crm/broadcast?tab=templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Templates</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{editing ? `Edit · ${existing?.template_label ?? ""}` : "New WhatsApp template"}</h1>
          <p className="text-sm text-muted-foreground">{editing ? "Changed wording goes back to Meta for review; until it is approved again the template cannot be broadcast." : "Meta reviews every template before it can be broadcast — usually within minutes."}</p></div>
        <Button loading={busy} disabled={!f.label.trim() || !!issues.length} onClick={() => void save()}>{!busy && <Send className="h-4 w-4" />} {editing ? "Submit changes" : "Submit for approval"}</Button>
      </div>
      <InlineError error={err} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
          <div>
            <p className="mb-2 text-sm font-medium">Who receives it{editing && <span className="ms-2 text-xs font-normal text-muted-foreground">(fixed once approved)</span>}</p>
            <ColorTabs value={who} onChange={switchWho} tabs={[
              { key: "Tax Client", label: "Clients", icon: Briefcase, tone: "gold" },
              { key: "CRM Lead", label: "Leads", icon: Users, tone: "sky" },
              { key: "CRM Deal", label: "Deals", icon: Handshake, tone: "violet" },
            ]} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Template name<input className="field mt-1.5" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. NTN registration offer" /></label>
            <div>
              <p className="text-sm font-medium">Category</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {([["Utility", "Reminders & updates", Wrench], ["Marketing", "Offers & promotions", Megaphone]] as const).map(([v, hint, Icon]) => (
                  <button key={v} type="button" disabled={editing && f.category !== v} onClick={() => !editing && setF({ ...f, category: v })}
                    className={cn("rounded-xl border p-2.5 text-start transition", f.category === v ? "border-primary bg-primary/10 ring-1 ring-primary" : "hover:border-primary/40", editing && f.category !== v && "opacity-40")}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4" />{v}</span><span className="text-xs text-muted-foreground">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <label className="block text-sm font-medium">Message
            <textarea ref={box} className="field mt-1.5 min-h-[220px] font-[inherit] leading-relaxed" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            <span className="mt-1 flex justify-between text-xs text-muted-foreground"><span>*bold*  _italic_  ~strike~ work in WhatsApp</span><span className={cn(f.body.length > 1024 && "text-rose-600")}>{f.body.length} / 1024</span></span>
          </label>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Braces className="h-3.5 w-3.5" /> Insert a field at the cursor</p>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {fields.map((x) => (
                <button key={x} type="button" onClick={() => insert(x)}
                  className="rounded-full border border-[#25D366]/40 bg-[#25D366]/10 px-2.5 py-1 text-xs font-medium text-[#128C7E] hover:bg-[#25D366]/20 dark:text-[#25D366]">{x}</button>
              ))}
            </div>
          </div>
          {used.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {used.map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm"><code className="rounded bg-muted px-1.5">{`{{${v}}}`}</code>
                  <SelectInput className="h-8 flex-1" value={vars[v] ?? ""} onChange={(e) => setVars({ ...vars, [v]: e.target.value })}>
                    <option value="">field…</option>{fields.map((x) => <option key={x}>{x}</option>)}</SelectInput></label>
              ))}
            </div>
          )}
          <label className="block text-sm font-medium">Footer<input className="field mt-1.5" maxLength={60} value={f.footer} onChange={(e) => setF({ ...f, footer: e.target.value })} /></label>
          {editing && <p className="flex gap-1.5 rounded-xl bg-sky-500/10 px-3 py-2 text-xs text-sky-800 dark:text-sky-300"><Info className="mt-0.5 h-4 w-4 shrink-0" />Meta allows an approved template to be edited about once a day and up to 10 times a month; its category and language cannot change.</p>}
          {issues.length > 0 && <ul className="space-y-1 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">{issues.map((i) => <li key={i} className="flex gap-1.5"><Info className="mt-0.5 h-4 w-4 shrink-0" />{i}</li>)}</ul>}
        </div>

        <div className="xl:sticky xl:top-20">
          <div className="mx-auto w-full max-w-[380px] rounded-[2.5rem] border-[10px] border-[#1f2c34] bg-[#1f2c34] shadow-2xl">
            <div className="flex items-center gap-3 rounded-t-[1.8rem] bg-[#075e54] px-4 py-3 text-white">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xs font-bold">VVS</span>
              <div className="leading-tight"><p className="text-sm font-semibold">{site?.firm_name ?? "VVS Consultants"}</p><p className="text-[11px] text-white/70">Business account</p></div>
            </div>
            <div className="min-h-[420px] rounded-b-[1.8rem] bg-[#efeae2] bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-[length:16px_16px] p-3 dark:bg-[#0b141a]">
              <p className="mx-auto mb-3 w-fit rounded-md bg-white/80 px-2 py-0.5 text-[11px] text-[#54656f] dark:bg-[#182229] dark:text-[#8696a0]">Today</p>
              <div className="ms-auto max-w-[88%] rounded-xl rounded-se-sm bg-[#d9fdd3] px-3 py-2 text-[13.5px] leading-snug text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
                <p className="whitespace-pre-wrap break-words">{preview || " "}</p>
                {f.footer && <p className="mt-1 text-[11px] text-[#667781] dark:text-[#8696a0]">{f.footer}</p>}
                <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-[#667781] dark:text-[#8696a0]">10:30 <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" /></p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Preview with sample values · {f.category} · for {who === "Tax Client" ? "clients" : who === "CRM Lead" ? "leads" : "deals"}</p>
        </div>
      </div>
    </div>
  );
}
