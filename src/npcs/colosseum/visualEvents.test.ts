import { describe, expect, it } from 'vitest';
import { discoverCacheUsage } from '../../../scripts/discoverCacheUsage';
import { SOL_BEAM_GRAPHIC_TICKS } from './__tests__/fixtures/solBeamGraphicsCapture';
import type { CardinalDirection } from './solAttacks';
import { COLOSSEUM_SPOT_ANIM_IDS, colosseumBeamGraphics, isColosseumVisualEvent } from './visualEvents';

const DIRECTIONS: readonly CardinalDirection[] = ['south', 'west', 'north', 'east'];

it('preloads and discovers the modifier and warband projectile cache dependencies', async () => {
  expect(COLOSSEUM_SPOT_ANIM_IDS).toEqual(expect.arrayContaining([2724, 131, 9, 130]));
  const usage = await discoverCacheUsage();
  expect(usage.npcIds.has(12826)).toBe(true);
  expect(usage.seqIds.has(10817)).toBe(true);
  expect(usage.spotAnimIds.has(2724)).toBe(true);
  expect(usage.spotAnimIds.has(131)).toBe(true);
  expect(usage.spotAnimIds.has(9)).toBe(true);
  expect(usage.spotAnimIds.has(130)).toBe(true);
});

describe('Colosseum graphic anchors', () => {
  it.each([
    { anchor: { actorId: 'sol_heredit' }, accepted: true },
    { anchor: { position: [30, 30] }, accepted: true },
    { anchor: { actorId: '' }, accepted: false },
    { anchor: {}, accepted: false },
    { anchor: { actorId: 'sol_heredit', position: [30, 30] }, accepted: false },
  ])('validates one unambiguous anchor: $anchor', ({ anchor, accepted }) => {
    const event = {
      type: 'colosseum_visual',
      tick: 0,
      eventId: 1,
      animations: [],
      graphics: [{ spotAnimId: 2668, delayCycles: 0, ...anchor }],
    };

    const result = isColosseumVisualEvent(event);

    expect(result).toBe(accepted);
  });
});

describe('directional Colosseum beam graphics', () => {
  it.each([
    'colosseum-sol-heredit-packet-data.txt',
    'colosseum-sol-heredit-packet-data-2.txt',
    'colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt',
  ])('matches each charge/fire direction, ripple and terminal impact in %s', (filename) => {
    const checkedDirections = new Set<CardinalDirection>();
    let checked = 0;
    for (const { beams, impacts } of SOL_BEAM_GRAPHIC_TICKS[filename] ?? []) {
      for (const beam of beams) {
        const id = beam.id;
        const graphics = beam.graphics.map(([x, y, delayCycles, height]) => ({
          position: [x, y] as [number, number],
          delayCycles,
          height,
        }));
        const stage = id >= 2693 ? 'fire' : 'charge';
        const direction = DIRECTIONS[id - (stage === 'fire' ? 2693 : 2689)];
        graphics.sort((a, b) => a.delayCycles - b.delayCycles);
        expect(graphics).toHaveLength(13);
        const predicted = colosseumBeamGraphics(
          direction,
          graphics.map((cue) => cue.position),
          stage,
        );

        expect(predicted.filter((cue) => cue.spotAnimId !== 2697)).toEqual(
          graphics.map((cue) => ({ spotAnimId: id, ...cue })),
        );
        if (stage === 'fire') {
          const impact = predicted.find((cue) => cue.spotAnimId === 2697);
          expect(impact).toBeDefined();
          if (!impact) throw new Error('Expected terminal beam impact');
          const [x, y] = impact.position;
          expect(impacts).toContainEqual([x, y, 39, 128]);
        }
        checkedDirections.add(direction);
        checked++;
      }
    }
    expect([...checkedDirections].sort()).toEqual(['east', 'north', 'south', 'west']);
    expect(checked).toBeGreaterThan(20);
  });
});
