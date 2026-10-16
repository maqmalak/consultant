import { useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Search } from "lucide-react";
import type { TaxClient } from "@/types";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyRow, Pagination, Table, TH, TR, TD } from "@/components/ui/table";
import { humanizeError } from "@/services/frappe";

const CLIENTS_METHOD = "frappe.client.get_list";
const LIMIT = 20;

type ClientType = "Individual" | "Company" | "HUF" | "Firm" | "Other";

function toClientType(v: unknown): ClientType | undefined {
  const s = typeof v === "string" ? v : "";
  if (!s) return undefined;
  return s as ClientType;
}

const TYPE_LABEL: Record<string, string> = {
  Individual: "Individual",
  Company: "Company",
  HUF: "HUF",
  Firm: "Firm",
  Other: "Other",
};

function sortByDate(a: Date | undefined, b: Date | undefined, reverse = false) {
  const aa = a?.getTime() ?? 0;
  const bb = b?.getTime() ?? 0;
  return reverse ? bb - aa : aa - bb;
}

export function ClientsPage() {
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const { data, error, isLoading, mutate } = useFrappeGetCall<{ message?: TaxClient[]; total_count?: number }>(
    CLIENTS_METHOD,
    {
      doctype: "Tax Client",
      fields: JSON.stringify(["name", "client_name", "client_type", "cnic", "cnic_masked", "ntn", "email", "mobile", "city", "province", "status", "assigned_consultant"]),
      limit_page_length: LIMIT,
      start,
      order_by: "creation desc",
    },
    "itax.tax_clients.list",
  );

  const rows = Array.isArray(data?.message) ? data.message : [];
  const totalCount = data?.total_count ?? rows.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.client_name, r.cnic_masked, r.ntn, r.email, r.mobile, r.city, r.province]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [query, rows]);

  const totalPages = Math.ceil((totalCount ?? 0) / LIMIT);

  return (
    <div className="page-container">
      <PageHeader
        title="Clients"
        subtitle="Manage your tax clients and their contact details"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                className="w-64 rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none"
                placeholder="Search client..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setStart(0);
                }}
              />
            </div>
            <button className="rounded-lg border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Add client
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
                    <TH>Client</TH>
                    <TH>Type</TH>
                    <TH>CNIC</TH>
                    <TH>NTN</TH>
                    <TH>Phone</TH>
                    <TH>City</TH>
                    <TH>Status</TH>
                    <TH>Consultant</TH>
                    <TH>Added</TH>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <EmptyRow colSpan={9} message={query ? "No matching clients." : "No clients yet."} />
                  ) : (
                    filtered
                      .slice(start, start + LIMIT)
                      .map((c) => (
                        <TR key={c.name}>
                          <TD className="font-medium text-slate-900">{c.client_name}</TD>
                          <TD>
                            <Badge variant="outline">{TYPE_LABEL[toClientType(c.client_type)]}</Badge>
                          </TD>
                          <TD>{c.cnic_masked || c.cnic || "—"}</TD>
                          <TD>{c.ntn || "—"}</TD>
                          <TD>{c.mobile || "—"}</TD>
                          <TD>{c.city || "—"}</TD>
                          <TD>
                            <Badge variant={stateVariant(c.status)}>{c.status || "—"}</Badge>
                          </TD>
                          <TD>{c.assigned_consultant || "—"}</TD>
                          <TD>{formatDate(c.creation)}</TD>
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
