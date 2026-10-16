import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { SWRConfig } from "swr";
import { BrandStyle } from "@/components/layout/brand-style";
import { AuthProvider } from "@/hooks/useAuth";
import i18n from "@/lib/i18n";
import { refreshCSRFToken } from "@/services/frappe";

const SWR = { revalidateOnFocus: false, shouldRetryOnError: false, keepPreviousData: true } as const;

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    // the production page injects window.csrf_token; the Vite dev server fetches it
    if (!(window as unknown as { csrf_token?: string }).csrf_token) void refreshCSRFToken();
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <SWRConfig value={SWR}>
        <BrandStyle />
        <AuthProvider>{children}</AuthProvider>
      </SWRConfig>
    </I18nextProvider>
  );
}
