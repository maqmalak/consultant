import { Copy, ExternalLink, FilePlus2, Mail, Plus, Search, Send, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SelectInput, TextArea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, TR } from "@/components/ui/table";
import { M, staff } from "@/lib/api";
import { formatDate, money } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/cn";
import { useSite } from "@/components/layout/brand";
import { ReturnTable } from "./queue";

type Row = Record<string, any>;

export function ClientsPage() {
  const [q, setQ] = useState("");
  const { data, error, isLoading, mutate } = useApi<Row[]>(`${M.STAFF}.search_clients`, { q });
  return (
    <div className="page-container">
      <PageHeader title="Clients" subtitle="Search by name, CNIC, NTN, mobile or email" icon={<Users className="h-5 w-5" />}
        actions={<>
          <LinkButton to="/staff/import" variant="outline" size="default">Import CSV</LinkButton>
          <a href="/app/tax-client/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New client</a>
        </>} />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute start-2.5 top-3 h-4 w-4 text-muted-foreground" />
        <input className="field ps-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Ali, 35202-…, 0300…, ali@…" aria-label="Search clients" />
      </div>
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={() => void mutate()} />}
      {data && !data.length && <Empty title="No clients found" />}
      {data && data.length > 0 && (
        <Table>
          <thead><tr><TH>Client</TH><TH>Type</TH><TH>CNIC</TH><TH>NTN</TH><TH>Mobile</TH><TH>City</TH><TH>Portal</TH></tr></thead>
          <tbody>
            {data.map((c) => (
              <TR key={c.name}>
                <TD><Link className="font-medium text-primary hover:underline" to={`/staff/clients/${c.name}`}>{c.client_name}</Link>
                  <p className="text-xs text-muted-foreground">{c.name}</p></TD>
                <TD>{c.client_type}</TD>
                <TD dir="ltr" className="font-mono text-xs">{c.cnic_masked || "—"}</TD>
                <TD dir="ltr">{c.ntn || "—"}</TD>
                <TD dir="ltr">{c.mobile || "—"}</TD>
                <TD>{c.city || "—"}</TD>
                <TD>{c.portal_user ? <StateBadge state="Verified" label="Active" /> : <StateBadge state="Requested" label="No login" />}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function InviteButton({ client, onDone }: { client: Row; onDone: () => void }) {
  const [res, setRes] = useState<{ emailed: boolean; link: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const site = useSite().data;
  const waText = res ? `Assalam-o-Alaikum ${client.client_name}, your client portal${site?.firm_name ? ` at ${site.firm_name}` : ""} is ready. Set your password here: ${res.link}` : "";
  return (
    <>
      <Button variant="outline" size="default" loading={busy} disabled={!client.email} title={client.email ? "" : "Add an email first"}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try { setRes(await staff.invite(client.name)); onDone(); } catch (e) { setErr(e); } finally { setBusy(false); }
        }}>
        <Mail className="h-4 w-4" /> {client.portal_user ? "Resend portal invite" : "Invite to portal"}
      </Button>
      <InlineError error={err} />
      <Dialog open={!!res} onClose={() => setRes(null)} title="Portal invite ready">
        <div className="space-y-3 text-sm">
          <p>{res?.emailed ? "We emailed the link to " : "Email is not set up on this site, so share this link with "}<b>{client.email}</b>.
            The link lets the client set a password and claim the account.</p>
          <div className="flex items-center gap-2 rounded-md bg-muted p-2"><code className="flex-1 break-all text-xs">{res?.link}</code>
            <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(res?.link ?? "")} aria-label="Copy link"><Copy className="h-4 w-4" /></Button></div>
          {client.mobile && (
            <a className="inline-flex items-center gap-1.5 font-medium text-[#128C7E]" target="_blank" rel="noopener"
              href={`https://wa.me/${String(client.mobile).replace(/\D/g, "")}?text=${encodeURIComponent(waText)}`}>
              <Send className="h-4 w-4" /> Send on WhatsApp</a>
          )}
        </div>
      </Dialog>
    </>
  );
}

function Messages({ client, rows, onSent }: { client: string; rows: Row[]; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  return (
    <div className="space-y-3">
      <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border bg-card p-3 scrollbar-thin">
        {!rows.length && <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>}
        {rows.map((m) => (
          <div key={m.name} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.from_client ? "me-auto bg-muted" : "ms-auto bg-primary text-primary-foreground")}>
            <p className="whitespace-pre-wrap">{m.message}</p>
            <p className="mt-1 text-[10px] opacity-70">{m.from_client ? "Client" : m.sender} · {new Date(m.creation).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <TextArea aria-label="Reply" className="min-h-[48px] flex-1" rows={2} value={text} onChange={(e) => setText(e.target.value)} />
        <Button loading={busy} disabled={!text.trim()} onClick={async () => {
          setBusy(true);
          try { await staff.reply(client, text.trim()); setText(""); onSent(); } catch (e) { setErr(e); } finally { setBusy(false); }
        }}><Send className="h-4 w-4" /> Send</Button>
      </div>
      <InlineError error={err} />
    </div>
  );
}

export function ClientDetail() {
  const { name = "" } = useParams();
  const navigate = useNavigate();
  const { data, error, isLoading, mutate } = useApi<Row>(`${M.STAFF}.client_overview`, { tax_client: name });
  const site = useSite().data;
  const [year, setYear] = useState("");
  const [err, setErr] = useState<unknown>(null);
  if (isLoading) return <Loading />;
  if (error || !data) return <div className="page-container"><ErrorState error={error} onRetry={() => void mutate()} /></div>;
  const fields: [string, any][] = [["Type", data.client_type], ["CNIC", data.cnic_masked], ["NTN", data.ntn], ["STRN", data.strn],
    ["Mobile", data.mobile], ["Email", data.email], ["City", data.city], ["FBR status", data.fbr_registration_status],
    ["Source", data.registration_source], ["Consultant", data.assigned_consultant], ["Consent", data.consent_given ? `Yes · ${formatDate(data.consent_timestamp)}` : "No"]];
  return (
    <div className="page-container space-y-6">
      <PageHeader title={data.client_name} subtitle={data.name} icon={<Users className="h-5 w-5" />}
        badge={data.portal_user ? <StateBadge state="Verified" label="Portal active" /> : undefined}
        actions={<>
          <InviteButton client={data} onDone={() => void mutate()} />
          <a href={`/app/tax-client/${data.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent">
            Edit in desk <ExternalLink className="h-3.5 w-3.5" /></a>
        </>} />
      <Card className="grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([k, v]) => <p key={k}><span className="text-muted-foreground">{k}:</span> {v || "—"}</p>)}
      </Card>
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-lg font-semibold">Returns</h2>
          <div className="flex items-center gap-2">
            <SelectInput aria-label="Tax year" className="h-9 w-32" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">Tax year…</option>{(site?.tax_years ?? []).map((y) => <option key={y}>{y}</option>)}
            </SelectInput>
            <Button size="default" disabled={!year} onClick={() => staff.createReturn(data.name, year).then((r) => navigate(`/staff/returns/${r}`)).catch(setErr)}>
              <FilePlus2 className="h-4 w-4" /> New return</Button>
          </div>
        </div>
        <InlineError error={err} />
        {data.returns.length ? <ReturnTable rows={data.returns} /> : <Empty title="No returns yet" />}
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Engagements & fees</h2>
          {data.engagements.length ? (
            <Table>
              <thead><tr><TH>Service</TH><TH>Year</TH><TH className="text-end">Fee</TH><TH>Payment</TH></tr></thead>
              <tbody>{data.engagements.map((e: Row) => (
                <TR key={e.name}><TD>{e.service_package || e.service}</TD><TD>{e.tax_year}</TD>
                  <TD className="text-end tabular-nums">{money(e.net_fee || e.agreed_fee)}</TD><TD><StateBadge state={e.payment_status} /></TD></TR>
              ))}</tbody>
            </Table>
          ) : <Empty title="No engagements" />}
          <h2 className="pt-2 text-lg font-semibold">Documents</h2>
          {data.documents.length ? (
            <ul className="divide-y rounded-lg border bg-card text-sm">
              {data.documents.map((d: Row) => (
                <li key={d.name} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>{d.document_type} <span className="text-xs text-muted-foreground">{d.tax_year}</span></span><StateBadge state={d.status} />
                </li>
              ))}
            </ul>
          ) : <Empty title="No documents" />}
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Messages</h2>
          <Messages client={data.name} rows={data.messages} onSent={() => void mutate()} />
        </div>
      </section>
    </div>
  );
}
