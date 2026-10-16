import { Check, Clock, Sparkles } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, TextInput } from "@/components/ui/field";
import { M, portal, type Pkg } from "@/lib/api";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";
import { useApi } from "@/lib/use-api";

/** Choose a package → creates the engagement, the draft return and its document checklist. */
export function PackagePicker({ onOrdered, service }: { onOrdered?: () => void; service?: string }) {
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useApi<Pkg[]>(`${M.PUB}.packages`, service ? { service } : undefined);
  const [chosen, setChosen] = useState<Pkg | null>(null);
  const [promo, setPromo] = useState("");
  const [quote, setQuote] = useState<{ discount: number; net_fee: number; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />;

  async function place() {
    if (!chosen) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await portal.order(chosen.name, undefined, quote && !quote.error ? promo : undefined);
      onOrdered?.();
      navigate(r.tax_return ? `/returns/${r.tax_return}` : "/payments");
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {(data ?? []).map((p) => (
          <Card key={p.name} className={cn("relative flex flex-col p-5", p.most_popular ? "border-primary ring-2 ring-primary/30" : "")}>
            {p.most_popular ? (
              <span className="absolute -top-3 start-4 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">
                <Sparkles className="h-3 w-3" /> Most popular
              </span>
            ) : null}
            <p className="text-sm font-semibold">{p.package_name}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums">{money(p.price)}</p>
            {p.turnaround && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /> {p.turnaround}</p>}
            {p.for_whom && <p className="mt-3 text-sm text-muted-foreground">{p.for_whom}</p>}
            <ul className="mt-3 flex-1 space-y-1.5 text-sm">
              {p.inclusions.map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {i}</li>)}
            </ul>
            <Button className="mt-5 w-full" variant={p.most_popular ? "primary" : "outline"} onClick={() => { setChosen(p); setQuote(null); setPromo(""); }}>
              Choose {p.package_name}
            </Button>
          </Card>
        ))}
      </div>
      <Dialog open={!!chosen} onClose={() => setChosen(null)} title={`Confirm: ${chosen?.package_name ?? ""}`}
        footer={<>
          <Button variant="ghost" onClick={() => setChosen(null)}>Cancel</Button>
          <Button loading={busy} onClick={() => void place()}>Start my return</Button>
        </>}>
        <div className="space-y-4 text-sm">
          <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
            <span>Fee</span>
            <span className="text-end">
              {quote && !quote.error && quote.discount > 0 && <s className="me-2 text-muted-foreground">{money(chosen?.price)}</s>}
              <b>{money(quote && !quote.error ? quote.net_fee : chosen?.price)}</b>
            </span>
          </div>
          <div className="flex items-end gap-2">
            <Field label="Promo code" error={quote?.error ?? undefined}>{(id) => (
              <TextInput id={id} value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} />)}</Field>
            <Button variant="outline" disabled={!promo || !chosen}
              onClick={() => chosen && void portal.checkPromo(chosen.name, promo).then(setQuote).catch(setErr)}>Apply</Button>
          </div>
          <p className="text-muted-foreground">Next you answer a few questions and upload your documents. Payment details are under Payments.</p>
          <InlineError error={err} />
        </div>
      </Dialog>
    </>
  );
}

export function OrderPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Choose a package</h1>
      <PackagePicker />
    </div>
  );
}
