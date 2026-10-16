import { createContext, useCallback, useContext, type ReactNode } from "react";
import { auth, M, type Me } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { refreshCSRFToken } from "@/services/frappe";

interface AuthState {
  me: Me | undefined;
  loading: boolean;
  isGuest: boolean;
  isStaff: boolean;
  hasRole: (...roles: string[]) => boolean;
  login: (usr: string, pwd: string) => Promise<Me | undefined>;
  logout: () => Promise<void>;
  refresh: () => Promise<Me | undefined>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: me, isLoading, mutate } = useApi<Me>(`${M.AUTH}.whoami`);
  const refresh = useCallback(async () => {
    await refreshCSRFToken();
    return mutate();
  }, [mutate]);
  const login = useCallback(async (usr: string, pwd: string) => {
    await auth.login(usr, pwd);
    return refresh();
  }, [refresh]);
  const logout = useCallback(async () => {
    await auth.logout();
    await refresh();
  }, [refresh]);
  const roles = me?.roles ?? [];
  const value: AuthState = {
    me,
    loading: isLoading,
    isGuest: !me || me.user === "Guest",
    isStaff: Boolean(me?.is_staff),
    hasRole: (...r) => me?.user === "Administrator" || r.some((x) => roles.includes(x)),
    login,
    logout,
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
