import { Copy, FileDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUpload } from "@/components/common/file-upload";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { M, portal, type EngagementRow, type PaymentDetails } from "@/lib/api";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

function Copyable({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <button type="button" className="inline-flex items-center gap-1.5 font-medium tabular-nums hover:text-primary" dir="ltr"
        onClick={() => void navigator.clipboard?.writeText(value)} title="Copy">{value} <Copy className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export function PaymentDetailsCard() {
  const { t } = useTranslation();
  const { data } = useApi<PaymentDetails>(`${M.PUB}.payment_details`);
  if (!data) return null;
  const any = Object.values(data).some(Boolean);
  return (
    <Card className="p-4">
      <h2 className="mb-2 text-sm font-semibold">{t("How to pay")}</h2>
      {!any && <p className="text-sm text-muted-foreground">Payment details will appear here soon. Please message us.</p>}
      {(data.bank_iban || data.bank_account_no) && <p className="mt-1 text-xs font-semibold uppercase text-muted-foreground">Bank transfer — {data.bank_name}</p>}
      <Copyable label="Account title" value={data.bank_account_title} />
      <Copyable label="Account no." value={data.bank_account_no} />
      <Copyable label="IBAN" value={data.bank_iban} />
      <Copyable label="Raast ID" value={data.raast_id} />
      <Copyable label={`JazzCash${data.jazzcash_title ? ` (${data.jazzcash_title})` : ""}`} value={data.jazzcash_number} />
      <Copyable label={`Easypaisa${data.easypaisa_title ? ` (${data.easypaisa_title})` : ""}`} value={data.easypaisa_number} />
    </Card>
  );
}

function ProofDialog({ eng, onClose, onDone }: { eng: EngagementRow; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState("Bank Transfer");
  const [amount, setAmount] = useState(String(Math.round(eng.outstanding || eng.net_fee || eng.agreed_fee)));
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <Dialog open onClose={onClose} title={t("I have paid")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button>
        <Button loading={busy} disabled={!amount || !file} onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const fields = { tax_engagement: eng.name, method, amount, reference };
            await portal.submitPayment(fields, file ? new File([file.blob], file.name) : undefined);
            onDone();
          } catch (e) {
            setErr(e);
          } finally {
            setBusy(false);
          }
        }}>{t("Send")}</Button></>}>
      <div className="space-y-4">
        <Field label="Paid by" required>{(id) => (
          <SelectInput id={id} value={method} onChange={(e) => setMethod(e.target.value)}>
            {["Bank Transfer", "Raast", "JazzCash", "Easypaisa"].map((m) => <option key={m}>{m}</option>)}
          </SelectInput>)}</Field>
        <Field label={t("Amount")} required>{(id) => (
          <TextInput id={id} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} />)}</Field>
        <Field label={t("Transaction reference")} hint="TID / transaction ID from your bank or wallet">{(id) => (
          <TextInput id={id} value={reference} onChange={(e) => setReference(e.target.value)} />)}</Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold">{t("Payment proof")} <span className="text-destructive">*</span></p>
          <FileUpload label={file ? file.name : "Screenshot / receipt"} onUpload={async (blob, name) => setFile({ blob, name })} />
        </div>
        <InlineError error={err} />
      </div>
    </Dialog>
  );
}

export function PaymentsPage() {
  const { t } = useTranslation();
  const { data, error, isLoading, mutate } = useApi<EngagementRow[]>(`${M.PORTAL}.engagements`);
  const [paying, setPaying] = useState<EngagementRow | null>(null);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">{t("Payments")}</h1>
      <PaymentDetailsCard />
      {(data ?? []).length === 0 && <Empty title="No fees yet" hint="Choose a package from Home." />}
      {(data ?? []).map((e) => (
        <Card key={e.name} className="space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{e.service_package ?? e.service}</p>
              <p className="text-xs text-muted-foreground">{e.service}{e.tax_year ? ` · Tax year ${e.tax_year}` : ""}</p>
            </div>
            <StateBadge state={e.payment_status} label={e.payment_status === "Paid" ? t("Paid") : e.payment_status === "Unbilled" ? t("Unpaid") : e.payment_status} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>Fee: <b>{money(e.net_fee || e.agreed_fee)}</b>{e.discount ? <span className="text-muted-foreground"> (discount {money(e.discount)})</span> : null}</span>
            {e.payment_status !== "Paid" && <span>Outstanding: <b>{money(e.outstanding)}</b></span>}
          </div>
          {e.proofs.length > 0 && (
            <ul className="space-y-1 border-t pt-2 text-sm">
              {e.proofs.map((p) => (
                <li key={p.name} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{p.method} · {money(p.amount)} {p.reference ? <span className="text-muted-foreground" dir="ltr">· {p.reference}</span> : null}</span>
                  <span className="flex items-center gap-2"><StateBadge state={p.status} />{p.rejection_reason && <span className="text-xs text-destructive">{p.rejection_reason}</span>}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {e.payment_status !== "Paid" && e.payment_status !== "Waived" && !e.proofs.some((p) => p.status === "Pending") && (
              <Button onClick={() => setPaying(e)}>{t("I have paid")}</Button>
            )}
            {e.sales_invoice && (
              <a className="inline-flex items-center gap-1.5 text-sm font-medium text-primary"
                href={`/api/method/${M.PORTAL}.invoice_pdf?tax_engagement=${encodeURIComponent(e.name)}`}>
                <FileDown className="h-4 w-4" /> Invoice / receipt
              </a>
            )}
          </div>
        </Card>
      ))}
      {paying && <ProofDialog eng={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); void mutate(); }} />}
    </div>
  );
}
