import { MapPin, Plus, UserPlus } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { Link, useNavigate } from "react-router-dom";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { M, staff, type ServiceRow } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { CLIENT_TYPES } from "@/lib/validation";
import { getList, humanizeError, insertDoc, setValue } from "@/services/frappe";

type Row = Record<string, any>;
const STATUSES = ["New", "Contacted", "Qualified", "Converted", "Not Interested"];

export function VisitsPage() {
  const [status, setStatus] = useState("");
  const { data, error, isLoading, mutate } = useSWR(["visits", status], () => getList<Row>("Site Visit", {
    fields: ["name", "full_name", "mobile", "city", "client_type", "status", "visit_date", "follow_up_date", "field_officer", "converted_client"],
    filters: status ? [["status", "=", status]] : undefined, orderBy: "visit_date", limit: 200 }));
  const [err, setErr] = useState<unknown>(null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="page-container">
      <PageHeader title="Site visits" subtitle="Leads from field visits · follow-ups due are highlighted" icon={<MapPin className="h-5 w-5" />}
        actions={<LinkButton to="/staff/visits/new" size="default"><Plus className="h-4 w-4" /> New visit</LinkButton>} />
      <div className="mb-4 flex flex-wrap gap-1">
        {["", ...STATUSES].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`rounded-full border px-3 py-1 text-sm ${status === s ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}>
            {s || "All"}</button>
        ))}
      </div>
      <InlineError error={err} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.length && <Empty title="No visits" />}
      {data && data.length > 0 && (
        <Table>
          <thead><tr><TH>Name</TH><TH>Mobile</TH><TH>City</TH><TH>Visit</TH><TH>Follow-up</TH><TH>Status</TH><TH className="text-end">Action</TH></tr></thead>
          <tbody>{data.map((v) => {
            const due = v.follow_up_date && v.follow_up_date <= today && !["Converted", "Not Interested"].includes(v.status);
            return (
              <TR key={v.name} className={due ? "bg-amber-500/10" : ""}>
                <TD className="font-medium">{v.full_name}<p className="text-xs text-muted-foreground">{v.client_type}</p></TD>
                <TD dir="ltr"><a className="text-primary" href={`tel:${v.mobile}`}>{v.mobile}</a></TD>
                <TD>{v.city || "—"}</TD><TD>{formatDate(v.visit_date)}</TD>
                <TD className={due ? "font-semibold text-amber-700 dark:text-amber-300" : ""}>{formatDate(v.follow_up_date)}</TD>
                <TD>
                  {v.status === "Converted" ? <StateBadge state="Converted" /> : (
                    <SelectInput aria-label="Status" className="h-9 min-w-[130px]" value={v.status}
                      onChange={(e) => setValue("Site Visit", v.name, { status: e.target.value }).then(() => mutate()).catch(setErr)}>
                      {STATUSES.filter((s) => s !== "Converted").map((s) => <option key={s}>{s}</option>)}
                    </SelectInput>)}
                </TD>
                <TD className="text-end">
                  {v.converted_client ? <Link className="text-sm text-primary hover:underline" to={`/staff/clients/${v.converted_client}`}>Open client</Link> : (
                    <Button size="sm" variant="outline" disabled={v.status === "Not Interested"}
                      onClick={() => staff.convertVisit(v.name).then(() => mutate()).catch(setErr)}><UserPlus className="h-4 w-4" /> Convert</Button>)}
                </TD>
              </TR>
            );
          })}</tbody>
        </Table>
      )}
    </div>
  );
}

/** Mobile-first visit form for field officers. */
export function VisitForm() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const { data: services } = useApi<ServiceRow[]>(`${M.PUB}.services`);
  const { data: docTypes } = useSWR("doc-types", () => getList<{ name: string }>("Document Type", { filters: [["is_active", "=", 1]], limit: 100, orderBy: "display_order", order: "asc" }));
  const [f, setF] = useState<Record<string, string>>({ client_type: "Individual-Salaried", visit_date: new Date().toISOString().slice(0, 10), status: "New" });
  const [svc, setSvc] = useState<string[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const toggle = (list: string[], set_: (v: string[]) => void, v: string) => set_(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="page-container max-w-2xl">
      <PageHeader title="New site visit" icon={<MapPin className="h-5 w-5" />} />
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await insertDoc({ doctype: "Site Visit", visit_type: "Prospect", field_officer: me?.user, ...f,
            services_needed: svc.map((s) => ({ service: s })), documents_handed_over: docs.map((d) => ({ document_type: d, received: 1 })) });
          navigate("/staff/visits");
        } catch (ex) {
          setErr(humanizeError(ex));
        } finally {
          setBusy(false);
        }
      }}>
        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="Name" required>{(id) => <TextInput id={id} required value={f.full_name ?? ""} onChange={set("full_name")} />}</Field>
          <Field label="Mobile" required>{(id) => <TextInput id={id} type="tel" required value={f.mobile ?? ""} onChange={set("mobile")} placeholder="0300 1234567" />}</Field>
          <Field label="Email">{(id) => <TextInput id={id} type="email" value={f.email ?? ""} onChange={set("email")} />}</Field>
          <Field label="CNIC / NTN (if available)">{(id) => <TextInput id={id} value={f.cnic_or_ntn ?? ""} onChange={set("cnic_or_ntn")} />}</Field>
          <Field label="Client type">{(id) => (
            <SelectInput id={id} value={f.client_type} onChange={set("client_type")}>{CLIENT_TYPES.map((c) => <option key={c}>{c}</option>)}</SelectInput>)}</Field>
          <Field label="City">{(id) => <TextInput id={id} value={f.city ?? ""} onChange={set("city")} />}</Field>
          <div className="sm:col-span-2"><Field label="Address / location">{(id) => <TextArea id={id} value={f.location_description ?? ""} onChange={set("location_description")} />}</Field></div>
          <Field label="Visit date" required>{(id) => <TextInput id={id} type="date" required value={f.visit_date} onChange={set("visit_date")} />}</Field>
          <Field label="Follow-up date">{(id) => <TextInput id={id} type="date" value={f.follow_up_date ?? ""} onChange={set("follow_up_date")} />}</Field>
          <div className="sm:col-span-2"><Field label="Purpose">{(id) => <TextInput id={id} value={f.purpose ?? ""} onChange={set("purpose")} />}</Field></div>
        </Card>
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold">Services needed</p>
          <div className="flex flex-wrap gap-2">{(services ?? []).map((s) => (
            <button type="button" key={s.name} onClick={() => toggle(svc, setSvc, s.name)} aria-pressed={svc.includes(s.name)}
              className={`rounded-full border px-3 py-1.5 text-sm ${svc.includes(s.name) ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{s.title}</button>))}</div>
          <p className="pt-2 text-sm font-semibold">Documents checklist handed over</p>
          <div className="flex flex-wrap gap-2">{(docTypes ?? []).map((d) => (
            <button type="button" key={d.name} onClick={() => toggle(docs, setDocs, d.name)} aria-pressed={docs.includes(d.name)}
              className={`rounded-full border px-3 py-1.5 text-sm ${docs.includes(d.name) ? "border-primary bg-primary text-primary-foreground" : "bg-card"}`}>{d.name}</button>))}</div>
        </Card>
        <Card className="p-4"><Field label="Notes">{(id) => <TextArea id={id} value={f.notes ?? ""} onChange={set("notes")} />}</Field></Card>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <Button type="submit" size="lg" className="w-full sm:w-auto" loading={busy}>Save visit</Button>
      </form>
    </div>
  );
}
