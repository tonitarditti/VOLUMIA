import type { InputHTMLAttributes } from "react";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement>;

export function TextField({ className = "", ...props }: TextFieldProps) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-volume-stroke bg-volume-control px-3 text-sm text-volume-text outline-none transition duration-200 placeholder:text-volume-muted focus:border-volume-accent focus:ring-2 focus:ring-[var(--focus-ring)] ${className}`}
      {...props}
    />
  );
}

export const Input = TextField;
