import { ArrowRight, MousePointerClick } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FilingProgress } from "@/components/common/filing-progress";
import { StateBadge } from "@/components/common/state-badge";
import { Loading } from "@/components/common/states";
import { M } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

interface Progress { name: string; tax_client: string; client_name: string; tax_year: string; state: string; step: number;
  step_dates: (string | null)[]; problem: boolean; net_tax_payable: number; refund_due: number }

/** Right-bar progress card for the return selected in a list (sticky on wide screens). */
export function ReturnProgressPanel({ name, showClient = true, className }: { name?: string | null; showClient?: boolean; className?: string }) {
  const { data, isLoading } = useApi<Progress>(name ? `${M.STAFF}.return_progress` : null, { tax_return: name });
  let body: ReactNode;
  if (!name) {
    body = (
      <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        <MousePointerClick className="mx-auto mb-2 h-6 w-6 opacity-50" />Select a return to see its progress.
      </div>
    );
  } else if (isLoading || !data) {
    body = <div className="rounded-lg border bg-card"><Loading /></div>;
  } else {
    body = (
      <FilingProgress step={data.step} dates={data.step_dates} problem={data.problem}
        title={showClient ? `${data.client_name} · TY${data.tax_year}` : `Tax year ${data.tax_year}`}
        footer={
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StateBadge state={data.state} />
              <span className="text-xs tabular-nums text-muted-foreground">
                {data.refund_due > 0 ? `${money(data.refund_due)} refund` : data.net_tax_payable ? `${money(data.net_tax_payable)} payable` : ""}
              </span>
            </div>
            <Link className="flex items-center gap-1 font-medium text-primary hover:underline" to={`/staff/returns/${data.name}`}>Open {data.name} <ArrowRight className="h-3.5 w-3.5" /></Link>
            {showClient && <Link className="block text-xs text-muted-foreground hover:text-foreground" to={`/staff/clients/${data.tax_client}`}>Client page →</Link>}
          </div>
        } />
    );
  }
  return <aside className={cn("lg:sticky lg:top-20 lg:self-start", className)} aria-label="Return progress">{body}</aside>;
}
