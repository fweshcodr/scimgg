import { describe, expect, it } from 'vitest';
import type { Coordinate, NpcSnapshot } from '../../../types/simulation';
import { ReplayActorHistory } from '../replayActorHistory';
import type { ReplayEffectSourceFrame } from '../replayEffectContext';

function frame(tick: number, crawl = true): ReplayEffectSourceFrame {
  const npc: NpcSnapshot = {
    id: 'orb',
    npcTypeId: 12826,
    archetypeId: 'orb',
    role: 'npc',
    alive: true,
    position: [0, 1],
    previousPosition: tick === 10 ? [0, 0] : [0, 1],
    size: 1,
    facingAngle: 0,
    hp: 1,
    maxHp: 1,
    ...(crawl ? { crawlMovement: { from: [0, 0] as Coordinate, to: [0, 1] as Coordinate, startTick: 10 } } : {}),
  };
  return {
    state: {
      currentTick: tick,
      playerPosition: [5, 5],
      playerPreviousPosition: [5, 5],
      playerMovementPath: [],
      primaryNpcPosition: [0, 1],
      primaryNpcSize: 1,
      playerEquipment: {},
      npcs: [npc],
    },
    events: [],
  };
}

describe('ReplayActorHistory crawl sampling', () => {
  it.each(['since-cycle', 'snapshot'] as const)('samples both ticks and direct seeks for %s presence', (presence) => {
    const history = new ReplayActorHistory();
    history.append(frame(10), 0);
    history.append(frame(11), 1);
    const sample = history.sampler({ cycle: 360, throughFrameIndex: 1 }, presence);
    for (const [cycle, y] of [
      [345, 0.75],
      [300, 0],
      [330, 0.5],
      [315, 0.25],
      [360, 1],
    ]) {
      expect(sample(cycle, 300)('orb')).toEqual([0, y]);
    }
  });

  it('keeps the fraction-zero shortcut when crawl metadata is absent', () => {
    const history = new ReplayActorHistory();
    history.append(frame(10, false), 0);
    const sample = history.sampler({ cycle: 315, throughFrameIndex: 0 });
    expect(sample(300, 300)('orb')).toEqual([0, 1]);
    expect(sample(315, 300)('orb')).toEqual([0, 0.5]);
  });
});
