import { describe, expect, it } from 'vitest';
import { NpcDefinitionCollection } from '../../core/npcs';
import { createSol, solDefinition } from './sol';

describe('Sol actor ownership', () => {
  it('keeps clone-safe ability state independent between instances', () => {
    const first = createSol({
      id: 'first',
      position: [31, 36],
      targetId: 'player',
      addedTick: 0,
      firstAttackTick: 5,
      holdUntilTick: 6,
    });
    const second = createSol({
      id: 'second',
      position: [28, 30],
      targetId: 'other',
      addedTick: 0,
      firstAttackTick: 12,
      holdUntilTick: 12,
    });
    const definitions = new NpcDefinitionCollection([
      solDefinition.register({ arena: { minX: 26, maxX: 39, minY: 28, maxY: 41 } }),
    ]);
    definitions.validateActor(first);
    definitions.validateActor(second);
    first.state.immobileUntilTick = 20;
    expect(solDefinition.getState(second)?.immobileUntilTick).toBe(12);
    expect(second.state.scheduler.nextAttackTick).toBe(12);
    expect(solDefinition.isActor(first)).toBe(true);
    expect(structuredClone(first.state)).toEqual(first.state);
    expect(Object.getPrototypeOf(first.state.scheduler)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(first.state.grapple)).toBe(Object.prototype);
  });
});
