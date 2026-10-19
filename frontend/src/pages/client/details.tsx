/**
 * "My tax details": the client describes their year in everyday words. Sections follow their questionnaire answers;
 * every field has an example. Nothing here changes the return until the consultant reviews and copies it in.
 */
import { Banknote, Briefcase, Building2, Car, CheckCircle2, Home, Landmark, Plus, Trash2, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { InlineError } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { M, staff, type ReturnDetail } from "@/lib/api";
import { money } from "@/lib/format";
import { apiCall } from "@/services/frappe";

type Row = Record<string, string | number>;
type Details = Record<string, Row[] | string | number>;

interface FieldDef { key: string; label: string; money?: boolean; placeholder?: string }
interface SectionDef { key: string; title: string; help: string; icon: typeof Briefcase; when?: string[]; fields: FieldDef[]; add: string }

export const SECTIONS: SectionDef[] = [
  { key: "salary", title: "Salary", icon: Briefcase, when: ["has_salary"], add: "Add another employer",
    help: "Your salary certificate shows these. Enter the total for July to June.",
    fields: [{ key: "employer", label: "Employer", placeholder: "e.g. ABC Textiles Ltd" },
      { key: "annual_salary", label: "Total salary for the year (Rs)", money: true, placeholder: "e.g. 1800000" },
      { key: "tax_deducted", label: "Tax deducted by employer (Rs)", money: true, placeholder: "e.g. 45000" }] },
  { key: "business", title: "Business", icon: Building2, when: ["has_business"], add: "Add another business",
    help: "A rough total is fine — your consultant checks it against your records.",
    fields: [{ key: "name", label: "Business name", placeholder: "e.g. Malik Traders" },
      { key: "annual_sales", label: "Sales / receipts for the year (Rs)", money: true },
      { key: "annual_expenses", label: "Business expenses for the year (Rs)", money: true }] },
  { key: "rent", title: "Rent you receive", icon: Home, when: ["has_property_income"], add: "Add another property",
    help: "Only property you rent out to someone else.",
    fields: [{ key: "property", label: "Property", placeholder: "e.g. House 12, Model Town" },
      { key: "annual_rent", label: "Rent received in the year (Rs)", money: true },
      { key: "tax_deducted", label: "Tax deducted by tenant, if any (Rs)", money: true }] },
  { key: "bank", title: "Bank accounts", icon: Landmark, add: "Add another account",
    help: "Every account in your name. The bank's yearly statement / profit certificate shows these.",
    fields: [{ key: "bank", label: "Bank", placeholder: "e.g. Meezan Bank" },
      { key: "balance_30_june", label: "Balance on 30 June (Rs)", money: true },
      { key: "profit", label: "Profit earned in the year (Rs)", money: true },
      { key: "tax_deducted", label: "Tax deducted on profit (Rs)", money: true }] },
  { key: "property", title: "Property you own", icon: Home, when: ["owns_property"], add: "Add another property",
    help: "Houses, flats, plots, shops. Use the price you paid (not today's value).",
    fields: [{ key: "description", label: "What is it", placeholder: "e.g. 5 marla house" },
      { key: "city", label: "City", placeholder: "e.g. Faisalabad" }, { key: "purchase_year", label: "Year bought", placeholder: "e.g. 2019" },
      { key: "value", label: "Price paid (Rs)", money: true }] },
  { key: "vehicles", title: "Vehicles", icon: Car, when: ["owns_vehicle"], add: "Add another vehicle",
    help: "Cars and motorcycles in your name.",
    fields: [{ key: "make_model", label: "Make and model", placeholder: "e.g. Toyota Corolla 2021" },
      { key: "registration_no", label: "Registration no.", placeholder: "e.g. FDA-123" },
      { key: "value", label: "Price paid (Rs)", money: true }, { key: "tax_paid_on_registration", label: "Tax paid at registration (Rs)", money: true }] },
  { key: "other_income", title: "Other income", icon: Banknote, when: ["has_other_income", "has_foreign_income", "has_capital_gains"],
    add: "Add other income", help: "Anything else: freelancing, foreign income, sale of shares or property…",
    fields: [{ key: "description", label: "What was it", placeholder: "e.g. Freelance design work" }, { key: "amount", label: "Amount (Rs)", money: true }] },
  { key: "loans", title: "Loans you owe", icon: Wallet, add: "Add a loan", help: "Bank loans, car financing, money borrowed from relatives.",
    fields: [{ key: "lender", label: "From whom", placeholder: "e.g. HBL car loan" }, { key: "amount", label: "Amount still owed on 30 June (Rs)", money: true }] },
];

function Card({ icon: Icon, title, help, children }: { icon: typeof Briefcase; title: string; help: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="form-card">
      <div className="form-card-head"><Icon className="h-4 w-4 text-primary" /> {t(title)}</div>
      <div className="form-card-body space-y-3">
        <p className="text-sm text-muted-foreground">{t(help)}</p>
        {children}
      </div>
    </section>
  );
}

/** Also used by staff (`onBehalf`) to enter the details for a client who told them by phone or in person. */
export function MyDetails({ detail, onSaved, onBehalf = false }: {
  detail: Pick<ReturnDetail, "name" | "client_details" | "can_edit_answers" | "questions">; onSaved: () => void; onBehalf?: boolean;
}) {
  const { t } = useTranslation();
  const [d, setD] = useState<Details>(() => ({ ...(detail.client_details ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const editable = detail.can_edit_answers;
  const visible = SECTIONS.filter((s) => !s.when || s.when.some((q) => detail.questions[q]));
  const rows = (k: string) => (Array.isArray(d[k]) ? (d[k] as Row[]) : []);
  const setRows = (k: string, r: Row[]) => { setD({ ...d, [k]: r }); setSaved(false); };

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      setD((onBehalf ? await staff.saveClientDetails(detail.name, d) : await apiCall<Details>(`${M.PORTAL}.save_details`, { tax_return: detail.name, details: d })) as Details);
      setSaved(true);
      onSaved();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {onBehalf ? (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 text-sm">
          <p className="font-medium">Entering on the client's behalf</p>
          <p className="mt-1 text-muted-foreground">Type what the client told you by phone, WhatsApp or in person. Your name is recorded with the entry; nothing changes the return until it is copied in.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">{t("Tell us about your year in your own words.")}</p>
          <p className="mt-1 text-muted-foreground">{t("Approximate figures are fine — your consultant checks everything against your documents before anything is filed.")}</p>
        </div>
      )}
      {visible.map((sec) => {
        const list = rows(sec.key);
        return (
          <Card key={sec.key} icon={sec.icon} title={sec.title} help={sec.help}>
            {list.map((row, i) => (
              <div key={i} className="relative grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                {sec.fields.map((f) => (
                  <label key={f.key} className="block text-sm font-medium">
                    {t(f.label)}
                    <input className="field mt-1 h-11 sm:h-10" disabled={!editable} inputMode={f.money ? "numeric" : undefined}
                      placeholder={f.placeholder ? t(f.placeholder) : undefined} value={row[f.key] ?? ""}
                      onChange={(e) => setRows(sec.key, list.map((r, j) => (j === i ? { ...r, [f.key]: f.money ? e.target.value.replace(/[^\d.]/g, "") : e.target.value } : r)))} />
                    {f.money && Number(row[f.key]) > 0 && <span className="mt-0.5 block text-xs text-muted-foreground">{money(Number(row[f.key]))}</span>}
                  </label>
                ))}
                {editable && (
                  <button type="button" onClick={() => setRows(sec.key, list.filter((_, j) => j !== i))} aria-label={t("Remove")}
                    className="absolute end-2 top-2 rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            ))}
            {editable && (
              <Button type="button" variant="outline" size="sm" onClick={() => setRows(sec.key, [...list, {}])}>
                <Plus className="h-4 w-4" /> {t(list.length ? sec.add : "Add")}
              </Button>
            )}
          </Card>
        );
      })}
      <Card icon={Wallet} title="Cash and household" help="Cash you keep at home, and what your household spends in a normal month (rent, bills, school fees, groceries).">
        <div className="grid gap-3 sm:grid-cols-2">
          {([["cash_in_hand", "Cash at home on 30 June (Rs)"], ["household_expenses_monthly", "Household spending per month (Rs)"]] as const).map(([k, label]) => (
            <label key={k} className="block text-sm font-medium">{t(label)}
              <input className="field mt-1 h-11 sm:h-10" inputMode="numeric" disabled={!editable} value={(d[k] as string) ?? ""}
                onChange={(e) => { setD({ ...d, [k]: e.target.value.replace(/[^\d.]/g, "") }); setSaved(false); }} />
            </label>
          ))}
          <label className="block text-sm font-medium sm:col-span-2">{t("Anything else your consultant should know")}
            <textarea className="field mt-1 h-auto min-h-[80px] py-2" disabled={!editable} value={(d.notes as string) ?? ""}
              onChange={(e) => { setD({ ...d, notes: e.target.value }); setSaved(false); }} />
          </label>
        </div>
      </Card>
      <InlineError error={err} />
      {editable ? (
        <div className="sticky bottom-20 z-10 flex items-center gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          <Button size="lg" loading={busy} onClick={() => void save()}>{onBehalf ? "Save for the client" : t("Save my details")}</Button>
          {saved && <span className="flex items-center gap-1 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> {onBehalf ? "Saved" : t("Saved — your consultant can see it")}</span>}
        </div>
      ) : <p className="text-sm text-muted-foreground">{t("Your return is in review. Message your consultant to change these details.")}</p>}
    </div>
  );
}
