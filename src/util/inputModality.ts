/**
 * Keyboard navigation opts the remaining focus styling in (the loadout editor and text fields);
 * a pointer press opts it out. See Keyboard and focus policy.
 *
 * Keyboard navigation is Tab, or any focus move made by a key press with no pointer press since:
 * the loadout grid's arrows, or a slot picker handing the slot back on Enter or Escape. Tab alone
 * cannot carry it, because `useAppHotkeys` swallows Tab and blurs whatever had focus, which left
 * the loadout editor's keyboard focus invisible. A key that leaves focus where it was (WASD, the
 * camera's arrows, Space) changes nothing, so game keys after a click never reveal a ring.
 */
export function installInputModality(): () => void {
  const root = document.documentElement;
  const previousSource = root.dataset.focusSource;
  root.dataset.focusSource = 'pointer';
  /** A key was pressed since the last pointer press, so a focus move now is the keyboard's. */
  let keyPressedLast = false;

  const onKeyDown = (event: KeyboardEvent): void => {
    keyPressedLast = true;
    if (event.key === 'Tab') root.dataset.focusSource = 'keyboard';
  };
  const onFocusIn = (): void => {
    if (keyPressedLast) root.dataset.focusSource = 'keyboard';
  };
  const onPointerDown = (): void => {
    keyPressedLast = false;
    root.dataset.focusSource = 'pointer';
  };
  // Returning to the window refocuses the element that had focus. That is not navigation, and
  // Alt+Tab's keydown must not make it look like some. Bubble phase: an element's blur does not
  // bubble, so only the window's own blur arrives here.
  const onWindowBlur = (): void => {
    keyPressedLast = false;
  };

  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('focusin', onFocusIn, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('blur', onWindowBlur);

  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('focusin', onFocusIn, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('blur', onWindowBlur);
    if (previousSource === undefined) delete root.dataset.focusSource;
    else root.dataset.focusSource = previousSource;
  };
}
