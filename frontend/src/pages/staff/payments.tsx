import { Check, Download, Wallet, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { downloadUrl, staff } from "@/lib/api";
import { formatDate, money } from "@/lib/format";
import { RejectDialog, useQueue } from "./queue";

/** Tax Admin: check the proof against the bank / wallet statement, then verify → Sales Invoice + Payment Entry. */
export function PaymentsQueue() {
  const { data, error, isLoading, mutate } = useQueue("payments");
  const [rejecting, setRejecting] = useState<Record<string, any> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="page-container">
      <PageHeader title="Payments to verify" subtitle="Match each proof with your bank / wallet statement before verifying"
        icon={<Wallet className="h-5 w-5" />} />
      <InlineError error={err} />
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.rows.length && <Empty title="No payments waiting" />}
      {data && data.rows.length > 0 && (
        <Table>
          <thead><tr><TH>Client</TH><TH>Method</TH><TH className="text-end">Amount</TH><TH>Reference</TH><TH>Paid on</TH><TH>Proof</TH><TH className="text-end">Action</TH></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <TR key={r.name}>
                <TD><Link className="font-medium hover:underline" to={`/staff/clients/${r.tax_client}`}>{r.client_name}</Link>
                  <p className="text-xs text-muted-foreground">{r.tax_engagement}</p></TD>
                <TD>{r.method}</TD>
                <TD className="text-end font-medium tabular-nums">{money(r.amount)}</TD>
                <TD dir="ltr">{r.reference || "—"}</TD>
                <TD>{formatDate(r.paid_on)}</TD>
                <TD>{r.proof_file ? <a className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank" rel="noopener"
                  href={downloadUrl("Payment Proof", r.name, "proof_file", true)}><Download className="h-4 w-4" /> View</a> : "—"}</TD>
                <TD className="text-end">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="success" loading={busy === r.name} onClick={async () => {
                      setBusy(r.name);
                      setErr(null);
                      try { await staff.verifyPayment(r.name, "Verified"); await mutate(); } catch (e) { setErr(e); } finally { setBusy(null); }
                    }}><Check className="h-4 w-4" /> Verify</Button>
                    <Button size="sm" variant="outline" onClick={() => setRejecting(r)}><X className="h-4 w-4" /> Reject</Button>
                  </div>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {rejecting && <RejectDialog title="Reject payment proof" onClose={() => setRejecting(null)}
        onReject={(reason) => staff.verifyPayment(rejecting.name, "Rejected", reason).then(() => mutate())} />}
    </div>
  );
}
