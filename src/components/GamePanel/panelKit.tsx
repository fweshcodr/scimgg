import type React from 'react';
import { ResetButton } from '../ui/ResetButton';

/**
 * Shared visual primitives for GamePanel tab content. All color comes from
 * semantic pack tokens.
 */

export const FONT_BOLD = '"RuneScape Bold 12", sans-serif';
// A hard 1px pixel shadow only earns its place at >=14px, where OSRS buttons
// read this way in-game. Smaller pixel text fuzzes under a shadow.
export const PIXEL_SHADOW = '1px 1px 0 #000';

export const SectionHeader: React.FC<{
  title: string;
  modified?: boolean;
  onReset?: () => void;
}> = ({ title, modified = false, onReset }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0 2px' }}>
      <span
        style={{
          fontFamily: FONT_BOLD,
          fontSize: '12px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
          color: 'var(--native-muted)',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      {modified && onReset && <ResetButton onClick={onReset} aria-label={`Reset ${title} to defaults`} />}
    </div>
  );
};
