import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { homeForRoles } from "@/app/nav";
import { apiGet, humanizeError } from "@/services/frappe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const schema = z.object({
  username: z.string().min(1, "Email or login ID is required"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

/** Fetch the user's roles immediately after login for role-based redirection
 *  (the SWR-backed role list in AuthProvider lands a tick too late to route). */
async function fetchRoles(user: string): Promise<string[]> {
  try {
    const rows = await apiGet<unknown[]>("frappe.client.get_list", {
      doctype: "Has Role",
      filters: JSON.stringify([["parent", "=", user]]),
      fields: JSON.stringify(["role"]),
      parent: "User",
      limit_page_length: 0,
    });
    const list = Array.isArray(rows) ? rows : [];
    return list
      .map((r) => (typeof r === "string" ? r : (r as { role?: string })?.role))
      .filter((r): r is string => Boolean(r));
  } catch {
    return [];
  }
}

export function LoginPage() {
  const { isAuthenticated, isLoading, login, roles } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Already signed in → role landing.
  if (isAuthenticated && !isLoading) {
    return <Navigate to={from ?? homeForRoles(roles)} replace />;
  }

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await login(values.username, values.password);
      const freshRoles = await fetchRoles(values.username);
      navigate(from ?? homeForRoles(freshRoles), { replace: true });
    } catch (e) {
      setServerError(humanizeError(e));
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Brand panel (desktop) */}
      <div className="hidden w-1/2 flex-col justify-between bg-brand-800 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold">Pakistan Tax Consultancy</p>
            <p className="text-sm text-brand-200">Income tax returns · FBR filing · Compliance</p>
          </div>
        </div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-snug">
            Prepare, review, approve and file — with a full audit trail.
          </h1>
          <p className="mt-4 max-w-md text-sm text-brand-100">
            Secure document collection, configurable tax-year calculations, controlled workflow
            transitions and FBR acknowledgment tracking for your entire consultancy.
          </p>
        </div>
        <p className="text-xs text-brand-300">
          Client data is protected with role-based access control and private file storage.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center px-4 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use your consultancy account credentials.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <Input
              label="Email or login ID"
              autoComplete="username"
              error={errors.username?.message}
              {...register("username")}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register("password")}
            />

            {serverError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {serverError}
              </div>
            ) : null}

            <Button type="submit" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>

            <div className="flex items-center justify-between text-sm">
              <a href="/forgot-password" className="text-brand-700 hover:underline">
                Forgot password?
              </a>
              <a href="/app" className="text-slate-400 hover:text-slate-600">
                Desk access
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
