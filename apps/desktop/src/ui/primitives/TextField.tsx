import { useId, type InputHTMLAttributes } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  containerClassName?: string;
};

export function TextField({ label, error, id, className = "", containerClassName = "", ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={`space-y-1 ${containerClassName}`}>
      {label ? <label htmlFor={inputId} className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</label> : null}
      <input
        id={inputId}
        className={`h-10 w-full rounded-lg border bg-[var(--input-bg)] px-3 text-sm text-[var(--text)] outline-none transition duration-150 ease-out placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus-ring)] ${
          error ? "border-[var(--danger)] focus:border-[var(--danger)]" : "border-[var(--input-border)] focus:border-[var(--accent)]"
        } ${className}`}
        {...props}
      />
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export const Input = TextField;

export type { TextFieldProps };
