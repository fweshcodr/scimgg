import type React from 'react';
import './OsrsToggle.css';

interface OsrsToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly size?: 'default' | 'small';
  readonly accessibleLabel?: string;
}

export const OsrsToggle: React.FC<OsrsToggleProps> = ({
  checked,
  onChange,
  disabled,
  size = 'default',
  accessibleLabel,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={accessibleLabel}
      disabled={disabled}
      className={`osrs-toggle osrs-toggle--${size}`}
      onClick={() => onChange(!checked)}
    >
      <span className="osrs-toggle__track">
        <span className="osrs-toggle__knob" />
      </span>
    </button>
  );
};
