// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOBILE_TOOL_WINDOW,
  inReplayMode,
  locateToolWindowTarget,
  type MobileToolWindowState,
  type ReplaySyncInput,
  resolveToolWindowView,
  syncReplay,
  toolWindowReducer,
} from '../osmToolWindowState';

const open = (tab: MobileToolWindowState['tab']): MobileToolWindowState => ({ open: true, tab });

describe('toolWindowReducer', () => {
  it('starts closed, on Practice', () => {
    expect(DEFAULT_MOBILE_TOOL_WINDOW).toEqual({ open: false, tab: 'practice' });
    // The stone opens it there.
    expect(toolWindowReducer(DEFAULT_MOBILE_TOOL_WINDOW, { type: 'dock' })).toEqual({ open: true, tab: 'practice' });
  });

  it('closes from the open tab itself, as the side panel does, and reopens there from the stone', () => {
    const closed = toolWindowReducer(open('menu'), { type: 'close' });
    expect(closed).toEqual({ open: false, tab: 'menu' });
    expect(toolWindowReducer(closed, { type: 'dock' })).toMatchObject({ open: true, tab: 'menu' });
    // Any tab opens a closed window on that tab.
    expect(toolWindowReducer(closed, { type: 'select', tab: 'practice' })).toEqual({ open: true, tab: 'practice' });
    // Closing is never a toggle: a window already closed stays closed.
    expect(toolWindowReducer(closed, { type: 'close' })).toBe(closed);
  });

  it('docks and restores from the stone in one tap each, back on the same tab', () => {
    const docked = toolWindowReducer(open('practice'), { type: 'dock' });
    expect(docked).toMatchObject({ open: false, tab: 'practice' });
    expect(toolWindowReducer(docked, { type: 'dock' })).toMatchObject({ open: true, tab: 'practice' });
  });

  it('switches tabs, and selecting the tab already open changes nothing (tapping it closes instead)', () => {
    const practice = toolWindowReducer(open('menu'), { type: 'select', tab: 'practice' });
    expect(practice).toEqual({ open: true, tab: 'practice' });
    expect(toolWindowReducer(practice, { type: 'select', tab: 'practice' })).toBe(practice);
    // A tab of a docked window opens it on that tab.
    expect(toolWindowReducer({ ...practice, open: false }, { type: 'select', tab: 'menu' })).toEqual({
      open: true,
      tab: 'menu',
    });
  });

  it('docks behind a menu choice, back on Practice', () => {
    const menu = toolWindowReducer(open('practice'), { type: 'select', tab: 'menu' });
    expect(toolWindowReducer(menu, { type: 'menuChosen' })).toEqual({ open: false, tab: 'practice' });
  });

  it('shows the Replay tab when playback starts, docked or not', () => {
    const docked = { ...open('menu'), open: false };
    expect(toolWindowReducer(docked, { type: 'replayStarted' })).toMatchObject({ open: true, tab: 'replay' });
  });
});

describe('the Replay tab is replay mode', () => {
  const replaying = toolWindowReducer(open('menu'), { type: 'select', tab: 'replay' });

  it('is replay mode only while the Replay tab shows', () => {
    expect(replaying).toEqual({ open: true, tab: 'replay' });
    expect(inReplayMode(replaying)).toBe(true);
    expect(inReplayMode(open('practice'))).toBe(false);
    expect(inReplayMode({ ...replaying, open: false })).toBe(false);
  });

  it('leaves replay mode, back on Practice, by every way out of the tab', () => {
    for (const tab of ['practice', 'menu'] as const) {
      expect(inReplayMode(toolWindowReducer(replaying, { type: 'select', tab }))).toBe(false);
    }
    // Closing from the Replay tab itself, back on Practice.
    const closed = toolWindowReducer(replaying, { type: 'close' });
    expect(closed).toMatchObject({ open: false, tab: 'practice' });
    expect(inReplayMode(closed)).toBe(false);
    // Docking from the pop-out stone or the transport's ✕ (which docks).
    const docked = toolWindowReducer(replaying, { type: 'dock' });
    expect(docked).toMatchObject({ open: false, tab: 'practice' });
    // Reopening the window never restarts a replay.
    expect(inReplayMode(toolWindowReducer(docked, { type: 'dock' }))).toBe(false);
    // Selecting Replay again keeps the replay going.
    expect(toolWindowReducer(replaying, { type: 'select', tab: 'replay' })).toBe(replaying);
  });

  it('returns to Practice when playback ends elsewhere (Take Over), and only from the Replay tab', () => {
    expect(toolWindowReducer(replaying, { type: 'replayEnded' })).toEqual({ open: true, tab: 'practice' });
    expect(toolWindowReducer(open('menu'), { type: 'replayEnded' })).toEqual(open('menu'));
  });

  describe('syncReplay', () => {
    const at = (input: Partial<ReplaySyncInput>): ReplaySyncInput => ({
      wasMode: false,
      isMode: false,
      wasReplaying: false,
      isReplaying: false,
      hasRecording: true,
      ...input,
    });

    it('plays the last fight back when the tab is chosen', () => {
      expect(syncReplay(at({ isMode: true }))).toEqual({ playback: 'enter', window: null });
    });

    it('starts nothing without a recording: the tab says there is none', () => {
      expect(syncReplay(at({ isMode: true, hasRecording: false }))).toEqual({ playback: null, window: null });
    });

    it('exits playback when the tab is left, however it was left', () => {
      expect(syncReplay(at({ wasMode: true, wasReplaying: true, isReplaying: true }))).toEqual({
        playback: 'exit',
        window: null,
      });
    });

    it('shows the tab for a replay started elsewhere, and does not start a second one', () => {
      expect(syncReplay(at({ isReplaying: true }))).toEqual({ playback: null, window: { type: 'replayStarted' } });
      expect(syncReplay(at({ wasMode: false, isMode: true, wasReplaying: true, isReplaying: true }))).toEqual({
        playback: null,
        window: null,
      });
    });

    it('leaves the tab when playback ends elsewhere', () => {
      expect(syncReplay(at({ wasMode: true, isMode: true, wasReplaying: true }))).toEqual({
        playback: null,
        window: { type: 'replayEnded' },
      });
    });

    it('does nothing when neither changed', () => {
      expect(syncReplay(at({ wasMode: true, isMode: true, wasReplaying: true, isReplaying: true }))).toEqual({
        playback: null,
        window: null,
      });
      expect(syncReplay(at({}))).toEqual({ playback: null, window: null });
    });
  });
});

describe('the tutorial rule', () => {
  const docked = { ...open('practice'), open: false };

  it('leaves the user’s state alone with no step, or a step elsewhere', () => {
    expect(resolveToolWindowView(docked, null)).toEqual({
      open: false,
      collapsed: false,
      tab: 'practice',
      forced: false,
    });
    expect(resolveToolWindowView(open('menu'), null)).toEqual({
      open: true,
      collapsed: false,
      tab: 'menu',
      forced: false,
    });
  });

  it('holds the window open on the tab a step’s target is in', () => {
    expect(resolveToolWindowView(docked, { kind: 'body', tab: 'menu' })).toEqual({
      open: true,
      collapsed: false,
      tab: 'menu',
      forced: true,
    });
  });

  it('keeps a targeted tab meaning “open this tab”', () => {
    // "Open Practice" with the window docked, or open on Practice: fold to the tab row, so the
    // tab shows unselected and still opens it.
    expect(resolveToolWindowView(docked, { kind: 'tab', tab: 'practice' })).toMatchObject({
      open: true,
      collapsed: true,
    });
    expect(resolveToolWindowView(open('practice'), { kind: 'tab', tab: 'practice' })).toMatchObject({
      open: true,
      collapsed: true,
    });
    // Open on another tab, the window stays as the user left it.
    expect(resolveToolWindowView(open('menu'), { kind: 'tab', tab: 'practice' })).toMatchObject({
      open: true,
      collapsed: false,
      tab: 'menu',
    });
    // Docked on another tab, nothing of it shows: just the row.
    expect(resolveToolWindowView({ ...docked, tab: 'menu' }, { kind: 'tab', tab: 'practice' })).toMatchObject({
      collapsed: true,
    });
  });

  it('finds a target in a pane or on a tab, and nowhere else', () => {
    const menu = document.createElement('div');
    const settings = document.createElement('button');
    menu.appendChild(settings);
    const practiceTab = document.createElement('button');
    const roots = { bodies: { menu }, tabs: { practice: practiceTab } };
    expect(locateToolWindowTarget(settings, roots)).toEqual({ kind: 'body', tab: 'menu' });
    expect(locateToolWindowTarget(practiceTab, roots)).toEqual({ kind: 'tab', tab: 'practice' });
    expect(locateToolWindowTarget(document.createElement('div'), roots)).toBeNull();
    expect(locateToolWindowTarget(null, roots)).toBeNull();
  });
});
