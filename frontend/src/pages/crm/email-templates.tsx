/**
 * Email templates (Frappe's Email Template records): a gallery, and a wide editor — rich text with {{ variable }} chips on
 * the left, a live email preview with sample values on the right. Picked from a lead / deal's Email tab.
 */
import { ArrowLeft, Braces, Eye, FilePlus2, Mail, Pencil, Save, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { RichText, RichTextEditor, htmlText } from "@/components/forms/rich-text-editor";
import { useSite } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/hooks/useAuth";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const E = "pakistan_tax_consultancy.api.email_templates";
interface Tpl { name: string; subject: string; body: string; excerpt: string; modified: string }
interface Data { templates: Tpl[]; variables: { key: string; label: string; sample: string }[] }

export function EmailTemplatesPage() {
  const { hasRole } = useAuth();
  const manage = hasRole("Tax Admin", "Sales Manager", "System Manager");
  const { data, error, isLoading, mutate } = useApi<Data>(`${E}.templates`);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const starters = () => { setBusy(true); apiCall(`${E}.starters`).then(() => mutate()).catch(setErr).finally(() => setBusy(false)); };
  return (
    <div className="page-container space-y-5">
      <PageHeader title="Email templates" subtitle="Write once, personalise for every lead and client" icon={<Mail className="h-5 w-5" />}
        actions={manage ? <>
          {data && !data.templates.some((t) => t.name === "Deadline reminder") && <Button variant="outline" loading={busy} onClick={starters}><Sparkles className="h-4 w-4" /> Add starter templates</Button>}
          <Link to="/crm/email-templates/new" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"><FilePlus2 className="h-4 w-4" /> New template</Link>
        </> : undefined} />
      <InlineError error={err} />
      {isLoading ? <Loading /> : error ? <ErrorState error={error} onRetry={() => void mutate()} /> : !data?.templates.length ? (
        <Empty title="No email templates yet" hint="Start with ready-made ones: welcome, deadline reminder, documents checklist."
          action={manage ? <Button loading={busy} onClick={starters}><Sparkles className="h-4 w-4" /> Add starter templates</Button> : undefined} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.templates.map((t) => (
            <Link key={t.name} to={`/crm/email-templates/${encodeURIComponent(t.name)}`}
              className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-[#d4af37]/60 hover:shadow-md">
              <div className="flex items-center gap-2 border-b bg-gradient-to-r from-sky-500/10 to-transparent px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/15 text-sky-600"><Mail className="h-4 w-4" /></span>
                <p className="min-w-0 flex-1 truncate font-semibold">{t.name}</p>
                <Pencil className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
              </div>
              <div className="flex-1 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Subject</p>
                <p className="mt-0.5 text-sm font-medium">{t.subject}</p>
                <p className="mt-3 line-clamp-4 text-sm text-muted-foreground">{t.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmailTemplateEditor() {
  const { name } = useParams();
  const isNew = !name || name === "new";
  const navigate = useNavigate();
  const site = useSite().data;
  const { hasRole } = useAuth();
  const manage = hasRole("Tax Admin", "Sales Manager", "System Manager");
  const { data, isLoading } = useApi<Data>(`${E}.templates`);
  const existing = data?.templates.find((t) => t.name === name);
  const [f, setF] = useState({ title: "", subject: "", body: "" });
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [target, setTarget] = useState<"subject" | "body">("body");

  useEffect(() => {
    if (!loaded && existing) { setF({ title: existing.name, subject: existing.subject, body: existing.body }); setLoaded(true); }
  }, [existing, loaded]);
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!f.subject && !htmlText(f.body)) { setPreview(null); return; }
      apiCall<{ subject: string; body: string }>(`${E}.render`, { subject: f.subject, body: f.body, sample: 1 }).then(setPreview).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(id);
  }, [f.subject, f.body]);

  const insert = (key: string) => {
    const token = `{{ ${key} }}`;
    if (target === "subject") setF((x) => ({ ...x, subject: `${x.subject}${x.subject && !x.subject.endsWith(" ") ? " " : ""}${token}` }));
    else setF((x) => ({ ...x, body: x.body.replace(/(<\/p>)?$/, (m) => ` ${token}${m}`) || `<p>${token}</p>` }));
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try { const n = await apiCall<string>(`${E}.save`, { title: f.title, subject: f.subject, body: f.body, name: isNew ? undefined : name }); navigate(`/crm/email-templates/${encodeURIComponent(n)}`, { replace: true }); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!name || !window.confirm(`Delete the template "${name}"?`)) return;
    try { await apiCall(`${E}.delete`, { name }); navigate("/crm/email-templates"); } catch (e) { setErr(e); }
  };
  if (!isNew && isLoading) return <Loading />;
  if (!isNew && data && !existing) return <div className="page-container"><Empty title="Template not found" /></div>;

  return (
    <div className="page-container max-w-none space-y-5">
      <Link to="/crm/email-templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Email templates</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{isNew ? "New email template" : f.title}</h1>
        {manage && <div className="flex gap-2">
          {!isNew && <Button variant="ghost" onClick={() => void remove()}><Trash2 className="h-4 w-4" /> Delete</Button>}
          <Button loading={busy} disabled={!f.title.trim() || !f.subject.trim() || !htmlText(f.body)} onClick={() => void save()}>{!busy && <Save className="h-4 w-4" />} Save template</Button>
        </div>}
      </div>
      <InlineError error={err} />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm">
          <label className="block text-sm font-medium">Template name<input className="field mt-1.5" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Deadline reminder" disabled={!manage} /></label>
          <label className="block text-sm font-medium">Subject<input className="field mt-1.5" value={f.subject} onFocus={() => setTarget("subject")} onChange={(e) => setF({ ...f, subject: e.target.value })} disabled={!manage} /></label>
          <div onFocusCapture={() => setTarget("body")}>
            <p className="mb-1.5 text-sm font-medium">Message</p>
            <RichTextEditor value={f.body} onChange={(html) => setF((x) => ({ ...x, body: html }))} minHeight={320} readOnly={!manage} placeholder="Dear {{ first_name }}, …" />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Braces className="h-3.5 w-3.5" /> Insert into {target}</p>
            <div className="flex flex-wrap gap-1.5">
              {data?.variables.map((v) => (
                <button key={v.key} type="button" disabled={!manage} onClick={() => insert(v.key)} title={`e.g. ${v.sample}`}
                  className="rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-2.5 py-1 text-xs font-medium text-[#8a6914] hover:bg-[#d4af37]/20 dark:text-[#f3d77a]">{v.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm xl:sticky xl:top-20">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Eye className="h-3.5 w-3.5" /> Preview with sample values</div>
          <div className="space-y-1 border-b px-5 py-3 text-sm">
            <p><span className="text-muted-foreground">From:</span> {site?.firm_name ?? "VVS Consultants"}{site?.email ? ` <${site.email}>` : ""}</p>
            <p><span className="text-muted-foreground">To:</span> Ahmed Raza &lt;ahmed@example.com&gt;</p>
            <p className="font-semibold">{preview?.subject || f.subject || "Subject"}</p>
          </div>
          <div className="bg-[#f6f6f4] p-5 dark:bg-[#0f0f11]">
            <div className="mx-auto max-w-xl overflow-hidden rounded-xl bg-white text-[#1f2937] shadow-sm">
              <div className="flex items-center gap-2 border-b-[3px] border-[#d4af37] bg-[#0b0b0c] px-5 py-3 text-white">
                <img src="/assets/pakistan_tax_consultancy/images/vvs-mark.svg" alt="" className="h-7 w-7" />
                <span className="font-display font-semibold">{site?.firm_name ?? "VVS Consultants"}</span>
              </div>
              <div className="px-5 py-4">{preview?.body ? <RichText html={preview.body} className="text-[#1f2937]" /> : <p className="text-sm text-slate-400">Start writing to see the email here.</p>}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
