import { useId, type ReactNode, type SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
  children: ReactNode;
};

export function Select({
  label,
  error,
  helperText,
  id,
  className = "",
  containerClassName = "",
  children,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={`space-y-1 ${containerClassName}`}>
      {label ? <label htmlFor={selectId} className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</label> : null}
      <div className="relative">
        <select
          id={selectId}
          className={`h-10 w-full appearance-none rounded-lg border bg-[var(--surface-3)] px-3 pr-9 text-sm text-[var(--text)] outline-none transition duration-150 ease-out focus:ring-2 focus:ring-[var(--focus-ring)] ${
            error ? "border-[var(--danger)] focus:border-[var(--danger)]" : "border-[var(--border)] focus:border-[var(--accent)]"
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">v</span>
      </div>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-[var(--text-muted)]">{helperText}</p> : null}
    </div>
  );
}

export type { SelectProps };

