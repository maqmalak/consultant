/**
 * Help centre (ported from the sugarcane help page): user manuals for the signed-in person's roles (manuals/*.md, rendered
 * on the server), A4 guides with screenshots and demo videos, grouped by the stage of the work. Each manual shows its own
 * guides and videos at the top. Team at /staff/help, clients at /help. Data: pakistan_tax_consultancy.api.help.
 */
import {
  ArrowUpRight, BarChart3, BookOpen, ClipboardCheck, FileCheck2, FileSpreadsheet, FileText, Filter, FolderOpen, Landmark,
  LifeBuoy, Link2, ListTree, type LucideIcon, MapPin, PenLine, PlayCircle, Printer, Rocket, Search, Send, Settings2,
  ShieldCheck, Sparkles, UserCheck, UserCog, UserPlus, Users, Video, Wallet, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Loading } from "@/components/common/states";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";

const API = "pakistan_tax_consultancy.api.help";
interface Entry { slug: string; title: string; roles: string[]; mine: boolean }
interface Guide { slug: string; order: number; stage: string; title: string; kind: "Guide" | "Video"; summary: string; roles: string[];
  pdf_url: string | null; video_url: string | null; mine: boolean }
interface Manual { slug: string; title: string; roles: string[]; html: string; guides: Guide[] }

const HUE = {
  gold: { cover: "from-[#d4af37]/30 via-[#d4af37]/10 to-transparent", tile: "bg-gradient-to-br from-[#f3d77a] via-[#d4af37] to-[#9c7a22] !text-[#141416]", text: "text-[#9c7a22] dark:text-[#f3d77a]" },
  sky: { cover: "from-sky-500/25 via-sky-500/10 to-transparent", tile: "bg-gradient-to-br from-sky-400 to-sky-600", text: "text-sky-600 dark:text-sky-400" },
  emerald: { cover: "from-emerald-500/25 via-emerald-500/10 to-transparent", tile: "bg-gradient-to-br from-emerald-400 to-emerald-600", text: "text-emerald-600 dark:text-emerald-400" },
  amber: { cover: "from-amber-500/25 via-amber-500/10 to-transparent", tile: "bg-gradient-to-br from-amber-400 to-orange-500", text: "text-amber-600 dark:text-amber-400" },
  violet: { cover: "from-violet-500/25 via-violet-500/10 to-transparent", tile: "bg-gradient-to-br from-violet-400 to-purple-600", text: "text-violet-600 dark:text-violet-400" },
  rose: { cover: "from-rose-500/25 via-rose-500/10 to-transparent", tile: "bg-gradient-to-br from-rose-400 to-rose-600", text: "text-rose-600 dark:text-rose-400" },
  indigo: { cover: "from-indigo-500/25 via-indigo-500/10 to-transparent", tile: "bg-gradient-to-br from-indigo-400 to-indigo-600", text: "text-indigo-600 dark:text-indigo-400" },
  teal: { cover: "from-teal-500/25 via-teal-500/10 to-transparent", tile: "bg-gradient-to-br from-teal-400 to-teal-600", text: "text-teal-600 dark:text-teal-400" },
  slate: { cover: "from-slate-500/25 via-slate-500/10 to-transparent", tile: "bg-gradient-to-br from-slate-400 to-slate-600", text: "text-slate-600 dark:text-slate-300" },
} as const;
type Hue = keyof typeof HUE;

const STAGE_HUE: Record<string, Hue> = {
  "Start here": "gold", "Clients & intake": "sky", Documents: "emerald", "Return work": "violet", "Fees & records": "amber", Tools: "indigo",
};
const GUIDE_ICON: Record<string, [LucideIcon, Hue]> = {
  "process-overview": [Rocket, "gold"], setup: [Settings2, "slate"], "new-client": [UserPlus, "sky"], "excel-import": [FileSpreadsheet, "teal"],
  "site-visits": [MapPin, "sky"], "client-portal": [Users, "emerald"], documents: [FolderOpen, "emerald"], preparation: [PenLine, "violet"],
  "review-approval": [ClipboardCheck, "violet"], filing: [Send, "indigo"], payments: [Wallet, "amber"], "vault-letters": [ShieldCheck, "amber"],
  "ask-vvs": [Sparkles, "gold"], reports: [BarChart3, "indigo"],
};
const MANUAL_ICON: Record<string, [LucideIcon, Hue]> = {
  "getting-started": [Rocket, "gold"], client: [Users, "emerald"], consultant: [PenLine, "violet"], "data-entry": [FileCheck2, "teal"],
  reviewer: [ClipboardCheck, "violet"], approver: [UserCheck, "emerald"], "filing-officer": [Landmark, "indigo"], "field-officer": [MapPin, "sky"],
  admin: [UserCog, "slate"],
};
const guideLook = (g: Guide): [LucideIcon, Hue] => GUIDE_ICON[g.slug] ?? [g.kind === "Video" ? PlayCircle : FileText, STAGE_HUE[g.stage] ?? "slate"];
const manualLook = (slug: string): [LucideIcon, Hue] => MANUAL_ICON[slug] ?? [BookOpen, "slate"];
const absolute = (u: string) => (u.startsWith("http") ? u : `${window.location.origin}${u}`);

function copy(text: string) {
  const done = () => toast.success("Link copied");
  if (navigator.clipboard && window.isSecureContext) { void navigator.clipboard.writeText(text).then(done); return; }
  const t = document.createElement("textarea");
  t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
  document.body.appendChild(t); t.select();
  try { document.execCommand("copy"); done(); } finally { t.remove(); }
}

function CopyBtn({ url, label, className }: { url: string; label?: string; className?: string }) {
  return (
    <button type="button" onClick={() => copy(url)} title={`Copy link: ${url}`} aria-label={label ?? "Copy link"}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg border bg-background/85 px-2 py-1.5 text-xs font-semibold hover:bg-accent", className)}>
      <Link2 className="h-3.5 w-3.5" />{label}</button>
  );
}

const match = (q: string, ...text: (string | undefined)[]) => !q || text.some((t) => (t ?? "").toLowerCase().includes(q));

function Tile({ icon: I, hue, size = "md" }: { icon: LucideIcon; hue: Hue; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "h-7 w-7 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5", md: "h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5", lg: "h-12 w-12 rounded-2xl [&_svg]:h-6 [&_svg]:w-6" }[size];
  return <span className={cn("grid shrink-0 place-items-center text-white shadow-md ring-1 ring-white/20", HUE[hue].tile, s)}><I strokeWidth={2.2} /></span>;
}

function VideoModal({ g, onClose }: { g: Guide; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  const [I, hue] = guideLook(g);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={g.title} className="w-full max-w-6xl overflow-hidden rounded-3xl bg-zinc-950 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-3 text-white">
          <Tile icon={I} hue={hue} size="sm" />
          <div className="min-w-0"><div className="truncate font-semibold">{g.title}</div><div className="truncate text-xs text-white/50">{g.stage}</div></div>
          {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"><FileText className="h-3.5 w-3.5" />Guide (PDF)</a>}
          <button type="button" onClick={onClose} className={cn("rounded-lg p-1.5 hover:bg-white/10", !g.pdf_url && "ms-auto")} aria-label="Close (Esc)"><X className="h-5 w-5" /></button>
        </div>
        <video src={g.video_url!} controls autoPlay className="aspect-video w-full bg-black" />
      </div>
    </div>
  );
}

function GuideCard({ g, onPlay, active, link }: { g: Guide; onPlay: (g: Guide) => void; active?: boolean; link: string }) {
  const [I, hue] = guideLook(g);
  return (
    <article id={`g-${g.slug}`} className={cn("group flex scroll-mt-24 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl", active && "ring-4 ring-[#d4af37]/50")}>
      <div className={cn("relative flex h-28 items-end gap-3 bg-gradient-to-br p-4", HUE[hue].cover)}>
        <span className={cn("absolute end-4 top-2 text-6xl font-black tabular-nums opacity-[0.14]", HUE[hue].text)}>{String(g.order).padStart(2, "0")}</span>
        <div className="transition-transform duration-200 group-hover:scale-110"><Tile icon={I} hue={hue} size="lg" /></div>
        <div className="flex flex-wrap gap-1 pb-0.5">
          {g.pdf_url && <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"><FileText className="h-3 w-3" />Guide</span>}
          {g.video_url && <span className="inline-flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm"><Video className="h-3 w-3" />Video</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug">{g.title}</h3>
        <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{g.summary}</p>
        <div className="mt-auto flex gap-2 pt-4">
          {g.video_url && <button type="button" onClick={() => onPlay(g)}
            className={cn("inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90", HUE[hue].tile)}><PlayCircle className="h-4 w-4" />Watch</button>}
          {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer"
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold hover:bg-accent"><FileText className="h-4 w-4" />Read<ArrowUpRight className="h-3.5 w-3.5 opacity-60" /></a>}
          <CopyBtn url={link} className="h-9 rounded-xl px-2.5" />
        </div>
      </div>
    </article>
  );
}

function MiniGuide({ g, onPlay }: { g: Guide; onPlay: (g: Guide) => void }) {
  const [I, hue] = guideLook(g);
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border bg-gradient-to-br p-3", HUE[hue].cover)}>
      <Tile icon={I} hue={hue} />
      <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{g.title}</div><div className="truncate text-xs text-muted-foreground">{g.stage}</div></div>
      {g.video_url && <button type="button" onClick={() => onPlay(g)} className="rounded-lg bg-background/85 p-2 shadow-sm hover:bg-background" aria-label={`Watch ${g.title}`}><PlayCircle className="h-4 w-4" /></button>}
      {g.pdf_url && <a href={g.pdf_url} target="_blank" rel="noreferrer" className="rounded-lg bg-background/85 p-2 shadow-sm hover:bg-background" aria-label={`Read ${g.title} (PDF)`}><FileText className="h-4 w-4" /></a>}
    </div>
  );
}

function LinksTable({ guides, manuals, query, links }: { guides: Guide[]; manuals: Entry[]; query: string; links: ReturnType<typeof makeLinks> }) {
  const gs = guides.filter((g) => match(query, g.title, g.stage));
  const ms = manuals.filter((m) => match(query, m.title));
  const cell = "px-3 py-2 align-top";
  const Url = ({ url, open }: { url: string; open?: boolean }) => (
    <div className="flex items-center gap-1.5">
      <a href={url} target={open ? "_blank" : undefined} rel="noreferrer" className="min-w-0 truncate font-mono text-xs text-primary hover:underline">{url.replace(/^https?:\/\//, "")}</a>
      <CopyBtn url={url} className="shrink-0 px-1.5 py-1" />
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <Link2 className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1 text-sm"><div className="font-semibold">Guide Book</div><div className="text-muted-foreground">Share these links on WhatsApp or by email. People sign in first, then land on the page.</div></div>
        <Url url={links.home} /><Url url={links.guidesHome} />
      </div>
      <section className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">Guides &amp; videos · {gs.length}</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-start text-xs"><tr><th className={cell}>#</th><th className={cell}>Title</th><th className={cell}>Page</th><th className={cell}>Guide (PDF)</th><th className={cell}>Video</th></tr></thead>
          <tbody>{gs.map((g) => (
            <tr key={g.slug} className="border-t">
              <td className={cn(cell, "tabular-nums text-muted-foreground")}>{String(g.order).padStart(2, "0")}</td>
              <td className={cn(cell, "min-w-48")}><div className="font-medium">{g.title}</div><div className="text-xs text-muted-foreground">{g.stage}</div></td>
              <td className={cn(cell, "max-w-72")}><Url url={links.guide(g.slug)} /></td>
              <td className={cn(cell, "max-w-72")}>{g.pdf_url ? <Url url={absolute(g.pdf_url)} open /> : <span className="text-muted-foreground">—</span>}</td>
              <td className={cn(cell, "max-w-72")}>{g.video_url ? <Url url={links.video(g.slug)} /> : <span className="text-muted-foreground">—</span>}</td>
            </tr>))}</tbody>
        </table>
      </section>
      <section className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-4 py-3 font-semibold">User manuals · {ms.length}</div>
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-start text-xs"><tr><th className={cell}>Manual</th><th className={cell}>For</th><th className={cell}>Page</th></tr></thead>
          <tbody>{ms.map((m) => (
            <tr key={m.slug} className="border-t">
              <td className={cn(cell, "font-medium")}>{m.title}</td>
              <td className={cn(cell, "text-xs text-muted-foreground")}>{m.roles.includes("all") ? "Everyone in the team" : m.roles.join(", ")}</td>
              <td className={cn(cell, "max-w-80")}><Url url={links.manual(m.slug)} /></td>
            </tr>))}</tbody>
        </table>
      </section>
    </div>
  );
}

function withOutline(html: string) {
  const toc: { id: string; text: string }[] = [];
  const out = html.replace(/<h2([^>]*)>(.*?)<\/h2>/g, (_m, attrs: string, inner: string) => {
    const id = `sec-${toc.length + 1}`;
    toc.push({ id, text: inner.replace(/<[^>]+>/g, "") });
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });
  return { html: out, toc };
}

/** Shareable addresses: the portal is served under /portal (the router basename). */
function makeLinks(base: string) {
  const root = `${window.location.origin}/portal${base}`;
  return {
    home: root, guidesHome: `${root}/guides`,
    guide: (slug: string) => `${root}/guides?g=${slug}`,
    video: (slug: string) => `${root}/guides?g=${slug}&play=1`,
    manual: (slug: string) => `${root}?m=${slug}`,
  };
}

/** `base` is "/staff/help" for the team and "/help" for clients. */
export function HelpPage({ base }: { base: string }) {
  const [params, setParams] = useSearchParams();
  const [playing, setPlaying] = useState<Guide | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "Guide" | "Video" | "mine" | "links">(params.get("view") === "links" ? "links" : "all");
  const focus = params.get("g");
  const loc = useLocation();
  const navigate = useNavigate();
  const links = useMemo(() => makeLinks(base), [base]);
  const tab = loc.pathname.endsWith("/guides") ? "guides" : "manuals";
  const goTab = (k: "manuals" | "guides") => navigate(k === "guides" ? `${base}/guides` : base, { replace: true });
  const list = useApi<Entry[]>(`${API}.manuals`);
  const guides = useApi<Guide[]>(`${API}.guides`);
  const first = list.data?.find((m) => m.mine && m.slug !== "getting-started")?.slug ?? list.data?.[0]?.slug;
  const slug = params.get("m") || first || "";
  const doc = useApi<Manual>(slug && tab === "manuals" ? `${API}.manual` : null, { slug });
  const query = q.trim().toLowerCase();

  const all = useMemo(() => guides.data ?? [], [guides.data]);
  const shownGuides = all.filter((g) => match(query, g.title, g.summary, g.stage, g.roles.join(" "))
    && (kind === "all" || kind === "links" || (kind === "mine" ? g.mine : kind === "Video" ? !!g.video_url : !!g.pdf_url)));
  const stages = [...shownGuides.reduce((m, g) => m.set(g.stage, [...(m.get(g.stage) ?? []), g]), new Map<string, Guide[]>()).entries()];
  const manuals = (list.data ?? []).filter((m) => match(query, m.title, m.roles.join(" ")));
  const outline = useMemo(() => withOutline(doc.data?.html ?? ""), [doc.data?.html]);
  const counts = { guides: all.filter((g) => g.pdf_url).length, videos: all.filter((g) => g.video_url).length, manuals: list.data?.length ?? 0 };
  const [MI, mhue] = manualLook(slug);

  useEffect(() => {  // ?g=<slug> scrolls to that guide's card; &play=1 also opens its video
    if (!focus || !guides.data || tab !== "guides") return;
    const g = guides.data.find((x) => x.slug === focus);
    if (!g) return;
    if (params.get("play") === "1" && g.video_url) setPlaying(g);
    requestAnimationFrame(() => document.getElementById(`g-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [focus, guides.data, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page-container space-y-6">
      <section className="relative overflow-hidden rounded-3xl hero-dark p-6 text-white sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-16 h-72 w-72 rounded-full bg-[#d4af37]/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 start-1/3 h-60 w-60 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Tile icon={LifeBuoy} hue="gold" size="lg" />
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4af37]">Guide Book</div>
            </div>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">How can we help?</h1>
            <p className="mt-1 max-w-2xl text-sm text-white/65">Manuals for your role, step-by-step guides with screenshots, and demo videos, in the order the work flows.</p>
            <div className="relative mt-4 max-w-xl">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search help" placeholder="Search manuals, guides and videos — e.g. IRIS, documents, import"
                className="h-11 w-full rounded-xl border bg-background/95 pe-10 ps-10 text-sm text-foreground shadow-sm outline-none ring-[#d4af37]/40 focus:ring-4" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute end-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>}
            </div>
          </div>
          <div className="flex gap-2">
            {([["Manuals", counts.manuals, BookOpen, "sky"], ["Guides", counts.guides, FileText, "emerald"], ["Videos", counts.videos, PlayCircle, "violet"]] as const).map(([l, n, I, h]) => (
              <div key={l} className="min-w-24 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                <Tile icon={I} hue={h} size="sm" /><div className="mt-2 font-display text-2xl font-semibold tabular-nums">{n}</div><div className="text-[11px] text-white/50">{l}</div></div>
            ))}
          </div>
        </div>
        <div className="relative mt-6 inline-flex rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur">
          {([["manuals", "User manuals", BookOpen], ["guides", "Guides & videos", PlayCircle]] as const).map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => goTab(k)}
              className={cn("inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors", tab === k ? "bg-[#d4af37] text-[#141416] shadow" : "text-white/60 hover:text-white")}>
              <I className="h-4 w-4" />{l}</button>))}
        </div>
      </section>

      {tab === "guides" ? (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {([["all", `All · ${all.length}`], ["Guide", `PDF guides · ${counts.guides}`], ["Video", `Videos · ${counts.videos}`], ["mine", `For my role · ${all.filter((g) => g.mine).length}`], ["links", "Page links"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={cn("rounded-full border px-3 py-1 text-xs font-semibold transition-colors", kind === k ? "border-[#d4af37] bg-[#d4af37]/10 text-[#9c7a22] dark:text-[#f3d77a]" : "text-muted-foreground hover:bg-accent")}>{l}</button>))}
          </div>
          {!guides.data && <Loading />}
          {guides.data && !all.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No guides or videos on this server yet.</div>}
          {guides.data && all.length > 0 && !shownGuides.length && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</div>}
          {kind === "links" ? <LinksTable guides={all} manuals={list.data ?? []} query={query} links={links} /> : stages.map(([stage, items], si) => {
            const h = STAGE_HUE[stage] ?? "slate";
            return (
              <section key={stage}>
                <div className="mb-3 flex items-center gap-3">
                  <span className={cn("grid h-8 w-8 place-items-center rounded-full text-sm font-bold text-white shadow-md", HUE[h].tile)}>{si + 1}</span>
                  <h2 className="text-lg font-semibold">{stage}</h2>
                  <span className="text-xs text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {items.map((g) => <GuideCard key={g.slug} g={g} onPlay={setPlaying} active={g.slug === focus} link={links.guide(g.slug)} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)] xl:grid-cols-[270px_minmax(0,1fr)_220px]">
          <nav aria-label="Manuals" className="h-fit rounded-2xl border bg-card p-2 shadow-sm lg:sticky lg:top-20">
            <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manuals · {manuals.length}</div>
            {!list.data && <Loading />}
            {manuals.map((m) => {
              const active = m.slug === slug;
              const [I, h] = manualLook(m.slug);
              return (
                <button key={m.slug} type="button" onClick={() => setParams({ m: m.slug }, { replace: true })}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-start text-sm transition-colors", active ? "bg-[#d4af37]/15 font-semibold" : "hover:bg-accent")}>
                  <Tile icon={I} hue={h} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {m.mine && m.slug !== "getting-started" && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" title="For your role" />}
                </button>
              );
            })}
            {list.data && !manuals.length && <div className="px-3 py-4 text-xs text-muted-foreground">No manual matches “{q}”.</div>}
            <button type="button" onClick={() => goTab("guides")}
              className="mt-2 flex w-full items-center gap-3 rounded-xl border-t px-2.5 py-2.5 text-start text-sm font-semibold hover:bg-accent">
              <Tile icon={PlayCircle} hue="violet" size="sm" />Guides & videos<ArrowUpRight className="ms-auto h-3.5 w-3.5 text-muted-foreground" /></button>
          </nav>

          <article className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm">
            {!doc.data ? <div className="p-8"><Loading /></div> : (
              <>
                <header className={cn("border-b bg-gradient-to-br px-6 py-5 sm:px-8", HUE[mhue].cover)}>
                  <div className="flex flex-wrap items-start gap-4">
                    <Tile icon={MI} hue={mhue} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[11px] font-semibold uppercase tracking-wider", HUE[mhue].text)}>User manual</div>
                      <h2 className="mt-0.5 text-2xl font-bold tracking-tight">{doc.data.title}</h2>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {doc.data.roles.filter((r) => r !== "all").map((r) => <span key={r} className="rounded-md border bg-background/70 px-2 py-0.5 text-[11px] font-medium">{r}</span>)}
                        {doc.data.roles.includes("all") && <span className="rounded-md border bg-background/70 px-2 py-0.5 text-[11px] font-medium">Everyone in the team</span>}
                      </div>
                    </div>
                    <CopyBtn url={links.manual(doc.data.slug)} label="Copy link" className="h-9 rounded-xl px-3 text-sm print:hidden" />
                    <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-xl border bg-background px-3 text-sm font-semibold hover:bg-accent print:hidden"><Printer className="h-4 w-4" />Print</button>
                  </div>
                  {doc.data.guides.length > 0 && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 print:hidden">
                      {doc.data.guides.map((g) => <MiniGuide key={g.slug} g={g} onPlay={setPlaying} />)}
                    </div>
                  )}
                </header>
                <div className="max-w-3xl space-y-3 px-6 py-6 text-[15px] leading-7 sm:px-8 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_h1]:hidden [&_h2]:mt-8 [&_h2]:scroll-mt-24 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:font-semibold [&_li]:ms-5 [&_li]:ps-1 [&_li::marker]:text-[#d4af37] [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_strong]:font-semibold [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1.5"
                  dangerouslySetInnerHTML={{ __html: outline.html }} />
              </>
            )}
          </article>

          <aside className="hidden h-fit xl:sticky xl:top-20 xl:block">
            {outline.toc.length > 0 && (
              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><ListTree className="h-3.5 w-3.5" />On this page</div>
                <ol className="space-y-1 border-s ps-3 text-sm">
                  {outline.toc.map((t) => <li key={t.id}><a href={`#${t.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth" }); }}
                    className="block truncate py-0.5 text-muted-foreground hover:text-[#9c7a22] dark:hover:text-[#f3d77a]">{t.text}</a></li>)}
                </ol>
              </div>
            )}
          </aside>
        </div>
      )}
      {playing && <VideoModal g={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
