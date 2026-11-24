import type { ButtonHTMLAttributes } from 'react';
import { RESET_BUTTON } from '../../resourcePack';
import { PixelSprite } from '../PixelSprite';
import { HoverHintButton } from './HoverHintControl';
import './ResetButton.css';

type ResetButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'>;

export function ResetButton({
  'aria-label': label = 'Reset to default',
  title,
  className = '',
  disabled,
  ...props
}: ResetButtonProps) {
  return (
    <HoverHintButton
      {...props}
      disabled={disabled}
      type="button"
      className={`reset-button ${className}`}
      aria-label={label}
      hint={title ?? label}
    >
      <PixelSprite
        src={disabled ? RESET_BUTTON.disabled : RESET_BUTTON.enabled}
        width={15}
        height={14}
        alt=""
        aria-hidden="true"
      />
    </HoverHintButton>
  );
}
