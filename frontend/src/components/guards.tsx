import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { homeForRoles } from "@/app/nav";
import { Spinner } from "@/components/ui/spinner";

/** Gate: must be logged in (session cookie valid) or bounce to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}

/**
 * Gate: role check for a route. UI-level only — every API call behind this
 * is independently permission-checked by the Frappe server.
 */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { hasRole, roles: userRoles, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  if (!hasRole(...roles)) {
    return <Navigate to={homeForRoles(userRoles)} replace />;
  }
  return <>{children}</>;
}

/** `/` → role-appropriate landing route. */
export function RoleRedirect() {
  const { roles, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  return <Navigate to={homeForRoles(roles)} replace />;
}
