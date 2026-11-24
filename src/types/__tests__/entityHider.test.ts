import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENTITY_HIDER_OPTIONS,
  type EntityHiderOptions,
  isNpcDrawnByEntityHider,
  parseEntityHiderOptions,
} from '../entityHider';

const PLAYER = 'player';

function options(overrides: Partial<EntityHiderOptions>): EntityHiderOptions {
  return { ...DEFAULT_ENTITY_HIDER_OPTIONS, ...overrides };
}

const bystander = { alive: true, combatTargetId: null };
const attacker = { alive: true, combatTargetId: PLAYER };
const dead = { alive: false, combatTargetId: PLAYER };

/** [model drawn, 2D drawn]. */
function layers(npc: typeof bystander | typeof attacker, hider: EntityHiderOptions): [boolean, boolean] {
  return [isNpcDrawnByEntityHider(npc, hider, false, PLAYER), isNpcDrawnByEntityHider(npc, hider, true, PLAYER)];
}

describe('isNpcDrawnByEntityHider', () => {
  it('draws everything with every option off', () => {
    expect(layers(bystander, DEFAULT_ENTITY_HIDER_OPTIONS)).toEqual([true, true]);
    expect(layers(dead, DEFAULT_ENTITY_HIDER_OPTIONS)).toEqual([true, true]);
  });

  it('hides each NPC layer on its own option', () => {
    expect(layers(bystander, options({ hideNpcs: true }))).toEqual([false, true]);
    expect(layers(bystander, options({ hideNpcs2D: true }))).toEqual([true, false]);
  });

  it('keeps the NPCs fighting you visible under Hide NPCs unless Hide attackers is on too', () => {
    expect(layers(attacker, options({ hideNpcs: true, hideNpcs2D: true }))).toEqual([true, true]);
    expect(layers(attacker, options({ hideNpcs: true, hideAttackers: true }))).toEqual([false, true]);
    expect(layers(attacker, options({ hideNpcs2D: true, hideAttackers: true }))).toEqual([true, false]);
  });

  it('hides attackers in both layers when neither NPC option is on, leaving bystanders', () => {
    expect(layers(attacker, options({ hideAttackers: true }))).toEqual([false, false]);
    expect(layers(bystander, options({ hideAttackers: true }))).toEqual([true, true]);
  });

  it('hides a dead NPC in both layers before the attacker rule can keep it', () => {
    expect(layers(dead, options({ hideDeadNpcs: true }))).toEqual([false, false]);
    expect(layers(dead, options({ hideDeadNpcs: true, hideNpcs: true }))).toEqual([false, false]);
  });
});

describe('parseEntityHiderOptions', () => {
  it('keeps stored booleans and defaults anything else, key by key', () => {
    expect(parseEntityHiderOptions({ hideNpcs: true, hideProjectiles: 'yes', unknown: true })).toEqual(
      options({ hideNpcs: true }),
    );
    expect(parseEntityHiderOptions('everything')).toEqual(DEFAULT_ENTITY_HIDER_OPTIONS);
    expect(parseEntityHiderOptions(null)).toEqual(DEFAULT_ENTITY_HIDER_OPTIONS);
  });
});
