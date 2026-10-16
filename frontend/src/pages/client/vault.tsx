import { ErrorState, Loading } from "@/components/common/states";
import { VaultView, type VaultData } from "@/components/vault/vault-view";
import { useApi } from "@/lib/use-api";
import { apiCall } from "@/services/frappe";

const V = "pakistan_tax_consultancy.api.vault";

export function VaultPage() {
  const { data, error, isLoading, mutate } = useApi<VaultData>(`${V}.my_vault`);
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;
  return (
    <VaultView data={data} onGenerate={async (document_type, reference_name) => {
      const r = await apiCall<{ name: string }>(`${V}.generate`, { document_type, reference_name });
      void mutate();
      return r;
    }} />
  );
}
