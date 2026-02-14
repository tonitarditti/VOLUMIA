import type { ButtonHTMLAttributes } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function IconButton({ className = "", children, ...props }: IconButtonProps) {
  return (
    <button
      className={`no-drag inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-volume-muted transition duration-200 hover:border-volume-stroke hover:bg-volume-panelAlt hover:text-volume-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
