import type { ButtonHTMLAttributes } from 'react';
import { LauncherIcon } from '../launcher/launcherIcons';
import './CloseButton.css';

type CloseButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> & {
  readonly 'aria-label': string;
};

/**
 * The close X of every Scim-owned sidebar and modal: the launcher set's pixel close glyph, recolored
 * on hover with no fill behind it. A surface's own class (`className`) only places it.
 */
export function CloseButton({ className, ...props }: CloseButtonProps) {
  return (
    <button {...props} type="button" className={className ? `close-button ${className}` : 'close-button'}>
      <LauncherIcon glyph="close" />
    </button>
  );
}
