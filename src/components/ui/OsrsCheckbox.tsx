import type React from 'react';
import './OsrsCheckbox.css';

interface OsrsCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const OsrsCheckbox: React.FC<OsrsCheckboxProps> = ({ checked, onChange, label, disabled }) => {
  return (
    /* biome-ignore lint/a11y/useSemanticElements: intentional ARIA checkbox; a native checkbox input cannot render the OSRS box-and-mark glyph. */
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      className="osrs-checkbox"
      onClick={() => onChange(!checked)}
    >
      <span className="osrs-checkbox__box">{checked && <span className="osrs-checkbox__mark" />}</span>
      <span className="osrs-checkbox__label">{label}</span>
    </button>
  );
};
