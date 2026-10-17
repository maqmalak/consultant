import { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { cn } from "@/lib/cn";

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ align: [] }],
  ["link"],
  ["clean"],
];

const EMPTY_HTML = "<p><br></p>";

/**
 * Ported from the realestate app. WYSIWYG HTML editor for ERPNext "Text Editor" fields (Quill — the same
 * rich-text engine Frappe's own desk uses for this fieldtype), so content
 * like Terms and Conditions templates, CRM notes, etc. is authored the same
 * way it would be in ERPNext itself, rather than as a plain-text/HTML blob.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  readOnly,
  className,
  minHeight = 140,
}: {
  value?: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
  /** Editing area height in px (remarks: ~120, emails / templates: 240+). */
  minHeight?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    // Quill's snow theme inserts the toolbar as a *sibling* of the element it's
    // given, in that element's parent — so a dedicated wrapper (rather than
    // appending the editor div straight into containerRef) means cleanup can
    // remove everything Quill created (toolbar included) in one shot, however
    // exactly it laid the DOM out. Without it, only the editor div would be
    // removed, leaving an orphaned toolbar behind — most visible under
    // StrictMode's dev-only double mount/cleanup/mount, which otherwise looks
    // like two stacked toolbars.
    const wrapper = document.createElement("div");
    containerRef.current.appendChild(wrapper);
    const editorEl = document.createElement("div");
    wrapper.appendChild(editorEl);

    const quill = new Quill(editorEl, {
      theme: "snow",
      placeholder,
      readOnly,
      modules: { toolbar: readOnly ? false : TOOLBAR },
    });
    quill.root.style.minHeight = `${minHeight}px`;
    if (value) quill.clipboard.dangerouslyPasteHTML(value);
    quill.on("text-change", () => {
      const html = quill.root.innerHTML;
      onChangeRef.current(html === EMPTY_HTML ? "" : html);
    });
    quillRef.current = quill;

    return () => {
      quillRef.current = null;
      wrapper.remove();
    };
    // Toolbar/readOnly are fixed for the editor's lifetime — changing them
    // would need a full re-mount anyway, so they're deliberately excluded
    // from deps rather than tearing down and rebuilding Quill on every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the editor in sync with external value changes (e.g. switching
  // which record is being edited) without clobbering the user's own typing —
  // only pushed in when it actually differs from what Quill already holds.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const current = quill.root.innerHTML === EMPTY_HTML ? "" : quill.root.innerHTML;
    if ((value ?? "") !== current) {
      quill.clipboard.dangerouslyPasteHTML(value ?? "");
    }
  }, [value]);

  return <div ref={containerRef} className={cn("rich-text-editor rounded-md border border-input", className)} />;
}

/** Strip tags for previews / "is it empty?" checks. */
export const htmlText = (html?: string | null) => (html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();

/** Show stored rich text (already sanitised on the server). */
export function RichText({ html, className }: { html?: string | null; className?: string }) {
  return <div className={cn("rich-text-view max-w-none text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_ol]:list-decimal [&_ol]:ps-5 [&_ul]:list-disc [&_ul]:ps-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:font-semibold [&_p]:my-1", className)}
    dangerouslySetInnerHTML={{ __html: html ?? "" }} />;
}
