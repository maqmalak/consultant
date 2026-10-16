import { useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Search } from "lucide-react";
import type { ClientVisit } from "@/types";
import { formatDate } from "@/lib/format";
import { Badge, stateVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyRow, Pagination, Table, TH, TR, TD } from "@/components/ui/table";
import { humanizeError } from "@/services/frappe";

const VISITS_METHOD = "frappe.client.get_list";
const LIMIT = 20;

const STATUS_LABEL: Record<string, string> = {
  New: "New",
  Contacted: "Contacted",
  Qualified: "Qualified",
  Processed: "Processed",
  Lost: "Lost",
  Closed: "Closed",
};

export function VisitsPage() {
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const { data, error, isLoading, mutate } = useFrappeGetCall<{ message?: ClientVisit[]; total_count?: number }>(
    VISITS_METHOD,
    {
      doctype: "Client Visit",
      fields: JSON.stringify(["name", "visit_type", "tax_client", "contact_person", "mobile", "lead_status", "visit_date", "purpose", "city", "field_officer", "assigned_consultant", "next_follow_up_date", "creation"]),
      limit_page_length: LIMIT,
      start,
      order_by: "visit_date desc",
    },
    "itax.client_visits.list",
  );

  const rows = Array.isArray(data?.message) ? data.message : [];
  const totalCount = data?.total_count ?? rows.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        [r.contact_person, r.mobile, r.lead_status, r.purpose, r.city, r.field_officer]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [query, rows]);

  const totalPages = Math.ceil((totalCount ?? 0) / LIMIT);

  return (
    <div className="page-container">
      <PageHeader
        title="Client Visits"
        subtitle="Track outreach, meetings and follow-ups"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                className="w-64 rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none"
                placeholder="Search visit..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setStart(0);
                }}
              />
            </div>
            <button className="rounded-lg border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              New visit
            </button>
          </div>
        }
      />

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {humanizeError(error)} <button className="underline" onClick={() => void mutate()}>Retry</button>
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table className="border-0 shadow-none">
                <thead>
                  <tr>
                    <TH>Visit</TH>
                    <TH>Client</TH>
                    <TH>Contact</TH>
                    <TH>Date</TH>
                    <TH>Lead</TH>
                    <TH>Purpose</TH>
                    <TH>Officer</TH>
                    <TH>Next follow-up</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <EmptyRow colSpan={8} message={query ? "No matching visits." : "No visits yet."} />
                  ) : (
                    filtered
                      .slice(start, start + LIMIT)
                      .map((v) => (
                        <TR key={v.name}>
                          <TD className="font-mono text-xs text-slate-500">{v.name}</TD>
                          <TD>{v.tax_client || "—"}</TD>
                          <TD className="font-medium text-slate-900">{v.contact_person || "—"}</TD>
                          <TD>{formatDate(v.visit_date)}</TD>
                          <TD>
                            <Badge variant={stateVariant(v.lead_status)}>{STATUS_LABEL[v.lead_status]}</Badge>
                          </TD>
                          <TD className="max-w-xs truncate text-slate-600">{v.purpose || "—"}</TD>
                          <TD>{v.field_officer || "—"}</TD>
                          <TD>{formatDate(v.next_follow_up_date)}</TD>
                        </TR>
                      ))
                  )}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Pagination
            start={start}
            limit={LIMIT}
            total={totalCount}
            onChange={setStart}
          />
        </>
      )}
    </div>
  );
}
