// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installInputModality } from '../inputModality';

describe('input modality', () => {
  let uninstall: () => void;

  beforeEach(() => {
    uninstall = installInputModality();
  });

  afterEach(() => {
    uninstall();
    document.body.replaceChildren();
  });

  it('defaults to pointer, then enables rings for Tab and Shift+Tab', () => {
    expect(document.documentElement.dataset.focusSource).toBe('pointer');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.documentElement.dataset.focusSource).toBe('keyboard');
    window.dispatchEvent(new PointerEvent('pointerdown'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }));
    expect(document.documentElement.dataset.focusSource).toBe('keyboard');
  });

  it.each([
    'w',
    'a',
    's',
    'd',
    'W',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'F1',
    'Enter',
    ' ',
  ])('%s does not switch input modality', (key) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(document.documentElement.dataset.focusSource).toBe('pointer');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(document.documentElement.dataset.focusSource).toBe('keyboard');
  });

  it.each(['mouse', 'touch', 'pen'])('%s restores pointer mode after Tab navigation', (pointerType) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType }));
    expect(document.documentElement.dataset.focusSource).toBe('pointer');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(document.documentElement.dataset.focusSource).toBe('pointer');
  });

  // Tab is swallowed and blurs (`useAppHotkeys`), so a key that moves focus, like the loadout
  // grid's arrows, is the only way its keyboard-gated focus styling can ever show.
  it('switches to keyboard when a key press moves focus', () => {
    const [first, second] = [document.createElement('button'), document.createElement('button')];
    document.body.append(first, second);
    window.dispatchEvent(new PointerEvent('pointerdown'));
    first.focus();
    expect(document.documentElement.dataset.focusSource).toBe('pointer');

    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    second.focus();
    expect(document.documentElement.dataset.focusSource).toBe('keyboard');
  });

  it('keeps pointer mode when focus moves after a pointer press, even with a key pressed before it', () => {
    const button = document.createElement('button');
    document.body.append(button);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    window.dispatchEvent(new PointerEvent('pointerdown'));
    button.focus();
    expect(document.documentElement.dataset.focusSource).toBe('pointer');
  });

  it('does not treat returning to the window as keyboard navigation', () => {
    const button = document.createElement('button');
    document.body.append(button);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    window.dispatchEvent(new FocusEvent('blur'));
    button.focus();
    expect(document.documentElement.dataset.focusSource).toBe('pointer');
  });

  it('observes events in capture phase before controls stop propagation', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.addEventListener('keydown', (event) => event.stopPropagation());
    button.addEventListener('pointerdown', (event) => event.stopPropagation());
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.documentElement.dataset.focusSource).toBe('keyboard');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.documentElement.dataset.focusSource).toBe('pointer');
  });

  it('removes its listeners and restores the prior attribute on cleanup', () => {
    uninstall();
    const previousSource = document.documentElement.dataset.focusSource;
    const cleanup = installInputModality();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    cleanup();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(document.documentElement.dataset.focusSource).toBe(previousSource);
    window.dispatchEvent(new PointerEvent('pointerdown'));
    expect(document.documentElement.dataset.focusSource).toBe(previousSource);
  });
});
