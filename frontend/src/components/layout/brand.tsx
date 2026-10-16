import { ShieldCheck } from "lucide-react";
import { M, type SiteInfo } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/cn";

export function useSite() {
  return useApi<SiteInfo>(`${M.PUB}.site_info`, undefined, { revalidateIfStale: false });
}

export function Brand({ dark = false, className }: { dark?: boolean; className?: string }) {
  const { data } = useSite();
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {data?.logo ? (
        <img src={data.logo} alt="" className="h-9 w-9 shrink-0 rounded-xl object-contain" />
      ) : (
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary to-primary/70 text-white shadow-lg shadow-primary/25 ring-1 ring-inset ring-white/20">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
          <ShieldCheck className="relative h-5 w-5" />
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{data?.firm_name ?? "Tax Consultancy"}</p>
        <p className={cn("truncate text-[11px]", dark ? "text-sidebar-muted" : "text-muted-foreground")}>
          {data?.tagline ?? "Income tax · FBR IRIS filing"}
        </p>
      </div>
    </div>
  );
}
