import { describe, expect, it } from 'vitest';
import { chatboxClearance, chatboxPlacement } from '../chatboxLayout';
import { FIXED_CHAT, FIXED_CHAT_CONTROLS } from '../osrsClientLayout';

const place = (overrides: Partial<Parameters<typeof chatboxPlacement>[0]>) =>
  chatboxPlacement({
    layout: 'modern',
    visible: true,
    frame: { width: 1280, height: 760 },
    fixedScale: 1,
    resizableScale: 1,
    insetLeft: 0,
    ...overrides,
  });

/** The four window sizes the layouts are checked at. */
const SIZES = [
  { width: 1024, height: 640 },
  { width: 1280, height: 760 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];

describe('chatboxPlacement', () => {
  it('keeps Fixed on the cache rectangle, times the frame stretch', () => {
    expect(place({ layout: 'fixed', fixedScale: 2 })).toEqual({
      scale: 2,
      rect: { x: 0, y: FIXED_CHAT.y * 2, width: FIXED_CHAT.width * 2, height: FIXED_CHAT.height * 2 },
    });
    expect(place({ layout: 'fixed', visible: false, fixedScale: 2 })?.rect).toEqual({
      x: 0,
      y: FIXED_CHAT_CONTROLS.y * 2,
      width: FIXED_CHAT_CONTROLS.width * 2,
      height: FIXED_CHAT_CONTROLS.height * 2,
    });
  });

  it.each(['modern', 'classic'] as const)('pins %s to the bottom-left corner at the side panel scale', (layout) => {
    for (const frame of SIZES) {
      const placement = place({ layout, frame });
      expect(placement).toEqual({
        scale: 1,
        rect: { x: 0, y: frame.height - FIXED_CHAT.height, width: FIXED_CHAT.width, height: FIXED_CHAT.height },
      });
    }
    expect(place({ layout, resizableScale: 1.5 })?.rect.height).toBe(FIXED_CHAT.height * 1.5);
  });

  it('collapses a resizable chatbox to its controls row, still on the bottom edge', () => {
    expect(place({ visible: false })?.rect).toEqual({
      x: 0,
      y: 760 - FIXED_CHAT_CONTROLS.height,
      width: FIXED_CHAT.width,
      height: FIXED_CHAT_CONTROLS.height,
    });
  });

  it('moves past a sidebar covering the left edge, as the launcher row does', () => {
    expect(place({ insetLeft: 320 })?.rect.x).toBe(320);
  });

  it('shrinks rather than run off a screen narrower than the chatbox at its scale', () => {
    const placement = place({ frame: { width: 800, height: 600 }, resizableScale: 2, insetLeft: 60 });
    expect(placement?.scale).toBeCloseTo((800 - 60) / FIXED_CHAT.width);
    expect((placement?.rect.x ?? 0) + (placement?.rect.width ?? 0)).toBeCloseTo(800);
  });

  it('has nothing for Mobile, which does not draw the chatbox', () => {
    expect(place({ layout: 'mobile' })).toBeNull();
  });
});

describe('chatboxClearance', () => {
  it('is the distance from the bottom edge to the chatbox top', () => {
    expect(chatboxClearance(place({}), 760)).toBe(FIXED_CHAT.height);
    expect(chatboxClearance(place({ visible: false }), 760)).toBe(FIXED_CHAT_CONTROLS.height);
    expect(chatboxClearance(place({ layout: 'fixed', fixedScale: 1.27 }), 503 * 1.27)).toBeCloseTo(
      FIXED_CHAT.height * 1.27,
      10,
    );
  });

  it('is zero with no chatbox', () => {
    expect(chatboxClearance(null, 760)).toBe(0);
  });
});
