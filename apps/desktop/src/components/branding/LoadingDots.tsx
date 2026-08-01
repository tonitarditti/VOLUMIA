import React from "react";

type LoadingDotsProps = {
  size?: number;
  color?: string;
  className?: string;
};

export function LoadingDots({ size = 8, color = "var(--accent)", className = "" }: LoadingDotsProps) {
  const dots = Array.from({ length: 5 }, (_, i) => i);
  return (
    <div
      aria-hidden
      className={`flex items-center gap-2 ${className}`}
      style={{ alignItems: "center" }}
    >
      <style>{`
        @keyframes volumia-dot-fade {
          0% { opacity: 0.18; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
          60% { opacity: 0.6; transform: translateY(0); }
          100% { opacity: 0.18; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .volumia-dot { animation: none !important; }
        }
      `}</style>

      {dots.map((d) => (
        <span
          key={d}
          className="volumia-dot"
          style={{
            width: size,
            height: size,
            borderRadius: "999px",
            background: "transparent",
            boxShadow: `0 0 0 1px rgba(255,255,255,0.06) inset`,
            display: "inline-block",
            opacity: 0.18,
            backgroundColor: color,
            animation: `volumia-dot-fade 1.25s ease-in-out ${d * 0.12}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
