import type { ReactNode } from "react";
import { Brand, useSite } from "@/components/layout/brand";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { ThemeToggle } from "@/components/layout/theme-provider";
import { WhatsAppButton } from "@/components/layout/whatsapp-button";

export function AuthLayout({ title, subtitle, children, footer }: {
  title: string; subtitle?: string; children: ReactNode; footer?: ReactNode;
}) {
  const { data } = useSite();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 items-center gap-2 px-4">
        <a href="/" className="min-w-0"><Brand /></a>
        <div className="ms-auto flex items-center gap-1"><LanguageToggle /><ThemeToggle /></div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center">
        <div className="w-full max-w-md">
          <div className="form-card">
            <div className="form-card-body space-y-5 sm:p-7">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
              </div>
              {children}
            </div>
          </div>
          {footer && <div className="mt-4 text-center text-sm text-muted-foreground">{footer}</div>}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            {data?.firm_name ? `${data.firm_name} files` : "We file"} returns on FBR IRIS on your behalf, with your authorisation.
          </p>
        </div>
      </main>
      <WhatsAppButton />
    </div>
  );
}
