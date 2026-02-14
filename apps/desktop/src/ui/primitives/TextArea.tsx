import { useId, type TextareaHTMLAttributes } from "react";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  helperText?: string;
  error?: string;
  containerClassName?: string;
};

export function TextArea({
  label,
  helperText,
  error,
  id,
  className = "",
  containerClassName = "",
  ...props
}: TextAreaProps) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;

  return (
    <div className={`space-y-1 ${containerClassName}`}>
      {label ? <label htmlFor={textareaId} className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</label> : null}
      <textarea
        id={textareaId}
        className={`min-h-24 w-full resize-y rounded-lg border bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] outline-none transition duration-150 ease-out placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-[var(--focus-ring)] ${
          error ? "border-[var(--danger)] focus:border-[var(--danger)]" : "border-[var(--input-border)] focus:border-[var(--accent)]"
        } ${className}`}
        {...props}
      />
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-[var(--text-muted)]">{helperText}</p> : null}
    </div>
  );
}

export const Textarea = TextArea;

export type { TextAreaProps };
