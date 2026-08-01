import React from "react";
import { LoadingDots } from "./LoadingDots";

export function StartupSplash() {
  return (
    <div className="flex flex-col items-center justify-center">
      <div
        style={{
          color: "var(--accent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          filter: "drop-shadow(0 6px 18px rgba(201,164,93,0.14))",
        }}
      >
        {/* Inline monochrome V icon using currentColor so it adapts to theme accent */}
        <svg
          width="132"
          height="132"
          viewBox="0 0 1024 1024"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path d="M318 248H478L558 624H470L318 248Z" fill="currentColor" />
          <path d="M318 248L558 624" stroke="currentColor" strokeWidth="28" opacity="0.95" />
          <path d="M546 624C646 538 746 466 812 286C714 304 654 368 590 456C560 496 544 548 526 620C572 680 616 730 664 764C646 712 604 668 546 624Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="14" opacity="0.9" />
          {/* subtle mesh lines */}
          <g opacity="0.85" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M520 620C584 660 636 708 672 768" strokeOpacity="0.12" />
            <path d="M530 596C604 644 666 700 710 764" strokeOpacity="0.10" />
            <path d="M542 572C622 622 690 686 740 758" strokeOpacity="0.08" />
          </g>
        </svg>
      </div>

      <div className="mt-6 text-center">
        <div style={{ letterSpacing: "0.18em" }}>
          <h1
            className="text-4xl font-semibold"
            style={{ color: "var(--text)", margin: 0, fontVariantCaps: "all-small-caps" }}
          >
            VOLUMIA
          </h1>
        </div>

        <p className="mt-2 text-sm text-[var(--text-muted)]">Your Creative 3D Assistant</p>

        <div className="mt-6">
          <LoadingDots />
        </div>
      </div>
    </div>
  );
}
