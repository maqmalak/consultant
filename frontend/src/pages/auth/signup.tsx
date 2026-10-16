import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { useAuth } from "@/hooks/useAuth";
import { auth } from "@/lib/api";
import { CLIENT_TYPES, passwordSchema, signupSchema, type SignupDetails } from "@/lib/validation";
import { AuthLayout } from "./auth-layout";

const TYPE_LABEL: Record<string, string> = {
  "Individual-Salaried": "Individual — salaried", "Individual-Business": "Individual — business / self-employed",
  AOP: "AOP / partnership", Company: "Company", Other: "Other",
};

export function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [details, setDetails] = useState<SignupDetails | null>(null);
  const [otpRequest, setOtpRequest] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const form = useForm<SignupDetails>({ resolver: zodResolver(signupSchema),
    defaultValues: { client_type: "Individual-Salaried", consent: undefined as unknown as true } });
  const pw = useForm<{ password: string; confirm: string }>({ resolver: zodResolver(passwordSchema) });

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const sendCode = form.handleSubmit((d) => run(async () => {
    const r = await auth.requestOtp(d.mobile);
    setDetails(d);
    setOtpRequest(r.request);
    setStep(2);
  }));

  const verify = () => run(async () => {
    await auth.verifyOtp(otpRequest, details!.mobile, code.trim());
    setStep(3);
  });

  const create = pw.handleSubmit((p) => run(async () => {
    await auth.signup({ ...details, consent: 1, whatsapp_opt_in: details?.whatsapp_opt_in ? 1 : 0, password: p.password,
      otp_request: otpRequest });
    await refresh();
    navigate("/", { replace: true });
  }));

  const e = form.formState.errors;
  return (
    <AuthLayout title={t("Create account")} subtitle={`Step ${step} of 3`}
      footer={<>{t("Already have an account?")} <Link to="/login" className="font-medium text-primary hover:underline">{t("Sign in")}</Link></>}>
      {step === 1 && (
        <form onSubmit={sendCode} className="space-y-4" noValidate>
          <Field label={t("Full name")} required error={e.full_name?.message}>{(id) => (
            <TextInput id={id} autoComplete="name" {...form.register("full_name")} />)}</Field>
          <Field label={t("Mobile number")} required error={e.mobile?.message} hint="We send a verification code by SMS">{(id) => (
            <TextInput id={id} type="tel" inputMode="tel" autoComplete="tel" placeholder="0300 1234567" {...form.register("mobile")} />)}</Field>
          <Field label={t("Email")} required error={e.email?.message}>{(id) => (
            <TextInput id={id} type="email" autoComplete="email" {...form.register("email")} />)}</Field>
          <Field label={t("CNIC")} error={e.cnic?.message} hint="Optional now — needed before filing">{(id) => (
            <TextInput id={id} inputMode="numeric" placeholder="12345-1234567-1" {...form.register("cnic")} />)}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("Client type")} required>{(id) => (
              <SelectInput id={id} {...form.register("client_type")}>
                {CLIENT_TYPES.map((c) => <option key={c} value={c}>{TYPE_LABEL[c]}</option>)}
              </SelectInput>)}</Field>
            <Field label={t("City")}>{(id) => <TextInput id={id} {...form.register("city")} />}</Field>
          </div>
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[hsl(var(--primary))]" {...form.register("consent")} />
            <span>{t("I agree to the privacy policy and terms")} — <a href="/privacy" target="_blank" className="text-primary underline">privacy</a>,{" "}
              <a href="/terms" target="_blank" className="text-primary underline">terms</a></span>
          </label>
          {e.consent && <p role="alert" className="text-xs text-destructive">{e.consent.message}</p>}
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 accent-[hsl(var(--primary))]" {...form.register("whatsapp_opt_in")} />
            <span>{t("Send me updates about my return on WhatsApp")}</span>
          </label>
          <InlineError error={error} />
          <Button type="submit" className="w-full" size="lg" loading={busy}>{t("Send code")}</Button>
        </form>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm">{t("We sent a 6-digit code to")} <b dir="ltr">{details?.mobile}</b>.</p>
          <Field label={t("Verification code")} required>{(id) => (
            <TextInput id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))} className="text-center text-lg tracking-[0.5em]" />)}</Field>
          <InlineError error={error} />
          <Button className="w-full" size="lg" loading={busy} disabled={code.length !== 6} onClick={verify}>{t("Verify")}</Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setStep(1)}>{t("Back")}</button>
            <button type="button" className="text-primary hover:underline" disabled={busy}
              onClick={() => run(async () => setOtpRequest((await auth.requestOtp(details!.mobile)).request))}>Resend code</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <form onSubmit={create} className="space-y-4" noValidate>
          <Field label={t("Password")} required error={pw.formState.errors.password?.message} hint="At least 8 characters with a letter and a number">{(id) => (
            <TextInput id={id} type="password" autoComplete="new-password" {...pw.register("password")} />)}</Field>
          <Field label="Confirm password" required error={pw.formState.errors.confirm?.message}>{(id) => (
            <TextInput id={id} type="password" autoComplete="new-password" {...pw.register("confirm")} />)}</Field>
          <InlineError error={error} />
          <Button type="submit" className="w-full" size="lg" loading={busy}>{t("Create account")}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
