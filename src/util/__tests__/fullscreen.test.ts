import { describe, expect, it, vi } from 'vitest';
import {
  canLockLandscape,
  canRequestFullscreen,
  enterFullscreenLandscape,
  exitFullscreen,
  resolveFullscreenRoute,
} from '../fullscreen';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPADOS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

/** A document stand-in carrying only the members the helpers read. */
function fakeDocument(options: {
  enabled?: boolean;
  webkitEnabled?: boolean;
  request?: () => Promise<void>;
  webkitRequest?: () => void;
}): Document {
  return {
    fullscreenEnabled: options.enabled ?? false,
    webkitFullscreenEnabled: options.webkitEnabled,
    documentElement: { requestFullscreen: options.request, webkitRequestFullscreen: options.webkitRequest },
  } as unknown as Document;
}

function fakeNavigator(userAgent: string, maxTouchPoints = 5): Navigator {
  return { userAgent, maxTouchPoints } as Navigator;
}

function fakeWindow(lock?: (orientation: string) => Promise<void>): Window {
  return { screen: { orientation: lock ? { lock } : {} } } as unknown as Window;
}

describe('resolveFullscreenRoute', () => {
  it('uses the Fullscreen API on Android Chrome', () => {
    const doc = fakeDocument({ enabled: true, request: () => Promise.resolve() });
    expect(resolveFullscreenRoute(doc, fakeNavigator(ANDROID_UA))).toBe('api');
  });

  it('uses the prefixed API on older iPadOS Safari', () => {
    const doc = fakeDocument({ webkitEnabled: true, webkitRequest: () => {} });
    expect(resolveFullscreenRoute(doc, fakeNavigator(IPADOS_UA))).toBe('api');
  });

  it('sends iPhone, which has no element fullscreen, to the Home Screen', () => {
    // iPhone Safari exposes the method on some builds but reports it disabled.
    const doc = fakeDocument({ enabled: false, request: () => Promise.reject(new Error('no')) });
    expect(resolveFullscreenRoute(doc, fakeNavigator(IPHONE_UA))).toBe('home-screen');
  });

  it('offers nothing in a non-Apple browser without the API', () => {
    expect(resolveFullscreenRoute(fakeDocument({}), fakeNavigator(ANDROID_UA))).toBe('none');
  });

  it('needs both the enabled flag and the method', () => {
    expect(canRequestFullscreen(fakeDocument({ enabled: true }))).toBe(false);
    expect(canRequestFullscreen(fakeDocument({ request: () => Promise.resolve() }))).toBe(false);
  });
});

describe('enterFullscreenLandscape', () => {
  it('requests fullscreen with hidden navigation, then locks landscape', async () => {
    const request = vi.fn(() => Promise.resolve());
    const lock = vi.fn(() => Promise.resolve());
    await expect(enterFullscreenLandscape(fakeDocument({ enabled: true, request }), fakeWindow(lock))).resolves.toBe(
      true,
    );
    expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' });
    expect(lock).toHaveBeenCalledWith('landscape');
  });

  it('requests fullscreen synchronously, inside the tap', () => {
    const request = vi.fn(() => Promise.resolve());
    void enterFullscreenLandscape(fakeDocument({ enabled: true, request }), fakeWindow());
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('ignores a rejected orientation lock', async () => {
    const lock = vi.fn(() => Promise.reject(new DOMException('not supported', 'NotSupportedError')));
    const doc = fakeDocument({ enabled: true, request: () => Promise.resolve() });
    await expect(enterFullscreenLandscape(doc, fakeWindow(lock))).resolves.toBe(true);
  });

  it('reports false, without locking, when fullscreen is refused', async () => {
    const lock = vi.fn(() => Promise.resolve());
    const doc = fakeDocument({ enabled: true, request: () => Promise.reject(new TypeError('denied')) });
    await expect(enterFullscreenLandscape(doc, fakeWindow(lock))).resolves.toBe(false);
    expect(lock).not.toHaveBeenCalled();
  });

  it('falls back to the prefixed request', async () => {
    const webkitRequest = vi.fn();
    const doc = fakeDocument({ webkitEnabled: true, webkitRequest });
    await expect(enterFullscreenLandscape(doc, fakeWindow())).resolves.toBe(true);
    expect(webkitRequest).toHaveBeenCalledTimes(1);
  });
});

describe('exitFullscreen', () => {
  it('uses the standard call, then the prefixed one, and swallows a refusal', async () => {
    const exit = vi.fn(() => Promise.reject(new TypeError('not in full screen')));
    await expect(exitFullscreen({ exitFullscreen: exit } as unknown as Document)).resolves.toBeUndefined();
    expect(exit).toHaveBeenCalledTimes(1);
    const webkit = vi.fn();
    await exitFullscreen({ webkitExitFullscreen: webkit } as unknown as Document);
    expect(webkit).toHaveBeenCalledTimes(1);
  });
});

describe('canLockLandscape', () => {
  const doc = fakeDocument({ enabled: true, request: () => Promise.resolve() });
  const withNav = (nav: Navigator, lock?: () => Promise<void>) =>
    ({ navigator: nav, screen: { orientation: lock ? { lock } : {} } }) as unknown as Window;

  it('is true on Android, where full screen can lock landscape', () => {
    expect(
      canLockLandscape(
        doc,
        withNav(fakeNavigator(ANDROID_UA), () => Promise.resolve()),
      ),
    ).toBe(true);
  });

  it('is false on iPadOS, which refuses the lock, and without full screen or a lock', () => {
    expect(
      canLockLandscape(
        doc,
        withNav(fakeNavigator(IPADOS_UA, 5), () => Promise.resolve()),
      ),
    ).toBe(false);
    expect(
      canLockLandscape(
        fakeDocument({}),
        withNav(fakeNavigator(ANDROID_UA), () => Promise.resolve()),
      ),
    ).toBe(false);
    expect(canLockLandscape(doc, withNav(fakeNavigator(ANDROID_UA)))).toBe(false);
  });
});
