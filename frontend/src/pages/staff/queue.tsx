import { Download, FileCheck2, Search, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { STAFF_NAV } from "@/app/nav";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { downloadUrl, M, staff } from "@/lib/api";
import { formatDate, money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

type Row = Record<string, any>;

export function useQueue(name: string | null, search = "") {
  return useApi<{ rows: Row[]; doctype: string }>(name ? `${M.STAFF}.queue` : null, { name, search: search || undefined });
}

function RejectDialog({ title, onClose, onReject }: { title: string; onClose: () => void; onReject: (reason: string) => Promise<unknown> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Dialog open onClose={onClose} title={title} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={async () => {
        setBusy(true);
        try { await onReject(reason.trim()); onClose(); } catch (e) { setErr(e); } finally { setBusy(false); }
      }}>Reject</Button></>}>
      <p className="mb-2 text-sm text-muted-foreground">The client sees this reason and is asked to upload again.</p>
      <TextArea aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <InlineError error={err} />
    </Dialog>
  );
}

export function DocumentQueue() {
  const { data, error, isLoading, mutate } = useQueue("documents");
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [err, setErr] = useState<unknown>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />;
  if (!data?.rows.length) return <Empty title="Nothing to verify" hint="New uploads appear here." />;
  return (
    <>
      <InlineError error={err} />
      <Table>
        <thead><tr><TH>Client</TH><TH>Document</TH><TH>Return</TH><TH>Uploaded</TH><TH className="text-end">Action</TH></tr></thead>
        <tbody>
          {data.rows.map((r) => (
            <TR key={r.name}>
              <TD><Link to={`/staff/clients/${r.tax_client}`} className="font-medium hover:underline">{r.client_name}</Link></TD>
              <TD>
                <a href={downloadUrl("Tax Document", r.name, "file", true)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-primary hover:underline">
                  <Download className="h-4 w-4" /> {r.document_type}
                </a>
                {r.is_client_upload ? <span className="ms-2 text-xs text-muted-foreground">by client</span> : null}
              </TD>
              <TD>{r.tax_return ? <Link to={`/staff/returns/${r.tax_return}`} className="hover:underline">{r.tax_return}</Link> : "—"}</TD>
              <TD>{formatDate(r.upload_date)}</TD>
              <TD className="text-end">
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="success" onClick={() => staff.verifyDocument(r.name, "Verified").then(() => mutate()).catch(setErr)}>
                    <FileCheck2 className="h-4 w-4" /> Verify
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRejecting(r)}><X className="h-4 w-4" /> Reject</Button>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      {rejecting && <RejectDialog title={`Reject ${rejecting.document_type}`} onClose={() => setRejecting(null)}
        onReject={(reason) => staff.verifyDocument(rejecting.name, "Rejected", reason).then(() => mutate())} />}
    </>
  );
}

export function ReturnTable({ rows }: { rows: Row[] }) {
  return (
    <Table>
      <thead><tr><TH>Return</TH><TH>Client</TH><TH>Year</TH><TH>Status</TH><TH className="text-end">Payable / refund</TH><TH>Updated</TH></tr></thead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.name}>
            <TD><Link to={`/staff/returns/${r.name}`} className="font-medium text-primary hover:underline">{r.name}</Link>
              {r.return_type === "Revised" && <span className="ms-1 text-xs text-muted-foreground">revised</span>}</TD>
            <TD>{r.client_name}</TD>
            <TD>{r.tax_year}</TD>
            <TD><StateBadge state={r.workflow_state} />{r.client_confirmed ? <span className="ms-1 text-xs text-success">client ✔</span> : null}</TD>
            <TD className="text-end tabular-nums">{r.refund_due > 0 ? <span className="text-success">{money(r.refund_due)} refund</span> : money(r.net_tax_payable)}</TD>
            <TD>{formatDate(r.modified)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export function QueuePage() {
  const { queue = "review" } = useParams();
  const [search, setSearch] = useState("");
  const item = STAFF_NAV.flatMap((g) => g.items).find((i) => i.path === `/staff/queue/${queue}`);
  const isDocs = queue === "documents";
  const { data, error, isLoading, mutate } = useQueue(isDocs ? null : queue, search);
  return (
    <div className="page-container">
      <PageHeader title={item?.label ?? "Queue"} subtitle={item?.hint} icon={item ? <item.icon className="h-5 w-5" /> : undefined} />
      {isDocs ? <DocumentQueue /> : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute start-2.5 top-3 h-4 w-4 text-muted-foreground" />
            <input className="field ps-8" placeholder="Search client or return" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {isLoading && <Loading />}
          {error && <ErrorState error={error} onRetry={() => void mutate()} />}
          {data && (data.rows.length ? <ReturnTable rows={data.rows} /> : <Empty title="Queue is empty" />)}
        </div>
      )}
    </div>
  );
}

export { RejectDialog };
