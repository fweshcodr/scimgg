import type React from 'react';
import './OsrsButton.css';

interface OsrsButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'default' | 'secondary' | 'primary' | 'small' | 'danger' | 'ghost';
  disabled?: boolean;
  /**
   * Off, but still able to answer a press. `disabled` sets `pointer-events: none`, so a button
   * using it cannot tell the player why it will not act or what would turn it on — pick this
   * whenever there IS something they can do about it, and `disabled` only when there is not.
   */
  ariaDisabled?: boolean;
  /** Points at the reason already on screen, rather than authoring a second, hidden one. */
  describedBy?: string;
  fullWidth?: boolean;
  className?: string;
}

export const OsrsButton: React.FC<OsrsButtonProps> = ({
  children,
  onClick,
  type = 'button',
  variant = 'default',
  disabled,
  ariaDisabled,
  describedBy,
  fullWidth,
  className = '',
}) => {
  return (
    <button
      type={type}
      tabIndex={-1}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={ariaDisabled || undefined}
      aria-describedby={describedBy}
      className={`osrs-btn osrs-btn--${variant} ${fullWidth ? 'osrs-btn--full-width' : ''} ${className}`}
    >
      {children}
    </button>
  );
};
