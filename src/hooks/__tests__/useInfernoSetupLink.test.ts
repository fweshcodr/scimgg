// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissInfernoSetupLinkNotice, getInfernoSetupLinkNotice } from '../../encounters/inferno/setupLinkNotice';
import { createEmptyCombatSupplies } from '../../types/encounterLoadout';
import { createEmptyInventory } from '../../types/inventory';
import type { MechanicsConfig } from '../../types/simulation';
import { type InfernoSetupLinkActions, type InfernoStoredChoices, useInfernoSetupLink } from '../useInfernoSetupLink';

function gearExport(): string {
  const inv = new Array(28).fill(null);
  inv[0] = { id: 6685 };
  const eq = new Array(14).fill(null);
  eq[0] = { id: 21018 };
  return JSON.stringify({ setup: { name: 'Inferno', inv, eq }, layout: [] });
}

const WAVE_5 = 'bat=[[1,5]]&blob=[[3,11]]';

const STORED_BEFORE: InfernoStoredChoices = {
  mechanics: { infernoStartWave: '12' },
  loadout: { equipment: { weapon: 4151 }, inventory: createEmptyInventory(), supplies: createEmptyCombatSupplies() },
};

function mount(url: string, saved: Partial<MechanicsConfig> = {}) {
  window.history.replaceState(null, '', url);
  const actions = {
    saveLoadout: vi.fn<InfernoSetupLinkActions['saveLoadout']>(),
    openSetup: vi.fn<InfernoSetupLinkActions['openSetup']>(),
    start: vi.fn<InfernoSetupLinkActions['start']>(),
    restore: vi.fn<InfernoSetupLinkActions['restore']>(),
  };
  // `stored` in the props stands for the Inferno choices as App's store holds them.
  type Props = { stored?: InfernoStoredChoices };
  const hook = renderHook(
    (props: Props) =>
      useInfernoSetupLink({
        ...actions,
        saved,
        stored: props.stored ?? STORED_BEFORE,
      }),
    { initialProps: {} as Props, wrapper: StrictMode },
  );
  return { ...actions, hook };
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
  dismissInfernoSetupLinkNotice();
});

describe('useInfernoSetupLink', () => {
  it('starts the run once with complete gear, saving it as the current loadout', () => {
    const { saveLoadout, openSetup, start, hook } = mount(
      `/inferno/?${WAVE_5}&setup=${encodeURIComponent(gearExport())}`,
    );
    hook.rerender({});
    expect(start).toHaveBeenCalledTimes(1);
    const [mechanics, loadout] = start.mock.calls[0];
    expect(mechanics).toMatchObject({ infernoStartWave: '5', infernoSpawnLayout: '5:bl-------' });
    expect(loadout?.equipment).toEqual({ head: 21018 });
    expect(saveLoadout).toHaveBeenCalledExactlyOnceWith(loadout);
    expect(openSetup).not.toHaveBeenCalled();
    expect(getInfernoSetupLinkNotice()).toMatchObject({ tone: 'success' });
    // Consumed: the address is the lobby's, so neither the router nor a reload reads it again.
    expect(window.location.pathname + window.location.search).toBe('/');
  });

  describe('Undo on the notice', () => {
    const linkLeft: InfernoStoredChoices = { ...STORED_BEFORE, mechanics: { infernoStartWave: '5' } };

    it('restores the options and gear as they were before the link, once, and closes the notice', () => {
      const { restore, hook } = mount(`/inferno/?${WAVE_5}&setup=${encodeURIComponent(gearExport())}`);
      // The store as the link left it.
      hook.rerender({ stored: linkLeft });
      const undo = getInfernoSetupLinkNotice()?.undo;
      expect(undo).toBeDefined();
      act(() => undo?.());
      expect(restore).toHaveBeenCalledExactlyOnceWith(STORED_BEFORE);
      expect(getInfernoSetupLinkNotice()).toBeNull();
      act(() => undo?.());
      expect(restore).toHaveBeenCalledOnce();
    });

    it('is withdrawn, the notice staying, once those options or that gear change after the link', () => {
      const { restore, hook } = mount(`/?${WAVE_5}`);
      hook.rerender({ stored: linkLeft });
      // A re-render with the same choices keeps it.
      hook.rerender({ stored: { ...linkLeft } });
      expect(getInfernoSetupLinkNotice()?.undo).toBeDefined();
      hook.rerender({ stored: { ...linkLeft, mechanics: { infernoStartWave: '6' } } });
      expect(getInfernoSetupLinkNotice()).toMatchObject({ tone: 'success', message: 'Wave 5 spawn loaded from link.' });
      expect(getInfernoSetupLinkNotice()?.undo).toBeUndefined();
      expect(restore).not.toHaveBeenCalled();
    });

    it('is not offered for a link that applied nothing', () => {
      mount('/inferno/?wave=99');
      expect(getInfernoSetupLinkNotice()).toMatchObject({ tone: 'error' });
      expect(getInfernoSetupLinkNotice()?.undo).toBeUndefined();
    });
  });

  it('opens the setup card on the link’s setup, without starting, when there is no gear', () => {
    const { saveLoadout, openSetup, start } = mount(`/?${WAVE_5}&copyable`);
    expect(openSetup).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ infernoStartWave: '5' }));
    expect(start).not.toHaveBeenCalled();
    expect(saveLoadout).not.toHaveBeenCalled();
  });

  it('opens the setup card with nothing applied for a broken link, and says why', () => {
    const { openSetup, start, saveLoadout } = mount(`/inferno/?bat=[[2,5]]&setup=${encodeURIComponent(gearExport())}`);
    expect(openSetup).toHaveBeenCalledExactlyOnceWith(null);
    expect(start).not.toHaveBeenCalled();
    expect(saveLoadout).not.toHaveBeenCalled();
    expect(getInfernoSetupLinkNotice()).toMatchObject({
      tone: 'error',
      message: 'The bat tile [2,5] is not a spawn tile.',
    });
  });

  describe('with the address bar’s own mirror', () => {
    const saved = { infernoStartWave: '5', infernoSpawnLayout: '5:bl-------' };

    const address = () => window.location.pathname + window.location.search;
    const untouched = (actions: ReturnType<typeof mount>) =>
      [actions.openSetup, actions.start, actions.saveLoadout].every((action) => action.mock.calls.length === 0);

    it('enters the saved setup in the saved gear from /inferno/, once and silently', () => {
      const actions = mount(`/inferno/?wave=5&${WAVE_5}&popout=1`, saved);
      // Consumed like any link before the router reads it: the entry is the hook's, not the router's.
      expect(address()).toBe('/?popout=1');
      expect(actions.start).toHaveBeenCalledExactlyOnceWith({});
      expect(actions.openSetup).not.toHaveBeenCalled();
      expect(actions.saveLoadout).not.toHaveBeenCalled();
      expect(getInfernoSetupLinkNotice()).toBeNull();
      actions.hook.rerender({});
      expect(actions.start).toHaveBeenCalledOnce();
    });

    it('does nothing for a mirror on the lobby', () => {
      const actions = mount(`/?wave=5&${WAVE_5}&popout=1`, saved);
      expect(address()).toBe('/?popout=1');
      expect(untouched(actions)).toBe(true);
      expect(getInfernoSetupLinkNotice()).toBeNull();
    });

    it('still opens a link that differs from the saved setup, with its notice', () => {
      const { openSetup } = mount('/inferno/?wave=6', saved);
      expect(openSetup).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ infernoStartWave: '6' }));
      expect(getInfernoSetupLinkNotice()).toMatchObject({ tone: 'success', message: 'Start wave 6 loaded from link.' });
      expect(address()).toBe('/');
    });
  });

  it('opens the setup card with nothing applied for a malformed link, whatever is saved', () => {
    const { openSetup, start } = mount('/inferno/?wave=99&popout=1', { infernoStartWave: '5' });
    expect(window.location.pathname + window.location.search).toBe('/?popout=1');
    expect(openSetup).toHaveBeenCalledExactlyOnceWith(null);
    expect(start).not.toHaveBeenCalled();
    expect(getInfernoSetupLinkNotice()).toMatchObject({ tone: 'error' });
  });

  it('does nothing without a link', () => {
    const { openSetup, start, saveLoadout } = mount('/inferno/?popout=1');
    expect(window.location.pathname + window.location.search).toBe('/inferno/?popout=1');
    expect([openSetup, start, saveLoadout].every((action) => action.mock.calls.length === 0)).toBe(true);
    expect(getInfernoSetupLinkNotice()).toBeNull();
  });
});
