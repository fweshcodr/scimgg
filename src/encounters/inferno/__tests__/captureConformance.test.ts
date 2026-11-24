import { afterEach, describe, expect, it } from 'vitest';
import type { ArenaConfig } from '../../../core/arena/ArenaConfig';
import { clearResolvedArenaConfigs, setArenaConfig, setDefaultArenaConfig } from '../../../core/constants';
import { type ExpectedDivergence, formatReport, replayCapture } from '../../../test/capture/replay';
import { skipWithoutSetup } from '../../../test/helpers/setupAssets';
import { INFERNO_CHANNELS, type InfernoReplaySession, type InfernoWindow, openInfernoReplay } from './captureAdapter';

const EMPTY_ARENA: ArenaConfig = { bounds: null, walkableTiles: null, collisionMap: null };

afterEach(() => {
  clearResolvedArenaConfigs();
  setDefaultArenaConfig(EMPTY_ARENA);
  setArenaConfig(EMPTY_ARENA, true);
});

/**
 * Findings that hold across windows (docs/testing/capture-timeline.md, Inferno findings). They are
 * reported, not fixed: each needs a deliberate, evidenced mechanic change.
 */
function knownFindings(session: InfernoReplaySession): ExpectedDivergence[] {
  return [
    {
      channel: 'projectile_origin',
      match: (divergence) =>
        [...divergence.missing, ...divergence.unexpected].some((value) => value.startsWith('1377 ')),
      note: 'F6 residual: 76/819 ranger volleys leave from a pair that does not face the target',
    },
    {
      channel: 'hit',
      match: (divergence) => session.cappedHit(divergence.tick, divergence.actor),
      note: 'N7 overkill: the captured killing splat exceeds the HP left by 1 although no regeneration fits (14/886 lives, e.g. P t755 bat after 53 ticks)',
    },
  ];
}

interface WindowCase extends InfernoWindow {
  readonly expected?: readonly ExpectedDivergence[];
}

const N5_JAD_STEP =
  "follows the sim Jad's extra underfoot escape at t9844 (an unwitnessed npc.movement.overlap_escape draw): its step clears the row these healers then enter";
const N5_FLAG_HOLD =
  'N5r open: two ticks after a player run cleared its tile, a healer still blocks (R t400 run, t402 hold), against the clear-on-leave flags every other stack fits';
const N9_SPLIT =
  'follows N9: the parent Jal-Ak animates its death on its kill tick in the capture, a tick before the sim, so its children are added a tick later';
const D10 =
  "D10 open: the children got lower NPC indices than earlier NPCs (index wrap), so they turn before them; the sim's turn order is registration order";
const UNANALYSED_Q =
  'unanalyzed, outside the split behavior this window covers (a blob release masked by a defend, or a blob step one tick late)';
const JAD_LATE = 'removed with its Jad, which dies a tick late (Q t5060)';
const MELEER_FLINCH =
  "open: a Jal-ImKot walking in, hit for 0 at t9037 (atlatl launched t9034), swings on arriving in reach at t9038, splat + 1; standard retaliation's flinch (floor(4 / 2)) holds the sim to t9039";

const WINDOWS: readonly WindowCase[] = [
  {
    name: 'P wave 4',
    capture: 'P',
    stream: 1,
    firstWave: 4,
    lastTick: 631,
  },
  { name: 'P wave 5', capture: 'P', stream: 1, firstWave: 5, lastTick: 696 },
  { name: 'P wave 9', capture: 'P', stream: 1, firstWave: 9, lastTick: 965 },
  {
    name: 'P waves 1-10',
    capture: 'P',
    stream: 1,
    firstWave: 1,
    lastTick: 1023,
    expected: [
      { channel: 'spawn', tick: 849, note: N9_SPLIT },
      { channel: 'spawn', tick: 850, note: N9_SPLIT },
    ],
  },
  {
    name: 'P wave 46',
    capture: 'P',
    stream: 1,
    firstWave: 46,
    lastTick: 5069,
    expected: [
      {
        channel: 'attack',
        tick: 4900,
        actor: 'blob_range#49495#1',
        note: 'N9 a single-splat kill (blowpipe, P:85905-85912) animates its death on the kill tick; the sim child, dying at K+1, still swings on K',
      },
    ],
  },
  // Meleer dig cases: P t7349 a corner-trapped meleer skips its spawn+50 check 18 ticks after a
  // swing (the swing + 4 + 15 window); P t9171 -> t9236 a 65-tick re-dig gap (the post-dig +6).
  { name: 'P wave 58', capture: 'P', stream: 1, firstWave: 58, lastTick: 7515 },
  {
    name: 'P wave 64',
    capture: 'P',
    stream: 1,
    firstWave: 64,
    lastTick: 9288,
    expected: [
      { channel: 'attack', tick: 9038, actor: 'meleer#54243#0', note: MELEER_FLINCH },
      { channel: 'hit', tick: 9038, actor: 'player', note: `${MELEER_FLINCH} (its splat)` },
    ],
  },
  {
    name: 'P wave 59',
    capture: 'P',
    stream: 1,
    firstWave: 59,
    lastTick: 7731,
  },
  {
    name: 'P wave 61',
    capture: 'P',
    stream: 1,
    firstWave: 61,
    lastTick: 8337,
    expected: [
      { channel: 'spawn', tick: 8248, note: N9_SPLIT },
      { channel: 'spawn', tick: 8249, note: N9_SPLIT },
    ],
  },
  {
    name: 'P wave 67',
    capture: 'P',
    stream: 1,
    firstWave: 67,
    lastTick: 10030,
    expected: [
      { channel: 'move', tick: 9844, actor: 'healer#62227#0', note: N5_JAD_STEP },
      { channel: 'move', tick: 9844, actor: 'healer#62228#0', note: N5_JAD_STEP },
      { channel: 'move', tick: 9844, actor: 'healer#62229#0', note: N5_JAD_STEP },
      { channel: 'move', tick: 9845, actor: 'healer#62226#0', note: N5_JAD_STEP },
    ],
  },
  {
    name: 'P wave 68',
    capture: 'P',
    stream: 2,
    firstWave: 68,
    lastTick: 903,
    expected: [
      { channel: 'move', tick: 402, actor: 'healer#35928#0', note: N5_FLAG_HOLD },
      { channel: 'move', tick: 402, actor: 'healer#35929#0', note: `${N5_FLAG_HOLD} (its partner's step)` },
      { channel: 'move', tick: 412, actor: 'healer#35927#0', note: `${N5_FLAG_HOLD} (later in the same chase)` },
    ],
  },
  // Split cases (birth layout, hidden add-tick steps): Q t895 Ket born under the player escapes
  // south; Q t2646 a bat moves between the parent's removal and its children; Q t2993 sibling stacks.
  {
    name: 'Q wave 38',
    capture: 'Q',
    stream: 1,
    firstWave: 38,
    lastTick: 913,
    expected: [{ channel: 'hit', tick: 888, note: UNANALYSED_Q }],
  },
  { name: 'Q wave 54', capture: 'Q', stream: 1, firstWave: 54, lastTick: 2681 },
  {
    name: 'Q wave 56',
    capture: 'Q',
    stream: 1,
    firstWave: 56,
    lastTick: 3038,
    expected: [
      { channel: 'move', tick: 2896, actor: 'blob#38804#0', note: UNANALYSED_Q },
      { channel: 'hit', tick: 2909, note: UNANALYSED_Q },
    ],
  },
  {
    name: 'Q wave 59',
    capture: 'Q',
    stream: 1,
    firstWave: 59,
    lastTick: 3595,
  },
  {
    name: 'Q wave 63',
    capture: 'Q',
    stream: 1,
    firstWave: 63,
    lastTick: 4315,
    expected: [{ channel: 'spawn', tick: 4300, note: D10 }],
  },
  {
    name: 'Q wave 67',
    capture: 'Q',
    stream: 1,
    firstWave: 67,
    lastTick: 4845,
  },
  {
    name: 'Q wave 68',
    capture: 'Q',
    stream: 1,
    firstWave: 68,
    lastTick: 5180,
    expected: [
      {
        channel: 'attack',
        tick: 5060,
        actor: 'jad#43527#0',
        note: 'open: the Jad animates its death on its last-hit tick, not the next (as N9); unexplained',
      },
      { channel: 'despawn', tick: 5066, actor: 'healer#46420#0', note: JAD_LATE },
      { channel: 'despawn', tick: 5066, actor: 'healer#46421#0', note: JAD_LATE },
      { channel: 'despawn', tick: 5066, actor: 'healer#46422#0', note: JAD_LATE },
    ],
  },
];

describe.skipIf(skipWithoutSetup('infernoArena'))('Inferno capture conformance', () => {
  it.each(WINDOWS)('$name', (window) => {
    const session = openInfernoReplay(window);
    const report = replayCapture(
      {
        name: window.name,
        channels: INFERNO_CHANNELS,
        expectedDivergences: [...knownFindings(session), ...(window.expected ?? [])],
      },
      session,
    );
    if (process.env.CAPTURE_REPORT) console.log(formatReport(report));
    if (process.env.CAPTURE_SITE)
      for (const record of session.ledger.records.filter((entry) => entry.key.site.includes(process.env.CAPTURE_SITE!)))
        console.log(JSON.stringify({ ...record, constraint: record.constraint?.evidence ?? null }));
    const summary = formatReport(report);
    expect(
      Object.values(report.observations).reduce((total, entry) => total + entry.matched, 0),
      summary,
    ).toBeGreaterThan(0);
    expect(
      report.divergences.filter((divergence) => divergence.classification === 'divergence'),
      summary,
    ).toEqual([]);
    expect(report.violations, summary).toEqual([]);
    // Window-specific expectations must still occur (general findings need not occur everywhere).
    expect(
      report.resolvedExpectations.filter((expectation) => window.expected?.includes(expectation)),
      summary,
    ).toEqual([]);
  });
});
