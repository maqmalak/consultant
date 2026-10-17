/**
 * Tax Admin settings: firm details (website + portal), WhatsApp, outgoing email and the payment gateway.
 * Secrets are write-only — the page only knows whether one is stored; leaving the field blank keeps it.
 */
import { CheckCircle2, CreditCard, KeyRound, Mail, MessageCircle, Radar, Settings2, Smartphone, Store } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ColorTabs, type TabTone } from "@/components/ui/color-tabs";
import { Field, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const S = "pakistan_tax_consultancy.api.settings";
type Rec = Record<string, any>;

interface AllSettings {
  firm: Rec;
  whatsapp: Rec & { has_token: boolean; has_app_secret: boolean; has_verify_token: boolean; webhook_url: string; last_test: string | null;
    events: { field: string; event: string; params: string[] }[] };
  email: Rec & { configured: boolean; has_password: boolean };
  payment: Rec & { has_secret: boolean; has_salt: boolean; return_url: string; gateway_status: string | null };
  lead_finder: Rec & { has_token: boolean };
  otp: Rec & { has_twilio_token: boolean; has_gateway_key: boolean; whatsapp_ready: boolean; sms_last_test: string | null };
}

function useSaver<T>(fn: (data: Rec) => Promise<T>) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (data: Rec, okText = "Saved") => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const r = await fn(data);
      setOk(okText);
      return r;
    } catch (e) {
      setErr(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, err, ok, run };
}

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="form-card">
      <div className="form-card-head">{title}</div>
      <div className="form-card-body space-y-4">{hint && <div className="text-sm text-muted-foreground">{hint}</div>}{children}</div>
    </section>
  );
}

function Saved({ ok, err }: { ok: string | null; err: unknown }) {
  return (
    <>
      <InlineError error={err} />
      {ok && <p className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> {ok}</p>}
    </>
  );
}

function Text({ label, field, form, set, hint, type = "text", placeholder }: {
  label: string; field: string; form: Rec; set: (f: string, v: unknown) => void; hint?: string; type?: string; placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>{(id) => (
      <TextInput id={id} type={type} placeholder={placeholder} value={form[field] ?? ""} onChange={(e) => set(field, e.target.value)} />
    )}</Field>
  );
}

/** Form state seeded once; the page remounts each tab (key) when fresh data arrives from the server. */
function useForm(initial: Rec) {
  const [form, setForm] = useState<Rec>(() => initial);
  return { form, set: (f: string, v: unknown) => setForm((p) => ({ ...p, [f]: v })), setForm };
}

// ------------------------------------------------------------------------------------------------ firm
function FirmTab({ data, onSaved }: { data: Rec; onSaved: () => void }) {
  const { form, set } = useForm(data);
  const save = useSaver((d) => apiCall(`${S}.save_firm`, { data: d }));
  const p = { form, set };
  return (
    <div className="space-y-5">
      <Section title="Firm" hint="Shown on the website, the portal and invoices. Only true facts — the trust strip shows them as written.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Firm name" field="firm_name" {...p} />
          <Text label="Tagline" field="tagline" {...p} />
          <Text label="Phone" field="phone" {...p} />
          <Text label="Second phone" field="phone_2" {...p} />
          <Text label="WhatsApp number" field="whatsapp" {...p} hint="International digits, e.g. 923001234567" />
          <Text label="Email" field="email" type="email" {...p} />
          <div className="sm:col-span-2"><Field label="Office address">{(id) => (
            <TextArea id={id} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />)}</Field></div>
          <Text label="Office hours" field="office_hours" {...p} />
          <Text label="Google Maps link" field="map_link" {...p} />
          <div className="sm:col-span-2"><Text label="Google Maps embed URL" field="map_embed_url" {...p} hint="Maps → Share → Embed a map → copy the src=… URL" /></div>
          <Text label="Membership / registration" field="membership_info" {...p} />
          <Text label="Years of experience" field="years_experience" type="number" {...p} />
          <Field label="Brand colour">{(id) => (
            <div className="flex items-center gap-2">
              <input id={id} type="color" value={form.brand_color || "#0d9488"} onChange={(e) => set("brand_color", e.target.value)} className="h-10 w-14 rounded border" />
              <span className="text-sm text-muted-foreground">{form.brand_color}</span>
            </div>)}</Field>
          <Text label="WhatsApp greeting" field="whatsapp_message" {...p} hint="Pre-filled text when a visitor taps WhatsApp" />
        </div>
      </Section>
      <Section title="Payment details shown to clients" hint="Clients see these under Payments and upload proof after paying.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Bank name" field="bank_name" {...p} />
          <Text label="Account title" field="bank_account_title" {...p} />
          <Text label="Account number" field="bank_account_no" {...p} />
          <Text label="IBAN" field="bank_iban" {...p} />
          <Text label="Raast ID" field="raast_id" {...p} />
          <Text label="JazzCash number" field="jazzcash_number" {...p} />
          <Text label="JazzCash account title" field="jazzcash_title" {...p} />
          <Text label="Easypaisa number" field="easypaisa_number" {...p} />
          <Text label="Easypaisa account title" field="easypaisa_title" {...p} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={!!form.work_before_payment} onChange={(e) => set("work_before_payment", e.target.checked ? 1 : 0)} />
            Start preparing returns before the fee is paid
          </label>
        </div>
      </Section>
      <Section title="Announcement bar">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={!!form.announcement_enabled} onChange={(e) => set("announcement_enabled", e.target.checked ? 1 : 0)} /> Show on the website
          </label>
          <div className="sm:col-span-2"><Text label="Text" field="announcement_text" {...p} /></div>
          <Text label="Link (optional)" field="announcement_link" {...p} />
          <Text label="Hide after" field="announcement_expiry" type="date" {...p} />
        </div>
      </Section>
      <div className="flex items-center gap-3">
        <Button loading={save.busy} onClick={() => void save.run(form).then((r) => r && onSaved())}>Save firm settings</Button>
        <Saved ok={save.ok} err={save.err} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ whatsapp
function WhatsAppTab({ data, onSaved }: { data: AllSettings["whatsapp"]; onSaved: () => void }) {
  const { form, set } = useForm({ ...data, wa_access_token: "", wa_app_secret: "", wa_webhook_verify_token: "" });
  const save = useSaver((d) => apiCall(`${S}.save_whatsapp`, { data: d }));
  const test = useSaver((d) => apiCall<{ result: string }>(`${S}.test_whatsapp`, d));
  const [to, setTo] = useState("");
  const [result, setResult] = useState<string | null>(data.last_test);
  const cloud = form.whatsapp_provider === "WhatsApp Cloud API (Meta)";
  const p = { form, set };
  return (
    <div className="space-y-5">
      <Section title="WhatsApp" hint={<>
        <p><b>Click-to-chat</b> (works now): the website, portal and invites open WhatsApp with your number.</p>
        <p className="mt-1"><b>WhatsApp Cloud API</b>: the app also sends automatic updates (return ready to confirm, document rejected, filed…) to
          clients who opted in. You need a Meta Business account, a WhatsApp Business phone number and approved message templates.</p>
      </>}>
        <label className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={!!form.wa_mock_mode} onChange={(e) => set("wa_mock_mode", e.target.checked ? 1 : 0)} />
          <span><b>Test mode</b> — no real messages leave the server. Use the WhatsApp inbox's “Simulate client reply” to try everything.
            Turn off only when your Meta number and token are set.</span>
        </label>
        <Field label="Mode">{(id) => (
          <SelectInput id={id} value={form.whatsapp_provider ?? ""} onChange={(e) => set("whatsapp_provider", e.target.value)}>
            <option>Click-to-chat only</option><option>WhatsApp Cloud API (Meta)</option>
          </SelectInput>)}</Field>
        {cloud && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Text label="Phone Number ID" field="wa_phone_number_id" {...p} hint="Meta → WhatsApp → API Setup" />
            <Text label="WhatsApp Business Account ID" field="wa_business_account_id" {...p} />
            <div className="sm:col-span-2">
              <Text label={`Permanent access token ${data.has_token ? "(stored — leave blank to keep)" : ""}`} field="wa_access_token" type="password" {...p}
                hint="System-user token with whatsapp_business_messaging permission. Stored encrypted; never shown again." />
            </div>
            <Text label="Meta App ID" field="wa_app_id" {...p} />
            <Text label={`App secret ${data.has_app_secret ? "(stored — leave blank to keep)" : ""}`} field="wa_app_secret" type="password" {...p}
              hint="Used to check that webhook calls really come from Meta" />
            <Text label={`Webhook verify token ${data.has_verify_token ? "(stored — leave blank to keep)" : ""}`} field="wa_webhook_verify_token" type="password" {...p}
              hint="Any secret phrase; enter the same in Meta → Webhooks" />
            <Field label="Webhook (callback) URL for Meta">{(id) => <TextInput id={id} readOnly value={data.webhook_url} />}</Field>
            <Text label="Graph API version" field="wa_api_version" {...p} />
            <Text label="Template language code" field="wa_language" {...p} hint="e.g. en, en_US or ur" />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={!!form.whatsapp_enabled} onChange={(e) => set("whatsapp_enabled", e.target.checked ? 1 : 0)} />
              Send automatic WhatsApp updates to clients who opted in
            </label>
          </div>
        )}
      </Section>
      {cloud && (
        <Section title="Message templates" hint="Create each template in WhatsApp Manager with these body placeholders in this order, wait for approval, then enter its name. Blank = that update is not sent on WhatsApp (email / in-app still are).">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Opt-out words (one per line)">{(id) => <TextArea id={id} value={form.wa_opt_out_keywords ?? ""} onChange={(e) => set("wa_opt_out_keywords", e.target.value)} />}</Field>
              <Field label="Opt-in words (one per line)">{(id) => <TextArea id={id} value={form.wa_opt_in_keywords ?? ""} onChange={(e) => set("wa_opt_in_keywords", e.target.value)} />}</Field>
            </div>
            {data.events.map((e) => (
              <div key={e.field} className="grid gap-2 sm:grid-cols-[1fr_1.2fr] sm:items-end">
                <Text label={e.event.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())} field={e.field} {...p} placeholder="template_name" />
                <p className="text-xs text-muted-foreground">{e.params.map((x, i) => `{{${i + 1}}} ${x}`).join(" · ")}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={save.busy} onClick={() => void save.run(form).then((r) => r && onSaved())}>Save WhatsApp settings</Button>
        <Saved ok={save.ok} err={save.err} />
      </div>
      {cloud && (
        <Section title="Send a test" hint="Sends Meta's sample “hello_world” template to the number below (it must be a WhatsApp number; in test mode, one you added in Meta).">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-64"><Field label="To">{(id) => <TextInput id={id} value={to} onChange={(e) => setTo(e.target.value)} placeholder="0300 1234567" />}</Field></div>
            <Button variant="outline" loading={test.busy} disabled={!to} onClick={() => void test.run({ to }, "Test sent").then((r) => r && setResult(r.result))}>Send test</Button>
          </div>
          <InlineError error={test.err} />
          {result && <p className={cn("rounded-md px-3 py-2 text-sm", result.startsWith("OK") ? "bg-success/10" : "bg-destructive/10 text-destructive")}>{result}</p>}
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ email
const PRESETS: Record<string, { smtp_server: string; smtp_port: string; use_tls: number; use_ssl_for_outgoing: number }> = {
  "Google Workspace / Gmail": { smtp_server: "smtp.gmail.com", smtp_port: "587", use_tls: 1, use_ssl_for_outgoing: 0 },
  "Microsoft 365 / Outlook": { smtp_server: "smtp.office365.com", smtp_port: "587", use_tls: 1, use_ssl_for_outgoing: 0 },
  "Zoho Mail": { smtp_server: "smtp.zoho.com", smtp_port: "587", use_tls: 1, use_ssl_for_outgoing: 0 },
  "cPanel / hosting (SSL 465)": { smtp_server: "mail.vvsconsultants.pk", smtp_port: "465", use_tls: 0, use_ssl_for_outgoing: 1 },
};

function EmailTab({ data, onSaved }: { data: AllSettings["email"]; onSaved: () => void }) {
  const { form, set, setForm } = useForm({ smtp_port: "587", use_tls: 1, ...data, password: "" });
  const save = useSaver((d) => apiCall(`${S}.save_email`, { data: d }));
  const test = useSaver((d) => apiCall(`${S}.test_email`, d));
  const [to, setTo] = useState("");
  const p = { form, set };
  return (
    <div className="space-y-5">
      <Section title="Outgoing email" hint={<>
        <p>Used for invites, password resets, OTP backups, notifications and invoices. Saving connects to the mail server to check the login.</p>
        <p className="mt-1">For Gmail / Google Workspace use an <b>App Password</b> (Google Account → Security → 2-Step Verification → App passwords), not your normal password.
          Also add SPF, DKIM and DMARC records for your domain (see GO_LIVE.md).</p>
      </>}>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((k) => (
            <button key={k} type="button" className="rounded-full border px-3 py-1 text-xs hover:bg-accent" onClick={() => setForm((f) => ({ ...f, ...PRESETS[k] }))}>{k}</button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Send from (email address)" field="email_id" type="email" {...p} placeholder="no-reply@vvsconsultants.pk" />
          <Text label="Login (if different)" field="login_id" {...p} />
          <Text label={`Password / app password ${data.has_password ? "(stored — leave blank to keep)" : ""}`} field="password" type="password" {...p} />
          <Text label="SMTP server" field="smtp_server" {...p} />
          <Text label="SMTP port" field="smtp_port" {...p} />
          <div className="flex items-end gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.use_tls} onChange={(e) => set("use_tls", e.target.checked ? 1 : 0)} /> STARTTLS</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!form.use_ssl_for_outgoing} onChange={(e) => set("use_ssl_for_outgoing", e.target.checked ? 1 : 0)} /> SSL</label>
          </div>
        </div>
      </Section>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={save.busy} onClick={() => void save.run(form, "Saved — the mail server accepted the login").then((r) => r && onSaved())}>Save & check connection</Button>
        <Saved ok={save.ok} err={save.err} />
      </div>
      {data.configured && (
        <Section title="Send a test email">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-72"><Field label="To">{(id) => <TextInput id={id} type="email" value={to} onChange={(e) => setTo(e.target.value)} />}</Field></div>
            <Button variant="outline" loading={test.busy} disabled={!to} onClick={() => void test.run({ to }, "Test email sent")}>Send test</Button>
          </div>
          <Saved ok={test.ok} err={test.err} />
        </Section>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ payment
const GATEWAYS: Record<string, string> = {
  "Manual (bank / wallet proof)": "Clients pay by bank transfer, Raast, JazzCash or Easypaisa and upload proof; you verify it (works now).",
  JazzCash: "Mobilink JazzCash merchant: wallet + card checkout. You receive Merchant ID, Password and Integrity Salt from JazzCash.",
  Easypaisa: "Telenor Easypaisa merchant: wallet / card checkout. You receive Store ID and a Hash Key.",
  Safepay: "Card + wallet checkout aggregator with a developer API. You receive API (public) key and secret key.",
  PayFast: "PayFast (APPS) aggregator: cards, wallets and bank accounts. You receive Merchant ID and secured key.",
  "Bank Alfalah (Alfa)": "Bank Alfalah payment gateway: cards and Alfa wallet. You receive Merchant ID, Store ID, keys.",
};

function PaymentTab({ data, onSaved }: { data: AllSettings["payment"]; onSaved: () => void }) {
  const { form, set } = useForm({ ...data, gateway_secret: "", gateway_salt: "" });
  const save = useSaver((d) => apiCall(`${S}.save_payment`, { data: d }));
  const manual = String(form.payment_gateway ?? "").startsWith("Manual");
  const p = { form, set };
  return (
    <div className="space-y-5">
      <Section title="Payment gateway" hint="Credentials are stored encrypted on the server. Online checkout for a gateway is switched on only after it has been built and tested in Sandbox.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Gateway">{(id) => (
            <SelectInput id={id} value={form.payment_gateway ?? ""} onChange={(e) => set("payment_gateway", e.target.value)}>
              {Object.keys(GATEWAYS).map((g) => <option key={g}>{g}</option>)}
            </SelectInput>)}</Field>
          {!manual && (
            <Field label="Environment">{(id) => (
              <SelectInput id={id} value={form.gateway_environment ?? "Sandbox"} onChange={(e) => set("gateway_environment", e.target.value)}>
                <option>Sandbox</option><option>Live</option>
              </SelectInput>)}</Field>
          )}
        </div>
        <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">{GATEWAYS[form.payment_gateway] ?? ""}</p>
        {!manual && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Text label="Merchant ID" field="gateway_merchant_id" {...p} />
            <Text label="Store ID / account" field="gateway_store_id" {...p} />
            <Text label="API / public key" field="gateway_api_key" {...p} />
            <Text label={`Password / secret key ${data.has_secret ? "(stored — leave blank to keep)" : ""}`} field="gateway_secret" type="password" {...p} />
            <Text label={`Integrity salt / hash key ${data.has_salt ? "(stored — leave blank to keep)" : ""}`} field="gateway_salt" type="password" {...p} />
            <Field label="Return URL (give this to the gateway)">{(id) => <TextInput id={id} readOnly value={data.return_url} />}</Field>
          </div>
        )}
        {data.gateway_status && <p className="text-sm text-muted-foreground">{data.gateway_status}</p>}
      </Section>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={save.busy} onClick={() => void save.run(form).then((r) => r && onSaved())}>Save payment settings</Button>
        <Saved ok={save.ok} err={save.err} />
      </div>
    </div>
  );
}

function LeadFinderTab({ data, onSaved }: { data: AllSettings["lead_finder"]; onSaved: () => void }) {
  const { form, set } = useForm({ ...data, apify_api_token: "" });
  const save = useSaver((d) => apiCall(`${S}.save_lead_finder`, { data: d }));
  const p = { form, set };
  return (
    <div className="space-y-5">
      <Section title="Google Maps leads (Apify)" hint="Lead Finder can search Google Maps by business type and city — e.g. restaurant · Faisalabad, Pakistan — through your Apify account. Results wait in the review queue; nothing becomes a lead until someone approves it. Apify bills your account per run.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label={`Apify API token ${data.has_token ? "(stored — leave blank to keep)" : ""}`} field="apify_api_token" type="password" {...p}
            hint="Apify console → Settings → API & Integrations" />
          <Text label="Actor ID" field="apify_actor_id" {...p} hint="Google Maps scraper actor (default nwua9Gu5YrADL7ZDj)" />
          <Text label="Max places per search" field="apify_max_places" type="number" {...p} hint="1–200; more places cost more Apify credit" />
          <Text label="Result language" field="apify_language" {...p} />
        </div>
        <p className="text-sm text-muted-foreground">{data.has_token ? "Token saved — staff can run Google Maps searches from CRM → Lead Finder." : "No token yet — Google Maps search stays off until one is saved."}</p>
      </Section>
      <div className="flex flex-wrap items-center gap-3">
        <Button loading={save.busy} onClick={() => void save.run(form).then((r) => r && onSaved())}>Save Lead Finder settings</Button>
        <Saved ok={save.ok} err={save.err} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ verification codes
const OTP_ORDER = [["WhatsApp, then SMS", "WhatsApp first, SMS as backup", "Recommended — most clients read WhatsApp first; if it fails the same code goes by SMS."],
  ["SMS only", "SMS only", "Every code by SMS."], ["WhatsApp only", "WhatsApp only", "No SMS cost — but a client without WhatsApp cannot sign up."]] as const;

function OtpTab({ data, onSaved }: { data: AllSettings["otp"]; onSaved: () => void }) {
  const { form, set } = useForm({ ...data, sms_twilio_token: "", sms_gateway_api_key: "" });
  const save = useSaver((d) => apiCall(`${S}.save_otp`, { data: d }));
  const [mobile, setMobile] = useState("");
  const test = useSaver((d) => apiCall<{ result: string }>(`${S}.test_otp`, d).then((r) => r.result));
  const p = { form, set };
  const provider = form.sms_provider as string;
  return (
    <div className="space-y-5">
      <Section title="How the 6-digit code reaches the client" hint="Used when a client creates an account (and later for sign-in or reset by mobile). The code is only stored scrambled; it never appears in the team inbox or logs.">
        <div className="grid gap-3 md:grid-cols-3">
          {OTP_ORDER.map(([value, label, hint]) => (
            <button key={value} type="button" onClick={() => set("otp_channel", value)}
              className={cn("rounded-xl border p-4 text-start transition", form.otp_channel === value ? "border-primary bg-primary/5 ring-2 ring-primary/25" : "hover:border-primary/40")}>
              <p className="flex items-center gap-2 text-sm font-semibold">{value.startsWith("WhatsApp") ? <MessageCircle className="h-4 w-4 text-[#25D366]" /> : <Smartphone className="h-4 w-4 text-sky-500" />}{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </button>
          ))}
        </div>
      </Section>

      <Section title="WhatsApp" hint={<>Needs the WhatsApp tab set to <b>WhatsApp Cloud API (Meta)</b> and switched on, plus an <b>Authentication</b> template approved by Meta with body “<i>{"{{1}}"} is your verification code</i>” and a <i>Copy code</i> button.</>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Text label="Authentication template name" field="wa_tpl_otp" {...p} hint="Exactly as approved in Meta WhatsApp Manager" />
          <div className={cn("flex items-center gap-2 self-end rounded-lg px-3 py-2.5 text-sm", data.whatsapp_ready ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-800 dark:text-amber-300")}>
            {data.whatsapp_ready ? <CheckCircle2 className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            {data.whatsapp_ready ? "WhatsApp is ready to send codes." : "WhatsApp is not ready — codes will go by SMS until it is."}
          </div>
        </div>
      </Section>

      <Section title="SMS (backup)" hint="Ask your SMS company for a sender ID (mask) registered with PTA. Keys are stored encrypted and never shown again.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SMS provider">{(id) => (
            <SelectInput id={id} value={provider} onChange={(e) => set("sms_provider", e.target.value)}>
              {["Console (development)", "Twilio", "HTTP gateway"].map((o) => <option key={o}>{o}</option>)}</SelectInput>)}</Field>
          <Text label="Sender ID / mask" field="sms_sender_id" {...p} hint="e.g. VVS-TAX, or the Twilio number" />
          {provider === "Twilio" && <>
            <Text label="Twilio Account SID" field="sms_twilio_sid" {...p} />
            <Text label={`Twilio Auth Token ${data.has_twilio_token ? "(stored — leave blank to keep)" : ""}`} field="sms_twilio_token" type="password" {...p} />
          </>}
          {provider === "HTTP gateway" && <>
            <div className="sm:col-span-2"><Field label="Gateway send link" hint="From your SMS company, with {to} {to_e164} {message} {sender} {api_key} where the values go. Must start with https://">{(id) => (
              <TextArea id={id} rows={2} value={form.sms_gateway_url ?? ""} onChange={(e) => set("sms_gateway_url", e.target.value)}
                placeholder="https://sms.example.pk/api/send?key={api_key}&to={to}&mask={sender}&msg={message}" />)}</Field></div>
            <Text label={`Gateway API key ${data.has_gateway_key ? "(stored — leave blank to keep)" : ""}`} field="sms_gateway_api_key" type="password" {...p} />
          </>}
        </div>
        {provider === "Console (development)" && <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">Development mode — no SMS leaves the server; codes are written to the server log only.</p>}
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button loading={save.busy} onClick={() => void save.run(form).then((r) => r && onSaved())}>Save verification settings</Button>
        <Saved ok={save.ok} err={save.err} />
      </div>

      <Section title="Send a test" hint="Sends the test code 000000 in the chosen order (save first). Use your own mobile.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56"><Field label="Mobile">{(id) => <TextInput id={id} inputMode="tel" placeholder="03xx-xxxxxxx" value={mobile} onChange={(e) => setMobile(e.target.value)} />}</Field></div>
          <Button variant="outline" loading={test.busy} disabled={!mobile.trim()} onClick={() => void test.run({ mobile })}>Test (WhatsApp first)</Button>
          <Button variant="outline" loading={test.busy} disabled={!mobile.trim()} onClick={() => void test.run({ mobile, channel: "sms" })}>Test SMS only</Button>
        </div>
        <Saved ok={test.ok} err={test.err} />
        {data.sms_last_test && !test.ok && <p className="text-xs text-muted-foreground">Last test: {data.sms_last_test}</p>}
      </Section>
    </div>
  );
}

const TAB_TONES: Record<string, TabTone> = { firm: "gold", whatsapp: "whatsapp", email: "sky", payment: "emerald", lead_finder: "violet", otp: "indigo" };
const TABS = [["firm", "Firm", Store], ["whatsapp", "WhatsApp", MessageCircle], ["email", "Email", Mail], ["payment", "Payment gateway", CreditCard], ["lead_finder", "Lead Finder", Radar], ["otp", "Verification codes", KeyRound]] as const;

export function SettingsPage() {
  const { data, error, isLoading, mutate } = useApi<AllSettings>(`${S}.get_settings`);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("firm");
  const [notice, setNotice] = useState<string | null>(null);
  const saved = () => { setNotice("Saved"); void mutate(); window.setTimeout(() => setNotice(null), 4000); };
  return (
    <div className="page-container space-y-5">
      <PageHeader title="Settings" subtitle="Firm details, WhatsApp, email and payments" icon={<Settings2 className="h-5 w-5" />} />
      <ColorTabs value={tab} onChange={setTab} tabs={TABS.map(([key, label, icon]) => ({ key, label, icon, tone: TAB_TONES[key] }))} />
      {notice && <p role="status" className="flex items-center gap-1.5 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> {notice}</p>}
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && tab === "firm" && <FirmTab key={JSON.stringify(data.firm)} data={data.firm} onSaved={saved} />}
      {data && tab === "whatsapp" && <WhatsAppTab key={JSON.stringify(data.whatsapp)} data={data.whatsapp} onSaved={saved} />}
      {data && tab === "email" && <EmailTab key={JSON.stringify(data.email)} data={data.email} onSaved={saved} />}
      {data && tab === "payment" && <PaymentTab key={JSON.stringify(data.payment)} data={data.payment} onSaved={saved} />}
      {data && tab === "otp" && <OtpTab key={JSON.stringify(data.otp)} data={data.otp} onSaved={saved} />}
      {data && tab === "lead_finder" && <LeadFinderTab key={JSON.stringify(data.lead_finder)} data={data.lead_finder} onSaved={saved} />}
    </div>
  );
}
