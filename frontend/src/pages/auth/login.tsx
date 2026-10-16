import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "./auth-layout";

export function LoginPage() {
  const { t } = useTranslation();
  const { login, isGuest, loading, me } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [usr, setUsr] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const next = params.get("next");

  if (!loading && !isGuest) return <Navigate to={next || (me?.is_staff ? "/staff" : "/")} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fresh = await login(usr.trim(), pwd);
      navigate(next || (fresh?.is_staff ? "/staff" : "/"), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={t("Sign in")} subtitle="Track your return, upload documents and message your consultant."
      footer={<>{t("New here?")} <Link to="/signup" className="font-medium text-primary hover:underline">{t("Create account")}</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t("Email")} required>{(id) => (
          <TextInput id={id} type="email" autoComplete="username" value={usr} onChange={(e) => setUsr(e.target.value)} required />
        )}</Field>
        <Field label={t("Password")} required>{(id) => (
          <TextInput id={id} type="password" autoComplete="current-password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
        )}</Field>
        <InlineError error={error} />
        <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!usr || !pwd}>{t("Sign in")}</Button>
        <p className="text-center text-sm"><Link to="/forgot" className="text-primary hover:underline">{t("Forgot password?")}</Link></p>
      </form>
    </AuthLayout>
  );
}
