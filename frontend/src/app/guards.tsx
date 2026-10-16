import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loading } from "@/components/common/states";
import { useAuth } from "@/hooks/useAuth";

/** UI routing only — every API call is checked on the server regardless of what the browser shows. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, isGuest } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (isGuest) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <>{children}</>;
}

export function RequireClient({ children }: { children: ReactNode }) {
  const { isStaff, me } = useAuth();
  if (isStaff) return <Navigate to="/staff" replace />;
  if (!me?.client) return <NoProfile />;
  return <>{children}</>;
}

export function RequireStaff({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { isStaff, hasRole } = useAuth();
  if (!isStaff) return <Navigate to="/" replace />;
  if (roles && !hasRole(...roles)) return <Navigate to="/staff" replace />;
  return <>{children}</>;
}

function NoProfile() {
  return (
    <div className="page-container max-w-md text-center">
      <h1 className="text-xl font-semibold">No client profile</h1>
      <p className="mt-2 text-sm text-muted-foreground">This account is not linked to a client record yet. Please contact our office.</p>
    </div>
  );
}
