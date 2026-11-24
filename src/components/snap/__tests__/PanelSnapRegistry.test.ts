import { describe, expect, it } from 'vitest';
import {
  type ContactKind,
  type PanelRect,
  type ResolveSnapInput,
  resolveSnap,
  SNAP_ALIGN_BONUS_PX,
  SNAP_ENGAGE_PX,
  SNAP_GAP_PX,
  SNAP_PREVIEW_PX,
  SNAP_RELEASE_PX,
} from '../PanelSnapRegistry';

function rect(id: string, left: number, top: number, width: number, height: number): PanelRect {
  return { id, left, top, right: left + width, bottom: top + height };
}

function input(overrides: Partial<ResolveSnapInput> = {}): ResolveSnapInput {
  return {
    movingId: 'moving',
    movingLeft: 100,
    movingTop: 100,
    movingWidth: 50,
    movingHeight: 40,
    siblings: [],
    prevEngagement: null,
    ...overrides,
  };
}

function targetForRightToLeft(id: string, delta: number): PanelRect {
  return rect(id, 150 + SNAP_GAP_PX + delta, 80, 50, 80);
}

function targetForLeftToRight(id: string, delta: number): PanelRect {
  return rect(id, 100 - SNAP_GAP_PX + delta - 50, 80, 50, 80);
}

function targetForBottomToTop(id: string, delta: number, left = 80): PanelRect {
  return rect(id, left, 140 + SNAP_GAP_PX + delta, 100, 50);
}

function targetForTopToBottom(id: string, delta: number, left = 80): PanelRect {
  return rect(id, left, 100 - SNAP_GAP_PX + delta - 50, 100, 50);
}

describe('resolveSnap', () => {
  it('engages right-to-left contact', () => {
    const c = { delta: SNAP_ENGAGE_PX - 4 };
    const result = resolveSnap(input({ siblings: [targetForRightToLeft('A', c.delta)] }));

    expect(result.dx).toBe(c.delta);
    expect(result.dy).toBe(0);
    expect(result.engagement?.contact).toBe('right-to-left');
    expect(result.engagement?.state).toBe('engaged');
    expect(result.engagement?.gapChannel).toEqual({ left: 160, top: 100, width: SNAP_GAP_PX, height: 40 });
  });

  it('engages left-to-right contact', () => {
    const c = { delta: -(SNAP_ENGAGE_PX - 4) };
    const result = resolveSnap(input({ siblings: [targetForLeftToRight('A', c.delta)] }));

    expect(result.dx).toBe(c.delta);
    expect(result.dy).toBe(0);
    expect(result.engagement?.contact).toBe('left-to-right');
    expect(result.engagement?.state).toBe('engaged');
    expect(result.engagement?.gapChannel).toEqual({ left: 85, top: 100, width: SNAP_GAP_PX, height: 40 });
  });

  it('engages bottom-to-top contact', () => {
    const c = { delta: SNAP_ENGAGE_PX - 6 };
    const result = resolveSnap(input({ siblings: [targetForBottomToTop('A', c.delta)] }));

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(c.delta);
    expect(result.engagement?.contact).toBe('bottom-to-top');
    expect(result.engagement?.state).toBe('engaged');
    expect(result.engagement?.gapChannel).toEqual({ left: 100, top: 148, width: 50, height: SNAP_GAP_PX });
  });

  it('engages top-to-bottom contact', () => {
    const c = { delta: -(SNAP_ENGAGE_PX - 6) };
    const result = resolveSnap(input({ siblings: [targetForTopToBottom('A', c.delta)] }));

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(c.delta);
    expect(result.engagement?.contact).toBe('top-to-bottom');
    expect(result.engagement?.state).toBe('engaged');
    expect(result.engagement?.gapChannel).toEqual({ left: 100, top: 87, width: 50, height: SNAP_GAP_PX });
  });

  it('returns no engagement for empty siblings', () => {
    expect(resolveSnap(input())).toEqual({ dx: 0, dy: 0, engagement: null });
  });

  it('returns no engagement when closest sibling is outside preview distance', () => {
    const result = resolveSnap(input({ siblings: [targetForRightToLeft('A', SNAP_PREVIEW_PX + 1)] }));

    expect(result).toEqual({ dx: 0, dy: 0, engagement: null });
  });

  it('previews at the snap destination without applying live deltas', () => {
    const delta = SNAP_ENGAGE_PX + 6;
    const result = resolveSnap(input({ siblings: [targetForRightToLeft('A', delta)] }));

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.engagement?.state).toBe('preview');
    expect(result.engagement?.movingRect).toEqual({ left: 120, top: 100, right: 170, bottom: 140 });
    expect(result.engagement?.gapChannel).toEqual({ left: 170, top: 100, width: SNAP_GAP_PX, height: 40 });
  });

  it('keeps an existing engagement when a closer sibling is only in preview range', () => {
    const result = resolveSnap(
      input({
        siblings: [targetForRightToLeft('A', SNAP_RELEASE_PX - 4), targetForRightToLeft('B', SNAP_ENGAGE_PX + 2)],
        prevEngagement: { targetId: 'A', contact: 'right-to-left' },
      }),
    );

    expect(result.dx).toBe(SNAP_RELEASE_PX - 4);
    expect(result.dy).toBe(0);
    expect(result.engagement?.targetId).toBe('A');
    expect(result.engagement?.state).toBe('engaged');
  });

  it('releases the sticky target after release distance and falls to best new preview', () => {
    const result = resolveSnap(
      input({
        siblings: [targetForRightToLeft('A', SNAP_RELEASE_PX + 2), targetForRightToLeft('B', SNAP_ENGAGE_PX + 2)],
        prevEngagement: { targetId: 'A', contact: 'right-to-left' },
      }),
    );

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(0);
    expect(result.engagement?.targetId).toBe('B');
    expect(result.engagement?.state).toBe('preview');
  });

  it('falls through to best new when previous target is absent', () => {
    const result = resolveSnap(
      input({
        siblings: [targetForRightToLeft('B', SNAP_ENGAGE_PX - 1)],
        prevEngagement: { targetId: 'A', contact: 'right-to-left' },
      }),
    );

    expect(result.dx).toBe(SNAP_ENGAGE_PX - 1);
    expect(result.engagement?.targetId).toBe('B');
    expect(result.engagement?.state).toBe('engaged');
  });

  it('applies horizontal alignment bonus for bottom-to-top contact', () => {
    const targetLeft = 100 + SNAP_ALIGN_BONUS_PX - 4;
    const result = resolveSnap(input({ siblings: [targetForBottomToTop('A', SNAP_ENGAGE_PX - 6, targetLeft)] }));

    expect(result.dx).toBe(targetLeft - 100);
    expect(result.dy).toBe(SNAP_ENGAGE_PX - 6);
    expect(result.engagement?.contact).toBe('bottom-to-top');
  });

  it('does not apply horizontal alignment bonus outside the threshold', () => {
    const targetLeft = 100 + SNAP_ALIGN_BONUS_PX + 1;
    const result = resolveSnap(input({ siblings: [targetForBottomToTop('A', SNAP_ENGAGE_PX - 6, targetLeft)] }));

    expect(result.dx).toBe(0);
    expect(result.dy).toBe(SNAP_ENGAGE_PX - 6);
  });

  it('applies vertical alignment bonus for right-to-left contact', () => {
    const targetTop = 100 - SNAP_ALIGN_BONUS_PX + 3;
    const target = rect('A', 150 + SNAP_GAP_PX + 7, targetTop, 50, 80);
    const result = resolveSnap(input({ siblings: [target] }));

    expect(result.dx).toBe(7);
    expect(result.dy).toBe(targetTop - 100);
    expect(result.engagement?.contact).toBe('right-to-left');
  });

  it('does not generate a vertical seam candidate without perpendicular overlap', () => {
    const belowAndLeft = rect('A', 150 + SNAP_GAP_PX + 5, 145, 50, 40);
    const result = resolveSnap(input({ siblings: [belowAndLeft] }));

    expect(result).toEqual({ dx: 0, dy: 0, engagement: null });
  });

  it('preserves the contact kind on the selected engagement', () => {
    const contact: ContactKind = 'top-to-bottom';
    const result = resolveSnap(input({ siblings: [targetForTopToBottom('A', -5)] }));

    expect(result.engagement?.contact).toBe(contact);
  });
});

describe('resolveSnap destination validation', () => {
  it('discards a candidate whose destination fails validation', () => {
    const result = resolveSnap(
      input({
        siblings: [targetForRightToLeft('A', SNAP_ENGAGE_PX - 4)],
        isDestinationValid: () => false,
      }),
    );

    expect(result).toEqual({ dx: 0, dy: 0, engagement: null });
  });

  it('chooses the nearest valid candidate when the closest one is invalid', () => {
    // A lands the panel at left 106 (distance 6), B at left 112 (distance 12).
    const result = resolveSnap(
      input({
        siblings: [targetForRightToLeft('A', SNAP_ENGAGE_PX - 8), targetForRightToLeft('B', SNAP_ENGAGE_PX - 2)],
        isDestinationValid: (dest) => dest.left !== 100 + (SNAP_ENGAGE_PX - 8),
      }),
    );

    expect(result.dx).toBe(SNAP_ENGAGE_PX - 2);
    expect(result.engagement?.targetId).toBe('B');
    expect(result.engagement?.state).toBe('engaged');
  });

  it('drops an invalid sticky target and falls through to a valid best new', () => {
    // Sticky A (distance 20, within release) would normally beat B, but its
    // destination is illegal.
    const result = resolveSnap(
      input({
        siblings: [targetForRightToLeft('A', SNAP_RELEASE_PX - 4), targetForRightToLeft('B', SNAP_ENGAGE_PX - 2)],
        prevEngagement: { targetId: 'A', contact: 'right-to-left' },
        isDestinationValid: (dest) => dest.left !== 100 + (SNAP_RELEASE_PX - 4),
      }),
    );

    expect(result.dx).toBe(SNAP_ENGAGE_PX - 2);
    expect(result.engagement?.targetId).toBe('B');
    expect(result.engagement?.state).toBe('engaged');
  });

  it('keeps a valid sticky target over a closer invalid one', () => {
    const result = resolveSnap(
      input({
        siblings: [targetForRightToLeft('A', SNAP_RELEASE_PX - 4), targetForRightToLeft('B', SNAP_ENGAGE_PX - 8)],
        prevEngagement: { targetId: 'A', contact: 'right-to-left' },
        isDestinationValid: (dest) => dest.left !== 100 + (SNAP_ENGAGE_PX - 8),
      }),
    );

    expect(result.dx).toBe(SNAP_RELEASE_PX - 4);
    expect(result.engagement?.targetId).toBe('A');
    expect(result.engagement?.state).toBe('engaged');
  });

  it('validates the destination including the perpendicular alignment bonus', () => {
    // bottom-to-top contact whose alignment bonus shifts the landing to left
    // 104; the gate rejects exactly that shifted destination.
    const result = resolveSnap(
      input({
        siblings: [targetForBottomToTop('A', SNAP_ENGAGE_PX - 6, 104)],
        isDestinationValid: (dest) => dest.left !== 104,
      }),
    );

    expect(result).toEqual({ dx: 0, dy: 0, engagement: null });
  });

  it('accepts the aligned destination when the gate allows it', () => {
    const result = resolveSnap(
      input({
        siblings: [targetForBottomToTop('A', SNAP_ENGAGE_PX - 6, 104)],
        isDestinationValid: (dest) => dest.left === 104,
      }),
    );

    expect(result.dx).toBe(4);
    expect(result.dy).toBe(SNAP_ENGAGE_PX - 6);
    expect(result.engagement?.contact).toBe('bottom-to-top');
  });
});
