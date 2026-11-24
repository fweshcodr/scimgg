// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOL_HEREDIT_MODIFIERS } from '../../encounters/solHeredit/modifiers';
import { ModifiersModal, runModifierSelection } from '../ModifiersModal';

function renderModal(initialSelection = {}) {
  const onRestart = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <ModifiersModal
      encounterName="Sol Heredit"
      modifiers={SOL_HEREDIT_MODIFIERS}
      initialSelection={initialSelection}
      onRestart={onRestart}
      onClose={onClose}
    />,
  );
  return { ...view, onRestart, onClose };
}

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('ModifiersModal', () => {
  afterEach(cleanup);

  it('opens on the selection it is given, with no field to unfold', () => {
    renderModal({ blasphemy: 3, doom: 1 });
    expect(screen.getByRole('dialog', { name: 'Modifiers' })).toBeTruthy();
    expect(pressed('Blasphemy tier III')).toBe('true');
    expect(pressed('Doom tier I')).toBe('true');
    expect(pressed('Bees! off')).toBe('true');
    // The grid is the dialog's body, not the encounter panel's folding field.
    expect(document.querySelector('.cfield')).toBeNull();
  });

  it('restarts with the edited draft', () => {
    const { onRestart, onClose } = renderModal({ blasphemy: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Blasphemy off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Doom tier II' }));
    expect(pressed('Doom tier II')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Restart fight' }));
    expect(onRestart).toHaveBeenCalledExactlyOnceWith({ doom: 2 });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('restarts with every modifier off when all are switched off', () => {
    const { onRestart } = renderModal({ blasphemy: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Blasphemy off' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restart fight' }));
    expect(onRestart).toHaveBeenCalledExactlyOnceWith({});
  });

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
    ['Escape', () => fireEvent.keyDown(document.body, { key: 'Escape' })],
    [
      'a press on the backdrop',
      () => {
        const overlay = document.querySelector('.modifiers-modal-overlay') as HTMLElement;
        fireEvent.pointerDown(overlay);
        fireEvent.click(overlay);
      },
    ],
  ])('closes on %s without restarting', (_, close) => {
    const { onRestart, onClose } = renderModal({ blasphemy: 3 });
    fireEvent.click(screen.getByRole('button', { name: 'Doom tier II' }));
    close();
    expect(onClose).toHaveBeenCalledOnce();
    expect(onRestart).not.toHaveBeenCalled();
  });

  it('keeps focus off its buttons, so game keys never re-press a tier', () => {
    renderModal();
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    screen.getByRole('button', { name: 'Doom tier II' }).dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });
});

describe('runModifierSelection', () => {
  it("reads the run's modifiers, keeping only those the encounter offers at a tier it has", () => {
    expect(runModifierSelection({ modifiers: { blasphemy: 3, doom: 9, retired: 2 } }, SOL_HEREDIT_MODIFIERS)).toEqual({
      blasphemy: 3,
    });
  });

  it('reads a run started with every modifier off, which carries no encounter config, as none', () => {
    expect(runModifierSelection(undefined, SOL_HEREDIT_MODIFIERS)).toEqual({});
    expect(runModifierSelection({}, SOL_HEREDIT_MODIFIERS)).toEqual({});
    expect(runModifierSelection({ modifiers: null }, SOL_HEREDIT_MODIFIERS)).toEqual({});
  });
});
