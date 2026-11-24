import { readFileSync } from 'node:fs';
import { INFERNO_WAVE_NPC_IDS } from '../../../npcs/inferno/constants';
import type {
  ActorLife,
  ActorOp,
  ActorRef,
  CaptureCoord,
  CaptureEvent,
  CaptureTick,
  LifeRecord,
  RangeStart,
  ReplayRange,
  SourceRef,
} from '../../../test/capture/types';

/**
 * Reader for the Inferno replay-range fixtures (`fixtures/replay/*.replay.txt`), the records the
 * capture replay compares against; the grammar is in docs/testing/capture-timeline.md (Replay
 * ranges). Tiles in the files are local to the arena, `local = world - INFERNO_ORIGIN`, and every
 * tile is on plane 0. Parsing is strict: any line outside the grammar throws with its line number.
 */
export const INFERNO_ORIGIN = [2240, 5312] as const;

/** Actor names in the files: `<species>#<npc index>#<generation>`, or `player`. */
const SPECIES: Readonly<Record<string, number>> = {
  nibbler: INFERNO_WAVE_NPC_IDS.nibbler,
  bat: INFERNO_WAVE_NPC_IDS.bat,
  blob: INFERNO_WAVE_NPC_IDS.blob,
  blob_mage: INFERNO_WAVE_NPC_IDS.blob_mage,
  blob_range: INFERNO_WAVE_NPC_IDS.blob_range,
  blob_melee: INFERNO_WAVE_NPC_IDS.blob_melee,
  meleer: INFERNO_WAVE_NPC_IDS.meleer,
  ranger: INFERNO_WAVE_NPC_IDS.ranger,
  mager: INFERNO_WAVE_NPC_IDS.mager,
  jad: INFERNO_WAVE_NPC_IDS.jad,
  healer: INFERNO_WAVE_NPC_IDS.jad_healer,
  pillar: INFERNO_WAVE_NPC_IDS.pillar,
  collapse: INFERNO_WAVE_NPC_IDS.pillarCollapse,
};

const PLAYER: ActorLife = Object.freeze({ kind: 'player', index: 0, generation: 0 });

const INT = '-?\\d+';
const TILE = `${INT},${INT}`;
const ACTOR = '(?:player|[a-z_]+#\\d+#\\d+)';
const AT = ' @(\\d+)';

const HEADER = /^capture (\S+) stream (\d+) ticks (\d+)-(\d+)$/;
const LIFE = new RegExp(`^life (${ACTOR}) (\\d+) (\\d+|open)$`);
const START = /^start (\d+)$/;
const START_PLAYER = new RegExp(`^  player (${TILE})$`);
const START_NPC = new RegExp(`^  npc (${ACTOR}) (${TILE})$`);
const START_VARBIT = new RegExp(`^  varbit (\\d+) (${INT})$`);
const TICK = /^t(\d+)$/;
const RECORDS = {
  addDel: new RegExp(`^  (add|del) (${ACTOR}) (${TILE})${AT}$`),
  move: new RegExp(`^  (walk|run|crawl|teleport|telejump) (${ACTOR}) (${TILE}) -> (${TILE})((?: via ${TILE})*)${AT}$`),
  seq: new RegExp(`^  seq (${ACTOR}) (${INT})${AT}$`),
  gfx: new RegExp(`^  gfx (${ACTOR}) (\\d+)(?: delay (\\d+))?${AT}$`),
  hit: new RegExp(`^  hit (${ACTOR}) (\\d+) (\\d+)${AT}$`),
  dead: new RegExp(`^  dead (${ACTOR})${AT}$`),
  faceTile: new RegExp(`^  face (${ACTOR}) (${TILE})${AT}$`),
  faceActor: new RegExp(`^  face (${ACTOR}) (${ACTOR}) (${TILE})${AT}$`),
  proj: new RegExp(
    `^  proj (\\d+) (${TILE}) -> (${ACTOR}|tile) (${TILE}) \\[(${INT}),(${INT}),(${INT}),(${INT}),(${INT}),(${INT})\\]${AT}$`,
  ),
  mapgfx: new RegExp(`^  mapgfx (\\d+) (${TILE})${AT}$`),
  wave: new RegExp(`^  wave (\\d+)${AT}$`),
  varbit: new RegExp(`^  varbit (\\d+) (${INT})${AT}$`),
} as const;

export class ReplayRangeError extends Error {
  constructor(
    readonly file: string,
    readonly line: number,
    reason: string,
  ) {
    super(`${file}:${line}: ${reason}`);
  }
}

/** A life's stable key, `kind:index#generation`. */
export function lifeKey(life: ActorLife): string {
  return `${life.kind}:${life.index}#${life.generation}`;
}

function world(text: string): CaptureCoord {
  const [x, y] = text.split(',').map(Number) as [number, number];
  return [x + INFERNO_ORIGIN[0], y + INFERNO_ORIGIN[1], 0];
}

export function parseReplayRange(text: string, file = '<replay range>'): ReplayRange {
  if (!text.endsWith('\n') || text.includes('\r')) throw new ReplayRangeError(file, 1, 'expected LF line endings');
  const lines = text.slice(0, -1).split('\n');
  let at = 0;
  const fail = (reason: string): never => {
    throw new ReplayRangeError(file, at + 1, reason);
  };
  const header = HEADER.exec(lines[0] ?? '') ?? fail('expected `capture <file> stream <n> ticks <first>-<last>`');
  const capture = header[1]!;
  const stream = Number(header[2]);
  const first = Number(header[3]);
  const last = Number(header[4]);
  if (first < 1 || last < first) fail('empty tick range');
  at = 1;

  const lives = new Map<string, LifeRecord>();
  const identities = new Set<string>();
  for (let match = LIFE.exec(lines[at] ?? ''); match; match = LIFE.exec(lines[++at] ?? '')) {
    const [, name, start, end] = match as unknown as [string, string, string, string];
    const [species, index, generation] = name.split('#') as [string, string, string];
    const npcId = SPECIES[species];
    if (name === 'player' || npcId === undefined) fail(`unknown species in ${name}`);
    if (identities.has(`${index}#${generation}`)) fail(`second life for ${index}#${generation}`);
    identities.add(`${index}#${generation}`);
    lives.set(name, {
      life: Object.freeze({ kind: 'npc', index: Number(index), generation: Number(generation) }),
      npcId: npcId!,
      start: Number(start),
      end: end === 'open' ? null : Number(end),
    });
  }
  const life = (name: string): ActorLife =>
    name === 'player' ? PLAYER : (lives.get(name) ?? fail(`no life for ${name}`)).life;
  const npc = (name: string): ActorLife => (name === 'player' ? fail(`${name} is not an NPC`) : life(name));

  const startMatch = START.exec(lines[at] ?? '') ?? fail('expected `start <tick>`');
  if (Number(startMatch[1]) !== first - 1) fail(`the start state must be at t${first - 1}`);
  at++;
  const player = START_PLAYER.exec(lines[at] ?? '') ?? fail('expected the start `player <x>,<y>`');
  at++;
  const npcs: { life: ActorLife; coord: CaptureCoord }[] = [];
  for (let match = START_NPC.exec(lines[at] ?? ''); match; match = START_NPC.exec(lines[++at] ?? ''))
    npcs.push({ life: npc(match[1]!), coord: world(match[2]!) });
  const varbits: { id: number; value: number }[] = [];
  for (let match = START_VARBIT.exec(lines[at] ?? ''); match; match = START_VARBIT.exec(lines[++at] ?? '')) {
    const id = Number(match[1]);
    if (varbits.some((entry) => entry.id === id)) fail(`varbit ${id} twice in the start state`);
    varbits.push({ id, value: Number(match[2]) });
  }
  const start: RangeStart = { tick: first - 1, player: world(player[1]!), npcs, varbits };

  /** Each record's pattern and its event; the last group of every pattern is the capture line. */
  type Build = (match: RegExpExecArray, source: SourceRef) => CaptureEvent;
  const builders: readonly (readonly [RegExp, Build])[] = [
    [
      RECORDS.addDel,
      (match, source) => ({
        type: 'actor',
        op: match[1] as 'add' | 'del',
        actor: npc(match[2]!),
        npcId: npcIdOf(lives, match[2]!),
        coord: world(match[3]!),
        source,
      }),
    ],
    [
      RECORDS.move,
      (match, source) => {
        const actor = life(match[2]!);
        const destination = world(match[4]!);
        const via = match[5]!.split(' via ').slice(1).map(world);
        return {
          type: 'actor',
          op: match[1] as ActorOp,
          actor,
          ...(actor.kind === 'npc' ? { npcId: npcIdOf(lives, match[2]!) } : {}),
          coord: world(match[3]!),
          newcoord: destination,
          ...(via.length > 0 ? { path: [...via, destination] } : {}),
          source,
        };
      },
    ],
    [RECORDS.seq, (match, source) => ({ type: 'sequence', actor: life(match[1]!), id: Number(match[2]), source })],
    [
      RECORDS.gfx,
      (match, source) => ({
        type: 'spotanim',
        actor: npc(match[1]!),
        id: Number(match[2]),
        ...(match[3] === undefined ? {} : { delay: Number(match[3]) }),
        source,
      }),
    ],
    [
      RECORDS.hit,
      (match, source) => ({
        type: 'hit',
        actor: life(match[1]!),
        id: Number(match[2]),
        value: Number(match[3]),
        source,
      }),
    ],
    [RECORDS.dead, (match, source) => ({ type: 'dead', actor: npc(match[1]!), source })],
    [
      RECORDS.faceTile,
      (match, source) => ({ type: 'facing', mode: 'coord', actor: npc(match[1]!), coord: world(match[2]!), source }),
    ],
    [
      RECORDS.faceActor,
      (match, source) => ({
        type: 'facing',
        mode: 'actor',
        actor: npc(match[1]!),
        target: reference(match[2]!, life, lives, world(match[3]!)),
        source,
      }),
    ],
    [
      RECORDS.proj,
      (match, source) => {
        const [starttime, endtime, angle, progress, startheight, endheight] = match.slice(5, 11).map(Number) as [
          number,
          number,
          number,
          number,
          number,
          number,
        ];
        return {
          type: 'projectile',
          id: Number(match[1]),
          starttime,
          endtime,
          angle,
          progress,
          startheight,
          endheight,
          from: world(match[2]!),
          to: world(match[4]!),
          ...(match[3] === 'tile' ? {} : { targetActor: reference(match[3]!, life, lives) }),
          source,
        };
      },
    ],
    [RECORDS.mapgfx, (match, source) => ({ type: 'map_anim', id: Number(match[1]), coord: world(match[2]!), source })],
    [RECORDS.wave, (match, source) => ({ type: 'wave', wave: Number(match[1]), source })],
    [RECORDS.varbit, (match, source) => ({ type: 'varbit', id: Number(match[1]), value: Number(match[2]), source })],
  ];
  const record = (text: string, tick: number): CaptureEvent => {
    for (const [pattern, build] of builders) {
      const match = pattern.exec(text);
      if (match) return build(match, { capture, stream, tick, line: Number(match.at(-1)) });
    }
    return fail('not a record of the grammar');
  };

  const byTick = new Map<number, CaptureEvent[]>();
  let previous = first - 1;
  while (at < lines.length) {
    const tickMatch = TICK.exec(lines[at]!) ?? fail('expected `t<tick>` or a record of the grammar');
    const tick = Number(tickMatch[1]);
    if (tick <= previous || tick > last) fail(`t${tick} is out of order or outside ${first}-${last}`);
    previous = tick;
    const events: CaptureEvent[] = [];
    for (at++; at < lines.length && lines[at]!.startsWith('  '); at++) events.push(record(lines[at]!, tick));
    if (events.length === 0) {
      at--;
      fail(`t${tick} has no records`);
    }
    byTick.set(tick, events);
  }

  const ticks: CaptureTick[] = [];
  for (let tick = first; tick <= last; tick++) ticks.push({ tick, events: byTick.get(tick) ?? [] });
  return { capture, stream, first, last, lives: [...lives.values()], start, ticks };
}

function npcIdOf(lives: ReadonlyMap<string, LifeRecord>, name: string): number {
  return lives.get(name)!.npcId!;
}

function reference(
  name: string,
  life: (name: string) => ActorLife,
  lives: ReadonlyMap<string, LifeRecord>,
  coord?: CaptureCoord,
): ActorRef {
  const target = life(name);
  return {
    kind: target.kind,
    index: target.index,
    life: target,
    ...(target.kind === 'npc' ? { npcId: npcIdOf(lives, name) } : {}),
    ...(coord ? { coord } : {}),
  };
}

const loaded = new Map<string, ReplayRange>();

/** Reads a `.replay.txt` range, parsing each path once per module instance. Treat it as immutable. */
export function loadReplayRange(path: string): ReplayRange {
  let range = loaded.get(path);
  if (!range) {
    range = parseReplayRange(readFileSync(path, 'utf8'), path);
    loaded.set(path, range);
  }
  return range;
}
