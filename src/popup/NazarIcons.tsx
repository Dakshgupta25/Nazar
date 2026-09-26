import React from 'react';

export interface NazarEyeIconProps {
  size?: number;
  state?: 'active' | 'idle' | 'scanning';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * NAZAR Protective Eye Icon (Nazar Amulet Concept)
 * Inspired by the Mediterranean/South Asian Nazar amulet warding off the evil eye.
 * Designed with a modern, geometric aesthetic doubling as a cryptographic privacy shield.
 */
export const NazarEyeIcon: React.FC<NazarEyeIconProps> = ({
  size = 24,
  state = 'active',
  className = '',
  style = {},
}) => {
  const isIdle = state === 'idle';
  const isScanning = state === 'scanning';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`nazar-eye-icon nazar-eye-${state} ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        filter: isScanning ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.6))' : undefined,
        ...style,
      }}
    >
      <defs>
        <linearGradient id="nazarOuterGradient" x1="2" y1="16" x2="30" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <radialGradient id="nazarIrisAmulet" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0284c7" />
          <stop offset="45%" stopColor="#1e3a8a" />
          <stop offset="70%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.8" />
        </radialGradient>
        <linearGradient id="nazarPupilGlow" x1="16" y1="12" x2="16" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
      </defs>

      {/* Eye Contour - Almond Geometric Shape */}
      {isIdle ? (
        // IDLE STATE: Lidded, resting calm eye contour
        <>
          {/* Subtle lower baseline */}
          <path
            d="M3 16C7.5 21 12 23 16 23C20 23 24.5 21 29 16"
            stroke="url(#nazarOuterGradient)"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.7"
          />
          {/* Lidded upper curve */}
          <path
            d="M3 16C7.5 17.5 12 18 16 18C20 18 24.5 17.5 29 16"
            stroke="url(#nazarOuterGradient)"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          {/* Half-visible lidded iris */}
          <path
            d="M11.5 16.5C12.5 19.5 14.2 21 16 21C17.8 21 19.5 19.5 20.5 16.5"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Centered calm pupil dot */}
          <circle cx="16" cy="17.5" r="1.8" fill="#60a5fa" />
        </>
      ) : (
        // ACTIVE / SCANNING STATE: Fully open, watchful, protective eye
        <>
          {/* Almond Eyelid Shell */}
          <path
            d="M2.5 16C6.5 8.5 11.5 5.5 16 5.5C20.5 5.5 25.5 8.5 29.5 16C25.5 23.5 20.5 26.5 16 26.5C11.5 26.5 6.5 23.5 2.5 16Z"
            fill="#090d16"
            stroke="url(#nazarOuterGradient)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />

          {/* White Sclera Ring / Inner Accent */}
          <path
            d="M6 16C9 10.5 12.5 8.5 16 8.5C19.5 8.5 23 10.5 26 16C23 21.5 19.5 23.5 16 23.5C12.5 23.5 9 21.5 6 16Z"
            fill="#f8fafc"
            opacity="0.08"
          />

          {/* Outer Cyan Ring of Nazar Boncuk */}
          <circle
            cx="16"
            cy="16"
            r="7.5"
            fill="url(#nazarIrisAmulet)"
            stroke="#38bdf8"
            strokeWidth="1.2"
          />

          {/* Inner Light Blue Accent Ring */}
          <circle
            cx="16"
            cy="16"
            r="4.5"
            fill="#0284c7"
            opacity="0.85"
          />

          {/* White Sclera Ring in Iris */}
          <circle
            cx="16"
            cy="16"
            r="3"
            fill="#f8fafc"
          />

          {/* Core Pupil / Keyhole Privacy Lock */}
          <circle
            cx="16"
            cy="16"
            r="1.8"
            fill="#090d16"
          />

          {/* High-Tech Specular Catchlight */}
          <circle
            cx="14.8"
            cy="14.8"
            r="0.8"
            fill="#ffffff"
          />

          {/* Scanning sweep ring animation indicator if scanning */}
          {isScanning && (
            <circle
              cx="16"
              cy="16"
              r="10"
              stroke="#38bdf8"
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.6"
              style={{
                transformOrigin: 'center',
                animation: 'spin 3s linear infinite',
              }}
            />
          )}
        </>
      )}
    </svg>
  );
};

export const ShieldLockIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <circle cx="12" cy="11" r="1.5" />
    <path d="M12 12.5V15" />
  </svg>
);

export const CloudOffIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M6.3 6.3A7 7 0 0 0 5 10a5 5 0 0 0 2 9.6h11a5 5 0 0 0 3.7-1.6" />
    <path d="M19.8 15.4A4.5 4.5 0 0 0 18 8h-1.3A7 7 0 0 0 9.2 4.4" />
  </svg>
);

export const CheckIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const CloseIcon: React.FC<{ size?: number; color?: string }> = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const TrashIcon: React.FC<{ size?: number; color?: string }> = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const UndoIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </svg>
);

export const RedoIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 7v6h-6" />
    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
  </svg>
);

export const ZoomInIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

export const ZoomOutIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

export const FitIcon: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

export const SettingsIcon: React.FC<{ size?: number; color?: string }> = ({ size = 15, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);
