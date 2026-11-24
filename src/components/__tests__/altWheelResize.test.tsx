// @vitest-environment happy-dom
import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { getModifiers } from '../../input/keyState';
import { useAltHeld } from '../altWheelResize';

afterEach(() => fireEvent.blur(window));

it('reads an already-held Alt from the modifier store on its first render', () => {
  getModifiers();
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  const observed: boolean[] = [];
  const view = renderHook(() => {
    const held = useAltHeld();
    observed.push(held);
    return held;
  });
  expect(observed).toEqual([true]);
  fireEvent.blur(window);
  expect(view.result.current).toBe(false);
});

it('subscribes only to Alt changes, not unrelated modifier changes', () => {
  let renders = 0;
  const { result } = renderHook(() => {
    renders++;
    return useAltHeld();
  });
  fireEvent.keyDown(window, { key: 'Shift', shiftKey: true });
  expect(renders).toBe(1);
  fireEvent.keyDown(window, { key: 'Alt', shiftKey: true, altKey: true });
  expect(result.current).toBe(true);
  const afterAlt = renders;
  fireEvent.keyUp(window, { key: 'Shift', altKey: true });
  expect(renders).toBe(afterAlt);
  fireEvent.keyUp(window, { key: 'Alt' });
  expect(result.current).toBe(false);
});
