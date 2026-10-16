import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSite } from "@/components/layout/brand";
import { ErrorState, InlineError, Loading } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { M, portal, whatsappLink, type Message } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useApi } from "@/lib/use-api";

export function MessagesPage() {
  const { t } = useTranslation();
  const { data, error, isLoading, mutate } = useApi<Message[]>(`${M.PORTAL}.messages`, undefined, { refreshInterval: 30_000 });
  const site = useSite().data;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [data?.length]);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={() => void mutate()} />;
  const wa = whatsappLink(site?.whatsapp, site?.whatsapp_message);
  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col gap-3 md:h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t("Messages")}</h1>
        {wa && <a href={wa} target="_blank" rel="noopener" className="text-sm font-medium text-[#128C7E] hover:underline">WhatsApp ↗</a>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border bg-card p-3 scrollbar-thin">
        {(data ?? []).length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Write to your consultant — we usually reply the same working day.</p>}
        {(data ?? []).map((m) => (
          <div key={m.name} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm", m.from_client
            ? "ms-auto rounded-ee-sm bg-primary text-primary-foreground" : "me-auto rounded-es-sm bg-muted")}>
            <p className="whitespace-pre-wrap">{m.message}</p>
            <p className={cn("mt-1 text-[10px]", m.from_client ? "text-primary-foreground/75" : "text-muted-foreground")}>
              {m.from_client ? "You" : m.sender_name} · {new Date(m.creation).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
            </p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <InlineError error={err} />
      <form className="flex items-end gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setBusy(true);
        setErr(null);
        try {
          await portal.sendMessage(text.trim());
          setText("");
          await mutate();
        } catch (ex) {
          setErr(ex);
        } finally {
          setBusy(false);
        }
      }}>
        <TextArea aria-label={t("Messages")} value={text} onChange={(e) => setText(e.target.value)} className="min-h-[48px] flex-1" rows={2} maxLength={2000} />
        <Button type="submit" size="lg" loading={busy} disabled={!text.trim()} aria-label={t("Send")}><Send className="h-4 w-4 rtl:-scale-x-100" /></Button>
      </form>
    </div>
  );
}
