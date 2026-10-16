import { AlertTriangle, ArrowRight, CalendarClock, FileText, MessageSquare, UserCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ProgressTracker } from "@/components/common/progress-tracker";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, Loading } from "@/components/common/states";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { M, type ClientDashboard } from "@/lib/api";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { PackagePicker } from "./order";

export function useDashboard() {
  return useApi<ClientDashboard>(`${M.PORTAL}.dashboard`);
}

function daysLeft(date: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export function ClientHome() {
  const { t } = useTranslation();
  const { data, error, isLoading, mutate } = useDashboard();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  const left = daysLeft(data.filing_deadline);
  const current = data.returns.find((r) => r.tax_year === data.current_tax_year);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Assalam-o-Alaikum")}, {data.client.client_name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.client.consultant ? <><UserCheck className="me-1 inline h-4 w-4" />{t("Your consultant")}: {data.client.consultant}</> : null}
          </p>
        </div>
        {left !== null && left >= 0 && (
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
            <CalendarClock className="h-4 w-4 text-primary" />
            {t("Filing deadline")}: <b>{new Date(data.filing_deadline!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</b>
            <span className="text-muted-foreground">· {left} {t("days left")}</span>
          </div>
        )}
      </div>

      {(data.documents_to_upload > 0 || data.documents_rejected > 0 || data.unread_messages > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {data.documents_to_upload > 0 && (
            <Link to="/documents" className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm hover:bg-amber-500/15">
              <FileText className="h-5 w-5 text-amber-600" /> <b>{data.documents_to_upload}</b> {t("documents to upload")}
            </Link>
          )}
          {data.documents_rejected > 0 && (
            <Link to="/documents" className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm hover:bg-destructive/15">
              <AlertTriangle className="h-5 w-5 text-destructive" /> <b>{data.documents_rejected}</b> {t("rejected — please re-upload")}
            </Link>
          )}
          {data.unread_messages > 0 && (
            <Link to="/messages" className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm hover:bg-primary/15">
              <MessageSquare className="h-5 w-5 text-primary" /> <b>{data.unread_messages}</b> new message(s)
            </Link>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("Your tax returns")}</h2>
        {data.returns.length === 0 && (
          <Empty title={t("No return yet")} hint={t("Choose a package to start your return.")} />
        )}
        {data.returns.map((r) => (
          <Card key={r.name} className="p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tax year {r.tax_year}{r.return_type === "Revised" ? " · Revised" : ""}</p>
                <p className="mt-0.5 text-lg font-semibold">{t(r.status)}</p>
              </div>
              <div className="flex items-center gap-2">
                {r.action_needed && <StateBadge state="Pending" label={t("Action needed")} />}
                <LinkButton to={`/returns/${r.name}`} size="sm" variant={r.action_needed ? "primary" : "outline"}>
                  {r.action_needed ? t("Continue") : "Open"} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </LinkButton>
              </div>
            </div>
            <ProgressTracker step={r.step} />
            {(r.net_tax_payable > 0 || r.refund_due > 0 || r.iris_acknowledgment_no) && (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm">
                {r.net_tax_payable > 0 && <span>{t("Tax payable")}: <b>{money(r.net_tax_payable)}</b></span>}
                {r.refund_due > 0 && <span>{t("Refund due")}: <b>{money(r.refund_due)}</b></span>}
                {r.iris_acknowledgment_no && <span>{t("Acknowledgment")}: <b dir="ltr">{r.iris_acknowledgment_no}</b></span>}
              </div>
            )}
          </Card>
        ))}
      </section>

      {!current && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{t("Start filing")} — tax year {data.current_tax_year}</h2>
          <PackagePicker onOrdered={() => void mutate()} />
        </section>
      )}
    </div>
  );
}
