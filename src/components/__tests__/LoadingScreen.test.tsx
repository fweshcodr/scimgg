// @vitest-environment happy-dom

import { act, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheDownloadState } from '../../cache/CacheManager';
import { TIPS, tipsForDevice } from '../../data/tips';
import { presetGpuStatus } from '../../util/gpuDetection';
import { formatTipText, LoadingScreen } from '../LoadingScreen';

const touchOnly = vi.hoisted(() => ({ current: false }));
vi.mock('../../hooks/useIsTouchOnly', () => ({ useIsTouchOnly: () => touchOnly.current }));

function progress(percent: number): CacheDownloadState {
  return { status: 'loading', stage: 'downloading', percent, detail: `${percent} of 100 MB` };
}

describe('LoadingScreen', () => {
  beforeEach(() => {
    presetGpuStatus({ status: 'hardware', renderer: 'test', vendor: null });
  });

  afterEach(() => {
    presetGpuStatus(null);
    touchOnly.current = false;
    vi.useRealTimers();
  });

  // Cache progress lands faster than React commits. If a progress change made the screen schedule a
  // second update from an effect, every commit's passive effects would carry one, and React logs
  // "Maximum update depth exceeded" once 50 commits in a row do.
  it('renders each progress update in a single commit', () => {
    let commits = 0;
    const tree = (state: CacheDownloadState) => (
      <Profiler
        id="loading"
        onRender={() => {
          commits += 1;
        }}
      >
        <LoadingScreen cacheState={state} isFullyLoaded={false} />
      </Profiler>
    );
    const { rerender } = render(tree(progress(0)));
    commits = 0;

    for (let percent = 1; percent <= 5; percent += 1) rerender(tree(progress(percent)));

    expect(commits).toBe(5);
    expect(screen.getByText('Downloading Cache')).toBeTruthy();
    expect(screen.getByText('5 of 100 MB')).toBeTruthy();
  });

  it('derives the status line from the cache state', () => {
    const { rerender } = render(<LoadingScreen cacheState={{ status: 'idle' }} isFullyLoaded={false} />);
    expect(screen.getByText('Initializing...')).toBeTruthy();

    rerender(<LoadingScreen cacheState={{ status: 'success' }} isFullyLoaded={false} />);
    expect(screen.getByText('Loading Assets')).toBeTruthy();
    expect(screen.getByText('Preparing game world...')).toBeTruthy();

    rerender(<LoadingScreen cacheState={{ status: 'success' }} isFullyLoaded />);
    expect(screen.queryByText('Loading Assets')).toBeNull();
    expect(screen.queryByText('Preparing game world...')).toBeNull();

    rerender(<LoadingScreen cacheState={{ status: 'error', message: 'Network down' }} isFullyLoaded={false} />);
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('Network down')).toBeTruthy();
  });

  /** Every tip text the screen shows across one full rotation of this device's list. */
  function shownTips(): Set<string> {
    vi.useFakeTimers();
    const { container } = render(<LoadingScreen cacheState={progress(10)} isFullyLoaded={false} />);
    const shown = new Set<string>();
    const read = () => container.querySelector('.loading-tip-text')?.textContent ?? '';
    shown.add(read());
    // A tip changes 600ms (its fade) after each 6s tick, so read 600ms past every tick.
    act(() => {
      vi.advanceTimersByTime(600);
    });
    for (let step = 0; step < TIPS.length; step += 1) {
      act(() => {
        vi.advanceTimersByTime(6000);
      });
      shown.add(read());
    }
    return shown;
  }

  it('rotates through every desktop tip and no touch-only tip on a mouse and keyboard device', () => {
    const shown = shownTips();
    expect(shown).toEqual(new Set(tipsForDevice(false).map((tip) => tip.text)));
    for (const tip of TIPS.filter((t) => t.device === 'touch')) expect(shown.has(tip.text)).toBe(false);
  });

  it('rotates through every touch tip and no desktop-only tip on a touch-only device', () => {
    touchOnly.current = true;
    const shown = shownTips();
    expect(shown).toEqual(new Set(tipsForDevice(true).map((tip) => tip.text)));
    for (const tip of TIPS.filter((t) => t.device === 'desktop')) expect(shown.has(tip.text)).toBe(false);
  });
});

describe('tipsForDevice', () => {
  it('leaves both devices tips to show, and shares the device-neutral ones', () => {
    const desktop = tipsForDevice(false);
    const touch = tipsForDevice(true);
    expect(desktop.length).toBeGreaterThan(0);
    expect(touch.length).toBeGreaterThan(0);
    for (const tip of TIPS.filter((t) => t.device === undefined)) {
      expect(desktop).toContain(tip);
      expect(touch).toContain(tip);
    }
  });
});

describe('formatTipText', () => {
  it('marks whole key names only', () => {
    const { container } = render(<p>{formatTipText('Hold Alt and Right-click. Alternate Escape stays plain.')}</p>);
    const keys = [...container.querySelectorAll('kbd')].map((kbd) => kbd.textContent);
    expect(keys).toEqual(['Alt', 'Right-click']);
    expect(container.textContent).toBe('Hold Alt and Right-click. Alternate Escape stays plain.');
  });
});
