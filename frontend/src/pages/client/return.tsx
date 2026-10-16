import { CheckCircle2, Download, HelpCircle, MessageCircleQuestion } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { FileUpload } from "@/components/common/file-upload";
import { ProgressTracker } from "@/components/common/progress-tracker";
import { StateBadge } from "@/components/common/state-badge";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/field";
import { downloadUrl, M, portal, type ChecklistItem, type ReturnDetail } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export const QUESTIONS: [string, string][] = [
  ["has_salary", "Do you have salary income?"],
  ["has_business", "Do you have business income?"],
  ["has_property_income", "Do you earn rent from property?"],
  ["has_capital_gains", "Did you sell shares or property (capital gains)?"],
  ["has_profit_on_debt", "Do you earn profit on bank deposits?"],
  ["has_foreign_income", "Do you have income from abroad?"],
  ["has_other_income", "Any other income?"],
  ["owns_property", "Do you own property?"],
  ["owns_vehicle", "Do you own a vehicle?"],
  ["first_time_filer", "Is this your first return?"],
];

const DOC_STATUS: Record<string, string> = { Requested: "Waiting for upload", Pending: "Being checked", Verified: "Verified", Rejected: "Rejected" };

export function Questionnaire({ detail, onSaved }: { detail: ReturnDetail; onSaved: () => void }) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, number>>(detail.questions);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const dirty = QUESTIONS.some(([k]) => (answers[k] ?? 0) !== (detail.questions[k] ?? 0));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Your answers decide which income sections and documents apply to you.</p>
      <div className="divide-y rounded-lg border bg-card">
        {QUESTIONS.map(([key, q]) => (
          <fieldset key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" disabled={!detail.can_edit_answers}>
            <legend className="sr-only">{t(q)}</legend>
            <span className="text-sm">{t(q)}</span>
            <div className="flex overflow-hidden rounded-lg border">
              {[1, 0].map((v) => (
                <button key={v} type="button" aria-pressed={(answers[key] ?? 0) === v}
                  onClick={() => { setAnswers({ ...answers, [key]: v }); setSaved(false); }}
                  className={cn("min-w-[64px] px-4 py-2 text-sm font-medium transition",
                    (answers[key] ?? 0) === v ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent")}>
                  {v ? t("Yes") : t("No")}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <InlineError error={err} />
      {detail.can_edit_answers && (
        <div className="flex items-center gap-3">
          <Button loading={busy} disabled={!dirty} onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await portal.saveAnswers(detail.name, answers);
              setSaved(true);
              onSaved();
            } catch (e) {
              setErr(e);
            } finally {
              setBusy(false);
            }
          }}>{t("Save")}</Button>
          {saved && <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> Saved — your checklist is updated</span>}
        </div>
      )}
    </div>
  );
}

export function DocumentRow({ item, onChange }: { item: ChecklistItem; onChange: () => void }) {
  const { t } = useTranslation();
  const canUpload = item.status !== "Verified";
  return (
    <li className={cn("flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
      item.status === "Rejected" && "bg-destructive/5")}>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {item.document_type}
          <span className="text-xs font-normal text-muted-foreground">{item.is_required ? t("Required") : t("Optional")}</span>
        </p>
        {item.hint && <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>}
        {item.status === "Rejected" && item.rejection_reason && (
          <p className="mt-1 text-xs font-medium text-destructive">{t("Reason")}: {item.rejection_reason}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StateBadge state={item.status} label={t(DOC_STATUS[item.status])} />
        {item.has_file && (
          <a href={downloadUrl("Tax Document", item.name, "file")} target="_blank" rel="noopener" aria-label={t("Download")}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"><Download className="h-4 w-4" /></a>
        )}
        {canUpload && (
          <FileUpload label={item.has_file ? t("Re-upload") : t("Upload")}
            onUpload={(blob, name) => portal.upload(item.name, blob, name)} onDone={onChange} />
        )}
      </div>
    </li>
  );
}

function Summary({ detail, onDone }: { detail: ReturnDetail; onDone: () => void }) {
  const { t } = useTranslation();
  const s = detail.summary!;
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const awaiting = detail.state === "Awaiting Client Confirmation";
  const rows: [string, number][] = [
    [t("Total income"), s.total_income], [t("Deductions"), s.total_deductions], [t("Taxable income"), s.taxable_income],
    [t("Tax liability"), s.tax_liability], [t("Tax already deducted"), s.total_tax_withheld], [t("Advance tax paid"), s.total_advance_tax],
  ];
  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setAsking(false);
      onDone();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <dl className="divide-y text-sm">
          {s.income.map((i) => (
            <div key={i.category} className="flex justify-between px-4 py-2.5"><dt className="text-muted-foreground">{i.category}</dt><dd className="tabular-nums">{money(i.amount)}</dd></div>
          ))}
          {rows.map(([label, v]) => (
            <div key={label} className="flex justify-between px-4 py-2.5"><dt>{label}</dt><dd className="font-medium tabular-nums">{money(v)}</dd></div>
          ))}
          <div className="flex justify-between bg-primary/10 px-4 py-3 text-base font-semibold">
            <dt>{s.refund_due > 0 ? t("Refund due") : t("Tax payable")}</dt>
            <dd className="tabular-nums">{money(s.refund_due > 0 ? s.refund_due : s.net_tax_payable)}</dd>
          </div>
          {s.net_wealth ? (
            <div className="flex justify-between px-4 py-2.5"><dt>{t("Net wealth")}</dt><dd className="tabular-nums">{money(s.net_wealth)}</dd></div>
          ) : null}
        </dl>
      </Card>
      {awaiting && !detail.client_confirmed && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm">{t("Please check the figures. When you confirm, a senior consultant approves the return and we file it on FBR IRIS on your behalf.")}</p>
          <InlineError error={err} />
          <div className="flex flex-wrap gap-2">
            <Button size="lg" loading={busy} onClick={() => void act(() => portal.confirm(detail.name))}>
              <CheckCircle2 className="h-4 w-4" /> {t("Confirm my return")}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setAsking(true)}>
              <MessageCircleQuestion className="h-4 w-4" /> {t("Ask a question")}
            </Button>
          </div>
        </div>
      )}
      {detail.client_confirmed ? (
        <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> You confirmed this return
          {detail.client_confirmed_on ? ` on ${new Date(detail.client_confirmed_on).toLocaleString("en-GB")}` : ""}.</p>
      ) : null}
      <Dialog open={asking} onClose={() => setAsking(false)} title={t("Ask a question")}
        footer={<><Button variant="ghost" onClick={() => setAsking(false)}>{t("Cancel")}</Button>
          <Button loading={busy} disabled={!question.trim()} onClick={() => void act(() => portal.ask(detail.name, question))}>{t("Send")}</Button></>}>
        <p className="mb-3 text-sm text-muted-foreground">Your consultant will update the return and send it back for your confirmation.</p>
        <TextArea aria-label={t("Ask a question")} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} />
        <InlineError error={err} />
      </Dialog>
    </div>
  );
}

export function ReturnPage() {
  const { t } = useTranslation();
  const { name = "" } = useParams();
  const { data, error, isLoading, mutate } = useApi<ReturnDetail>(`${M.PORTAL}.return_detail`, { tax_return: name });
  const [tab, setTab] = useState<string | null>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  const defaultTab = data.summary ? "summary" : data.state === "Documents Pending" ? "documents" : "questions";
  const active = tab ?? defaultTab;
  const tabs: [string, string][] = [["questions", t("Questions")], ["documents", t("Documents")],
    ...(data.summary ? [["summary", t("Summary")] as [string, string]] : [])];
  const required = data.checklist.filter((c) => c.is_required);
  const verified = required.filter((c) => c.status === "Verified").length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tax year {data.tax_year}</p>
        <h1 className="text-2xl font-semibold">{t(data.status)}</h1>
      </div>
      <Card className="p-4"><ProgressTracker step={data.step} /></Card>
      {data.iris_acknowledgment_no && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-success/40 bg-success/5 p-4">
          <p className="text-sm">{t("Acknowledgment")}: <b dir="ltr">{data.iris_acknowledgment_no}</b></p>
          {data.has_receipt && (
            <a className="inline-flex items-center gap-1.5 text-sm font-medium text-primary" href={downloadUrl("Tax Return", data.name, "fbr_receipt")}>
              <Download className="h-4 w-4" /> {t("Download")} FBR receipt
            </a>
          )}
        </Card>
      )}
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={active === key} onClick={() => setTab(key)}
            className={cn("flex-1 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition",
              active === key ? "bg-card text-foreground shadow" : "text-muted-foreground hover:text-foreground")}>
            {label}{key === "documents" && required.length ? ` (${verified}/${required.length})` : ""}
          </button>
        ))}
      </div>
      {active === "questions" && <Questionnaire detail={data} onSaved={() => void mutate()} />}
      {active === "documents" && (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><HelpCircle className="h-4 w-4" /> PDF, JPG or PNG up to 10 MB. Files are private — only you and your consultant can open them.</p>
          <ul className="divide-y rounded-lg border bg-card">
            {data.checklist.map((item) => <DocumentRow key={item.name} item={item} onChange={() => void mutate()} />)}
          </ul>
        </div>
      )}
      {active === "summary" && data.summary && <Summary detail={data} onDone={() => void mutate()} />}
      {data.comments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("Notes on this return")}</h2>
          {data.comments.map((c, i) => (
            <div key={i} className={cn("rounded-lg px-3 py-2 text-sm", c.from_client ? "ms-8 bg-primary/10" : "me-8 bg-muted")}>
              <p className="whitespace-pre-wrap">{c.comment}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{c.from_client ? "You" : "Consultant"} · {new Date(c.creation).toLocaleString("en-GB")}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
