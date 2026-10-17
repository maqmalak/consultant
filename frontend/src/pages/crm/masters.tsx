/** CRM masters (ported from the realestate MastersPage idea): organizations, lead sources, statuses, lost reasons, industries, territories. */
import { Building2, Compass, Factory, Layers, Map, Pencil, Plus, Search, Trash2, XOctagon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { CRM_COLORS } from "@/components/crm/kanban-board";
import { Button } from "@/components/ui/button";
import { ColorTabs, type TabTone } from "@/components/ui/color-tabs";
import { Dialog } from "@/components/ui/dialog";
import { SelectInput, TextArea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const M = "pakistan_tax_consultancy.api.crm_masters";
interface FieldDef { field: string; label: string; type: string; options: string | null }
interface Master { doctype: string; title: string; count: number; fields: FieldDef[] }
type Row = Record<string, any> & { name: string; used: number };
const LOOK: Record<string, { label: string; icon: LucideIcon; tone: TabTone; hint: string }> = {
  "CRM Organization": { label: "Organizations", icon: Building2, tone: "gold", hint: "Businesses and companies your leads and deals belong to" },
  "CRM Lead Source": { label: "Lead sources", icon: Compass, tone: "sky", hint: "Where leads come from — website, WhatsApp, referral…" },
  "CRM Lead Status": { label: "Lead statuses", icon: Layers, tone: "violet", hint: "The stages a lead moves through before it becomes a deal" },
  "CRM Lost Reason": { label: "Lost reasons", icon: XOctagon, tone: "rose", hint: "Why a deal did not go ahead — shown when a deal is marked lost" },
  "CRM Industry": { label: "Industries", icon: Factory, tone: "emerald", hint: "Business sectors, for filtering and broadcasts" },
  "CRM Territory": { label: "Territories", icon: Map, tone: "indigo", hint: "Cities or regions, with an optional manager" },
};

function LinkSelect({ doctype, value, onChange }: { doctype: string; value: string; onChange: (v: string) => void }) {
  const { data } = useApi<{ value: string; label: string }[]>(`${M}.link_options`, { doctype });
  return <SelectInput value={value} onChange={(e) => onChange(e.target.value)}><option value="">—</option>{data?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</SelectInput>;
}

function Editor({ master, row, onClose, onSaved }: { master: Master; row: Row | null | "new"; onClose: () => void; onSaved: () => void }) {
  const isNew = row === "new";
  const [f, setF] = useState<Record<string, any>>(isNew ? {} : { ...(row ?? {}) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const title = master.fields[0];
  const save = async () => {
    setBusy(true); setErr(null);
    try { await apiCall(`${M}.save`, { doctype: master.doctype, data: JSON.stringify(f), name: isNew ? undefined : (row as Row).name }); onSaved(); onClose(); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!row} onClose={onClose} title={`${isNew ? "New" : "Edit"} ${LOOK[master.doctype].label.replace(/s$/, "").toLowerCase()}`} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f[title.field]} onClick={() => void save()}>Save</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {master.fields.map((fd) => (
          <label key={fd.field} className={cn("block text-sm font-medium", (fd.type === "Text" || fd.field === title.field) && "sm:col-span-2")}>{fd.label}
            <div className="mt-1.5">
              {fd.type === "Select" ? <SelectInput value={f[fd.field] ?? ""} onChange={(e) => setF({ ...f, [fd.field]: e.target.value })}><option value="">—</option>{fd.options?.split("\n").map((o) => <option key={o}>{o}</option>)}</SelectInput>
                : fd.type === "Link" ? <LinkSelect doctype={fd.options!} value={f[fd.field] ?? ""} onChange={(v) => setF({ ...f, [fd.field]: v })} />
                : fd.type === "Text" ? <TextArea rows={4} value={f[fd.field] ?? ""} onChange={(e) => setF({ ...f, [fd.field]: e.target.value })} />
                : <input className="field" type={fd.type === "Int" || fd.type === "Currency" ? "number" : "text"} value={f[fd.field] ?? ""}
                    disabled={!isNew && fd.field === title.field} onChange={(e) => setF({ ...f, [fd.field]: e.target.value })} />}
            </div>
          </label>
        ))}
      </div>
      <InlineError error={err} />
    </Dialog>
  );
}

export function CrmMastersPage() {
  const [params, setParams] = useSearchParams();
  const masters = useApi<Master[]>(`${M}.overview`);
  const doctype = params.get("m") ?? "CRM Organization";
  const master = masters.data?.find((m) => m.doctype === doctype);
  const rows = useApi<{ rows: Row[]; can_write: boolean; can_create: boolean; used_by: string }>(master ? `${M}.rows` : null, { doctype });
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [err, setErr] = useState<unknown>(null);
  if (masters.isLoading) return <Loading />;
  if (masters.error || !masters.data) return <div className="page-container"><ErrorState error={masters.error} onRetry={() => void masters.mutate()} /></div>;
  const look = LOOK[doctype];
  const list = (rows.data?.rows ?? []).filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  const cols = master?.fields.slice(1, 4) ?? [];
  const remove = (r: Row) => { if (window.confirm(`Delete ${r.name}?`)) void apiCall(`${M}.delete`, { doctype, name: r.name }).then(() => { void rows.mutate(); void masters.mutate(); }).catch(setErr); };
  return (
    <div className="page-container space-y-5">
      <PageHeader title="CRM masters" subtitle="The lists your leads and deals are built from" icon={<Layers className="h-5 w-5" />} />
      <ColorTabs value={doctype} onChange={(k) => { setParams({ m: k }); setQ(""); }}
        tabs={masters.data.map((m) => ({ key: m.doctype, label: LOOK[m.doctype].label, icon: LOOK[m.doctype].icon, tone: LOOK[m.doctype].tone, count: m.count }))} />
      {master && look && (
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><look.icon className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">{look.label}</p><p className="text-xs text-muted-foreground">{look.hint}</p></div>
            <div className="relative w-full sm:w-60"><Search className="absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input className="field h-9 ps-8 text-sm" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {rows.data?.can_create && <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add</Button>}
          </div>
          <InlineError error={err} />
          {rows.isLoading ? <Loading /> : !list.length ? <div className="p-6"><Empty title="Nothing here yet" /></div> : (
            <Table className="rounded-none border-0">
              <thead><tr><TH>{master.fields[0].label}</TH>{cols.map((c) => <TH key={c.field}>{c.label}</TH>)}<TH className="text-end">Used by</TH><TH className="text-end">{""}</TH></tr></thead>
              <tbody>{list.map((r) => (
                <TR key={r.name}>
                  <TD className="font-medium">{doctype === "CRM Lead Status" && <span className={cn("me-2 inline-block h-2.5 w-2.5 rounded-full", CRM_COLORS[r.color ?? "gray"])} />}{r.name}</TD>
                  {cols.map((c) => <TD key={c.field} className="text-sm text-muted-foreground">{c.type === "Currency" && r[c.field] ? Number(r[c.field]).toLocaleString() : String(r[c.field] ?? "—")}</TD>)}
                  <TD className="text-end"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", r.used ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{r.used} {(rows.data?.used_by ?? "").replace("CRM ", "").toLowerCase()}{r.used === 1 ? "" : "s"}</span></TD>
                  <TD className="text-end">{rows.data?.can_write && <div className="flex justify-end gap-1">
                    <button className="rounded-md p-1.5 hover:bg-accent" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></button>
                    <button className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${r.name}`} disabled={!!r.used} title={r.used ? "In use" : undefined} onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></button>
                  </div>}</TD>
                </TR>
              ))}</tbody>
            </Table>
          )}
        </div>
      )}
      {master && editing && <Editor master={master} row={editing} onClose={() => setEditing(null)} onSaved={() => { void rows.mutate(); void masters.mutate(); }} />}
    </div>
  );
}
