import { useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Search } from "lucide-react";
import type { TaxReturn } from "@/types";
import { formatDate } from "@/lib/format";
import { Badge, stateVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyRow, Pagination, Table, TH, TR, TD } from "@/components/ui/table";
import { humanizeError } from "@/services/frappe";

const RETURNS_METHOD = "frappe.client.get_list";
const LIMIT = 20;

const STATE_LABEL: Record<string, string> = {
  Draft: "Draft",
  Submitted: "Submitted",
  "Under Review": "Under review",
  Approved: "Approved",
  Rejected: "Rejected",
  Filed: "Filed",
};

function sortByDate(a: Date | undefined, b: Date | undefined, reverse = false) {
  const aa = a?.getTime() ?? 0;
  const bb = b?.getTime() ?? 0;
  return reverse ? bb - aa : aa - bb;
}

export function ReturnsPage() {
  const [state, setState] = useState<string>("All");
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const { data, error, isLoading, mutate } = useFrappeGetCall<{ message?: TaxReturn[]; total_count?: number }>(
    RETURNS_METHOD,
    {
      doctype: "Tax Return",
      fields: JSON.stringify(["name", "tax_client", "client_name", "tax_year", "return_type", "tax_regime", "workflow_state", "net_tax_payable", "fbr_submission_status", "fbr_acknowledgment_number", "approval_status", "creation", "modified"]),
      limit_page_length: LIMIT,
      start,
      order_by: "modified desc",
    },
    "itax.tax_returns.list",
  );

  const rows = Array.isArray(data?.message) ? data.message : [];
  const totalCount = data?.total_count ?? rows.length;

  const filtered = useMemo(() => {
    if (state === "All") return rows;
    return rows.filter((r) => r.workflow_state === state);
  }, [state, rows]);

  const totalPages = Math.ceil((totalCount ?? 0) / LIMIT);

  const chips = [
    { value: "All", label: "All states" },
    { value: "Submitted", label: "Submitted" },
    { value: "Under Review", label: "Under review" },
    { value: "Approved", label: "Approved" },
    { value: "Filed", label: "Filed" },
  ];

  return (
    <div className="page-container">
      <PageHeader
        title="Returns"
        subtitle="Track every income tax return across your clients"
        actions={
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  setState(c.value);
                  setStart(0);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  state === c.value
                    ? "bg-brand-600 text-white"
                    : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {c.label}
              </button>
            ))}
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
                    <TH>Return</TH>
                    <TH>Client</TH>
                    <TH>Year</TH>
                    <TH>Type</TH>
                    <TH>Regime</TH>
                    <TH>State</TH>
                    <TH className="text-right">Payable</TH>
                    <TH>FBR</TH>
                    <TH>Updated</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <EmptyRow
                      colSpan={10}
                      message={
                        state === "All" ? "No returns yet." : `No returns in state "${state}".`
                      }
                    />
                  ) : (
                    filtered
                      .slice(start, start + LIMIT)
                      .map((r) => (
                        <TR key={r.name}>
                          <TD className="font-mono text-xs text-slate-500">{r.name}</TD>
                          <TD className="font-medium text-slate-900">{r.client_name || r.tax_client}</TD>
                          <TD>{r.tax_year || "—"}</TD>
                          <TD>{r.return_type || "—"}</TD>
                          <TD>{r.tax_regime || "—"}</TD>
                          <TD>
                            <Badge variant={stateVariant(r.workflow_state)}>
                              {STATE_LABEL[r.workflow_state || ""] || r.workflow_state || "—"}
                            </Badge>
                          </TD>
                          <TD className="text-right">{r.net_tax_payable ? `PKR ${r.net_tax_payable.toLocaleString("en-PK")}` : "—"}</TD>
                          <TD>
                            {r.fbr_submission_status === "Submitted"
                              ? "Submitted"
                              : r.fbr_submission_status === "Filed"
                              ? "Filed"
                              : r.fbr_acknowledgment_number
                              ? <Badge variant="default">{r.fbr_acknowledgment_number}</Badge>
                              : "—"}
                          </TD>
                          <TD>{formatDate(r.modified)}</TD>
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

