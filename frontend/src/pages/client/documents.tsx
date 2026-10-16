import { useTranslation } from "react-i18next";
import { Empty, ErrorState, Loading } from "@/components/common/states";
import { M, type ReturnDetail } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useDashboard } from "./home";
import { DocumentRow } from "./return";

function ReturnDocuments({ name, year }: { name: string; year: string }) {
  const { data, error, isLoading, mutate } = useApi<ReturnDetail>(`${M.PORTAL}.return_detail`, { tax_return: name });
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Tax year {year}</h2>
      {data.checklist.length ? (
        <ul className="divide-y rounded-lg border bg-card">
          {data.checklist.map((item) => <DocumentRow key={item.name} item={item} onChange={() => void mutate()} />)}
        </ul>
      ) : <p className="text-sm text-muted-foreground">No documents requested for this year.</p>}
    </section>
  );
}

export function DocumentsPage() {
  const { t } = useTranslation();
  const { data, error, isLoading, mutate } = useDashboard();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("Documents")}</h1>
      {data.returns.length === 0 && <Empty title="Nothing to upload yet" hint="Start a return from Home to get your checklist." />}
      {data.returns.map((r) => <ReturnDocuments key={r.name} name={r.name} year={r.tax_year} />)}
    </div>
  );
}
