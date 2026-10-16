import { Camera, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { humanizeError } from "@/services/frappe";

const ACCEPT = "application/pdf,image/jpeg,image/png";
const MAX_MB = 10;

/** Shrink large photos in the browser (long side 2000px, JPEG 0.82) before upload. PDFs pass through. */
export async function compressImage(file: File): Promise<{ blob: Blob; name: string }> {
  if (!file.type.startsWith("image/") || file.size < 900 * 1024) return { blob: file, name: file.name };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return { blob: file, name: file.name };
    return { blob, name: file.name.replace(/\.(png|jpe?g)$/i, "") + ".jpg" };
  } catch {
    return { blob: file, name: file.name };
  }
}

interface Props {
  onUpload: (blob: Blob, filename: string) => Promise<unknown>;
  label?: string;
  camera?: boolean;
  disabled?: boolean;
  onDone?: () => void;
}

/** Upload button with an optional "Take photo" (rear camera on phones). Validates type and size first. */
export function FileUpload({ onUpload, label, camera = true, disabled, onDone }: Props) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file?: File) {
    if (!file) return;
    setError(null);
    if (!ACCEPT.split(",").includes(file.type)) {
      setError("Only PDF, JPG or PNG files are accepted.");
      return;
    }
    const { blob, name } = await compressImage(file);
    if (blob.size > MAX_MB * 1024 * 1024) {
      setError(`File is larger than ${MAX_MB} MB.`);
      return;
    }
    setBusy(true);
    try {
      await onUpload(blob, name);
      onDone?.();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (camRef.current) camRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" loading={busy} disabled={disabled}
          onClick={() => fileRef.current?.click()}>
          {!busy && <Upload className="h-4 w-4" />} {label ?? t("Upload")}
        </Button>
        {camera && (
          <Button type="button" size="sm" variant="ghost" disabled={disabled || busy} onClick={() => camRef.current?.click()}
            className="sm:hidden">
            <Camera className="h-4 w-4" /> {t("Take photo")}
          </Button>
        )}
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" aria-label={label ?? t("Upload")}
        onChange={(e) => void handle(e.target.files?.[0])} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => void handle(e.target.files?.[0])} />
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
