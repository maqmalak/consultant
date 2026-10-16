import { Search, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Empty, ErrorState, Loading } from "@/components/common/states";
import { VaultView, type VaultData } from "@/components/vault/vault-view";
import { M } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const V = "pakistan_tax_consultancy.api.vault";
interface Hit { name: string; client_name: string; client_type: string; cnic_masked: string | null; mobile: string | null }

/** Staff document vault: pick a client, then generate letters and see everything on file for them. */
export function StaffVaultPage() {
  const [params, setParams] = useSearchParams();
  const client = params.get("client");
  const [q, setQ] = useState("");
  const hits = useApi<Hit[]>(client ? null : `${M.STAFF}.search_clients`, { q, page_length: 12 });
  const vault = useApi<VaultData>(client ? `${V}.client_vault` : null, { tax_client: client });

  if (!client) {
    return (
      <div className="page-container mx-auto max-w-3xl space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#141416] text-[#f3d77a]"><ShieldCheck className="h-5 w-5" /></span>
          <div><h1 className="text-2xl font-semibold">Document vault</h1><p className="text-sm text-muted-foreground">Pick a client to see their files and generate letters.</p></div>
        </div>
        <div className="relative">
          <Search className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
          <input autoFocus aria-label="Search clients" className="field h-10 ps-9" placeholder="Name, CNIC, NTN or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {hits.isLoading ? <Loading /> : hits.data?.length ? (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {hits.data.map((h) => (
              <li key={h.name}><button className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-accent" onClick={() => setParams({ client: h.name })}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">{h.client_name.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{h.client_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{h.client_type} · {h.cnic_masked ?? ""} · {h.mobile ?? ""}</span></span>
                <span className="text-sm font-medium text-primary">Open vault →</span>
              </button></li>
            ))}
          </ul>
        ) : <Empty title="No clients found" hint="Try a name, CNIC or mobile number." />}
      </div>
    );
  }
  if (vault.isLoading) return <Loading />;
  if (vault.error || !vault.data) return <div className="page-container"><ErrorState error={vault.error} onRetry={() => void vault.mutate()} /></div>;
  return (
    <div className="page-container space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button className="text-primary hover:underline" onClick={() => setParams({})}>← All clients</button>
        <span className="text-muted-foreground">·</span>
        <Link className="text-primary hover:underline" to={`/staff/clients/${encodeURIComponent(client)}`}>Client page</Link>
      </div>
      <VaultView staff data={vault.data} onGenerate={async (document_type, reference_name) => {
        const r = await apiCall<{ name: string }>(`${V}.staff_generate`, { document_type, reference_name });
        void vault.mutate();
        return r;
      }} />
    </div>
  );
}
