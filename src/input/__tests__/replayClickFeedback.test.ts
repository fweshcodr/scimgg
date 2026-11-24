// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPrimaryUiPointerDownListener,
  REPLAY_CLICK_DURATION_MS,
  REPLAY_CLICK_OWNER_ATTRIBUTE,
  REPLAY_CLICK_OWNERS,
} from '../replayClickFeedback';

const mountedElements: HTMLElement[] = [];

afterEach(() => {
  for (const element of mountedElements) element.remove();
  mountedElements.length = 0;
});

function mountButton(owner?: string): HTMLButtonElement {
  const container = document.createElement('div');
  if (owner) container.setAttribute(REPLAY_CLICK_OWNER_ATTRIBUTE, owner);
  const button = document.createElement('button');
  container.appendChild(button);
  document.body.appendChild(container);
  mountedElements.push(container);
  return button;
}

function dispatchPointerDown(target: Element, button: number): void {
  target.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      button,
      clientX: 42,
      clientY: 24,
    }),
  );
}

describe('replay click feedback pointerdown listener', () => {
  it('uses a compact UI acknowledgment while preserving OSRS world-click timing', () => {
    expect(REPLAY_CLICK_DURATION_MS).toEqual({ yellow: 600, red: 600, ui: 420 });
  });

  it('reports one neutral click for a primary UI pointerdown', () => {
    const onUiPointerDown = vi.fn();
    const listener = createPrimaryUiPointerDownListener(onUiPointerDown);
    const button = mountButton();
    window.addEventListener('pointerdown', listener);

    dispatchPointerDown(button, 0);

    expect(onUiPointerDown).toHaveBeenCalledOnce();
    expect(onUiPointerDown).toHaveBeenCalledWith({ clientX: 42, clientY: 24, timeStamp: expect.any(Number) });
    window.removeEventListener('pointerdown', listener);
  });

  it.each([
    REPLAY_CLICK_OWNERS.world,
    REPLAY_CLICK_OWNERS.explicit,
  ])('excludes primary pointerdowns owned by %s click feedback', (owner) => {
    const onUiPointerDown = vi.fn();
    const listener = createPrimaryUiPointerDownListener(onUiPointerDown);
    const button = mountButton(owner);
    window.addEventListener('pointerdown', listener);

    dispatchPointerDown(button, 0);

    expect(onUiPointerDown).not.toHaveBeenCalled();
    window.removeEventListener('pointerdown', listener);
  });

  it('ignores non-primary pointerdowns', () => {
    const onUiPointerDown = vi.fn();
    const listener = createPrimaryUiPointerDownListener(onUiPointerDown);
    const button = mountButton();
    window.addEventListener('pointerdown', listener);

    dispatchPointerDown(button, 2);

    expect(onUiPointerDown).not.toHaveBeenCalled();
    window.removeEventListener('pointerdown', listener);
  });
});
