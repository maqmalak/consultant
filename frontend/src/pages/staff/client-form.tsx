/** Add / edit a client in plain steps. Identifiers are normalised and duplicates checked on the server. */
import { Save, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { M } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { CLIENT_TYPES, CNIC_RE, MOBILE_RE } from "@/lib/validation";
import { apiCall, http } from "@/services/frappe";

type Rec = Record<string, any>;
const PROVINCES = ["", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"];
const FBR = ["", "Filer (Active Taxpayer)", "Non-Filer", "Not Registered (No NTN)", "Unknown"];

export function ClientForm() {
  const { name } = useParams();
  const navigate = useNavigate();
  const editing = !!name;
  const { data: staff } = useApi<{ user: string; name: string; roles: string[] }[]>(`${M.STAFF}.staff_users`);
  const [form, setForm] = useState<Rec>({ client_type: "Individual-Salaried", status: "Active", registration_source: "Office" });
  const [loading, setLoading] = useState(editing);
  const [loadErr, setLoadErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!editing) return;
    http.get(`/api/resource/Tax Client/${encodeURIComponent(name!)}`).then((r) => setForm(r.data.data)).catch(setLoadErr).finally(() => setLoading(false));
  }, [editing, name]);

  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const mobileOk = !form.mobile || MOBILE_RE.test(String(form.mobile).replace(/[\s-]/g, ""));
  const cnicOk = !form.cnic || CNIC_RE.test(String(form.cnic).trim());
  const valid = !!form.client_name?.trim() && mobileOk && cnicOk;

  async function save() {
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setErr(null);
    try {
      const doc = await apiCall<Rec>("frappe.client.save", { doc: { ...form, doctype: "Tax Client" } });
      navigate(`/staff/clients/${doc.name}`);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (loadErr) return <div className="page-container"><ErrorState error={loadErr} /></div>;
  const consultants = (staff ?? []).filter((u) => u.roles.includes("Tax Consultant") || u.roles.includes("Tax Admin"));
  const officers = (staff ?? []).filter((u) => u.roles.includes("Field Officer"));
  return (
    <div className="page-container max-w-3xl space-y-5">
      <PageHeader title={editing ? `Edit ${form.client_name ?? ""}` : "New client"} subtitle="Fields marked * are required. Everything else can be added later."
        icon={<UserPlus className="h-5 w-5" />} />
      <section className="form-card">
        <div className="form-card-head">1 · Who is the client?</div>
        <div className="form-card-body grid gap-4 sm:grid-cols-2">
          <Field label="Full name / business name" required error={touched && !form.client_name?.trim() ? "Enter a name" : undefined}>{(id) => (
            <TextInput id={id} value={form.client_name ?? ""} onChange={set("client_name")} autoFocus />)}</Field>
          <Field label="Client type" required>{(id) => (
            <SelectInput id={id} value={form.client_type} onChange={set("client_type")}>
              {CLIENT_TYPES.map((c) => <option key={c}>{c}</option>)}
            </SelectInput>)}</Field>
          <Field label="CNIC" hint="12345-1234567-1" error={touched && !cnicOk ? "CNIC must have 13 digits" : undefined}>{(id) => (
            <TextInput id={id} inputMode="numeric" value={form.cnic ?? ""} onChange={set("cnic")} placeholder="12345-1234567-1" />)}</Field>
          <Field label="NTN" hint="If registered">{(id) => <TextInput id={id} value={form.ntn ?? ""} onChange={set("ntn")} />}</Field>
          <Field label="FBR status">{(id) => (
            <SelectInput id={id} value={form.fbr_registration_status ?? ""} onChange={set("fbr_registration_status")}>
              {FBR.map((f) => <option key={f} value={f}>{f || "—"}</option>)}
            </SelectInput>)}</Field>
          <Field label="STRN" hint="Sales tax registration, if any">{(id) => <TextInput id={id} value={form.strn ?? ""} onChange={set("strn")} />}</Field>
        </div>
      </section>
      <section className="form-card">
        <div className="form-card-head">2 · How do we reach them?</div>
        <div className="form-card-body grid gap-4 sm:grid-cols-2">
          <Field label="Mobile" hint="0300 1234567" error={touched && !mobileOk ? "Enter a Pakistani mobile number" : undefined}>{(id) => (
            <TextInput id={id} type="tel" value={form.mobile ?? ""} onChange={set("mobile")} placeholder="0300 1234567" />)}</Field>
          <Field label="Email" hint="Needed for the portal invite">{(id) => <TextInput id={id} type="email" value={form.email ?? ""} onChange={set("email")} />}</Field>
          <Field label="City">{(id) => <TextInput id={id} value={form.city ?? ""} onChange={set("city")} />}</Field>
          <Field label="Province">{(id) => (
            <SelectInput id={id} value={form.province ?? ""} onChange={set("province")}>{PROVINCES.map((p) => <option key={p} value={p}>{p || "—"}</option>)}</SelectInput>)}</Field>
          <div className="sm:col-span-2"><Field label="Home address">{(id) => <TextArea id={id} value={form.residential_address ?? ""} onChange={set("residential_address")} />}</Field></div>
          <Field label="Business name">{(id) => <TextInput id={id} value={form.business_name ?? ""} onChange={set("business_name")} />}</Field>
          <Field label="Preferred contact">{(id) => (
            <SelectInput id={id} value={form.preferred_contact_method ?? "WhatsApp"} onChange={set("preferred_contact_method")}>
              {["WhatsApp", "Phone Call", "Email", "SMS"].map((m) => <option key={m}>{m}</option>)}</SelectInput>)}</Field>
        </div>
      </section>
      <section className="form-card">
        <div className="form-card-head">3 · Who looks after them?</div>
        <div className="form-card-body grid gap-4 sm:grid-cols-2">
          <Field label="Consultant">{(id) => (
            <SelectInput id={id} value={form.assigned_consultant ?? ""} onChange={set("assigned_consultant")}>
              <option value="">— not assigned —</option>{consultants.map((u) => <option key={u.user} value={u.user}>{u.name}</option>)}</SelectInput>)}</Field>
          <Field label="Field officer">{(id) => (
            <SelectInput id={id} value={form.field_officer ?? ""} onChange={set("field_officer")}>
              <option value="">—</option>{officers.map((u) => <option key={u.user} value={u.user}>{u.name}</option>)}</SelectInput>)}</Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={!!form.consent_given} onChange={(e) => setForm({ ...form, consent_given: e.target.checked ? 1 : 0 })} />
            Client agreed to our privacy policy and terms (date is recorded)
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-5 w-5" checked={!!form.whatsapp_opt_in} onChange={(e) => setForm({ ...form, whatsapp_opt_in: e.target.checked ? 1 : 0 })} />
            Client agreed to receive updates on WhatsApp
          </label>
        </div>
      </section>
      <InlineError error={err} />
      <div className="sticky bottom-4 flex gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
        <Button size="lg" loading={busy} onClick={() => void save()}><Save className="h-4 w-4" /> {editing ? "Save changes" : "Create client"}</Button>
        <Button size="lg" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
      </div>
    </div>
  );
}
