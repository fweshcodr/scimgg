import { describe, expect, it } from 'vitest';
import { DisplayTimeline, type DisplayTimelineSnapshot } from '../../core/displayTimeline';
import type { CoreGameEvent, GameEvent } from '../../core/events/types';
import type { ReplayDisplayFrame } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { SimulationEngine } from '../../core/SimulationEngine';
import { TickProgressStore } from '../../core/tickProgressStore';
import { encounterRegistry } from '../../encounters/registry';
import { OSRS_TICK_MS } from '../../types/simulation';
import { FADE_START_FRACTION, LIFETIME_MS, STACK_SPACING_PX, UNGROUPED_DELAY_MS, XpDropProjection } from '../xpDrops';

type XpEvent = Extract<CoreGameEvent, { type: 'xp_drop' }>;
const initialState = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();
const grouped = { grouped: true, speed: 44 };
const ungrouped = { grouped: false, speed: 44 };
const skills: XpEvent['skills'] = [
  { skill: 'attack', amount: 100 },
  { skill: 'strength', amount: 50 },
  { skill: 'hitpoints', amount: 33 },
];

function frame(tick: number, events: GameEvent[] = []): ReplayDisplayFrame {
  return { state: { ...initialState, currentTick: tick }, events };
}

function event(tick: number, eventId = tick, deltas = skills): XpEvent {
  return { type: 'xp_drop', tick, eventId, skills: deltas, predictedHit: 25 };
}

function snapshot(history: readonly ReplayDisplayFrame[], timeMs: number): DisplayTimelineSnapshot {
  const tick = timeMs / OSRS_TICK_MS;
  let frameIndex = history.length - 1;
  while (frameIndex >= 0 && history[frameIndex].state.currentTick > tick) frameIndex--;
  return { history, frameIndex, state: history[frameIndex]?.state ?? initialState, tick };
}

describe('XpDropProjection', () => {
  it('preserves grouped skill totals, hit, birth time and stable keys', () => {
    const projection = new XpDropProjection();
    const history = [frame(80, [event(80)])];

    const drops = projection.sample(snapshot(history, 80 * OSRS_TICK_MS + 100), grouped);

    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ skills, predictedHit: 25, bornAtMs: 48000, startOffsetPx: 0 });
    expect(drops[0].skills.reduce((total, skill) => total + skill.amount, 0)).toBe(183);
    expect(projection.sample(snapshot(history, 48150), grouped)[0]).toBe(drops[0]);
    expect(drops[0].key).toBeTruthy();
    expect([LIFETIME_MS, FADE_START_FRACTION, UNGROUPED_DELAY_MS, STACK_SPACING_PX]).toEqual([2000, 0.8, 400, 26]);
  });

  it('filters empty and zero-total groups and ignores non-XP events', () => {
    const history = [
      frame(0, [
        event(0, 1, []),
        event(0, 2, [{ skill: 'attack', amount: 0 }]),
        { type: 'encounter_hint', tick: 0, eventId: 3 },
      ]),
    ];

    const drops = new XpDropProjection().sample(snapshot(history, 0), grouped);

    expect(drops).toEqual([]);
  });

  it('deduplicates recorded events across frames without merging distinct attacks', () => {
    const attack = event(0, 1);
    const history = [frame(0, [attack, { ...attack }]), frame(1, [{ ...attack }, event(1, 2)])];

    const drops = new XpDropProjection().sample(snapshot(history, 600), grouped);

    expect(drops).toHaveLength(2);
    expect(new Set(drops.map((drop) => drop.key)).size).toBe(2);
  });

  it('releases ungrouped skills 400ms apart and attaches predicted hit only to the first', () => {
    const projection = new XpDropProjection();
    const history = [frame(0, [event(0)]), frame(1), frame(2)];

    const atRelease = projection.sample(snapshot(history, 400), ungrouped);

    expect(projection.sample(snapshot(history, 399), ungrouped)).toHaveLength(1);
    expect(atRelease.map((drop) => [drop.skills[0].skill, drop.bornAtMs, drop.predictedHit])).toEqual([
      ['attack', 0, 25],
      ['strength', 400, 0],
    ]);
    expect(projection.sample(snapshot(history, 800), ungrouped).map((drop) => drop.bornAtMs)).toEqual([0, 400, 800]);
  });

  it('keeps original stagger slots when zero skills are filtered', () => {
    const history = [
      frame(0, [
        event(0, 1, [
          { skill: 'attack', amount: 0 },
          { skill: 'hitpoints', amount: 33 },
        ]),
      ]),
    ];

    const drops = new XpDropProjection().sample(snapshot(history, 400), ungrouped);

    expect(drops).toHaveLength(1);
    expect(drops[0]).toMatchObject({ predictedHit: 0, bornAtMs: 400, startOffsetPx: 0 });
  });

  it('orders deferred skill releases between later attacks before deriving their stack destinations', () => {
    const history = [frame(0, [event(0)]), frame(1, [event(1, 1, [{ skill: 'magic', amount: 80 }])])];

    const drops = new XpDropProjection().sample(snapshot(history, 800), ungrouped);

    expect(drops.map((drop) => drop.skills[0].skill)).toEqual(['attack', 'strength', 'magic', 'hitpoints']);
    expect(drops.map((drop) => drop.bornAtMs)).toEqual([0, 400, 600, 800]);
    expect(drops[1].startOffsetPx).toBeCloseTo(8.4);
    expect(drops[2].startOffsetPx).toBeCloseTo(25.6);
    expect(drops[3].startOffsetPx).toBeCloseTo(42.8);
  });

  it('updates the deferred tail when live frames append without changing earlier destinations', () => {
    const projection = new XpDropProjection();
    const history = [frame(0, [event(0)])];
    const first = projection.sample(snapshot(history, 400), ungrouped);

    history.push(frame(1, [event(1, 1, [{ skill: 'magic', amount: 80 }])]));
    const afterAppend = projection.sample(snapshot(history, 800), ungrouped);

    expect(afterAppend[3].startOffsetPx).toBeCloseTo(42.8);
    expect(projection.sample(snapshot(history, 400), ungrouped)).toEqual(first);
    expect(afterAppend[0]).toBe(first[0]);
    expect(afterAppend[1]).toBe(first[1]);
  });

  it('orders equal-time releases by their source event before later attacks', () => {
    const fourSkills: XpEvent['skills'] = [...skills, { skill: 'defence', amount: 12 }];
    const history = [frame(0, [event(0, 0, fourSkills)]), frame(1), frame(2, [event(2)])];

    const drops = new XpDropProjection().sample(snapshot(history, 1200), ungrouped);

    expect(drops.slice(-2).map((drop) => drop.skills[0].skill)).toEqual(['defence', 'attack']);
    expect(drops.at(-1)?.startOffsetPx).toBeCloseTo((drops.at(-2)?.startOffsetPx ?? 0) + 26);
  });

  it('excludes future source frames even when interpolation reaches their boundary', () => {
    const projection = new XpDropProjection();
    const history = [frame(0, [event(0)]), frame(1, [event(1)])];
    projection.sample(snapshot(history, 800), ungrouped);
    const boundary = { ...snapshot(history, 600), frameIndex: 0, state: history[0].state };

    const drops = projection.sample(boundary, ungrouped);

    expect(drops.map((drop) => drop.bornAtMs)).toEqual([0, 400]);
  });

  it('expires drops exactly at the lifetime boundary and reconstructs their original age on rewind', () => {
    const projection = new XpDropProjection();
    const history = [frame(0, [event(0)]), frame(1), frame(2), frame(3), frame(4)];
    projection.sample(snapshot(history, 2400), grouped);

    const rewound = projection.sample(snapshot(history, 1999), grouped);

    expect(rewound).toHaveLength(1);
    expect(rewound[0].bornAtMs).toBe(0);
    expect(projection.sample(snapshot(history, 2000), grouped)).toEqual([]);
  });

  it.each([10, 44, 120])('preserves staggered stack destinations across repeated seeks at speed %s', (speed) => {
    const history = Array.from({ length: 40 }, (_, index) => frame(80 + index, [event(80 + index)]));
    const options = { grouped: false, speed };
    const continuous = new XpDropProjection();
    for (let index = 0; index < 40; index++) {
      continuous.sample(snapshot(history, (80 + index) * OSRS_TICK_MS + 500), options);
    }

    const seekTimes = [81.5, 118.25, 83, 100.75, 80, 119.5, 92];

    for (const tick of seekTimes) {
      const target = snapshot(history, tick * OSRS_TICK_MS);
      expect(continuous.sample(target, options)).toEqual(new XpDropProjection().sample(target, options));
    }
  });

  it('retains arbitrarily old stack ancestry at slow speed after a direct seek', () => {
    const history = Array.from({ length: 101 }, (_, tick) => frame(tick, [event(tick)]));
    const options = { grouped: true, speed: 10 };
    const continuous = new XpDropProjection();
    for (let tick = 0; tick < 100; tick++) continuous.sample(snapshot(history, tick * OSRS_TICK_MS), options);

    const sought = new XpDropProjection().sample(snapshot(history, 60000), options);

    expect(sought).toEqual(continuous.sample(snapshot(history, 60000), options));
    expect(sought.at(-1)?.startOffsetPx).toBe(2000);
    expect(sought).toHaveLength(4);
  });

  it('resets stack ancestry when the previous drop has expired before the next birth', () => {
    const history = [frame(0, [event(0)]), frame(1, [event(1)]), frame(5, [event(5)])];

    const drops = new XpDropProjection().sample(snapshot(history, 3000), { grouped: true, speed: 10 });

    expect(drops).toHaveLength(1);
    expect(drops[0].startOffsetPx).toBe(0);
  });

  it('rederives viewer grouping and speed without changing recording data', () => {
    const projection = new XpDropProjection();
    const history = [frame(0, [event(0)]), frame(1, [event(1)])];
    projection.sample(snapshot(history, 600), grouped);

    const slower = projection.sample(snapshot(history, 600), { grouped: true, speed: 10 });

    expect(slower.at(-1)?.startOffsetPx).toBe(20);
    expect(projection.sample(snapshot(history, 600), ungrouped)).toHaveLength(3);
    expect(history[0].events).toEqual([event(0)]);
  });

  it('invalidates a replacement history at the same index and event id', () => {
    const projection = new XpDropProjection();
    projection.sample(snapshot([frame(0, [event(0)])], 0), grouped);
    const replacement = [frame(0, [event(0, 0, [{ skill: 'magic', amount: 99 }])])];

    const drops = projection.sample(snapshot(replacement, 0), grouped);

    expect(drops[0].skills).toEqual([{ skill: 'magic', amount: 99 }]);
  });

  it('reads each accepted frame event array once across append, interpolation and repeated seeks', () => {
    const projection = new XpDropProjection();
    let reads = 0;
    const history = Array.from(
      { length: 100 },
      (_, tick): ReplayDisplayFrame => ({
        state: { ...initialState, currentTick: tick },
        get events() {
          reads++;
          return [event(tick)];
        },
      }),
    );
    projection.sample(snapshot(history, 99 * OSRS_TICK_MS), grouped);
    expect(reads).toBe(100);

    for (let index = 0; index < 200; index++) {
      projection.sample(snapshot(history, ((index * 37) % 99) * OSRS_TICK_MS + 125), { ...grouped });
    }

    expect(reads).toBe(100);
    history.push({
      state: { ...initialState, currentTick: 100 },
      get events() {
        reads++;
        return [event(100)];
      },
    });
    projection.sample(snapshot(history, 100 * OSRS_TICK_MS), grouped);
    expect(reads).toBe(101);
  });

  it('leaves future source event arrays unread until their frame is accepted', () => {
    let futureReads = 0;
    const history = [
      frame(0, [event(0)]),
      {
        state: { ...initialState, currentTick: 1 },
        get events() {
          futureReads++;
          return [event(1)];
        },
      },
    ];
    const projection = new XpDropProjection();

    projection.sample({ ...snapshot(history, 600), frameIndex: 0, state: history[0].state }, ungrouped);

    expect(futureReads).toBe(0);
    projection.sample(snapshot(history, 600), ungrouped);
    expect(futureReads).toBe(1);
  });

  it('produces identical live and replay drops at the same displayed simulation time', () => {
    const history = [frame(80, [event(80)]), frame(81, [event(81)])];
    const ticks = new TickProgressStore();
    const replay = new ReplayFrameStore();
    const timeline = new DisplayTimeline(ticks, replay);
    const projection = new XpDropProjection();
    ticks.set(81.5);
    timeline.setSource({ history, state: history[1].state, replaying: false });
    const live = timeline.getSnapshot();
    expect(live).not.toBeNull();
    if (!live) return;
    const liveDrops = projection.sample(live, ungrouped);
    replay.setHistory(history);
    replay.set(900, undefined);

    timeline.setSource({ history, state: history[1].state, replaying: true });

    const replayed = timeline.getSnapshot();
    expect(replayed).not.toBeNull();
    if (!replayed) return;
    expect(projection.sample(replayed, ungrouped)).toEqual(liveDrops);
  });
});
