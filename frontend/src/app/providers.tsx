import type { ReactNode } from "react";
import { useEffect } from "react";
import { FrappeProvider } from "frappe-react-sdk";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/hooks/useAuth";
import { refreshCSRFToken } from "@/services/frappe";

/**
 * Application providers.
 *
 * - `FrappeProvider` configures the REST/RPC transport and Socket.IO realtime.
 *   With `VITE_FRAPPE_URL` empty the SPA runs same-origin (prod) — in dev the
 *   Vite proxy makes `/api` same-origin too, so session cookies just work.
 * - SWR config is a stable reference (inline objects re-create every render
 *   and cause infinite loops).
 */

const frappeUrl = import.meta.env.VITE_FRAPPE_URL || undefined;
const socketEnabled = import.meta.env.VITE_ENABLE_SOCKET !== "false";

/** Route Socket.IO through the Vite dev proxy instead of port 9000 directly. */
const socketPort =
  typeof window !== "undefined" && window.location.port ? window.location.port : undefined;

const SWR_CONFIG = {
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  shouldRetryOnError: true,
  errorRetryCount: 3,
  errorRetryInterval: 3000,
  dedupingInterval: 5000,
  keepPreviousData: true,
} as const;

export function AppProviders({ children }: { children: ReactNode }) {
  // Fetch a CSRF token once on mount (dev-server mode has no injected token).
  useEffect(() => {
    void refreshCSRFToken();
  }, []);

  return (
    <FrappeProvider
      url={frappeUrl}
      enableSocket={socketEnabled}
      socketPort={socketPort}
      swrConfig={SWR_CONFIG}
    >
      <AuthProvider>
        {children}
        <Toaster position="top-right" toastOptions={{ duration: 4000 }} />
      </AuthProvider>
    </FrappeProvider>
  );
}
