import { FileText, Search } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { useSite } from "@/components/layout/brand";
import { Empty, ErrorState, Loading } from "@/components/common/states";
import { SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { getList } from "@/services/frappe";
import { ReturnProgressPanel } from "@/components/common/return-progress-panel";
import { ReturnTable } from "./queue";

const STATES = ["Documents Pending", "Draft", "Changes Required", "Pending Review", "Under Review", "Reviewed",
  "Awaiting Client Confirmation", "Approved", "Submitted to FBR", "Filing Error", "Acknowledged", "Closed"];

export function ReturnsPage() {
  const site = useSite().data;
  const [state, setState] = useState("");
  const [year, setYear] = useState("");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const filters: [string, string, any][] = [];
  if (state) filters.push(["workflow_state", "=", state]);
  if (year) filters.push(["tax_year", "=", year]);
  if (q) filters.push(["client_name", "like", `%${q}%`]);
  const { data, error, isLoading, mutate } = useSWR(["returns", state, year, q], () => getList<Record<string, any>>("Tax Return", {
    fields: ["name", "tax_client", "client_name", "tax_year", "return_type", "workflow_state", "net_tax_payable", "refund_due", "client_confirmed", "modified"],
    filters, limit: 200 }));
  // the picked return, else the first current-tax-year return in the list, else the first row
  const selected = data?.some((r) => r.name === picked) ? picked
    : data?.find((r) => r.tax_year === site?.tax_year)?.name ?? data?.[0]?.name ?? null;
  return (
    <div className="page-container">
      <PageHeader title="Tax returns" subtitle="Every return you may see, newest activity first" icon={<FileText className="h-5 w-5" />} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-64"><Search className="absolute start-2.5 top-3 h-4 w-4 text-muted-foreground" />
          <input className="field ps-8" placeholder="Client name" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <SelectInput aria-label="Status" className="w-56" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All statuses</option>{STATES.map((s) => <option key={s}>{s}</option>)}</SelectInput>
        <SelectInput aria-label="Tax year" className="w-36" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>{(site?.tax_years ?? []).map((y) => <option key={y}>{y}</option>)}</SelectInput>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {isLoading && <Loading />}
          {error && <ErrorState error={error} onRetry={() => void mutate()} />}
          {data && (data.length ? <ReturnTable rows={data} selected={selected} onSelect={setPicked} /> : <Empty title="No returns match" />)}
        </div>
        <ReturnProgressPanel name={selected} />
      </div>
    </div>
  );
}
