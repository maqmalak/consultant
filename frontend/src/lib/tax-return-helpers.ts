import type { TaxReturn } from "@/types";

/** Strip undefined / empty values so the payload can be written safely. */
export function cleanPayload(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(cleanPayload).filter((x) => x !== undefined && x !== null && typeof x !== "undefined");
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined && val !== null && !Array.isArray(val)) out[k] = cleanPayload(val);
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return v;
}

function sortObj<T extends Record<string, unknown>>(o: T): T {
  const a = { ...o };
  const keys = Object.keys(a).sort();
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = a[k];
  return out as T;
}

async function sha256(msg: string): Promise<string> {
  const buf = new TextEncoder().encode(msg);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 of canonical JSON — used for version/content tracking. */
export async function contentHashOf(doc: Record<string, unknown>): Promise<string> {
  return sha256(JSON.stringify(sortObj(doc)));
}

export function stateLabel(state?: string): string {
  const map: Record<string, string> = {
    Draft: "Draft",
    Submitted: "Submitted",
    "Under Review": "Under review",
    Approved: "Approved",
    Rejected: "Rejected",
    Filed: "Filed",
  };
  return map[state ?? ""] ?? state ?? "—";
}

export function formatLineErrors<T extends Record<string, unknown>>(errors: T): string[] {
  const msgs: string[] = [];
  for (const key of Object.keys(errors)) {
    const e = (errors as Record<string, { message?: string }>)[key];
    if (e?.message) msgs.push(`${key}: ${e.message}`);
  }
  return msgs;
}
