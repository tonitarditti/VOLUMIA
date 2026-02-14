import type { ReactNode } from "react";

type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  helperText?: ReactNode;
  disabled?: boolean;
  className?: string;
};

export function Toggle({ checked, onChange, label, helperText, disabled = false, className = "" }: ToggleProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 ${className}`}
    >
      <div className="min-w-0">
        {label ? <p className="text-sm text-[var(--text)]">{label}</p> : null}
        {helperText ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{helperText}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50 ${
          checked
            ? "border-[var(--accent)] bg-[var(--accent)]"
            : "border-[var(--border)] bg-[var(--surface-3)]"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-[var(--surface-1)] shadow-sm transition-transform duration-150 ease-out ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

export type { ToggleProps };

