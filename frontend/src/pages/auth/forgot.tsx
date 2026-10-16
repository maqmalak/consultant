import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { auth } from "@/lib/api";
import { AuthLayout } from "./auth-layout";

export function ForgotPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await auth.resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout title={t("Forgot password?")} footer={<Link to="/login" className="text-primary hover:underline">{t("Back")}</Link>}>
      {sent ? (
        <p className="rounded-md bg-success/10 px-3 py-3 text-sm">If an account exists for <b>{email}</b>, we have emailed a link to set a new password.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t("Email")} required>{(id) => (
            <TextInput id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          )}</Field>
          <InlineError error={error} />
          <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!email}>{t("Continue")}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
