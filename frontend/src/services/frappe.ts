import axios, { type AxiosInstance } from "axios";

/**
 * Thin transport layer for the Frappe REST / RPC APIs.
 *
 * - Cookie/session authentication (same-origin via the Vite proxy in dev, or
 *   same-origin when the SPA is served by the site itself in production).
 * - CSRF: Frappe injects `window.csrf_token` only into pages it renders. The
 *   SPA fetches its own token via
 *   `pakistan_tax_consultancy.api.session.get_csrf_token_for_session` (guest-accessible,
 *   returns only the caller's own token) and attaches it to every write
 *   request; stale tokens auto-recover.
 */

let baseURL = import.meta.env.VITE_FRAPPE_URL || "";

export function getBaseURL(): string {
  return baseURL;
}

/** Allow tests / modules to override the Frappe base URL. */
export function setBaseURL(url: string): void {
  baseURL = url.replace(/\/$/, "");
}

export const http: AxiosInstance = axios.create({
  baseURL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
  timeout: 60_000,
});

// Attach the CSRF token to every write request.
http.interceptors.request.use((config) => {
  const token = (window as unknown as { csrf_token?: string }).csrf_token;
  if (token && config.method && ["post", "put", "patch", "delete"].includes(config.method)) {
    config.headers["X-Frappe-CSRF-Token"] = token;
  }
  return config;
});

/**
 * Fetch a fresh CSRF token for the current session and cache it on
 * `window.csrf_token`. Called at app bootstrap and after login/logout.
 */
export async function refreshCSRFToken(): Promise<void> {
  try {
    const res = await fetch("/api/method/pakistan_tax_consultancy.api.session.get_csrf_token_for_session", {
      credentials: "include",
    });
    if (!res.ok) return;
    const data = (await res.json()) as { message?: string };
    if (data?.message) {
      (window as unknown as { csrf_token?: string }).csrf_token = data.message;
    }
  } catch {
    /* CSRF bootstrap is best-effort; GETs still work unauthenticated. */
  }
}

function isCSRFTokenError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const data = error.response?.data as Record<string, any> | undefined;
  if (!data) return false;
  if (data.exc_type === "CSRFTokenError") return true;
  const text = [data._error_message, data.message, data._server_messages]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
  return text.includes("csrf");
}

let csrfRefreshPromise: Promise<void> | null = null;

// Auto-recover from a stale cached CSRF token: refresh once (shared promise)
// and replay the failed write exactly once.
http.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (!isCSRFTokenError(error) || !axios.isAxiosError(error)) throw error;
    const config = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (!config || config._retried) throw error;
    config._retried = true;
    csrfRefreshPromise = csrfRefreshPromise ?? refreshCSRFToken();
    await csrfRefreshPromise;
    csrfRefreshPromise = null;
    const token = (window as unknown as { csrf_token?: string }).csrf_token;
    if (token) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)["X-Frappe-CSRF-Token"] = token;
    }
    return http.request(config);
  },
);

/** Unwrap the `{message: ...}` envelope Frappe wraps around whitelisted results. */
async function wrap<T>(p: Promise<{ data: any }>): Promise<T> {
  const res = await p;
  const data = res?.data;
  if (data && typeof data === "object" && "message" in data) return data.message as T;
  return data as T;
}

/**
 * Call a whitelisted Python method: `/api/method/<path>` with JSON args.
 * Guest access allowed at the transport level; each method enforces its own
 * server-side permission checks.
 */
export function apiCall<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
  return wrap<T>(http.post(`/api/method/${method}`, args ?? {}));
}

/** GET variant for whitelisted methods that only read. */
export function apiGet<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
  return wrap<T>(http.get(`/api/method/${method}`, { params }));
}

/**
 * Permission-aware fetch of a DocType list via the REST resource API.
 * Filters are evaluated server-side under the caller's permissions — the UI
 * never sees rows the user is not allowed to read.
 */
export function getList<T = Record<string, any>>(
  doctype: string,
  opts: {
    fields?: string[];
    filters?: Record<string, any> | [string, string, any][];
    orFilters?: [string, string, any][];
    orderBy?: string;
    order?: "asc" | "desc";
    start?: number;
    limit?: number;
    limitPageLength?: number;
  } = {},
): Promise<T[]> {
  const {
    fields = ["name"],
    filters,
    orFilters,
    orderBy = "modified",
    order = "desc",
    start = 0,
    limit,
    limitPageLength,
  } = opts;
  return wrap<T[]>(
    http.get("/api/resource/" + encodeURIComponent(doctype), {
      params: {
        fields: JSON.stringify(fields),
        ...(filters ? { filters: JSON.stringify(filters) } : {}),
        ...(orFilters ? { or_filters: JSON.stringify(orFilters) } : {}),
        order_by: `${orderBy} ${order}`,
        limit_start: start,
        limit_page_length: limit ?? limitPageLength ?? 20,
      },
    }),
  );
}

/** Insert a document via the REST resource API (server-side perms apply). */
export function insertDoc<T = Record<string, any>>(doc: Record<string, any>): Promise<T> {
  return wrap<T>(http.post("/api/resource/" + encodeURIComponent(doc.doctype), doc));
}

/** Update fields on an existing document via `frappe.client.set_value`. */
export function setValue<T = Record<string, any>>(
  doctype: string,
  name: string,
  fields: Record<string, any>,
): Promise<T> {
  return wrap<T>(
    http.post("/api/method/frappe.client.set_value", { doctype, name, fieldname: fields }),
  );
}

/** Build an absolute file URL for attachments (private files need a session). */
export function fileURL(fileUrl?: string): string {
  if (!fileUrl) return "";
  if (/^https?:\/\//.test(fileUrl)) return fileUrl;
  const base = getBaseURL();
  return `${base}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

/** Convert server-side Frappe messages into a readable error string. */
export function humanizeError(error: unknown): string {
  if (!error) return "Something went wrong. Please try again.";
  if (typeof error === "string") return error;

  const anyErr = error as Record<string, any>;

  // Frappe often packs messages into _server_messages (JSON string of JSON strings).
  const serverMessages =
    anyErr?._server_messages ??
    anyErr?.response?.data?._server_messages ??
    anyErr?.data?._server_messages;
  if (serverMessages) {
    try {
      const list = typeof serverMessages === "string" ? JSON.parse(serverMessages) : serverMessages;
      const parts = (Array.isArray(list) ? list : [list]).map((entry: unknown) => {
        try {
          const obj = typeof entry === "string" ? JSON.parse(entry) : entry;
          return (obj as any)?.message ?? String(entry);
        } catch {
          return String(entry);
        }
      });
      const joined = parts.filter(Boolean).join(" ").trim();
      if (joined) return stripHtml(joined);
    } catch {
      /* fall through */
    }
  }

  // The JSON error body carries the reason in `exception` as
  // "module.path.ExceptionClass: message" — strip the dotted-class prefix.
  const stripExceptionPrefix = (s: string) => s.replace(/^[\w.]+:\s+/, "");

  const candidates = [
    anyErr?.response?.data?.exception && stripExceptionPrefix(anyErr.response.data.exception),
    anyErr?.response?.data?.exc,
    anyErr?.response?.data?.message,
    anyErr?.exception && stripExceptionPrefix(anyErr.exception),
    anyErr?.exc,
    anyErr?.response?.data?.exc_type,
    anyErr?.message,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return stripHtml(c);
  }

  if (error instanceof Error && error.message) return stripHtml(error.message);
  return "Something went wrong. Please try again.";
}

export function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** POST a single file (multipart) plus string fields to a whitelisted method. */
export function apiUpload<T = unknown>(method: string, file: File | Blob, fields: Record<string, string> = {},
  filename?: string): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", file, filename ?? (file instanceof File ? file.name : "upload"));
  return wrap<T>(http.post(`/api/method/${method}`, form, { headers: { "Content-Type": "multipart/form-data" } }));
}
