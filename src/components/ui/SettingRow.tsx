import type React from 'react';
import { ResetButton } from './ResetButton';
import './SettingRow.css';

interface SettingRowProps {
  children: React.ReactNode;
  /** An explanation belongs to the same modified/reset group as its control. */
  hint?: React.ReactNode;
  isModified: boolean;
  onReset: () => void;
  /** Hide the built-in reset button (for controls that render their own inline) */
  hideReset?: boolean;
  className?: string;
  /**
   * The row's settings-search id (`data-search-id`), the anchor `revealSetting` scrolls to, made
   * with `settingsSearchId`/`pluginSearchId` and listed in src/settingsSearch/entries.ts. Required,
   * so a new setting cannot be added without deciding how search finds it: pass `null`, with a
   * comment saying why, when an enclosing element carries the anchor (a group with its title) or
   * the row is deliberately not searchable (development-only, or not in either sidebar).
   */
  searchId: string | null;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  children,
  hint,
  isModified,
  onReset,
  hideReset,
  className,
  searchId,
}) => {
  return (
    <div
      className={`setting-row${isModified ? ' setting-row--modified' : ''}${className ? ` ${className}` : ''}`}
      data-search-id={searchId ?? undefined}
    >
      {hint === undefined ? (
        children
      ) : (
        <div className="setting-row__content">
          {children}
          <div className="settings-hint setting-row__hint">{hint}</div>
        </div>
      )}
      {!hideReset && (
        <ResetButton
          className="setting-row__reset"
          onClick={onReset}
          aria-label="Reset to default"
          aria-hidden={!isModified}
          disabled={!isModified}
        />
      )}
    </div>
  );
};
