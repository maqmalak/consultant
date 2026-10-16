import useSWR, { type SWRConfiguration } from "swr";
import { apiGet } from "@/services/frappe";

/** GET a whitelisted method with SWR caching; pass `null` as method to skip. */
export function useApi<T>(method: string | null, params?: Record<string, unknown>, config?: SWRConfiguration) {
  const key = method ? [method, JSON.stringify(params ?? {})] : null;
  return useSWR<T>(key, () => apiGet<T>(method as string, params), { revalidateOnFocus: false, ...config });
}
