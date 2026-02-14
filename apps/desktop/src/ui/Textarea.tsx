import type { TextareaHTMLAttributes } from "react";

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({ className = "", ...props }: TextAreaProps) {
  return (
    <textarea
      className={`w-full rounded-lg border border-volume-stroke bg-volume-control px-3 py-2 text-sm text-volume-text outline-none transition duration-200 placeholder:text-volume-muted focus:border-volume-accent focus:ring-2 focus:ring-[var(--focus-ring)] ${className}`}
      {...props}
    />
  );
}

export const Textarea = TextArea;
