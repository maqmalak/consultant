import { useFrappeGetCall } from "frappe-react-sdk";
import { useSWRConfig } from "swr";
import type { TaxReturn } from "@/types";
import { formatDate } from "@/lib/format";
import { Badge, stateVariant } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { EmptyRow, Pagination, Table, TH, TR, TD } from "@/components/ui/table";
import { humanizeError } from "@/services/frappe";
import { QUEUES } from "./queue-tabs";

interface QueueTableProps {
  queue: number;
  start: number;
  onStartChange: (start: number) => void;
}

export function QueueTable({ queue, start, onStartChange }: QueueTableProps) {
  const { mutate: revalidate } = useSWRConfig();

  const { data, error, isLoading, mutate } = useFrappeGetCall<{
    message: TaxReturn[];
    total_count?: number;
  }>(
    "frappe.client.get_list",
    {
      doctype: "Tax Return",
      fields: JSON.stringify(["name", "tax_client", "client_name", "tax_year", "workflow_state", "net_tax_payable", "approval_status", "fbr_submission_status", "submission_timestamp", "creation"]),
      filters: JSON.stringify({ workflow_state: QUEUES[queue].states }),
      limit_page_length: 20,
      start,
      order_by: "submission_timestamp desc nulls last",
    },
    `itax.queue.${queue}`,
  );

  const rows = Array.isArray(data?.message) ? data.message : [];
  const totalCount = data?.total_count ?? rows.length;

  return (
    <>
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {humanizeError(error)} <button className="underline" onClick={() => void mutate()}>Retry</button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
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
                    <TH>State</TH>
                    <TH className="text-right">Payable</TH>
                    <TH>FBR</TH>
                    <TH>Posted</TH>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <EmptyRow
                      colSpan={8}
                      message={
                        QUEUES[queue].states.includes("Submitted")
                          ? "Nothing submitted yet — returns submitted by your consultants will appear here."
                          : QUEUES[queue].states.includes("Under Review")
                          ? "Nothing under review at the moment."
                          : QUEUES[queue].states.includes("Approved")
                          ? "Nothing approved for filing yet."
                          : "No returns in this queue."
                      }
                    />
                  ) : (
                    rows
                      .slice(start, start + 20)
                      .map((r) => (
                        <TR key={r.name}>
                          <TD className="font-mono text-xs text-slate-500">{r.name}</TD>
                          <TD className="font-medium text-slate-900">{r.client_name || r.tax_client}</TD>
                          <TD>{r.tax_year || "—"}</TD>
                          <TD>
                            <Badge variant={stateVariant(r.workflow_state)}>
                              {r.workflow_state || "—"}
                            </Badge>
                          </TD>
                          <TD className="text-right">{r.net_tax_payable ? `PKR ${r.net_tax_payable.toLocaleString("en-PK")}` : "—"}</TD>
                          <TD>
                            {r.fbr_submission_status === "Filed"
                              ? <Badge variant="default">{r.fbr_acknowledgment_number || "Filed"}</Badge>
                              : r.fbr_acknowledgment_number
                              ? <Badge variant="default">{r.fbr_acknowledgment_number}</Badge>
                              : "—"}
                          </TD>
                          <TD>{formatDate(r.creation)}</TD>
                        </TR>
                      ))
                  )}
                </tbody>
              </Table>
            </CardContent>
          </Card>

          <Pagination
            start={start}
            limit={20}
            total={totalCount}
            onChange={onStartChange}
          />
        </>
      )}
    </>
  );
}
