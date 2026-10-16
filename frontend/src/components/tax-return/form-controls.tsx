import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

interface NumberInputProps {
  field: any;
  label?: string;
  emptyValue?: number;
  step?: number;
  min?: number;
}

export function NumberInput({ field, label, emptyValue = 0, step = 0.01, min = 0 }: NumberInputProps) {
  const [value, setValue] = useState<number | string>(field.value ?? emptyValue);

  useEffect(() => {
    setValue(field.value ?? emptyValue);
  }, [field.value, emptyValue]);

  const commit = useCallback(
    (next: number | string) => {
      const n = typeof next === "string" ? (next === "" ? undefined : Number(next)) : next;
      if (n === undefined || Number.isNaN(Number(n))) {
        field.onChange(undefined);
      } else {
        field.onChange(Number(n));
      }
      setValue(n);
    },
    [field],
  );

  return (
    <Input
      {...field}
      value={typeof value === "number" ? String(value) : value}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      label={label}
      step={step}
      min={min}
    />
  );
}

export function SaveIndicator({ saving, message }: { saving: boolean; message: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      {saving ? (
        <>
          <Spinner className="h-3.5 w-3.5 text-brand-500" />
          Saving {message}…
        </>
      ) : (
        <span className="truncate">{message}</span>
      )}
    </div>
  );
}
