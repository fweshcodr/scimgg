import { describe, expect, it } from 'vitest';
import {
  type AttachRect,
  DOCKED_WITHIN_PX,
  detectAttachments,
  resolveAttachedRects,
  SNAP_GAP_PX,
} from '../panelAttachment';

const VIEWPORT = { width: 1920, height: 970 };
const box = (id: string, left: number, top: number, width: number, height: number): AttachRect => ({
  id,
  left,
  top,
  right: left + width,
  bottom: top + height,
});

// The game panel in the bottom-right corner, and an infobox strip docked above it,
// right edges aligned.
const gamePanel = box('gamePanel', 1920 - 240, 970 - 330, 240, 330);
const strip = box('strip', 1920 - 150, 970 - 330 - SNAP_GAP_PX - 40, 150, 40);

describe('detectAttachments', () => {
  it('attaches the smaller panel to the one it docks against, keeping gap and alignment', () => {
    expect(detectAttachments([gamePanel, strip], VIEWPORT).get('strip')).toEqual({
      id: 'strip',
      hostId: 'gamePanel',
      side: 'above',
      gap: SNAP_GAP_PX,
      align: 'end',
      offset: 0,
    });
    expect(detectAttachments([gamePanel, strip], VIEWPORT).has('gamePanel')).toBe(false);
  });

  it('only counts a docking gap, with a shared edge', () => {
    const far = box('far', strip.left, strip.top - DOCKED_WITHIN_PX - 1 - 40, 150, 40);
    const slid = box('slid', 1920 - 240 - 150 - 1, strip.top, 150, 40);
    expect(detectAttachments([gamePanel, far], VIEWPORT).size).toBe(0);
    expect(detectAttachments([gamePanel, slid], VIEWPORT).size).toBe(0);
  });

  it('lets a panel hugging a viewport edge host a larger one that does not', () => {
    const orbs = box('orbs', 1920 - 60, 200, 60, 150);
    const big = box('big', 1920 - 60 - SNAP_GAP_PX - 300, 200, 300, 200);
    expect(detectAttachments([orbs, big], VIEWPORT).get('big')?.hostId).toBe('orbs');
  });

  it('lets a corner panel host a larger one docked to it along the same edge', () => {
    // The modern layout: the tab bar in the corner, the panel body 2px above it.
    const tabBar = box('tabBar', 1920 - 240, 970 - 36, 240, 36);
    const body = box('body', 1920 - 240, 970 - 36 - 2 - 330, 240, 330);
    expect(detectAttachments([tabBar, body], VIEWPORT).get('body')).toMatchObject({
      hostId: 'tabBar',
      side: 'above',
      gap: 2,
    });
  });

  it('forms a chain rather than a cycle', () => {
    const top = box('top', 1920 - 100, strip.top - SNAP_GAP_PX - 30, 100, 30);
    const attachments = detectAttachments([gamePanel, strip, top], VIEWPORT);
    expect(attachments.get('strip')?.hostId).toBe('gamePanel');
    expect(attachments.get('top')?.hostId).toBe('strip');
  });

  it('never makes an owner-positioned panel follow, but lets it host', () => {
    const attachments = detectAttachments([gamePanel, strip], VIEWPORT, (id) => id !== 'strip');
    expect(attachments.size).toBe(0);
  });
});

describe('resolveAttachedRects', () => {
  it('places a chain from the root outwards against the host’s new rect', () => {
    const top = box('top', 1920 - 100, strip.top - SNAP_GAP_PX - 30, 100, 30);
    const attachments = detectAttachments([gamePanel, strip, top], VIEWPORT);
    // Everything doubled: the host where its own rule put it, the others still where theirs did.
    const current = new Map([
      ['gamePanel', box('gamePanel', 1920 - 480, 970 - 660, 480, 660)],
      ['strip', box('strip', 1000, 100, 300, 80)],
      ['top', box('top', 10, 10, 200, 60)],
    ]);
    const resolved = resolveAttachedRects(attachments, current);
    expect(resolved.get('strip')).toEqual(box('strip', 1920 - 300, 970 - 660 - SNAP_GAP_PX - 80, 300, 80));
    expect(resolved.get('top')).toEqual(box('top', 1920 - 200, 970 - 660 - 2 * SNAP_GAP_PX - 80 - 60, 200, 60));
    expect(resolved.has('gamePanel')).toBe(false);
  });

  it('keeps a side-by-side pair level and gapped', () => {
    const flick = box('flick', 300, 200, 208, 144);
    const dps = box('dps', 300 + 208 + SNAP_GAP_PX, 200, 208, 94);
    const attachments = detectAttachments([flick, dps], VIEWPORT);
    expect(attachments.get('dps')).toMatchObject({ hostId: 'flick', side: 'right', align: 'start', offset: 0 });
    const resolved = resolveAttachedRects(
      attachments,
      new Map([
        ['flick', box('flick', 250, 150, 416, 288)],
        ['dps', box('dps', 0, 0, 416, 188)],
      ]),
    );
    expect(resolved.get('dps')).toEqual(box('dps', 250 + 416 + SNAP_GAP_PX, 150, 416, 188));
  });

  it('leaves assembly clamping to the solver, preserving the arranged gap', () => {
    const attachments = detectAttachments([gamePanel, strip], VIEWPORT);
    const resolved = resolveAttachedRects(
      attachments,
      new Map([
        ['gamePanel', box('gamePanel', 1920 - 480, 0, 480, 960)],
        ['strip', box('strip', 0, 0, 300, 80)],
      ]),
    );
    expect(resolved.get('strip')?.top).toBe(-85);
  });
});
