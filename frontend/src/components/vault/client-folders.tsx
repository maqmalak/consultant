/**
 * Client folders (staff): the client's Tax Documents as `C-00456 · Name / TY2026 / Document type / file`.
 * Browse, preview PDFs and photos, add several files at once into a folder, see older versions of a file and
 * download a folder as a ZIP. The folders are a view over the vault (api/folders.py); access and audit are unchanged.
 */
import { ChevronRight, Download, Eye, FileImage, FileText, Folder, FolderOpen, History, Loader2, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { StateBadge } from "@/components/common/state-badge";
import { Empty, ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, SelectInput } from "@/components/ui/field";
import { downloadUrl } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";
import { apiUpload, humanizeError } from "@/services/frappe";

const F = "pakistan_tax_consultancy.api.folders";
const NO_YEAR = "No tax year";

interface FolderFile {
  name: string; document_type: string; document_name: string | null; tax_year: string | null; year_folder: string;
  status: string; upload_date: string | null; is_client_upload: number; received_via: string | null;
  file_name: string; file_size: number; ext: string; versions: number;
}
interface Tree {
  client: { name: string; client_code: string | null; client_name: string; folder: string };
  files: FolderFile[]; years: string[]; document_types: string[]; received_via: string[]; max_mb: number;
}
interface Version { name: string; file_name: string; file_size: number; creation: string; owner: string; current: boolean }

const STATUS_LABEL: Record<string, string> = { Requested: "To upload", Pending: "To verify", Verified: "Verified", Rejected: "Rejected" };
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const day = (v: string | null) => (v ? new Date(v.replace(" ", "T")).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");
const previewable = (ext: string) => ["pdf", "jpg", "jpeg", "png"].includes(ext);
const zipUrl = (client: string, year?: string, type?: string) =>
  `/api/method/${F}.download_zip?${new URLSearchParams({ tax_client: client, ...(year ? { tax_year: year } : {}), ...(type ? { document_type: type } : {}) })}`;

function FolderTile({ label, count, onOpen }: { label: string; count: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen}
      className="group flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-start transition hover:-translate-y-0.5 hover:border-[#d4af37]/60 hover:shadow-sm">
      <Folder className="h-8 w-8 shrink-0 fill-[#f3d77a]/40 text-[#9c7a22] group-hover:hidden" />
      <FolderOpen className="hidden h-8 w-8 shrink-0 fill-[#f3d77a]/40 text-[#9c7a22] group-hover:block" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{count} {count === 1 ? "file" : "files"}</span>
      </span>
    </button>
  );
}

export function ClientFolders({ taxClient }: { taxClient: string }) {
  const { data, error, isLoading, mutate } = useApi<Tree>(`${F}.tree`, { tax_client: taxClient });
  const [year, setYear] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [preview, setPreview] = useState<FolderFile | null>(null);
  const [history, setHistory] = useState<FolderFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const files = data?.files ?? [];
  const inYear = useMemo(() => files.filter((f) => f.year_folder === year), [files, year]);
  const shown = useMemo(() => inYear.filter((f) => f.document_type === type), [inYear, type]);
  const group = (rows: FolderFile[], key: "year_folder" | "document_type") =>
    Object.entries(rows.reduce<Record<string, number>>((acc, f) => { acc[f[key]] = (acc[f[key]] ?? 0) + 1; return acc; }, {}));

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void mutate()} />;

  const yearFolders = group(files, "year_folder").sort(([a], [b]) => (a === NO_YEAR ? 1 : b === NO_YEAR ? -1 : b.localeCompare(a)));
  const typeFolders = group(inYear, "document_type").sort(([a], [b]) => a.localeCompare(b));
  const crumb = "rounded px-1.5 py-0.5 hover:bg-accent";

  return (
    <section aria-labelledby="folders" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="folders" className="text-lg font-semibold">Client folders</h2>
          <nav aria-label="Folder path" className="mt-1 flex flex-wrap items-center gap-0.5 text-sm">
            <button type="button" className={cn(crumb, "font-medium")} onClick={() => { setYear(null); setType(null); }}>{data.client.folder}</button>
            {year && <><ChevronRight className="h-4 w-4 text-muted-foreground" />
              <button type="button" className={crumb} onClick={() => setType(null)}>{year}</button></>}
            {type && <><ChevronRight className="h-4 w-4 text-muted-foreground" /><span className="px-1.5">{type}</span></>}
          </nav>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setUploading(true)}><Upload className="h-4 w-4" /> Add files</Button>
          {(type ? shown.length : year ? inYear.length : files.length) > 0 && (
            <a className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent"
              href={zipUrl(taxClient, year ?? undefined, type ?? undefined)}><Download className="h-4 w-4" /> Download ZIP</a>
          )}
        </div>
      </div>

      {!files.length ? (
        <Empty title="No files yet" hint="Add files, or they appear here as the client uploads them." />
      ) : !year ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {yearFolders.map(([y, n]) => <FolderTile key={y} label={y} count={n} onOpen={() => setYear(y)} />)}
        </div>
      ) : !type ? (
        typeFolders.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {typeFolders.map(([t, n]) => <FolderTile key={t} label={t} count={n} onOpen={() => setType(t)} />)}
          </div>
        ) : <Empty title="This folder is empty" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
          {shown.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {["jpg", "jpeg", "png"].includes(f.ext) ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.file_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {size(f.file_size)} · added {day(f.upload_date)} · {f.is_client_upload ? "by the client" : f.received_via ? `via ${f.received_via}` : "by staff"}
                </p>
              </div>
              <StateBadge state={f.status} label={STATUS_LABEL[f.status] ?? f.status} />
              {f.versions > 1 && (
                <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-accent"
                  onClick={() => setHistory(f)} title="Older versions"><History className="h-3.5 w-3.5" /> {f.versions}</button>
              )}
              {previewable(f.ext) && (
                <button type="button" className="rounded-md border p-2 hover:bg-accent" aria-label={`Preview ${f.file_name}`} onClick={() => setPreview(f)}>
                  <Eye className="h-4 w-4" /></button>
              )}
              <a className="rounded-md border p-2 hover:bg-accent" aria-label={`Download ${f.file_name}`} target="_blank" rel="noopener"
                href={downloadUrl("Tax Document", f.name, "file", true)}><Download className="h-4 w-4" /></a>
            </li>
          ))}
        </ul>
      )}

      {preview && <Preview file={preview} onClose={() => setPreview(null)} />}
      {history && <Versions file={history} onClose={() => setHistory(null)} />}
      {uploading && <AddFiles tree={data} year={year} type={type} onClose={() => setUploading(false)} onDone={() => void mutate()} />}
    </section>
  );
}

function Preview({ file, onClose }: { file: FolderFile; onClose: () => void }) {
  const url = downloadUrl("Tax Document", file.name, "file", true);
  return (
    <Dialog open onClose={onClose} title={`${file.document_type} · ${file.file_name}`} size="xl">
      <div className="h-[70vh] overflow-hidden rounded-lg border bg-muted/40">
        {file.ext === "pdf"
          ? <iframe title={file.file_name} src={url} className="h-full w-full" />
          : <img src={url} alt={file.file_name} className="mx-auto h-full object-contain" />}
      </div>
    </Dialog>
  );
}

function Versions({ file, onClose }: { file: FolderFile; onClose: () => void }) {
  const { data, error, isLoading } = useApi<Version[]>(`${F}.versions`, { tax_document: file.name });
  return (
    <Dialog open onClose={onClose} title={`Versions of ${file.document_type}`}>
      {isLoading ? <Loading /> : error ? <InlineError error={error} /> : (
        <ul className="divide-y rounded-lg border text-sm">
          {(data ?? []).map((v, i) => (
            <li key={v.name} className="flex items-center gap-3 px-3 py-2">
              <span className="w-8 text-xs font-semibold text-muted-foreground">v{(data?.length ?? 0) - i}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{v.file_name}</span>
                <span className="block text-xs text-muted-foreground">{day(v.creation)} · {size(v.file_size)}</span>
              </span>
              {v.current && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">in use</span>}
              <a className="rounded-md border p-1.5 hover:bg-accent" aria-label={`Download version ${(data?.length ?? 0) - i}`} target="_blank" rel="noopener"
                href={`/api/method/${F}.download_version?${new URLSearchParams({ tax_document: file.name, file: v.name })}`}><Download className="h-4 w-4" /></a>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

type Row = { file: File; state: "waiting" | "uploading" | "done" | "error"; message?: string };

function AddFiles({ tree, year, type, onClose, onDone }: {
  tree: Tree; year: string | null; type: string | null; onClose: () => void; onDone: () => void;
}) {
  const [taxYear, setTaxYear] = useState(year && year !== NO_YEAR ? year.replace(/^TY/, "") : (year === NO_YEAR ? "" : tree.years[0] ?? ""));
  const [docType, setDocType] = useState(type ?? "");
  const [via, setVia] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = (list: FileList | null) => setRows((r) => [...r, ...Array.from(list ?? []).map((file) => ({ file, state: "waiting" as const }))]);
  const tooBig = (f: File) => f.size > tree.max_mb * 1048576;

  const start = async () => {
    setBusy(true);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].state === "done") continue;
      setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "uploading" } : x)));
      try {
        if (tooBig(rows[i].file)) throw new Error(`Larger than ${tree.max_mb} MB`);
        const res = await apiUpload<{ filled_request: boolean }>(`${F}.add_file`, rows[i].file,
          { tax_client: tree.client.name, document_type: docType, tax_year: taxYear, received_via: via });
        setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "done", message: res.filled_request ? "filled the open request" : undefined } : x)));
      } catch (e) {
        setRows((r) => r.map((x, j) => (j === i ? { ...x, state: "error", message: humanizeError(e) } : x)));
      }
    }
    setBusy(false);
    onDone();
  };
  const finished = rows.length > 0 && rows.every((r) => r.state === "done");

  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title={`Add files to ${tree.client.folder}`} size="lg"
      footer={finished ? <Button onClick={onClose}>Done</Button> : <>
        <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={() => void start()} loading={busy} disabled={!docType || !rows.some((r) => r.state !== "done")}>
          Upload {rows.filter((r) => r.state !== "done").length || ""} {rows.filter((r) => r.state !== "done").length === 1 ? "file" : "files"}</Button>
      </>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tax year">
          {(id) => <SelectInput id={id} value={taxYear} onChange={(e) => setTaxYear(e.target.value)} disabled={busy}>
            {tree.years.map((y) => <option key={y} value={y}>TY{y}</option>)}
            <option value="">{NO_YEAR}</option>
          </SelectInput>}
        </Field>
        <Field label="Document type" required>
          {(id) => <SelectInput id={id} value={docType} onChange={(e) => setDocType(e.target.value)} disabled={busy}>
            <option value="">Choose…</option>
            {tree.document_types.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectInput>}
        </Field>
        <Field label="Received via">
          {(id) => <SelectInput id={id} value={via} onChange={(e) => setVia(e.target.value)} disabled={busy}>
            <option value="">—</option>
            {tree.received_via.map((v) => <option key={v} value={v}>{v}</option>)}
          </SelectInput>}
        </Field>
      </div>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
        className="mt-4 flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-sm text-muted-foreground hover:border-[#d4af37] hover:bg-accent/40">
        <Upload className="h-6 w-6" />
        <span className="font-medium text-foreground">Drop files here or click to choose</span>
        <span>PDF, JPG or PNG · up to {tree.max_mb} MB each · each file becomes a document to verify</span>
      </button>
      <input ref={input} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      {rows.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border text-sm">
          {rows.map((r, i) => (
            <li key={`${r.file.name}-${i}`} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate">{r.file.name} <span className="text-xs text-muted-foreground">{size(r.file.size)}</span></span>
              {r.state === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {r.state === "done" && <span className="text-xs font-medium text-emerald-600">Added{r.message ? ` · ${r.message}` : ""}</span>}
              {r.state === "error" && <span className="max-w-[50%] truncate text-xs text-rose-600" title={r.message}>{r.message}</span>}
              {r.state === "waiting" && !busy && (
                <button type="button" aria-label={`Remove ${r.file.name}`} className="rounded p-1 hover:bg-accent"
                  onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
