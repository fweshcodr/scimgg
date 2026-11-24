// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EncounterSnapshot } from '../../core/encounters/snapshot';
import {
  encounterCurrentSetup,
  encounterInfobox,
  encounterPracticeSession,
  encounterSetupStage,
} from '../../encounters/practiceChrome';
import type { PracticeSessionState } from '../../types/practiceSession';
import { PracticeSessionBar } from '../PracticeSessionBar';
import { OutcomePracticeActions } from '../ReplayPractice';
import { makeReplayPractice } from './ReplayPractice.fixtures';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function infernoSnapshot(wave: number, startSpawnLayout = '', pinnedWave?: number): EncounterSnapshot {
  return {
    kind: 'inferno',
    state: {
      wave,
      startWave: 1,
      startDestroyedPillars: { west: false, south: false, northEast: false },
      startSpawnLayout,
      startPlayerTile: '',
      ...(pinnedWave === undefined ? {} : { pinnedWave }),
      waveSpawnLayout: '',
      waveStartDestroyedPillars: { west: false, south: false, northEast: false },
      waveStartPlayerTile: null,
      phase: 'active',
      nextWaveTick: null,
      pillars: [],
      zuk: null,
    },
    visuals: { pillarLocs: [], zukControlTick: null },
  };
}

function session(overrides: Partial<PracticeSessionState> = {}): PracticeSessionState {
  return {
    title: 'Wave 47',
    primary: { label: 'Retry wave 47', hint: 'Start wave 47 again with your custom layout.', onClick: vi.fn() },
    secondary: {
      label: 'Random spawns',
      hint: 'Start wave 47 again with random spawns instead of your custom layout.',
      onClick: vi.fn(),
    },
    ...overrides,
  };
}

describe('encounter practice session', () => {
  it('names the wave the restart will repeat, and offers Lock layout beside Retry on a random wave', () => {
    const run = vi.fn();
    const state = encounterPracticeSession(infernoSnapshot(52), run);
    expect(state?.title).toBe('Wave 52');
    expect(state?.primary.label).toBe('Retry wave 52');
    expect(state?.primary.hint).toBe('Start wave 52 again with new random spawns. Ctrl+R does the same.');
    // Retry rolls new spawns here, so the second restart is the one that keeps them.
    expect(state?.secondary?.label).toBe('Lock layout');
    expect(state?.secondary?.hint).toBe(
      'Restart wave 52 with this spawn layout and lock it for retries. Retry and Ctrl+R repeat it until you leave the wave. Go and Restart fight clear the lock. Your saved custom layout is unchanged.',
    );
    state?.primary.onClick();
    expect(run).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'retry-wave' });
    state?.secondary?.onClick();
    expect(run).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'keep-spawns' });
    // A layout for another wave leaves this one random.
    expect(encounterPracticeSession(infernoSnapshot(52, '6:-b-l----b'), run)?.secondary?.label).toBe('Lock layout');
  });

  it.each([
    52, 68,
  ])('names kept spawns in the title and offers New spawns, as the way back to random, once wave %i’s are kept', (wave) => {
    const run = vi.fn();
    const state = encounterPracticeSession(infernoSnapshot(wave, '', wave), run);
    expect(state?.title).toBe(`Wave ${wave} · spawn layout locked`);
    expect(state?.primary.hint).toBe(`Start wave ${wave} again with the locked spawn layout. Ctrl+R does the same.`);
    expect(state?.secondary?.label).toBe('New spawns');
    expect(state?.secondary?.hint).toBe(
      `Restart wave ${wave} with new random spawns and clear the layout lock. Retry and Ctrl+R generate new spawns on each attempt.`,
    );
    state?.primary.onClick();
    expect(run).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'retry-wave' });
    state?.secondary?.onClick();
    expect(run).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'reroll-wave' });
  });

  it('ignores spawns kept for a wave the run has moved past', () => {
    const state = encounterPracticeSession(infernoSnapshot(53, '', 52), vi.fn());
    expect(state?.title).toBe('Wave 53');
    expect(state?.primary.hint).toBe('Start wave 53 again with new random spawns. Ctrl+R does the same.');
    expect(state?.secondary?.label).toBe('Lock layout');
  });

  it.each([67, 69])('offers Retry alone on wave %i, which has no spawns to roll or keep', (wave) => {
    // 67's one Jad stands on a fixed tile; 69's run seed picks only a random shield start.
    for (const snapshot of [infernoSnapshot(wave), infernoSnapshot(wave, '', wave)]) {
      const state = encounterPracticeSession(snapshot, vi.fn());
      expect(state?.primary.label).toBe(`Retry wave ${wave}`);
      expect(state?.primary.hint).toBe(`Start wave ${wave} again. Ctrl+R does the same.`);
      expect(state?.secondary).toBeUndefined();
    }
  });

  it('offers Lock layout on wave 68, whose three Jads spawn in a seeded order', () => {
    const run = vi.fn();
    const state = encounterPracticeSession(infernoSnapshot(68), run);
    expect(state?.primary.hint).toBe('Start wave 68 again with new random spawns. Ctrl+R does the same.');
    expect(state?.secondary?.label).toBe('Lock layout');
    state?.secondary?.onClick();
    expect(run).toHaveBeenCalledWith({ encounter: 'inferno', type: 'keep-spawns' });
  });

  it('offers Random spawns, as the way back to random, instead of Lock layout on the wave the run places from a custom layout', () => {
    const run = vi.fn();
    const state = encounterPracticeSession(infernoSnapshot(6, '6:-b-l----b'), run);
    expect(state?.title).toBe('Wave 6');
    expect(state?.primary.label).toBe('Retry wave 6');
    expect(state?.primary.hint).toBe('Start wave 6 again with your custom layout. Ctrl+R does the same.');
    expect(state?.secondary?.label).toBe('Random spawns');
    expect(state?.secondary?.hint).toBe(
      'Restart wave 6 with random spawns instead of your custom layout for this run. Retry and Ctrl+R generate new spawns on each attempt. Your custom layout stays saved for Go and Restart fight.',
    );
    state?.primary.onClick();
    expect(run).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'retry-wave' });
    state?.secondary?.onClick();
    expect(run).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'reroll-wave' });
  });

  it('publishes only an actual spawned layout and the pillars at that spawn', () => {
    const snapshot = infernoSnapshot(6);
    if (snapshot.kind !== 'inferno') throw new Error('Wrong fixture');
    const active = {
      ...snapshot,
      state: {
        ...snapshot.state,
        waveSpawnLayout: '6:-b-l----b',
        waveStartDestroyedPillars: { west: true, south: false, northEast: false },
      },
    };
    expect(encounterCurrentSetup(active)).toMatchObject({
      infernoStartWave: '6',
      infernoSpawnLayout: '6:-b-l----b',
      infernoWestPillarDestroyed: true,
    });
    expect(encounterCurrentSetup(snapshot)).toBeUndefined();
    expect(encounterCurrentSetup({ ...active, state: { ...active.state, wave: 7 } })).toBeUndefined();
  });

  it('offers nothing in an encounter that has no stages to repeat', () => {
    const lobby = { kind: 'lobby', state: {}, visuals: {} } as EncounterSnapshot;
    expect(encounterPracticeSession(lobby, vi.fn())).toBeNull();
    expect(encounterInfobox(lobby)).toBeNull();
    expect(encounterSetupStage(lobby)).toBeNull();
  });

  it.each([6, 67, 68])('shares wave %s’s actual starting tile, not the original run setup', (wave) => {
    const snapshot = infernoSnapshot(wave);
    if (snapshot.kind !== 'inferno') throw new Error('Wrong fixture');
    expect(
      encounterCurrentSetup({
        ...snapshot,
        state: {
          ...snapshot.state,
          startPlayerTile: '34,44',
          waveStartPlayerTile: [33, 43],
          waveSpawnLayout: wave === 6 ? '6:-b-l----b' : '',
        },
      }),
    ).toMatchObject({ infernoStartWave: String(wave), infernoStartTile: '33,43' });
  });

  /**
   * A primitive, so the hosts can memoize their run handle on it: the Mobile tool window keeps
   * Practice mounted and skips re-rendering it only while its props hold identity.
   */
  it('reports the stage as a bare number the setup surfaces can memoize on', () => {
    expect(encounterSetupStage(infernoSnapshot(52))).toBe(52);
    expect(encounterSetupStage(infernoSnapshot(52))).toBe(encounterSetupStage(infernoSnapshot(52)));
  });

  it('publishes the wave as a run-state infobox tile', () => {
    const tile = encounterInfobox(infernoSnapshot(47));
    expect(tile).toMatchObject({
      id: 'inferno-wave',
      text: '47',
      tooltipTitle: 'Inferno',
      tooltipDetail: 'Wave 47 of 69',
    });
  });
});

describe('practice session bar', () => {
  it('runs each action and explains it in the app hover card', () => {
    vi.useFakeTimers();
    const state = session();
    render(<PracticeSessionBar session={state} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry wave 47' }));
    expect(state.primary.onClick).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Random spawns' }));
    expect(state.secondary?.onClick).toHaveBeenCalledOnce();
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Random spawns' }), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Start wave 47 again with random spawns instead of your custom layout.',
    );
  });

  it('keeps both actions in words at every width, dropping only the repeated title', () => {
    const state = session();
    const view = render(<PracticeSessionBar session={state} />);
    expect(screen.getByText('Wave 47')).toBeInTheDocument();
    view.rerender(<PracticeSessionBar session={state} presentation="labelled" />);
    expect(screen.getByText('Wave 47')).toBeInTheDocument();
    view.rerender(<PracticeSessionBar session={state} presentation="compact" />);
    expect(view.container.querySelector('.session-bar__title')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry wave 47' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Random spawns' })).toBeInTheDocument();
  });
});

describe('terminal screens', () => {
  it('leads with the stage restart, and keeps the whole-fight restart available', () => {
    const state = session();
    const onRestart = vi.fn();
    render(<OutcomePracticeActions encounterSession={state} onRestart={onRestart} />);
    const primary = screen.getByRole('button', { name: /Retry wave 47/ });
    fireEvent.click(primary);
    expect(state.primary.onClick).toHaveBeenCalledOnce();
    expect(onRestart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Random spawns' }));
    expect(state.secondary?.onClick).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Restart fight' }));
    expect(onRestart).toHaveBeenCalledOnce();
    // Ctrl+R runs the stage restart too, so the primary claims it and the whole-fight one does not.
    expect(primary).toHaveTextContent('Ctrl+R');
    expect(screen.getByRole('button', { name: 'Restart fight' })).not.toHaveTextContent('Ctrl+R');
  });

  it('gives a replay practice start the primary action back', () => {
    const controls = makeReplayPractice({ startTick: 124 });
    render(<OutcomePracticeActions controls={controls} encounterSession={session()} onRestart={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Restart from tick 124/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Random spawns' })).toBeNull();
  });

  it('is the plain restart where the encounter offers no stage of its own', () => {
    const onRestart = vi.fn();
    render(<OutcomePracticeActions onRestart={onRestart} />);
    const primary = screen.getByRole('button', { name: /Restart fight/ });
    expect(primary).toHaveTextContent('Ctrl+R');
    fireEvent.click(primary);
    expect(onRestart).toHaveBeenCalledOnce();
  });
});
