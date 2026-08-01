import { useEffect, useState } from "react";
import { LogoPrimary } from "@/components/branding/LogoPrimary";

export type SplashProps = {
  onComplete: () => void;
};

export function Splash({ onComplete }: SplashProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Simulate initialization progress
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 85) return prev; // Stop at 85%, let real loading finish
        return prev + Math.random() * 30;
      });
    }, 150);

    // Start the exit animation after the splash duration, then notify the app.
    const timer = setTimeout(() => {
      setProgress(100);
      setIsExiting(true);
    }, 2800);
    const completionTimer = setTimeout(onComplete, 3300);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(timer);
      clearTimeout(completionTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center overflow-hidden transition-opacity duration-500 ${
        isExiting ? "opacity-0" : "opacity-100"
      }`}
      style={{
        background:
          "linear-gradient(135deg, var(--bg-app) 0%, color-mix(in srgb, var(--bg-app) 95%, var(--accent) 5%) 100%)",
      }}
    >
      {/* Animated background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{
            background: "radial-gradient(circle, var(--accent), transparent)",
            top: "-10%",
            right: "-10%",
            animation: "float 20s ease-in-out infinite",
          }}
        />
        <div
          className="absolute w-96 h-96 rounded-full opacity-10 blur-3xl"
          style={{
            background: "radial-gradient(circle, var(--accent-2), transparent)",
            bottom: "-15%",
            left: "-5%",
            animation: "float 25s ease-in-out infinite 2s",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-12">
        {/* Logo with fade-in and scale animation */}
        <div
          className="flex items-center justify-center"
          style={{
            animation: "fadeInScale 0.8s ease-out 0.2s both",
          }}
        >
          <div className="w-28 h-28 flex items-center justify-center">
            <LogoPrimary size={112} />
          </div>
        </div>

        {/* Title and subtitle */}
        <div className="text-center space-y-2">
          <h1
            className="text-4xl font-bold tracking-wide text-[var(--text)]"
            style={{
              animation: "fadeInUp 0.8s ease-out 0.4s both",
              textShadow:
                "0 2px 8px rgba(0, 0, 0, 0.15), 0 0 20px rgba(76, 111, 255, 0.18)",
            }}
          >
            VOLUMIA
          </h1>
          <p
            className="text-sm font-light tracking-widest text-[var(--text-muted)] uppercase"
            style={{
              animation: "fadeInUp 0.8s ease-out 0.5s both",
              letterSpacing: "0.15em",
            }}
          >
            Tu asistente creativo 3D
          </p>
        </div>

        {/* Loading progress bar */}
        <div
          className="w-64 h-0.5 rounded-full bg-[var(--surface-2)] overflow-hidden"
          style={{
            animation: "fadeIn 0.8s ease-out 0.6s both",
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${progress}%`,
              background:
                "linear-gradient(90deg, var(--accent), var(--accent-2))",
              boxShadow: "0 0 12px rgba(76, 111, 255, 0.45)",
            }}
          />
        </div>

        {/* Subtle status text */}
        <p
          className="text-xs text-[var(--text-faint)] tracking-wide uppercase"
          style={{
            animation: "fadeIn 0.8s ease-out 0.7s both",
          }}
        >
          Inicializando espacio de trabajo...
        </p>
      </div>

      {/* Animated background styles */}
      <style>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
          }
          25% {
            transform: translateY(-20px) translateX(10px);
          }
          50% {
            transform: translateY(-10px) translateX(-10px);
          }
          75% {
            transform: translateY(10px) translateX(20px);
          }
        }

        .reduce-motion @keyframes fadeInScale,
        .reduce-motion @keyframes fadeInUp,
        .reduce-motion @keyframes fadeIn,
        .reduce-motion @keyframes float {
          from, to {
            transform: none;
          }
        }
      `}</style>
    </div>
  );
}
