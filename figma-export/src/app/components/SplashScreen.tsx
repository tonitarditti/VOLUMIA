import React, { useEffect, useState } from 'react';

const BOOT_SEQUENCE = [
  { text: 'Initializing AI Engine', duration: 600 },
  { text: 'Loading 3D Modules', duration: 600 },
  { text: 'RTX 4090 Detected', duration: 600, accent: true },
  { text: 'ComfyUI Connected', duration: 600, success: true },
];

const VolumiaMark = ({ size = 72, accent = '#A47C45' }: { size?: number; accent?: string }) => (
  <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
    <polygon
      points="36,7 63,21.5 63,50.5 36,65 9,50.5 9,21.5"
      stroke={accent}
      strokeWidth="1.6"
      fill="none"
    />
    <polygon
      points="36,18 52,26.5 52,43.5 36,52 20,43.5 20,26.5"
      fill={accent}
      opacity="0.10"
    />
    <line x1="36" y1="7" x2="36" y2="65" stroke={accent} strokeWidth="0.7" opacity="0.35" />
    <line x1="9" y1="21.5" x2="63" y2="50.5" stroke={accent} strokeWidth="0.7" opacity="0.35" />
    <line x1="63" y1="21.5" x2="9" y2="50.5" stroke={accent} strokeWidth="0.7" opacity="0.35" />
    <circle cx="36" cy="36" r="2.5" fill={accent} opacity="0.5" />
  </svg>
);

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [activeMessage, setActiveMessage] = useState(0);
  const [completedMessages, setCompletedMessages] = useState<number[]>([]);
  const [fadeOut, setFadeOut] = useState(false);
  const [logoVisible, setLogoVisible] = useState(false);

  useEffect(() => {
    const logoTimer = setTimeout(() => setLogoVisible(true), 150);
    return () => clearTimeout(logoTimer);
  }, []);

  useEffect(() => {
    const TOTAL = 3200;
    const start = Date.now();

    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const p = Math.min(100, (elapsed / TOTAL) * 100);
      setProgress(p);

      const msgIndex = Math.min(BOOT_SEQUENCE.length - 1, Math.floor((p / 100) * BOOT_SEQUENCE.length));
      setActiveMessage(msgIndex);

      if (p >= 100) {
        clearInterval(progressInterval);
        setCompletedMessages([0, 1, 2, 3]);
        setTimeout(() => {
          setFadeOut(true);
          setTimeout(onComplete, 450);
        }, 600);
      } else {
        const completed: number[] = [];
        for (let i = 0; i < msgIndex; i++) completed.push(i);
        setCompletedMessages(completed);
      }
    }, 16);

    return () => clearInterval(progressInterval);
  }, [onComplete]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#1A1A1C',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.45s ease',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Subtle radial glow behind logo */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -58%)',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(164,124,69,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Center content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
          opacity: logoVisible ? 1 : 0,
          transform: logoVisible ? 'translateY(0)' : 'translateY(12px)',
          transition: 'opacity 0.6s ease, transform 0.6s ease',
        }}
      >
        {/* Logo block */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
          <VolumiaMark size={72} accent="#A47C45" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                color: '#E8E4DE',
                fontSize: 20,
                fontWeight: 200,
                letterSpacing: '0.32em',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              VOLUMIA
            </span>
            <span
              style={{
                color: '#484644',
                fontSize: 9,
                letterSpacing: '0.18em',
                fontFamily: 'system-ui, -apple-system, sans-serif',
              }}
            >
              3D ARCHITECTURAL INTELLIGENCE
            </span>
          </div>
        </div>

        {/* Boot messages */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {BOOT_SEQUENCE.map((msg, i) => {
            const isCompleted = completedMessages.includes(i);
            const isActive = activeMessage === i && !isCompleted;
            const isVisible = i <= activeMessage;

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? 'translateX(0)' : 'translateX(-8px)',
                  transition: 'opacity 0.35s ease, transform 0.35s ease',
                }}
              >
                {/* Status indicator */}
                <div
                  style={{
                    width: 16,
                    height: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isCompleted ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5.5" stroke="#4CAF7D" strokeWidth="1" />
                      <path d="M3.5 6L5.2 7.8L8.5 4.2" stroke="#4CAF7D" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : isActive ? (
                    <div
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: '#A47C45',
                        boxShadow: '0 0 6px rgba(164,124,69,0.6)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: '#3A3A3D',
                      }}
                    />
                  )}
                </div>

                {/* Message text */}
                <span
                  style={{
                    color: isCompleted ? '#525050' : isActive ? '#C0BCB6' : '#3A3836',
                    fontSize: 11,
                    fontFamily: 'system-ui, -apple-system, monospace',
                    letterSpacing: '0.03em',
                    transition: 'color 0.3s',
                  }}
                >
                  {msg.text}
                  {isActive && (
                    <span style={{ color: '#484440', marginLeft: 4, animation: 'none' }}>
                      ...
                    </span>
                  )}
                </span>

                {/* RTX highlight */}
                {msg.accent && isCompleted && (
                  <span
                    style={{
                      background: 'rgba(164,124,69,0.12)',
                      color: '#A47C45',
                      fontSize: 8,
                      padding: '1px 5px',
                      borderRadius: 3,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                    }}
                  >
                    ACTIVE
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ width: 300 }}>
          <div
            style={{
              height: 1,
              background: '#2A2A2D',
              borderRadius: 1,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #7A5C30, #A47C45, #C49055)',
                borderRadius: 1,
                transition: 'width 0.08s linear',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: 8,
            }}
          >
            <span style={{ color: '#383634', fontSize: 9, fontFamily: 'monospace' }}>
              {progress >= 100 ? 'READY' : 'LOADING'}
            </span>
            <span style={{ color: '#383634', fontSize: 9, fontFamily: 'monospace' }}>
              {Math.floor(progress)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
