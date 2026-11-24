import { describe, expect, it } from 'vitest';
import { INFERNO_WAVE_NPC_IDS } from '../../../npcs/inferno/constants';
import { DEFAULT_ENTITY_HIDER_OPTIONS } from '../../../types/entityHider';
import { DEFAULT_TZHAAR_HP_TRACKER_OPTIONS } from '../../../types/tzhaarHpTracker';
import {
  isNpc2DHidden,
  isNpcModelHidden,
  isNpcOverlayHidden,
  type NpcHidingPlugins,
  npcVisibilityFactsWithoutSnapshot,
} from '../npcPluginVisibility';

const PLAYER = 'player';
const deadMager = { npcTypeId: INFERNO_WAVE_NPC_IDS.mager, alive: false, hp: 0, combatTargetId: null };
const liveMager = { ...deadMager, alive: true, hp: 100 };

/** [model, client 2D, plugin marks] hidden. */
function hidden(npc: typeof deadMager, plugins: NpcHidingPlugins): [boolean, boolean, boolean] {
  return [
    isNpcModelHidden(npc, plugins, PLAYER),
    isNpc2DHidden(npc, plugins, PLAYER),
    isNpcOverlayHidden(npc, plugins, PLAYER),
  ];
}

describe('NPC hiding plugins', () => {
  it('hides nothing while both plugins are off', () => {
    expect(hidden(deadMager, { entityHider: null, tzhaarHpTracker: null })).toEqual([false, false, false]);
  });

  it("takes TzHaar's dead NPC out of the model and the client 2D, keeping the plugin's own marks", () => {
    const plugins = { entityHider: null, tzhaarHpTracker: { ...DEFAULT_TZHAAR_HP_TRACKER_OPTIONS, hideDead: true } };
    expect(hidden(deadMager, plugins)).toEqual([true, true, false]);
    expect(hidden(liveMager, plugins)).toEqual([false, false, false]);
  });

  it("hides every mark with Entity Hider's 2D option, plugin highlights included", () => {
    const plugins = { entityHider: { ...DEFAULT_ENTITY_HIDER_OPTIONS, hideNpcs2D: true }, tzhaarHpTracker: null };
    expect(hidden(liveMager, plugins)).toEqual([false, true, true]);
  });

  it('judges a corpse that outlived its snapshot entry as dead, and any other orphan as idle', () => {
    const plugins = { entityHider: { ...DEFAULT_ENTITY_HIDER_OPTIONS, hideDeadNpcs: true }, tzhaarHpTracker: null };
    expect(isNpcModelHidden(npcVisibilityFactsWithoutSnapshot(1, true), plugins, PLAYER)).toBe(true);
    expect(isNpcModelHidden(npcVisibilityFactsWithoutSnapshot(1, false), plugins, PLAYER)).toBe(false);
  });
});
