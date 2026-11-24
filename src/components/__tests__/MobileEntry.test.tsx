// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MobileEntry as MobileEntryState } from '../../hooks/useMobileEntry';
import { OSM_SIDE_PANEL, OSM_TAB_RAIL } from '../../layout/osmClientLayout';
import { osmLeftColumnRight } from '../../layout/osmFrame';
import { defaultOsmFrame } from '../../test/helpers/osmFrame';
import { entryFrameStylesheetSprites, landscapeReserves, MobileEntry } from '../MobileEntry';
import { resetPixelSpriteStore } from '../pixelSpriteStore';

/** The decoded stone's pixels, which happy-dom cannot decode: null keeps the real hook. */
const stonePixels = vi.hoisted(() => ({ value: null as readonly (string | null)[] | null }));
vi.mock('../useSpriteCss', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useSpriteCss')>();
  return {
    ...actual,
    useSpritePixels: (src: string, points: readonly (readonly [number, number])[]) => {
      const decoded = actual.useSpritePixels(src, points);
      return stonePixels.value ?? decoded;
    },
  };
});

/**
 * The note reads the real `navigator`, so these override it per case and `afterEach` puts the
 * object back exactly as it was found (an own property restored, or removed where there was none,
 * which uncovers the prototype's getter again).
 */
const NAVIGATOR_KEYS = ['userAgent', 'maxTouchPoints'] as const;
const originalNavigator = NAVIGATOR_KEYS.map((key) => [key, Object.getOwnPropertyDescriptor(navigator, key)] as const);

function setNavigator(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

function restoreNavigator() {
  for (const [key, descriptor] of originalNavigator) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else delete (navigator as unknown as Record<string, unknown>)[key];
  }
}

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
/** iPadOS 13+ sends a Macintosh user agent; only its touch points give it away. */
const IPADOS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC_UA = IPADOS_UA;
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

const IOS_NOTE =
  "We know about some iPhone and iPad issues and are working on fixes. If something looks wrong, that's likely why.";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  stonePixels.value = null;
  restoreNavigator();
});

function entry(overrides: Partial<MobileEntryState> = {}): MobileEntryState {
  return {
    welcome: null,
    rotateInvite: null,
    playFullscreen: vi.fn(),
    dismissWelcome: vi.fn(),
    lookAround: vi.fn(),
    fullscreenControl: 'enter',
    toggleFullscreen: vi.fn(),
    stoneAttention: 0,
    ...overrides,
  };
}

describe('MobileEntry', () => {
  it('renders nothing when the flow has nothing to say', () => {
    const { container } = render(<MobileEntry entry={entry()} />);
    expect(container.innerHTML).toBe('');
  });

  it('offers full screen as the first choice, and "Not now" beside it', () => {
    const state = entry({ welcome: 'fullscreen' });
    render(<MobileEntry entry={state} />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Play full screen', 'Not now']);
    // The full-screen stone's own glyph leads the offer, hidden from the button's name.
    const glyph = screen.getByRole('button', { name: 'Play full screen' }).querySelector('svg[data-stone-glyph]');
    expect(glyph).toHaveAttribute('data-stone-glyph', 'fullscreenEnter');
    expect(glyph).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Not now' }).querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play full screen' }));
    expect(state.playFullscreen).toHaveBeenCalledTimes(1);
  });

  it('gives iPhone one primary answer, not a secondary-sounding one', () => {
    render(<MobileEntry entry={entry({ welcome: 'home-screen' })} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Got it']);
    expect(screen.getByRole('button', { name: 'Got it' }).className).toContain('mobile-entry-stone--primary');
    expect(document.body.textContent).toContain('Add to Home Screen');
    expect(document.body.textContent).not.toContain('Continue in browser');
  });

  it('shows no "needs a mouse and keyboard" list', () => {
    render(<MobileEntry entry={entry({ welcome: 'plain' })} />);
    expect(document.body.textContent).not.toMatch(/mouse|resizing panels/i);
    expect(document.body.textContent).toContain('hold for menus');
  });

  it('is not a wall: a tap outside the sheet answers it, a tap inside does not', () => {
    const state = entry({ welcome: 'fullscreen' });
    render(
      <>
        <div data-testid="scene" />
        <MobileEntry entry={state} />
      </>,
    );
    fireEvent.pointerDown(screen.getByRole('heading'));
    expect(state.dismissWelcome).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByTestId('scene'));
    expect(state.dismissWelcome).toHaveBeenCalledTimes(1);
  });

  it('invites a turn in portrait, with full screen (which turns it) where the screen can be locked', () => {
    const state = entry({ rotateInvite: { canLockLandscape: true } });
    render(<MobileEntry entry={state} />);
    expect(screen.getByRole('heading', { name: 'Best played in landscape' })).toBeDefined();
    // Recommended, not required, and framed as the mobile client's shape.
    expect(document.body.textContent).toContain('matches the OSRS mobile client, which is built for landscape');
    expect(document.body.textContent).not.toMatch(/only (works|plays)|requires?/i);
    const goFullscreen = screen.getByRole('button', { name: 'Go full screen' });
    expect(goFullscreen.querySelector('svg[data-stone-glyph]')).toHaveAttribute('data-stone-glyph', 'fullscreenEnter');
    fireEvent.click(goFullscreen);
    expect(state.playFullscreen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Look around' }));
    expect(state.lookAround).toHaveBeenCalledTimes(1);
  });

  it('makes "Look around" the primary answer where the screen cannot be turned for you', () => {
    render(<MobileEntry entry={entry({ rotateInvite: { canLockLandscape: false } })} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Look around']);
    expect(screen.getByRole('button', { name: 'Look around' }).className).toContain('mobile-entry-stone--primary');
  });

  it('plays its exit before unmounting, holding the content it showed', () => {
    vi.useFakeTimers();
    const { rerender, container } = render(<MobileEntry entry={entry({ rotateInvite: { canLockLandscape: true } })} />);
    rerender(<MobileEntry entry={entry()} />);
    expect(container.querySelector('.mobile-entry-layer--leaving')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Best played in landscape' })).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(container.innerHTML).toBe('');
  });

  it('uses no title attributes', () => {
    const { container } = render(<MobileEntry entry={entry({ welcome: 'fullscreen' })} />);
    expect(container.ownerDocument.querySelectorAll('[title]')).toHaveLength(0);
  });

  it("paints its stones in the tones read from the pack's own stone sprite", () => {
    stonePixels.value = ['rgb(1 2 3)', 'rgb(40 50 60)', null, null, null, null, null, 'rgb(7 8 9)'];
    render(<MobileEntry entry={entry({ welcome: 'fullscreen' })} />);
    const sheet = document.querySelector<HTMLElement>('.mobile-entry-sheet');
    expect(sheet?.style.getPropertyValue('--mobile-entry-stone-outline')).toBe('rgb(1 2 3)');
    expect(sheet?.style.getPropertyValue('--mobile-entry-stone-body')).toBe('rgb(40 50 60)');
    expect(sheet?.style.getPropertyValue('--mobile-entry-stone-pressed')).toBe('rgb(7 8 9)');
    // An undecoded tone is left to the stylesheet's fallback rather than set empty.
    expect(sheet?.style.getPropertyValue('--mobile-entry-stone-lit')).toBe('');
  });

  // A stylesheet pointed at the file would load and decode it a second time (it cannot set
  // `crossOrigin`); the frame is painted from the object URLs the image cache made from the
  // preloaded bytes, and from nothing until they exist.
  it('paints its frame from the image cache’s object URLs, never the files themselves', async () => {
    const realImage = globalThis.Image;
    const realCreate = URL.createObjectURL;
    class LoadingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 3;
      naturalHeight = 3;
      private requested = '';
      get src() {
        return this.requested;
      }
      set src(value: string) {
        this.requested = value;
        queueMicrotask(() => this.onload?.());
      }
      decode() {
        return Promise.resolve();
      }
    }
    globalThis.Image = LoadingImage as unknown as typeof Image;
    vi.stubGlobal('fetch', async () => ({ ok: true, blob: async () => new Blob(['png']) }));
    const made: string[] = [];
    URL.createObjectURL = () => {
      made.push(`blob:frame-${made.length + 1}`);
      return made[made.length - 1];
    };
    try {
      // The sprites' own files, which a stylesheet would otherwise fetch by path.
      resetPixelSpriteStore();
      render(<MobileEntry entry={entry({ welcome: 'fullscreen' })} />);
      const sheet = () => document.querySelector<HTMLElement>('.mobile-entry-sheet');
      expect(sheet()?.style.backgroundImage).not.toContain('/assets/');

      await waitFor(() => expect(sheet()?.style.backgroundImage).not.toContain('none'));
      const layers = sheet()?.style.backgroundImage.split(', ') ?? [];
      expect(layers).toHaveLength(entryFrameStylesheetSprites().length);
      for (const layer of layers) expect(made.map((url) => `url("${url}")`)).toContain(layer);
      expect(made).toHaveLength(new Set(entryFrameStylesheetSprites()).size);
    } finally {
      globalThis.Image = realImage;
      URL.createObjectURL = realCreate;
      vi.unstubAllGlobals();
      resetPixelSpriteStore();
    }
  });

  it('draws every stone color from those tones, at rest and pressed, never a fixed color', () => {
    const css = readFileSync(join(process.cwd(), 'src/components/MobileEntry.css'), 'utf8');
    const rules = [...css.matchAll(/\.mobile-entry-stone(?::active)?\s*\{([^}]*)\}/g)].map((m) => m[1]);
    expect(rules.length).toBeGreaterThanOrEqual(2);
    for (const body of rules) {
      // Hex only as a var() fallback, inside the --stone-* aliases.
      const declarations = body.split(';').filter((d) => /#[0-9a-f]{3,8}\b/i.test(d));
      for (const declaration of declarations)
        expect(declaration).toMatch(/^\s*--stone-[a-z-]+:\s*var\(--mobile-entry-stone-/);
    }
  });

  it('keeps the landscape welcome between the left column and the side panel as drawn', () => {
    const frame = defaultOsmFrame({ width: 640, height: 360 });
    render(<MobileEntry entry={entry({ welcome: 'fullscreen' })} frame={frame} />);
    const layer = document.querySelector<HTMLElement>('.mobile-entry-layer');
    const left = Number.parseFloat(layer?.style.getPropertyValue('--mobile-entry-reserve-left') ?? '');
    const right = Number.parseFloat(layer?.style.getPropertyValue('--mobile-entry-reserve-right') ?? '');
    expect(left).toBe(osmLeftColumnRight(frame));
    // The panel and the expanded rail beside it, at the frame's scale (to its whole-pixel snap).
    expect(right).toBeCloseTo((OSM_SIDE_PANEL.width + OSM_TAB_RAIL.expandedWidth) * frame.scale, 0);
    // At 640x360 the native-size reserves (58 + 289) left 269px; at scale they leave room for the
    // stones on one row.
    expect(640 - left - right - 24).toBeGreaterThan(360);
  });

  // People are finding the mobile sim while known WebKit issues are still open, so an iPhone or
  // iPad player is told before they meet one. Apple touch hardware only: the issues are on this
  // hardware whatever layout the Device setting asks for, and nobody else should read an apology
  // for a platform they are not on.
  describe('the iPhone and iPad note', () => {
    it.each([
      ['an iPhone', IPHONE_UA, 5],
      ['an iPad on its Macintosh user agent', IPADOS_UA, 5],
    ])('tells %s that the issues are known and being worked on', (_name, ua, touchPoints) => {
      setNavigator(ua, touchPoints);
      render(<MobileEntry entry={entry({ welcome: 'home-screen' })} />);
      expect(document.querySelector('.mobile-entry-note')?.textContent).toBe(IOS_NOTE);
    });

    it.each([
      ['a desktop Mac, which reports no touch points', MAC_UA, 0],
      ['Windows', WINDOWS_UA, 0],
      ['an Android phone', ANDROID_UA, 5],
    ])('says nothing on %s', (_name, ua, touchPoints) => {
      setNavigator(ua, touchPoints);
      render(<MobileEntry entry={entry({ welcome: 'fullscreen' })} />);
      expect(document.querySelector('.mobile-entry-note')).toBeNull();
      expect(document.body.textContent).not.toMatch(/iPhone|iPad/);
    });

    // The welcome is landscape-only, and "Look around" keeps a phone upright for the session, so
    // the turn invitation is the only entry an upright iPhone may ever see.
    it('rides along on the portrait turn invitation too', () => {
      setNavigator(IPHONE_UA, 5);
      render(<MobileEntry entry={entry({ rotateInvite: { canLockLandscape: false } })} />);
      expect(document.querySelector('.mobile-entry-note')?.textContent).toBe(IOS_NOTE);
    });

    // Nothing to press and nothing to remember: it leaves with the sheet, so there is no
    // dismissal to persist and no control to keep out of the Tab order.
    it('adds no control to the sheet it sits in', () => {
      setNavigator(IPHONE_UA, 5);
      render(<MobileEntry entry={entry({ welcome: 'fullscreen' })} />);
      expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Play full screen', 'Not now']);
      const note = document.querySelector('.mobile-entry-note');
      expect(note).not.toBeNull();
      expect(note?.querySelector('button, a, [tabindex]')).toBeNull();
    });
  });

  it('measures the reserves inside the safe area, which the stylesheet adds outside them', () => {
    const plain = landscapeReserves(defaultOsmFrame({ width: 844, height: 390 }));
    const notched = landscapeReserves(
      defaultOsmFrame({ width: 844, height: 390 }, { top: 0, right: 0, bottom: 0, left: 47 }),
    );
    expect(notched).toHaveProperty(
      '--mobile-entry-reserve-left',
      (plain as Record<string, string>)['--mobile-entry-reserve-left'],
    );
    expect(landscapeReserves(null)).toEqual({});
  });
});
