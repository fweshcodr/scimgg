// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_MODE_STORAGE_KEY, getDeviceMode, resetDeviceModeForTests, setDeviceMode } from '../deviceMode';
import {
  detectMobileDevice,
  isAppleTouchDevice,
  isMobileDevice,
  isTouchOnlyDevice,
  MOBILE_UA_PATTERN,
  TOUCH_ONLY_QUERY,
  TOUCH_PRIMARY_QUERY,
} from '../mobileDetection';

const UA = {
  iPhone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  androidPhone:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  // A tablet or unfolded foldable: Android, but no "Mobile" token.
  androidTablet:
    'Mozilla/5.0 (Linux; Android 16; SM-F966U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  samsungInternet:
    'Mozilla/5.0 (Linux; Android 16; SAMSUNG SM-F966U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Safari/537.36',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // What Android browsers send in "desktop site" mode, and what a Linux desktop sends.
  linuxDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  chromeOS:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/** Stubs `matchMedia` so only the listed queries match. */
function setMatchingQueries(...matching: string[]): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matching.includes(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  });
}

/**
 * These are getters on the Navigator prototype, so we install configurable
 * own properties and delete them in `afterEach`.
 */
function setNavigator(
  ua: string,
  maxTouchPoints = 0,
  extra: { platform?: string; userAgentData?: { mobile: boolean; platform?: string } } = {},
): void {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => maxTouchPoints });
  Object.defineProperty(navigator, 'platform', { configurable: true, get: () => extra.platform ?? '' });
  Object.defineProperty(navigator, 'userAgentData', { configurable: true, get: () => extra.userAgentData });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { matchMedia?: unknown }).matchMedia;
  for (const key of ['userAgent', 'maxTouchPoints', 'platform', 'userAgentData']) {
    delete (navigator as unknown as Record<string, unknown>)[key];
  }
  localStorage.removeItem(DEVICE_MODE_STORAGE_KEY);
  resetDeviceModeForTests();
});

describe('isAppleTouchDevice', () => {
  it('recognizes iPhone and iPadOS posing as a Mac', () => {
    setNavigator(UA.iPhone, 5);
    expect(isAppleTouchDevice()).toBe(true);
    setNavigator(UA.mac, 5);
    expect(isAppleTouchDevice()).toBe(true);
  });

  it('does not treat a real Mac or Android as Apple touch', () => {
    setNavigator(UA.mac, 0);
    expect(isAppleTouchDevice()).toBe(false);
    setNavigator(UA.androidPhone, 5);
    expect(isAppleTouchDevice()).toBe(false);
  });
});

describe('Device setting overrides detection', () => {
  it('Mobile forces a desktop computer to mobile and touch', () => {
    setMatchingQueries();
    setNavigator(UA.windows, 0);
    setDeviceMode('mobile');
    expect(detectMobileDevice()).toBe(false);
    expect(isMobileDevice()).toBe(true);
    expect(isTouchOnlyDevice()).toBe(true);
  });

  it('Desktop forces a phone to desktop', () => {
    setMatchingQueries();
    setNavigator(UA.samsungInternet, 10);
    setDeviceMode('desktop');
    expect(isMobileDevice()).toBe(false);
    expect(isTouchOnlyDevice()).toBe(false);
  });

  it('Desktop keeps touch input on a screen that has no mouse', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY, TOUCH_PRIMARY_QUERY);
    setNavigator(UA.iPhone, 5);
    setDeviceMode('desktop');
    expect(isMobileDevice()).toBe(false);
    expect(isTouchOnlyDevice()).toBe(true);
  });

  it('Automatic follows detection, and survives a reload from storage', () => {
    setMatchingQueries();
    setNavigator(UA.windows, 0);
    setDeviceMode('mobile');
    resetDeviceModeForTests();
    expect(isMobileDevice()).toBe(true);
    setDeviceMode('auto');
    expect(isMobileDevice()).toBe(false);
  });

  it('an unknown stored value falls back to Automatic', () => {
    localStorage.setItem(DEVICE_MODE_STORAGE_KEY, '"tablet"');
    expect(getDeviceMode()).toBe('auto');
  });
});

describe('isMobileDevice — phones and tablets', () => {
  it('iPhone → true', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY, TOUCH_PRIMARY_QUERY);
    setNavigator(UA.iPhone, 5);
    expect(isMobileDevice()).toBe(true);
  });

  it('Android phone → true', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY, TOUCH_PRIMARY_QUERY);
    setNavigator(UA.androidPhone, 5);
    expect(isMobileDevice()).toBe(true);
  });

  it('Samsung foldable that reports a fine pointer and hover (stylus / virtual mouse) → true', () => {
    setMatchingQueries();
    setNavigator(UA.androidTablet, 10);
    expect(isMobileDevice()).toBe(true);
    setNavigator(UA.samsungInternet, 10);
    expect(isMobileDevice()).toBe(true);
  });

  it('Chromium client hints say mobile → true', () => {
    setMatchingQueries();
    setNavigator(UA.linuxDesktop, 5, { userAgentData: { mobile: true } });
    expect(isMobileDevice()).toBe(true);
  });

  it('iPadOS disguised as Macintosh with touch points → true, even with a trackpad attached', () => {
    setMatchingQueries();
    setNavigator(UA.mac, 5);
    expect(isMobileDevice()).toBe(true);
  });

  it('explicit iPad UA (pre-iPadOS 13) → true', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY, TOUCH_PRIMARY_QUERY);
    setNavigator(UA.ipadLegacy, 5);
    expect(isMobileDevice()).toBe(true);
  });

  it('Android in desktop-site mode: Linux UA + touch-primary pointer → true', () => {
    setMatchingQueries(TOUCH_PRIMARY_QUERY);
    setNavigator(UA.linuxDesktop, 10, { platform: 'Linux x86_64' });
    expect(isMobileDevice()).toBe(true);
  });

  it('Android in desktop-site mode with a misreported pointer: Linux UA + touch + ARM platform → true', () => {
    setMatchingQueries();
    setNavigator(UA.linuxDesktop, 10, { platform: 'Linux armv81' });
    expect(isMobileDevice()).toBe(true);
  });

  it('touch is the only input, desktop user agent (desktop site requested) → true', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY);
    setNavigator(UA.linuxDesktop, 10, { platform: 'Linux x86_64' });
    expect(isMobileDevice()).toBe(true);
  });

  it('Windows tablet with its keyboard detached (touch is the only input) → true', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY, TOUCH_PRIMARY_QUERY);
    setNavigator(UA.windows, 10);
    expect(isMobileDevice()).toBe(true);
  });

  it('ChromeOS in tablet mode (touch is the only input) → true', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY, TOUCH_PRIMARY_QUERY);
    setNavigator(UA.chromeOS, 10, { platform: 'Linux armv81' });
    expect(isMobileDevice()).toBe(true);
  });

  it('works without matchMedia (UA alone decides)', () => {
    setNavigator(UA.iPhone, 5);
    expect(isMobileDevice()).toBe(true);
  });
});

describe('isMobileDevice — computers stay desktop', () => {
  it('desktop Chrome on Windows → false', () => {
    setMatchingQueries();
    setNavigator(UA.windows, 0);
    expect(isMobileDevice()).toBe(false);
  });

  it('desktop Safari on Mac → false', () => {
    setMatchingQueries();
    setNavigator(UA.mac, 0);
    expect(isMobileDevice()).toBe(false);
  });

  it('Windows touchscreen laptop → false', () => {
    setMatchingQueries();
    setNavigator(UA.windows, 10);
    expect(isMobileDevice()).toBe(false);
  });

  it('coarse-only pointer with no touch hardware (e.g. TV remote) → false', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY);
    setNavigator(UA.linuxDesktop, 0, { platform: 'Linux x86_64' });
    expect(isMobileDevice()).toBe(false);
  });

  it('Linux desktop with no touch hardware → false', () => {
    setMatchingQueries();
    setNavigator(UA.linuxDesktop, 0, { platform: 'Linux x86_64' });
    expect(isMobileDevice()).toBe(false);
  });

  it('Linux touchscreen laptop with a mouse-primary pointer → false', () => {
    setMatchingQueries();
    setNavigator(UA.linuxDesktop, 10, { platform: 'Linux x86_64' });
    expect(isMobileDevice()).toBe(false);
  });

  it('ChromeOS touch laptop with its trackpad → false', () => {
    setMatchingQueries();
    setNavigator(UA.chromeOS, 10, { platform: 'Linux armv81' });
    expect(isMobileDevice()).toBe(false);
  });

  it('Chromium client hints say not mobile → no effect on its own', () => {
    setMatchingQueries();
    setNavigator(UA.windows, 0, { userAgentData: { mobile: false } });
    expect(isMobileDevice()).toBe(false);
  });
});

describe('isTouchOnlyDevice', () => {
  it('touch-only media query → true', () => {
    setMatchingQueries(TOUCH_ONLY_QUERY);
    setNavigator(UA.windows, 10);
    expect(isTouchOnlyDevice()).toBe(true);
  });

  it('phone that advertises a fine pointer → true', () => {
    setMatchingQueries();
    setNavigator(UA.samsungInternet, 10);
    expect(isTouchOnlyDevice()).toBe(true);
  });

  it('touchscreen laptop → false', () => {
    setMatchingQueries();
    setNavigator(UA.windows, 10);
    expect(isTouchOnlyDevice()).toBe(false);
  });
});

describe('MOBILE_UA_PATTERN', () => {
  it('matches common phone and tablet user agents', () => {
    for (const ua of ['iPhone', 'iPad', 'Android', 'BlackBerry', 'Opera Mini', 'Windows Phone Mobile']) {
      expect(MOBILE_UA_PATTERN.test(ua)).toBe(true);
    }
  });

  it('does not match desktop strings', () => {
    expect(MOBILE_UA_PATTERN.test('Macintosh; Intel Mac OS X 10_15_7')).toBe(false);
    expect(MOBILE_UA_PATTERN.test('Windows NT 10.0; Win64; x64')).toBe(false);
    expect(MOBILE_UA_PATTERN.test('X11; Linux x86_64')).toBe(false);
    expect(MOBILE_UA_PATTERN.test('X11; CrOS x86_64 14541.0.0')).toBe(false);
  });
});
