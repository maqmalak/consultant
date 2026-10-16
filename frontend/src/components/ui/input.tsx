import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    return (
      <div className="w-full">
        {label ? (
          <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-foreground">
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error) || undefined}
          className={cn(
            "field",
            error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25",
            className,
          )}
          {...props}
        />
        {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
      </div>
    );
  },
);
Input.displayName = "Input";
