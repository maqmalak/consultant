import { useFieldArray, Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { configFor } from "./tax-return-config";

interface ChildTableEditorProps {
  name: string;
  control: any;
  label: string;
  flex?: number;
}

export function ChildTableEditor({ name, control, label, flex = 1 }: ChildTableEditorProps) {
  const { fields, append, remove } = useFieldArray({ control, name });
  const config = configFor(name) ?? configFor("Tax Return Income");

  return (
    <div className={`rounded-b-xl border border-border bg-muted/40 ${flex > 1 ? "lg:col-span-2" : ""}`}>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
            <Badge variant="outline" className="text-xs">{config.doctype.split(" ").join("")}</Badge>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-primary hover:text-primary"
            onClick={() => append(config.doctype, {})}
          >
            + Add row
          </button>
        </div>
      </div>
      <div className="px-4 pb-4">
        {fields.length === 0 ? (
          <p className="py-4 text-xs text-muted-foreground">No rows. Add a row to begin.</p>
        ) : (
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={f.id} className="flex gap-2 border border-border rounded-lg px-3 py-2 hover:bg-card">
                {config.fields.map((field) => (
                  <Controller
                    key={field.fieldname}
                    control={control}
                    name={`${name}.${i}.${field.fieldname}` as const}
                    render={({ field: fld }) => (
                      <Input
                        {...fld}
                        value={(fld.value ?? "").toString()}
                        onBlur={(e) => {
                          const val = e.target.value === "" ? undefined : e.target.value;
                          fld.onChange(val);
                        }}
                        placeholder={`${label} ${field.label}`}
                        className="flex-1 min-w-0"
                      />
                    )}
                  />
                ))}
                <button
                  type="button"
                  className="flex-shrink-0 rounded-lg p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                  onClick={() => remove(i)}
                  aria-label="Remove row"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
