import { useMemo, useState } from "react";
import { useFrappeGetCall } from "frappe-react-sdk";
import { Link } from "react-router-dom";
import type { TaxClient, TaxReturn } from "@/types";
import { formatDate } from "@/lib/format";
import { Badge, stateVariant } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { EmptyRow, Pagination, Table, TH, TR, TD } from "@/components/ui/table";
import { humanizeError } from "@/services/frappe";
import { useAuth } from "@/hooks/useAuth";

const CLIENTS_METHOD = "frappe.client.get_list";
const RETURNS_METHOD = "frappe.client.get_list";
const LIMIT = 20;

function json<T>(v: T): string {
  return JSON.stringify(v);
}

export function PortalHomePage() {
  const { currentUser } = useAuth();
  const [start, setStart] = useState(0);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const {
    data: clientsData,
    error: clientsError,
    isLoading: clientsLoading,
  } = useFrappeGetCall<{ message?: TaxClient[]; total_count?: number }>(
    CLIENTS_METHOD,
    {
      doctype: "Tax Client",
      fields: json(["name", "client_name", "client_type", "cnic_masked", "mobile", "city", "status", "assigned_consultant"]),
      filters: json({ portal_user: currentUser }),
      limit_page_length: LIMIT,
      start,
    },
    "itax.client_portal.clients",
  );

  const myClients = Array.isArray(clientsData?.message) ? clientsData.message : [];
  const totalClients = clientsData?.total_count ?? myClients.length;

  const {
    data: returnsData,
    error: returnsError,
    isLoading: returnsLoading,
  } = useFrappeGetCall<{ message?: TaxReturn[]; total_count?: number }>(
    RETURNS_METHOD,
    {
      doctype: "Tax Return",
      fields: json(["name", "tax_client", "client_name", "tax_year", "workflow_state", "net_tax_payable", "fbr_acknowledgment_number", "fbr_submission_status", "creation"]),
      filters: json({ tax_client: { "in": myClients.map((c) => c.name) } }),
      limit_page_length: LIMIT,
      start,
      order_by: "creation desc",
    },
    "itax.client_portal.returns",
  );

  const myReturns = Array.isArray(returnsData?.message) ? returnsData.message : [];
  const totalReturns = returnsData?.total_count ?? myReturns.length;

  if (currentUser === undefined || clientsLoading || returnsLoading) {
    return (
      <div className="page-container">
        <PageHeader title="Client Portal" />
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Client Portal"
        subtitle={`Welcome back, ${currentUser.split("@")[0]}`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{totalClients}</div>
            <p className="text-xs text-slate-500">Tax Client records linked to your profile</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{totalReturns}</div>
            <p className="text-xs text-slate-500">Returns for your linked clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-500">Ready to review your files before each filing</p>
            <div className="mt-2 flex gap-2">
              <Badge variant="default">Document checklist active</Badge>
              <Badge variant="outline">Filing calendar linked</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {myReturns.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-slate-500">
              {myClients.length === 0
                ? "No Tax Client records are linked to your account yet. Ask your consultant to attach you as a portal user."
                : "You have no returns linked to your clients yet."}
            </p>
            {myClients.length === 0 ? (
              <Link to="/app" className="mt-4 text-sm font-medium text-brand-700 hover:underline">
                Back to the workspace
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
