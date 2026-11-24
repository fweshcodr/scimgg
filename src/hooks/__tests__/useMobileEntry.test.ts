// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type MobileEntryInputs,
  PORTRAIT_DISMISSED_KEY,
  resolveFullscreenControl,
  resolveMobileEntry,
  useMobileEntry,
} from '../useMobileEntry';

const OUT = { element: false, standalone: false };

/** An Android phone, first visit, held sideways. */
const phone: MobileEntryInputs = {
  isMobileDevice: true,
  route: 'api',
  canLockLandscape: true,
  introSeen: false,
  welcomeAnswered: false,
  turnedFromInvite: false,
  portrait: false,
  portraitDismissed: false,
  fullScreen: OUT,
};

describe('resolveMobileEntry', () => {
  it('shows nothing at all on desktop, in any orientation', () => {
    for (const portrait of [false, true]) {
      expect(resolveMobileEntry({ ...phone, isMobileDevice: false, portrait })).toEqual({
        welcome: null,
        rotateInvite: null,
      });
    }
  });

  describe('landscape', () => {
    it('welcomes a first visit with the full-screen offer', () => {
      expect(resolveMobileEntry(phone)).toEqual({ welcome: 'fullscreen', rotateInvite: null });
    });

    it('gets out of the way once answered, now or on an earlier visit', () => {
      expect(resolveMobileEntry({ ...phone, welcomeAnswered: true }).welcome).toBeNull();
      expect(resolveMobileEntry({ ...phone, introSeen: true }).welcome).toBeNull();
    });

    it('points iPhone Safari at the Home Screen, which is its only full screen', () => {
      expect(resolveMobileEntry({ ...phone, route: 'home-screen', canLockLandscape: false }).welcome).toBe(
        'home-screen',
      );
    });

    it('keeps only the touch basics where full screen is already on or impossible', () => {
      expect(resolveMobileEntry({ ...phone, fullScreen: { element: true, standalone: false } }).welcome).toBe('plain');
      // Launched from the iPhone Home Screen.
      expect(
        resolveMobileEntry({ ...phone, route: 'home-screen', fullScreen: { element: false, standalone: true } })
          .welcome,
      ).toBe('plain');
      expect(resolveMobileEntry({ ...phone, route: 'none' }).welcome).toBe('plain');
    });
  });

  describe('portrait', () => {
    const upright: MobileEntryInputs = { ...phone, portrait: true };

    it('invites a turn instead of welcoming, and never as a wall', () => {
      expect(resolveMobileEntry(upright)).toEqual({ welcome: null, rotateInvite: { canLockLandscape: true } });
    });

    it('offers to turn the screen itself only where full screen can lock it', () => {
      expect(resolveMobileEntry({ ...upright, canLockLandscape: false }).rotateInvite).toEqual({
        canLockLandscape: false,
      });
      expect(resolveMobileEntry({ ...upright, fullScreen: { element: true, standalone: false } }).rotateInvite).toEqual(
        { canLockLandscape: false },
      );
    });

    it('stays away for the session once the visitor chose to look around', () => {
      expect(resolveMobileEntry({ ...upright, portraitDismissed: true })).toEqual({
        welcome: null,
        rotateInvite: null,
      });
    });

    it('asks returning visitors too, since play needs landscape every time', () => {
      expect(resolveMobileEntry({ ...upright, introSeen: true }).rotateInvite).not.toBeNull();
    });
  });

  it('hands over on rotation: portrait invitation out, landscape welcome in', () => {
    expect(resolveMobileEntry({ ...phone, portrait: true }).welcome).toBeNull();
    expect(resolveMobileEntry({ ...phone, portrait: false }).rotateInvite).toBeNull();
    expect(resolveMobileEntry({ ...phone, portrait: false }).welcome).toBe('fullscreen');
  });

  it("follows a return visit's turn from the invitation with the full-screen offer only", () => {
    const returning = { ...phone, introSeen: true, turnedFromInvite: true };
    expect(resolveMobileEntry(returning).welcome).toBe('fullscreen');
    expect(resolveMobileEntry({ ...returning, route: 'home-screen' }).welcome).toBe('home-screen');
    // Nothing to offer: no touch-basics sheet for someone who has seen it.
    expect(resolveMobileEntry({ ...returning, fullScreen: { element: true, standalone: false } }).welcome).toBeNull();
    expect(resolveMobileEntry({ ...returning, route: 'none' }).welcome).toBeNull();
    expect(resolveMobileEntry({ ...returning, welcomeAnswered: true }).welcome).toBeNull();
  });
});

/** Points `matchMedia` at a fake orientation the test can flip, with live listeners. */
function fakeOrientation(initialPortrait: boolean) {
  let portrait = initialPortrait;
  const listeners = new Set<() => void>();
  const spy = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query.includes('portrait') ? portrait : false;
        },
        media: query,
        addEventListener: (_: string, fn: () => void) => listeners.add(fn),
        removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      }) as unknown as MediaQueryList,
  );
  return {
    rotate(next: boolean) {
      portrait = next;
      for (const fn of listeners) fn();
    },
    restore: () => spy.mockRestore(),
  };
}

describe('useMobileEntry', () => {
  const root = document.documentElement as HTMLElement & { requestFullscreen?: unknown };
  const originalRequest = root.requestFullscreen;
  let orientation: ReturnType<typeof fakeOrientation> | null = null;

  function withFullscreenApi(request: () => Promise<void>): void {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(root, 'requestFullscreen', { configurable: true, writable: true, value: request });
  }

  afterEach(() => {
    orientation?.restore();
    orientation = null;
    window.sessionStorage.clear();
    delete (document as unknown as { fullscreenEnabled?: unknown }).fullscreenEnabled;
    Object.defineProperty(root, 'requestFullscreen', { configurable: true, writable: true, value: originalRequest });
  });

  it('persists the welcome as answered, and points at the stone instead', () => {
    withFullscreenApi(() => Promise.resolve());
    orientation = fakeOrientation(false);
    const onIntroSeen = vi.fn();
    const { result } = renderHook(() => useMobileEntry({ isMobileDevice: true, introSeen: false, onIntroSeen }));
    expect(result.current.welcome).toBe('fullscreen');
    const before = result.current.stoneAttention;

    act(() => result.current.dismissWelcome());
    expect(onIntroSeen).toHaveBeenCalledTimes(1);
    expect(result.current.welcome).toBeNull();
    expect(result.current.stoneAttention).toBe(before + 1);
  });

  it('requests full screen from the welcome, synchronously, and answers it', () => {
    const request = vi.fn(() => Promise.resolve());
    withFullscreenApi(request);
    orientation = fakeOrientation(false);
    const onIntroSeen = vi.fn();
    const { result } = renderHook(() => useMobileEntry({ isMobileDevice: true, introSeen: false, onIntroSeen }));
    act(() => result.current.playFullscreen());
    expect(request).toHaveBeenCalledTimes(1);
    expect(onIntroSeen).toHaveBeenCalledTimes(1);
    expect(result.current.welcome).toBeNull();
  });

  it('greets a return visit with one glint on the stone, and no sheet', () => {
    withFullscreenApi(() => Promise.resolve());
    orientation = fakeOrientation(false);
    const { result } = renderHook(() =>
      useMobileEntry({ isMobileDevice: true, introSeen: true, onIntroSeen: vi.fn() }),
    );
    expect(result.current.welcome).toBeNull();
    expect(result.current.rotateInvite).toBeNull();
    expect(result.current.stoneAttention).toBe(1);
  });

  it('follows rotation: invitation in portrait, welcome after turning, invitation back on turning again', () => {
    withFullscreenApi(() => Promise.resolve());
    orientation = fakeOrientation(true);
    const { result } = renderHook(() =>
      useMobileEntry({ isMobileDevice: true, introSeen: false, onIntroSeen: vi.fn() }),
    );
    expect(result.current.rotateInvite).not.toBeNull();
    expect(result.current.welcome).toBeNull();

    act(() => orientation?.rotate(false));
    expect(result.current.rotateInvite).toBeNull();
    expect(result.current.welcome).toBe('fullscreen');

    act(() => orientation?.rotate(true));
    expect(result.current.rotateInvite).not.toBeNull();
  });

  it('offers full screen to a return visit that turns sideways from the invitation', () => {
    withFullscreenApi(() => Promise.resolve());
    orientation = fakeOrientation(true);
    const { result } = renderHook(() =>
      useMobileEntry({ isMobileDevice: true, introSeen: true, onIntroSeen: vi.fn() }),
    );
    expect(result.current.rotateInvite).not.toBeNull();

    act(() => orientation?.rotate(false));
    expect(result.current.welcome).toBe('fullscreen');

    // Answered: turning back and forth again does not ask twice.
    act(() => result.current.dismissWelcome());
    act(() => orientation?.rotate(true));
    act(() => orientation?.rotate(false));
    expect(result.current.welcome).toBeNull();
  });

  it('does not offer full screen on a turn after "Look around" put the invitation away', () => {
    withFullscreenApi(() => Promise.resolve());
    orientation = fakeOrientation(true);
    const { result } = renderHook(() =>
      useMobileEntry({ isMobileDevice: true, introSeen: true, onIntroSeen: vi.fn() }),
    );
    act(() => result.current.lookAround());
    act(() => orientation?.rotate(false));
    expect(result.current.welcome).toBeNull();
  });

  it('remembers "Look around" for the session, not forever', () => {
    withFullscreenApi(() => Promise.resolve());
    orientation = fakeOrientation(true);
    const { result, unmount } = renderHook(() =>
      useMobileEntry({ isMobileDevice: true, introSeen: true, onIntroSeen: vi.fn() }),
    );
    act(() => result.current.lookAround());
    expect(result.current.rotateInvite).toBeNull();
    expect(result.current.stoneAttention).toBe(1);
    expect(window.sessionStorage.getItem(PORTRAIT_DISMISSED_KEY)).toBe('1');
    unmount();

    // A reload in the same tab.
    const again = renderHook(() => useMobileEntry({ isMobileDevice: true, introSeen: true, onIntroSeen: vi.fn() }));
    expect(again.result.current.rotateInvite).toBeNull();
  });

  it('stays inert on desktop', () => {
    withFullscreenApi(() => Promise.resolve());
    orientation = fakeOrientation(true);
    const { result } = renderHook(() =>
      useMobileEntry({ isMobileDevice: false, introSeen: false, onIntroSeen: () => {} }),
    );
    expect(result.current.welcome).toBeNull();
    expect(result.current.rotateInvite).toBeNull();
    expect(result.current.fullscreenControl).toBeNull();
    expect(result.current.stoneAttention).toBe(0);
  });
});

describe('resolveFullscreenControl', () => {
  const out = { element: false, standalone: false };
  it('mirrors document.fullscreenElement where the API works', () => {
    expect(resolveFullscreenControl(true, 'api', out)).toBe('enter');
    expect(resolveFullscreenControl(true, 'api', { ...out, element: true })).toBe('exit');
  });

  it('explains the Home Screen on iPhone instead of switching', () => {
    expect(resolveFullscreenControl(true, 'home-screen', out)).toBe('home-screen');
  });

  it('is absent on desktop, without any route, and once launched from the Home Screen', () => {
    expect(resolveFullscreenControl(false, 'api', out)).toBeNull();
    expect(resolveFullscreenControl(true, 'none', out)).toBeNull();
    expect(resolveFullscreenControl(true, 'api', { ...out, standalone: true })).toBeNull();
    expect(resolveFullscreenControl(true, 'home-screen', { ...out, standalone: true })).toBeNull();
  });
});

describe('useMobileEntry full-screen stone', () => {
  const root = document.documentElement as HTMLElement & { requestFullscreen?: unknown };
  afterEach(() => {
    delete (document as unknown as { fullscreenEnabled?: unknown }).fullscreenEnabled;
    delete (document as unknown as { fullscreenElement?: unknown }).fullscreenElement;
    delete (document as unknown as { exitFullscreen?: unknown }).exitFullscreen;
    delete (root as { requestFullscreen?: unknown }).requestFullscreen;
  });

  it('enters, follows fullscreenchange, then leaves', () => {
    const request = vi.fn(() => Promise.resolve());
    const exit = vi.fn(() => Promise.resolve());
    let element: Element | null = null;
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, writable: true, value: exit });
    Object.defineProperty(root, 'requestFullscreen', { configurable: true, writable: true, value: request });

    const { result } = renderHook(() =>
      useMobileEntry({ isMobileDevice: true, introSeen: true, onIntroSeen: () => {} }),
    );
    expect(result.current.fullscreenControl).toBe('enter');

    act(() => result.current.toggleFullscreen());
    expect(request).toHaveBeenCalledTimes(1);

    element = document.documentElement;
    // Chromium reports display-mode: fullscreen during element full screen too; that must not
    // read as a Home Screen launch and hide the stone.
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('fullscreen'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.fullscreenControl).toBe('exit');
    matchMedia.mockRestore();

    act(() => result.current.toggleFullscreen());
    expect(exit).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(1);

    // Leaving (here, or by a swipe) prompts nothing; the stone glints once instead.
    const glints = result.current.stoneAttention;
    element = null;
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.fullscreenControl).toBe('enter');
    expect(result.current.stoneAttention).toBe(glints + 1);
  });
});
