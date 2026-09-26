import React from 'react';

export interface SensitiveBadgeProps {
  count: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Unified Sensitive Items Badge component.
 * Replaces disparate plain-text counts and inconsistent badges with a single
 * polished, trustworthy indicator.
 */
export const SensitiveBadge: React.FC<SensitiveBadgeProps> = ({
  count,
  label,
  size = 'md',
  className = '',
  style = {},
}) => {
  const isZero = count === 0;
  const isWarning = count > 0;

  const displayText = label
    ? `${count} ${label}`
    : isZero
    ? '0 Sensitive Items • Clean'
    : count === 1
    ? '1 Sensitive Item Protected'
    : `${count} Sensitive Items Protected`;

  const fontSizes = {
    sm: '10px',
    md: '11px',
    lg: '12px',
  };

  const paddings = {
    sm: '2px 8px',
    md: '4px 10px',
    lg: '6px 14px',
  };

  return (
    <div
      className={`sensitive-badge ${isWarning ? 'sensitive-badge-warning' : 'sensitive-badge-safe'} ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: fontSizes[size],
        padding: paddings[size],
        borderRadius: '9999px',
        fontWeight: 600,
        letterSpacing: '0.01em',
        userSelect: 'none',
        transition: 'all 0.2s ease',
        background: isWarning ? 'rgba(244, 63, 94, 0.12)' : 'rgba(16, 185, 129, 0.12)',
        color: isWarning ? '#fb7185' : '#34d399',
        border: `1px solid ${isWarning ? 'rgba(244, 63, 94, 0.28)' : 'rgba(16, 185, 129, 0.28)'}`,
        boxShadow: isWarning ? '0 1px 6px rgba(244, 63, 94, 0.15)' : '0 1px 6px rgba(16, 185, 129, 0.12)',
        ...style,
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: isWarning ? '#f43f5e' : '#10b981',
          boxShadow: isWarning ? '0 0 6px #f43f5e' : '0 0 6px #10b981',
          flexShrink: 0,
        }}
      />
      <span>{displayText}</span>
    </div>
  );
};
