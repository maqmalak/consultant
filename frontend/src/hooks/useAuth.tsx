import * as React from "react";
import { useFrappeAuth, useFrappeGetCall, useFrappeGetDoc } from "frappe-react-sdk";
import { refreshCSRFToken } from "@/services/frappe";
import type { FrappeUser } from "@/types";

/**
 * Authentication + session context.
 *
 * Wraps the SDK's `useFrappeAuth` (cookie/session auth) and enriches it with
 * the User document (full name, email) and the user's roles. Role guards in
 * this file only drive UI affordances — every permission decision is enforced
 * by Frappe on the server.
 */

export interface AuthState {
  /** Login id (email) of the current user, or null when logged out. */
  currentUser: string | null | undefined;
  user?: FrappeUser;
  roles: string[];
  isLoading: boolean;
  isAuthenticated: boolean;
  error?: unknown;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = React.createContext<AuthState | null>(null);

const GUEST = "Guest";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    isLoading: authLoading,
    error,
    updateCurrentUser,
    getUserCookie,
  } = useFrappeAuth();

  const isAuthenticated = Boolean(currentUser && currentUser !== GUEST);

  // Full User document — only fetched when authenticated.
  const { data: userDoc, isLoading: userLoading } = useFrappeGetDoc<FrappeUser>(
    "User",
    isAuthenticated ? (currentUser as string) : undefined,
    isAuthenticated ? `itax.user.${currentUser}` : null,
  );

  // Roles of the logged-in user (server-evaluated).
  const { data: rolesData } = useFrappeGetCall<{ message: string[] } | string[]>(
    "frappe.client.get_list",
    {
      doctype: "Has Role",
      filters: JSON.stringify([["parent", "=", currentUser ?? ""]]),
      fields: JSON.stringify(["role"]),
      parent: "User",
      limit_page_length: 0,
    },
    isAuthenticated ? `itax.roles.${currentUser}` : null,
  );

  const roles = React.useMemo(() => {
    const raw = (rolesData as any)?.message ?? rolesData ?? [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r: any) => (typeof r === "string" ? r : r?.role))
      .filter(Boolean) as string[];
  }, [rolesData]);

  /**
   * Frappe's `/api/method/login` only accepts **form-encoded** `usr`/`pwd`.
   * The SDK's `loginWithUsernamePassword` sends JSON `{username, password}`,
   * which Frappe rejects with "Incomplete login details". Call the endpoint
   * directly with the correct encoding, then refresh SDK session state.
   */
  const login = React.useCallback(
    async (username: string, password: string) => {
      const body = new URLSearchParams({ usr: username, pwd: password });
      const res = await fetch("/api/method/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        credentials: "include",
        body,
      });
      if (!res.ok) {
        let message = `Login failed (HTTP ${res.status})`;
        try {
          const data = await res.json();
          const serverMsg = (data as any)?._server_messages;
          if (serverMsg) {
            const parsed = JSON.parse(serverMsg);
            message = parsed.map((m: any) => m.message).join(" ");
          } else {
            message = (data as any)?.message ?? message;
          }
        } catch {
          /* keep default message */
        }
        throw new Error(message);
      }
      // Cookie set — refresh cookie-derived user_id AND revalidate the
      // get_logged_user SWR cache so isAuthenticated flips to true.
      getUserCookie();
      await updateCurrentUser();
      // New session => new CSRF token; refresh before any write requests.
      await refreshCSRFToken();
    },
    [updateCurrentUser, getUserCookie],
  );

  const logout = React.useCallback(async () => {
    // Logout mutates an authenticated session, so it needs the CSRF header —
    // raw fetch bypasses the axios interceptor that attaches it.
    const csrfToken = (window as unknown as { csrf_token?: string }).csrf_token;
    await fetch("/api/method/logout", {
      method: "POST",
      credentials: "include",
      headers: csrfToken ? { "X-Frappe-CSRF-Token": csrfToken } : undefined,
    }).catch(() => undefined);
    getUserCookie();
    await updateCurrentUser();
    await refreshCSRFToken();
    // Full navigation: hard-resets SWR/state caches instead of leaving stale
    // authenticated data behind the login screen.
    window.location.assign("/login");
  }, [updateCurrentUser, getUserCookie]);

  const refresh = React.useCallback(async () => {
    await updateCurrentUser();
  }, [updateCurrentUser]);

  const hasRole = React.useCallback(
    (...wanted: string[]) =>
      wanted.length === 0 ||
      roles.includes("Administrator") ||
      roles.includes("System Manager") ||
      wanted.some((r) => roles.includes(r)),
    [roles],
  );

  const value: AuthState = {
    currentUser,
    user: userDoc as FrappeUser | undefined,
    roles,
    isLoading: authLoading || (isAuthenticated && userLoading),
    isAuthenticated,
    error,
    login,
    logout,
    refresh,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
