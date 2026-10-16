import { CheckCircle2, MailWarning } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { auth, M, portal } from "@/lib/api";
import { useApi } from "@/lib/use-api";

type Profile = Record<string, string | number | null>;
const EDITABLE = ["city", "province", "residential_address", "business_name", "business_address", "ntn",
  "preferred_contact_method", "preferred_language", "whatsapp_opt_in"];

export function ProfilePage() {
  const { t } = useTranslation();
  const { data, error, isLoading, mutate } = useApi<Profile>(`${M.PORTAL}.profile`);
  const [form, setForm] = useState<Profile>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  const set = (k: string) => (e: { target: { value: string } }) => { setForm({ ...form, [k]: e.target.value }); setSaved(false); };
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("Profile")}</h1>
      <Card className="grid gap-3 p-4 text-sm sm:grid-cols-2">
        <p><span className="text-muted-foreground">Name:</span> <b>{data.client_name}</b></p>
        <p><span className="text-muted-foreground">Type:</span> {data.client_type}</p>
        <p><span className="text-muted-foreground">CNIC:</span> <span dir="ltr">{data.cnic_masked ?? "—"}</span></p>
        <p><span className="text-muted-foreground">FBR status:</span> {data.fbr_registration_status || "—"}</p>
        <p className="flex items-center gap-1.5"><span className="text-muted-foreground">Mobile:</span> <span dir="ltr">{data.mobile}</span>
          {data.mobile_verified ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="verified" /> : null}</p>
        <p className="flex flex-wrap items-center gap-1.5"><span className="text-muted-foreground">Email:</span> {data.email}
          {data.email_verified ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="verified" /> : (
            <button type="button" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              onClick={() => void auth.resendVerification()}><MailWarning className="h-3.5 w-3.5" /> verify</button>)}</p>
      </Card>
      <form className="form-card" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
          await portal.updateProfile(Object.fromEntries(EDITABLE.map((k) => [k, form[k]])));
          setSaved(true);
          await mutate();
        } catch (ex) {
          setErr(ex);
        } finally {
          setBusy(false);
        }
      }}>
        <div className="form-card-head">Contact & address</div>
        <div className="form-card-body grid gap-4 sm:grid-cols-2">
          <Field label={t("City")}>{(id) => <TextInput id={id} value={String(form.city ?? "")} onChange={set("city")} />}</Field>
          <Field label="Province">{(id) => (
            <SelectInput id={id} value={String(form.province ?? "")} onChange={set("province")}>
              {["", "Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"]
                .map((p) => <option key={p} value={p}>{p || "—"}</option>)}
            </SelectInput>)}</Field>
          <div className="sm:col-span-2"><Field label="Home address">{(id) => (
            <TextArea id={id} value={String(form.residential_address ?? "")} onChange={set("residential_address")} />)}</Field></div>
          <Field label="NTN (if you have one)">{(id) => <TextInput id={id} value={String(form.ntn ?? "")} onChange={set("ntn")} />}</Field>
          <Field label="Business name">{(id) => <TextInput id={id} value={String(form.business_name ?? "")} onChange={set("business_name")} />}</Field>
          <Field label="Contact me by">{(id) => (
            <SelectInput id={id} value={String(form.preferred_contact_method ?? "")} onChange={set("preferred_contact_method")}>
              {["Email", "Phone Call", "WhatsApp", "SMS"].map((m) => <option key={m}>{m}</option>)}
            </SelectInput>)}</Field>
          <Field label={t("Language")}>{(id) => (
            <SelectInput id={id} value={String(form.preferred_language ?? "en")} onChange={set("preferred_language")}>
              <option value="en">English</option><option value="ur">اردو</option>
            </SelectInput>)}</Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={!!form.whatsapp_opt_in}
              onChange={(e) => { setForm({ ...form, whatsapp_opt_in: e.target.checked ? 1 : 0 }); setSaved(false); }} />
            {t("Send me updates about my return on WhatsApp")}
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" loading={busy}>{t("Save")}</Button>
            {saved && <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
          </div>
          <div className="sm:col-span-2"><InlineError error={err} /></div>
        </div>
      </form>
    </div>
  );
}
