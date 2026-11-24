// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EncounterRegistry } from '../../core/encounters/encounterFactory';
import { infernoSetupQuery } from '../../encounters/inferno/setupLink';
import { dismissInfernoSetupLinkNotice, getInfernoSetupLinkNotice } from '../../encounters/inferno/setupLinkNotice';
import { createEmptyCombatSupplies } from '../../types/encounterLoadout';
import { createEmptyInventory } from '../../types/inventory';
import type { MechanicsConfig } from '../../types/simulation';
import { useInfernoSetupLink } from '../useInfernoSetupLink';
import { INFERNO_SETUP_QUERY_SETTLE_MS, useInfernoSetupQuery } from '../useInfernoSetupQuery';
import { type SceneState, useRouting } from '../useRouting';

const WAVE_5 = 'bat=[[1,5]]&blob=[[3,11]]';
const WAVE_5_SAVED = { infernoStartWave: '5', infernoSpawnLayout: '5:bl-------' };

function gearExport(): string {
  const inv = new Array(28).fill(null);
  inv[0] = { id: 6685 };
  const eq = new Array(14).fill(null);
  eq[0] = { id: 21018 };
  return JSON.stringify({ setup: { name: 'Inferno', inv, eq }, layout: [] });
}

function registry(): EncounterRegistry {
  const encounters = new EncounterRegistry();
  for (const [kind, displayName] of [
    ['inferno', 'The Inferno'],
    ['yama_p3', 'Yama'],
    ['lobby', 'Lobby'],
  ]) {
    encounters.register(kind, () => ({}) as never, {
      kind,
      displayName,
      description: '',
      mapSquare: { x: 0, y: 0 },
      playerStart: [0, 0],
    });
  }
  return encounters;
}

const address = () => window.location.pathname + window.location.search;
const STORED = {
  mechanics: undefined,
  loadout: { equipment: {}, inventory: createEmptyInventory(), supplies: createEmptyCombatSupplies() },
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
  dismissInfernoSetupLinkNotice();
});

describe('useInfernoSetupQuery', () => {
  it('shows the setup at once on becoming active, settles edits, and drops it at once when inactive', () => {
    const hook = renderHook(({ query, active }) => useInfernoSetupQuery(query, active), {
      initialProps: { query: 'wave=5', active: false },
    });
    expect(hook.result.current.query).toBe('');
    hook.rerender({ query: 'wave=5', active: true });
    expect(hook.result.current.query).toBe('wave=5');
    // Typing 4 then 40: one write, once the field has been still.
    hook.rerender({ query: 'wave=4', active: true });
    act(() => vi.advanceTimersByTime(INFERNO_SETUP_QUERY_SETTLE_MS - 100));
    hook.rerender({ query: 'wave=40', active: true });
    act(() => vi.advanceTimersByTime(INFERNO_SETUP_QUERY_SETTLE_MS - 1));
    expect(hook.result.current.query).toBe('wave=5');
    act(() => vi.advanceTimersByTime(1));
    expect(hook.result.current.query).toBe('wave=40');
    hook.rerender({ query: 'wave=40', active: false });
    expect(hook.result.current.query).toBe('');
  });
});

/**
 * App's wiring of the address: the boot link, the mirror and the router over one saved setup, with
 * the setup card and the scene as plain state.
 */
function mountApp(url: string, initialSaved: Partial<MechanicsConfig> = {}) {
  window.history.replaceState(null, '', url);
  const encounters = registry();
  // Every way into the fight: the router's, and the link's.
  const entries = { router: vi.fn(), start: vi.fn() };
  const hook = renderHook(() => {
    const [saved, setSaved] = useState(initialSaved);
    const [scene, setScene] = useState<SceneState>({ kind: 'lobby' });
    const [cardOpen, setCardOpen] = useState(false);
    useInfernoSetupLink({
      saved,
      saveLoadout: () => {},
      stored: STORED,
      restore: () => {},
      openSetup: (mechanics) => {
        setSaved((current) => ({ ...current, ...mechanics }));
        setCardOpen(true);
      },
      start: (mechanics, loadout) => {
        entries.start(mechanics, loadout);
        setSaved((current) => ({ ...current, ...mechanics }));
        setScene({ kind: 'loading', targetEncounter: 'inferno' });
      },
    });
    const sceneKind =
      scene.kind === 'encounter' ? scene.encounterKind : scene.kind === 'loading' ? scene.targetEncounter : null;
    const query = useInfernoSetupQuery(
      infernoSetupQuery(saved),
      sceneKind === 'inferno' || (scene.kind === 'lobby' && cardOpen),
    );
    const enter = (kind: string) => {
      entries.router(kind);
      setScene({ kind: 'loading', targetEncounter: kind });
    };
    useRouting(scene, enter, () => setScene({ kind: 'lobby' }), encounters, query);
    return { saved, scene, setSaved, setScene, setCardOpen };
  });
  return Object.assign(hook, { entries });
}

/** Lets the router's navigation guard lapse and any edit settle. */
function settle(): void {
  act(() => vi.advanceTimersByTime(INFERNO_SETUP_QUERY_SETTLE_MS));
}

describe('the address bar’s Inferno setup', () => {
  it('starts a gear link, then mirrors the applied setup without its gear', () => {
    const app = mountApp(`/inferno/?${WAVE_5}&setup=${encodeURIComponent(gearExport())}&popout=1`);
    settle();
    expect(app.result.current.scene).toEqual({ kind: 'loading', targetEncounter: 'inferno' });
    expect(getInfernoSetupLinkNotice()).toMatchObject({ tone: 'success' });
    expect(address()).toBe(`/inferno/?wave=5&${WAVE_5}&popout=1`);
  });

  it('opens a gearless link on the setup card, mirrored there', () => {
    const app = mountApp('/inferno/?wave=31&pillars=west');
    settle();
    expect(app.result.current.scene).toEqual({ kind: 'lobby' });
    expect(address()).toBe('/?wave=31&pillars=west');
    // Start from the card carries it onto the fight's route.
    act(() => app.result.current.setScene({ kind: 'loading', targetEncounter: 'inferno' }));
    expect(address()).toBe('/inferno/?wave=31&pillars=west');
  });

  it('follows edits once settled, stays plain for the default, and clears on leaving', () => {
    const app = mountApp('/inferno/?popout=1');
    settle();
    expect(app.result.current.scene).toEqual({ kind: 'loading', targetEncounter: 'inferno' });
    expect(address()).toBe('/inferno/?popout=1');
    act(() => app.result.current.setSaved({ infernoStartWave: '4' }));
    act(() => app.result.current.setSaved({ infernoStartWave: '40' }));
    expect(address()).toBe('/inferno/?popout=1');
    settle();
    expect(address()).toBe('/inferno/?wave=40&popout=1');
    act(() => app.result.current.setSaved({ infernoStartWave: '40', infernoSouthPillarDestroyed: true }));
    settle();
    expect(address()).toBe('/inferno/?wave=40&pillars=south&popout=1');
    // Back to the untouched default: the plain route.
    act(() => app.result.current.setSaved({}));
    settle();
    expect(address()).toBe('/inferno/?popout=1');
    act(() => app.result.current.setSaved({ infernoStartWave: '40' }));
    settle();
    act(() => app.result.current.setScene({ kind: 'encounter', encounterKind: 'yama_p3' }));
    expect(address()).toBe('/yama/?popout=1');
    act(() => app.result.current.setScene({ kind: 'lobby' }));
    expect(address()).toBe('/?popout=1');
  });

  it('reloads its own mirror silently, into the fight as the plain route does', () => {
    const app = mountApp(`/inferno/?wave=5&${WAVE_5}`, WAVE_5_SAVED);
    settle();
    expect(getInfernoSetupLinkNotice()).toBeNull();
    expect(app.result.current.scene).toEqual({ kind: 'loading', targetEncounter: 'inferno' });
    expect(app.entries.router).not.toHaveBeenCalled();
    expect(app.entries.start).toHaveBeenCalledExactlyOnceWith({}, undefined);
    expect(address()).toBe(`/inferno/?wave=5&${WAVE_5}`);
    // And it is still the mirror's to change.
    act(() => app.result.current.setSaved({ ...WAVE_5_SAVED, infernoSpawnLayout: '' }));
    settle();
    expect(address()).toBe('/inferno/?wave=5');
  });

  it('keeps other parameters in place while the setup changes', () => {
    const app = mountApp('/inferno/?debug=1');
    settle();
    act(() => app.result.current.setSaved({ infernoStartWave: '12' }));
    settle();
    expect(address()).toBe('/inferno/?wave=12&debug=1');
    act(() => app.result.current.setSaved({ infernoStartWave: '13' }));
    settle();
    expect(address()).toBe('/inferno/?wave=13&debug=1');
  });
});
