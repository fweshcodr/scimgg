// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RESET_BUTTON } from '../../../resourcePack';
import { ResetButton } from '../ResetButton';

describe('ResetButton', () => {
  it('provides a named reset control with the native decorative sprite', () => {
    render(<ResetButton />);

    const button = screen.getByRole('button', { name: 'Reset to default' });

    expect(button).toHaveAttribute('title', '');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
    expect(button.querySelector('canvas')).toHaveAttribute('data-src', RESET_BUTTON.enabled);
    expect(button.querySelector('canvas')).toHaveStyle({ width: '15px', height: '14px' });
  });

  it('preserves a specific action name and its click callback', () => {
    const onClick = vi.fn();
    render(<ResetButton aria-label="Reset brightness to default" onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset brightness to default' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('button')).toHaveAttribute('title', '');
  });

  it('does not invoke reset when disabled', () => {
    const onClick = vi.fn();
    render(<ResetButton disabled onClick={onClick} />);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button').querySelector('canvas')).toHaveAttribute('data-src', RESET_BUTTON.disabled);
  });

  it('keeps an explicitly requested hover hint separate from its accessible name', async () => {
    render(<ResetButton aria-label="Reset brightness" title="Restore the original brightness" />);
    const button = screen.getByRole('button', { name: 'Reset brightness' });
    expect(button).toHaveAttribute('title', '');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent('Restore the original brightness');
  });

  it('blocks an ancestor native title while keeping its own custom reset hint', async () => {
    render(
      <span title="Auto-size explanation">
        <ResetButton aria-label="Reset overlay size" title="Restore the default size" />
      </span>,
    );
    const button = screen.getByRole('button', { name: 'Reset overlay size' });
    expect(button.closest('[title]')).toHaveAttribute('title', '');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent('Restore the default size');
  });
});
