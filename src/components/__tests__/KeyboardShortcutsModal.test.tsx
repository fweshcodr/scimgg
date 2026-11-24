// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAMEPANEL_KEYBINDS_ID } from '../../settingsSearch/ids';
import { deleteSetting, saveSetting } from '../../util/storage';
import { KeyboardShortcutsModal } from '../KeyboardShortcutsModal';
import { REVEAL_NO_GAME_PANEL_REASON, useGamePanelRevealDestination } from '../settingsReveal';

/** A stand-in game panel: the keybind editor's destination, as GamePanel registers it. */
function GamePanelDestination() {
  useGamePanelRevealDestination(
    () => null,
    () => {},
  );
  return <div data-search-id={GAMEPANEL_KEYBINDS_ID} />;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  deleteSetting('osrs-unified-keybinds');
});

describe('KeyboardShortcutsModal: Edit keybinds', () => {
  it.each([
    { key: 'F8', display: 'F8' },
    { key: '', display: 'Unbound' },
  ])('renders configured dismissal $display for both close and replay', ({ key, display }) => {
    saveSetting('osrs-unified-keybinds', { ui: { closeOverlay: key } });
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText('Close or cancel').previousElementSibling).toHaveTextContent(display);
    expect(screen.getByText('Exit replay').previousElementSibling).toHaveTextContent(display);
    expect(screen.queryByText('Esc', { selector: 'kbd' })).toBeNull();
  });

  it('keeps the close icon named without a hover hint or browser tooltip', () => {
    vi.useFakeTimers();
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Close shortcuts modal' });
    expect(button).not.toHaveAttribute('title');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('says the keys are changed in the game panel, and takes the player there, closing itself', () => {
    render(<GamePanelDestination />);
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    expect(screen.getByText(/Change keybindings in the game panel\./)).toBeDefined();
    const listener = vi.fn();
    window.addEventListener('settings:reveal', listener);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Edit keybinds' }));
      expect(onClose).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]?.[0].detail).toEqual({ id: GAMEPANEL_KEYBINDS_ID, surface: 'gamepanel' });
    } finally {
      window.removeEventListener('settings:reveal', listener);
    }
  });

  it('stays open and says why when the editor cannot be reached', () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsModal isOpen onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit keybinds' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe(REVEAL_NO_GAME_PANEL_REASON);
  });
});
