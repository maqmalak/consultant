/**
 * One tax return, as the client sees it: a dark-and-gold header with where it stands and what they owe or get back,
 * coloured tabs (questions, my details, documents, summary), and the filing progress beside it.
 */
import {
  AlertTriangle, BadgeCheck, Briefcase, Building, Building2, Calculator, Car, CheckCircle2, Clock, Coins, Download, FileCheck2, Globe,
  HelpCircle, Home, Info, Landmark, Lock, MessageCircle, MessageCircleQuestion, Sparkles, TrendingUp, Upload, UserRound, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { FileUpload } from "@/components/common/file-upload";
import { FilingProgress } from "@/components/common/filing-progress";
import { StateBadge } from "@/components/common/state-badge";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ColorTabs } from "@/components/ui/color-tabs";
import { Dialog } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/field";
import { downloadUrl, M, portal, type ChecklistItem, type ReturnDetail } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { MyDetails } from "./details";

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
const Q_ICON: Record<string, LucideIcon> = {
  has_salary: Briefcase, has_business: Building2, has_property_income: Home, has_capital_gains: TrendingUp, has_profit_on_debt: Landmark,
  has_foreign_income: Globe, has_other_income: Coins, owns_property: Building, owns_vehicle: Car, first_time_filer: Sparkles,
};

const DOC_STATUS: Record<string, string> = { Requested: "Waiting for upload", Pending: "Being checked", Verified: "Verified", Rejected: "Rejected" };
const DOC_TONE: Record<string, { ring: string; icon: LucideIcon }> = {
  Requested: { ring: "bg-amber-500/15 text-amber-600 dark:text-amber-400", icon: Upload },
  Pending: { ring: "bg-sky-500/15 text-sky-600 dark:text-sky-400", icon: Clock },
  Verified: { ring: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  Rejected: { ring: "bg-rose-500/15 text-rose-600 dark:text-rose-400", icon: AlertTriangle },
};

export function Questionnaire({ detail, onSaved }: { detail: ReturnDetail; onSaved: () => void }) {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, number>>(detail.questions);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const dirty = QUESTIONS.some(([k]) => (answers[k] ?? 0) !== (detail.questions[k] ?? 0));
  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {t("Your answers decide which income sections and documents apply to you.")}
        {!detail.can_edit_answers && <span className="ms-auto inline-flex shrink-0 items-center gap-1 font-medium"><Lock className="h-3.5 w-3.5" /> {t("Locked")}</span>}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {QUESTIONS.map(([key, q]) => {
          const Icon = Q_ICON[key] ?? HelpCircle;
          const yes = (answers[key] ?? 0) === 1;
          return (
            <fieldset key={key} disabled={!detail.can_edit_answers}
              className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-sm transition", yes && "border-[#d4af37]/50 bg-[#d4af37]/5")}>
              <legend className="sr-only">{t(q)}</legend>
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", yes ? "bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] text-[#141416]" : "bg-muted text-muted-foreground")}>
                <Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{t(q)}</span>
              <div className="flex shrink-0 rounded-full border bg-muted/40 p-0.5">
                {[1, 0].map((v) => (
                  <button key={v} type="button" aria-pressed={(answers[key] ?? 0) === v}
                    onClick={() => { setAnswers({ ...answers, [key]: v }); setSaved(false); }}
                    className={cn("min-w-[52px] rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed",
                      (answers[key] ?? 0) === v ? (v ? "bg-[#d4af37] text-[#141416] shadow" : "bg-card text-foreground shadow") : "text-muted-foreground hover:text-foreground")}>
                    {v ? t("Yes") : t("No")}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        })}
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
          {saved && <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> {t("Saved — your checklist is updated")}</span>}
        </div>
      )}
    </div>
  );
}

export function DocumentRow({ item, onChange }: { item: ChecklistItem; onChange: () => void }) {
  const { t } = useTranslation();
  const canUpload = item.status !== "Verified";
  const tone = DOC_TONE[item.status] ?? DOC_TONE.Requested;
  return (
    <li className={cn("flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between", item.status === "Rejected" && "bg-destructive/5")}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl", tone.ring)}><tone.icon className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {item.document_type}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              item.is_required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{item.is_required ? t("Required") : t("Optional")}</span>
          </p>
          {item.hint && <p className="mt-0.5 text-xs text-muted-foreground">{item.hint}</p>}
          {item.requested_reason && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{t("Why we need it")}: {item.requested_reason}</p>}
          {item.status === "Rejected" && item.rejection_reason && (
            <p className="mt-1 text-xs font-medium text-destructive">{t("Reason")}: {item.rejection_reason}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 ps-12 sm:ps-0">
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

function Documents({ data, onChange }: { data: ReturnDetail; onChange: () => void }) {
  const { t } = useTranslation();
  const required = data.checklist.filter((c) => c.is_required);
  const verified = required.filter((c) => c.status === "Verified").length;
  const pct = required.length ? Math.round((verified * 100) / required.length) : 100;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("Required documents verified")}</p>
          <p className="text-sm font-bold tabular-nums">{verified} / {required.length}</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-gradient-to-r from-[#f3d77a] to-[#d4af37]")} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3.5 w-3.5" /> {t("PDF, JPG or PNG up to 10 MB. Files are private — only you and your consultant can open them.")}</p>
      </div>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {data.checklist.map((item) => <DocumentRow key={item.name} item={item} onChange={onChange} />)}
      </ul>
    </div>
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
  const refund = s.refund_due > 0;
  const maxIncome = Math.max(1, ...s.income.map((i) => i.amount));
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
  const steps: [string, number, "+" | "−" | "="][] = [
    [t("Total income"), s.total_income, "+"], [t("Deductions"), s.total_deductions, "−"], [t("Taxable income"), s.taxable_income, "="],
    [t("Tax liability"), s.tax_liability, "+"], [t("Tax already deducted"), s.total_tax_withheld, "−"],
    ...(s.total_advance_tax ? [[t("Advance tax paid"), s.total_advance_tax, "−"] as [string, number, "−"]] : []),
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("Your income")}</h3>
          <div className="mt-3 space-y-3">
            {s.income.map((i) => (
              <div key={i.category}>
                <div className="flex justify-between text-sm"><span>{t(i.category)}</span><span className="font-semibold tabular-nums">{money(i.amount)}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-[#f3d77a] to-[#d4af37]" style={{ width: `${(i.amount * 100) / maxIncome}%` }} /></div>
              </div>
            ))}
          </div>
          {(s.total_assets || s.net_wealth) ? (
            <div className="mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
              {([[t("Assets"), s.total_assets], [t("Liabilities"), s.total_liabilities], [t("Net wealth"), s.net_wealth]] as [string, number][]).map(([l, v]) => (
                <div key={l} className="rounded-xl bg-muted/50 px-2 py-2"><p className="text-[11px] text-muted-foreground">{l}</p><p className="text-sm font-semibold tabular-nums">{money(v, { compact: true })}</p></div>
              ))}
            </div>
          ) : null}
        </section>
        <section className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("How your tax is worked out")}</h3>
          <ol className="mt-3 space-y-1.5">
            {steps.map(([label, v, sign]) => (
              <li key={label} className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm", sign === "=" && "bg-muted/60 font-semibold")}>
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                  sign === "−" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : sign === "=" ? "bg-foreground/10" : "bg-[#d4af37]/15 text-[#8a6914] dark:text-[#f3d77a]")}>{sign}</span>
                <span className="flex-1">{label}</span><span className="tabular-nums">{money(v)}</span>
              </li>
            ))}
          </ol>
          <div className={cn("mt-3 flex items-center justify-between rounded-xl px-4 py-3", refund ? "bg-emerald-500/10" : "hero-dark text-white")}>
            <span className="text-sm font-semibold">{refund ? t("Refund due") : t("Tax payable")}</span>
            <span className={cn("font-display text-2xl font-bold tabular-nums", refund ? "text-emerald-600 dark:text-emerald-400" : "text-[#f3d77a]")}>{money(refund ? s.refund_due : s.net_tax_payable)}</span>
          </div>
        </section>
      </div>
      {awaiting && !detail.client_confirmed && (
        <div className="space-y-3 rounded-2xl border border-[#d4af37]/50 bg-[#d4af37]/5 p-5">
          <p className="flex items-start gap-2 text-sm"><BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#b8912a] dark:text-[#f3d77a]" />
            {t("Please check the figures. When you confirm, a senior consultant approves the return and we file it on FBR IRIS on your behalf.")}</p>
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
        <p className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> {t("You confirmed this return")}
          {detail.client_confirmed_on ? ` · ${new Date(detail.client_confirmed_on).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
      ) : null}
      <Dialog open={asking} onClose={() => setAsking(false)} title={t("Ask a question")}
        footer={<><Button variant="ghost" onClick={() => setAsking(false)}>{t("Cancel")}</Button>
          <Button loading={busy} disabled={!question.trim()} onClick={() => void act(() => portal.ask(detail.name, question))}>{t("Send")}</Button></>}>
        <p className="mb-3 text-sm text-muted-foreground">{t("Your consultant will update the return and send it back for your confirmation.")}</p>
        <TextArea aria-label={t("Ask a question")} value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={2000} />
        <InlineError error={err} />
      </Dialog>
    </div>
  );
}

type Tab = "questions" | "details" | "documents" | "summary";

export function ReturnPage() {
  const { t } = useTranslation();
  const { name = "" } = useParams();
  const { data, error, isLoading, mutate } = useApi<ReturnDetail>(`${M.PORTAL}.return_detail`, { tax_return: name });
  const [tab, setTab] = useState<Tab | null>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  const defaultTab: Tab = data.summary ? "summary" : data.state === "Documents Pending" ? "documents" : "questions";
  const active = tab ?? defaultTab;
  const required = data.checklist.filter((c) => c.is_required);
  const verified = required.filter((c) => c.status === "Verified").length;
  const awaiting = data.state === "Awaiting Client Confirmation";
  const headline = awaiting && data.client_confirmed ? t("Confirmed — waiting for final approval") : t(data.status);
  const refund = (data.summary?.refund_due ?? data.refund_due) > 0;
  const amount = refund ? (data.summary?.refund_due ?? data.refund_due) : (data.summary?.net_tax_payable ?? data.net_tax_payable);
  const tabs = [
    { key: "questions" as Tab, label: t("Questions"), icon: HelpCircle, tone: "gold" as const },
    { key: "details" as Tab, label: t("My details"), icon: UserRound, tone: "sky" as const },
    { key: "documents" as Tab, label: required.length ? `${t("Documents")} ${verified}/${required.length}` : t("Documents"), icon: FileCheck2, tone: "emerald" as const },
    ...(data.summary ? [{ key: "summary" as Tab, label: t("Summary"), icon: Calculator, tone: "violet" as const }] : []),
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <aside className="space-y-4 lg:sticky lg:top-20 lg:order-2">
        <FilingProgress step={data.step} dates={data.step_dates} problem={data.problem} title={`${t("Filing progress")} · ${data.tax_year}`} />
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="text-sm font-semibold">{t("Questions about your return?")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("Your consultant replies in the portal, usually the same working day.")}</p>
          <Link to="/messages" className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition hover:border-primary/50 hover:bg-primary/5">
            <MessageCircle className="h-4 w-4 text-primary" /> {t("Message your consultant")}</Link>
        </div>
      </aside>

      <div className="min-w-0 space-y-5 lg:order-1">
        {/* header */}
        <div className="hero-dark relative overflow-hidden rounded-2xl p-5 text-white shadow-lg sm:p-6">
          <div aria-hidden className="pointer-events-none absolute -end-20 -top-20 h-56 w-56 rounded-full bg-[#d4af37]/20 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f3d77a]">{t("Tax year")} {data.tax_year} · {data.return_type === "Revised" ? t("Revised return") : t("Income tax return")}</p>
              <h1 className="mt-1 font-display text-2xl font-semibold sm:text-3xl">{headline}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-white/60">
                <span dir="ltr">{data.name}</span>
                <span className="text-white/30">·</span>
                {t("Step")} {Math.min(data.step + 1, 7)} {t("of")} 7
                {data.problem && <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-semibold text-rose-200"><AlertTriangle className="h-3 w-3" /> {t("Needs your attention")}</span>}
              </p>
            </div>
            <div className="rounded-2xl bg-white/5 px-5 py-3 text-end ring-1 ring-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{data.summary ? (refund ? t("Refund due") : t("Tax payable")) : t("Figures")}</p>
              {data.summary
                ? <p className={cn("font-display text-3xl font-bold tabular-nums", refund ? "text-emerald-300" : "text-[#f3d77a]")}>{money(amount)}</p>
                : <p className="text-sm text-white/70">{t("Shown once your consultant has prepared the return")}</p>}
              {awaiting && !data.client_confirmed && data.summary && active !== "summary" && (
                <button type="button" onClick={() => setTab("summary")} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#f3d77a] to-[#d4af37] px-3.5 py-1.5 text-xs font-bold text-[#141416] shadow">
                  <BadgeCheck className="h-3.5 w-3.5" /> {t("Review & confirm")}</button>
              )}
            </div>
          </div>
          {data.iris_acknowledgment_no && (
            <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-500/15 px-4 py-2.5 ring-1 ring-emerald-400/30">
              <p className="flex items-center gap-2 text-sm"><BadgeCheck className="h-4 w-4 text-emerald-300" /> {t("Filed on FBR IRIS")} · {t("Acknowledgment")} <b dir="ltr">{data.iris_acknowledgment_no}</b></p>
              {data.has_receipt && (
                <a className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-200 hover:underline" href={downloadUrl("Tax Return", data.name, "fbr_receipt")}>
                  <Download className="h-4 w-4" /> {t("FBR receipt")}
                </a>
              )}
            </div>
          )}
        </div>

        <ColorTabs value={active} onChange={setTab} tabs={tabs} />

        {active === "questions" && <Questionnaire detail={data} onSaved={() => void mutate()} />}
        {active === "details" && <MyDetails detail={data} onSaved={() => void mutate()} />}
        {active === "documents" && <Documents data={data} onChange={() => void mutate()} />}
        {active === "summary" && data.summary && <Summary detail={data} onDone={() => void mutate()} />}

        {data.comments.length > 0 && (
          <section className="rounded-2xl border bg-card p-4 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-primary" /> {t("Notes on this return")}</h2>
            <div className="space-y-2.5">
              {data.comments.map((c, i) => (
                <div key={i} className={cn("flex items-end gap-2", c.from_client && "flex-row-reverse")}>
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                    c.from_client ? "bg-primary/15 text-primary" : "bg-gradient-to-br from-[#f3d77a] to-[#d4af37] text-[#141416]")}>{c.from_client ? t("You").slice(0, 2).toUpperCase() : "VVS"}</span>
                  <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2 text-sm", c.from_client ? "rounded-br-sm bg-primary/10" : "rounded-bl-sm bg-muted")}>
                    <p className="whitespace-pre-wrap">{c.comment}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{c.from_client ? t("You") : t("Consultant")} · {new Date(c.creation).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
