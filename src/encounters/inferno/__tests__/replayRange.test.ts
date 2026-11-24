import { describe, expect, it } from 'vitest';
import { parseReplayRange, ReplayRangeError } from './replayRange';

const VALID = `capture example-packet-data.txt stream 2 ticks 10-13
life nibbler#100#0 5 open
life pillar#7#1 1 12
start 9
  player 30,40
  npc pillar#7#1 17,37
  varbit 4116 1
  varbit 5655 20
t10
  add nibbler#100#0 26,34 @50
  walk nibbler#100#0 26,34 -> 25,33 @51
  run player 30,40 -> 28,38 @52
  seq nibbler#100#0 7574 @53
  gfx nibbler#100#0 85 delay 46 @54
  proj 1382 20,35 -> player 28,38 [10,48,16,128,200,124] @55
  proj 366 28,38 -> tile 25,33 [51,106,16,64,172,0] @56
t12
  hit nibbler#100#0 16 3 @60
  hit player 12 0 @61
  dead nibbler#100#0 @62
  face nibbler#100#0 pillar#7#1 17,37 @63
  mapgfx 444 32,34 @64
  wave 3 @65
  varbit 4116 0 @66
  del pillar#7#1 17,37 @67
`;

function failure(text: string): string {
  try {
    parseReplayRange(text, 'range');
  } catch (error) {
    if (error instanceof ReplayRangeError)
      return `${error.line}: ${error.message.slice(error.message.indexOf(': ') + 2)}`;
    throw error;
  }
  throw new Error('parsed');
}

describe('replay range grammar', () => {
  it('reads every record kind into world tiles, with every tick of the range', () => {
    const range = parseReplayRange(VALID, 'range');
    expect(range).toMatchObject({ capture: 'example-packet-data.txt', stream: 2, first: 10, last: 13 });
    expect(range.ticks.map((tick) => [tick.tick, tick.events.length])).toEqual([
      [10, 7],
      [11, 0],
      [12, 8],
      [13, 0],
    ]);
    expect(range.start).toMatchObject({
      tick: 9,
      player: [2270, 5352, 0],
      npcs: [{ coord: [2257, 5349, 0] }],
      varbits: [
        { id: 4116, value: 1 },
        { id: 5655, value: 20 },
      ],
    });
    expect(range.lives).toMatchObject([
      { life: { kind: 'npc', index: 100, generation: 0 }, npcId: 7691, start: 5, end: null },
      { life: { kind: 'npc', index: 7, generation: 1 }, npcId: 7709, start: 1, end: 12 },
    ]);
    const [add, walk, run, , gfx, proj, tileProj] = range.ticks[0]!.events;
    expect(add).toMatchObject({ type: 'actor', op: 'add', npcId: 7691, coord: [2266, 5346, 0] });
    expect(walk).toMatchObject({ op: 'walk', newcoord: [2265, 5345, 0] });
    expect(walk).not.toHaveProperty('path');
    expect(run).toMatchObject({ op: 'run', actor: { kind: 'player' } });
    expect(gfx).toMatchObject({ type: 'spotanim', id: 85, delay: 46 });
    expect(proj).toMatchObject({ endtime: 48, targetActor: { kind: 'player' }, source: { line: 55, tick: 10 } });
    expect(tileProj).not.toHaveProperty('targetActor');
    // One life object per actor, shared by every record that names it.
    expect(range.ticks[2]!.events[0]).toHaveProperty('actor', range.lives[0]!.life);
    expect(range.ticks[2]!.events[3]).toMatchObject({ mode: 'actor', target: { npcId: 7709, coord: [2257, 5349, 0] } });
  });

  it.each([
    ['a free-text line', VALID.replace('t12\n', '# note\nt12\n'), '17: expected `t<tick>` or a record of the grammar'],
    ['an unknown record kind', VALID.replace('  wave 3 @65', '  chat 3 @65'), '23: not a record of the grammar'],
    ['a record without its line', VALID.replace(' @65', ''), '23: not a record of the grammar'],
    ['a trailing space', VALID.replace(' @61', ' @61 '), '19: not a record of the grammar'],
    ['an actor with no life', VALID.replace('hit nibbler#100#0', 'hit bat#101#0'), '18: no life for bat#101#0'],
    [
      'an unknown species',
      VALID.replace('life nibbler#100#0', 'life goblin#100#0'),
      '2: unknown species in goblin#100#0',
    ],
    ['a second life for one index', VALID.replace('pillar#7#1 1 12', 'bat#100#0 1 12'), '3: second life for 100#0'],
    ['a misplaced start state', VALID.replace('start 9', 'start 8'), '4: the start state must be at t9'],
    ['ticks out of order', VALID.replace('t12', 't9'), '17: t9 is out of order or outside 10-13'],
    ['a tick outside the range', VALID.replace('t12', 't14'), '17: t14 is out of order or outside 10-13'],
    ['an empty tick', VALID.replace('t12\n', 't11\nt12\n'), '17: t11 has no records'],
    ['a player graphic', VALID.replace('gfx nibbler#100#0', 'gfx player'), '14: player is not an NPC'],
    ['CRLF line endings', VALID.replaceAll('\n', '\r\n'), '1: expected LF line endings'],
  ])('rejects %s', (_, text, reason) => {
    expect(failure(text)).toBe(reason);
  });
});
