import React from 'react';
import { COLORS } from '../styles/colors';
import { withAlpha } from '../utils/color';

interface IconButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  color?: string;
  hoverBg?: string;
  title?: string;
  size?: number;
  disabled?: boolean;
  loading?: boolean;
}

const IconButton: React.FC<IconButtonProps> = ({
  icon, onClick, color = COLORS.primary, hoverBg,
  title, size = 36, disabled = false,
  loading = false,
}) => {
  const bg = hoverBg || withAlpha(color, 0.08);

  return (
    <div
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={title}
      onKeyDown={disabled ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: disabled ? COLORS.borderInput : color,
        fontSize: size * 0.61, cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none', transition: 'all 0.2s',
        opacity: disabled ? 0.5 : 1, outline: 'none',
      }}
      onMouseEnter={e => {
        if (!disabled) e.currentTarget.style.background = bg;
      }}
      onMouseLeave={e => {
        if (!disabled) e.currentTarget.style.background = 'transparent';
      }}
      title={title}
    >
      {loading ? <span style={{ fontSize: size * 0.5, opacity: 0.6 }}>⟳</span> : icon}
    </div>
  );
};

export default IconButton;
