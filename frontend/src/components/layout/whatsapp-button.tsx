import { whatsappLink } from "@/lib/api";
import { useSite } from "./brand";

/** Floating WhatsApp button (wa.me with a pre-filled message). Hidden until the firm's number is set. */
export function WhatsAppButton({ bottomOffset = false }: { bottomOffset?: boolean }) {
  const { data } = useSite();
  const href = whatsappLink(data?.whatsapp, data?.whatsapp_message);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"
      className={`fixed end-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40 ${bottomOffset ? "bottom-20 sm:bottom-6" : "bottom-6"}`}>
      <svg viewBox="0 0 32 32" className="h-7 w-7 fill-current" aria-hidden>
        <path d="M16.04 3C8.86 3 3.02 8.83 3.02 16.01c0 2.3.6 4.54 1.75 6.52L3 29l6.65-1.74a12.98 12.98 0 0 0 6.39 1.67h.01c7.18 0 13.02-5.84 13.02-13.02 0-3.48-1.36-6.75-3.82-9.21A12.93 12.93 0 0 0 16.04 3Zm0 23.73h-.01a10.8 10.8 0 0 1-5.5-1.5l-.4-.24-3.95 1.03 1.05-3.85-.26-.4a10.77 10.77 0 0 1-1.65-5.75c0-5.96 4.85-10.81 10.82-10.81 2.89 0 5.6 1.13 7.64 3.17a10.73 10.73 0 0 1 3.17 7.65c0 5.96-4.86 10.8-10.81 10.8Zm5.93-8.09c-.33-.16-1.93-.95-2.23-1.06-.3-.11-.52-.16-.73.16-.22.33-.84 1.06-1.03 1.28-.19.22-.38.24-.71.08-.33-.16-1.38-.51-2.62-1.62-.97-.87-1.62-1.93-1.81-2.26-.19-.33-.02-.5.14-.67.15-.15.33-.38.49-.57.16-.19.22-.33.33-.55.11-.22.05-.41-.03-.57-.08-.16-.73-1.77-1-2.42-.27-.64-.54-.55-.73-.56h-.62c-.22 0-.57.08-.87.41-.3.33-1.14 1.11-1.14 2.71s1.17 3.15 1.33 3.36c.16.22 2.3 3.51 5.57 4.92.78.34 1.39.54 1.86.69.78.25 1.49.21 2.05.13.63-.09 1.93-.79 2.2-1.55.27-.76.27-1.42.19-1.55-.08-.14-.3-.22-.62-.38Z" />
      </svg>
    </a>
  );
}
