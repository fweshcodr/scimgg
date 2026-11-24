import type { Coordinate } from '../../../../types/simulation';
import { BEE_CAPTURE_FRAMES } from './fixtures/beeCapture';

export const BEES_CAPTURE_B = 'colosseum-waves-bees-death(no-sol)-packet-data-1.txt';
export const BEES_CAPTURE_A =
  'colosseum-waves-1-12-damage-trials-solarflare3-volatility3-bees1-totemic-doom1-death-packet-data.txt';

interface CapturedBee {
  readonly id: number;
  readonly position: Coordinate;
  readonly alive: boolean;
  readonly firstCrawlTick: number;
  readonly resumeTick?: number;
}

/** One capture tick: `bees` as at its start, then what happened to them and the player. */
export interface BeeCaptureFrame {
  readonly tick: number;
  readonly playerStart: Coordinate;
  readonly playerEnd: Coordinate;
  readonly bees: readonly CapturedBee[];
  readonly moves: readonly { readonly id: number; readonly from: Coordinate; readonly to: Coordinate }[];
  readonly killed: readonly number[];
  readonly removed: readonly number[];
  readonly stings: number;
}

/** Local tiles; only the ticks on which a swarm existed or acted (see the fixture's header). */
export function readBeeFrames(filename: string): readonly BeeCaptureFrame[] {
  const frames = BEE_CAPTURE_FRAMES[filename];
  if (!frames) throw new Error(`No extracted bee frames for ${filename}`);
  return frames;
}

export interface BeeCaptureWindow {
  id: number;
  tick: number;
  start: Coordinate;
  player: Coordinate;
  steps: { tick: number; position: Coordinate }[];
  complete: boolean;
}

/** A destination can be inferred only for complete windows with 1..5 crawls, not cutoff windows. */
export function beeWindows(frames: readonly BeeCaptureFrame[]): BeeCaptureWindow[] {
  const windows = new Map<string, BeeCaptureWindow & { observed: number }>();
  for (const frame of frames) {
    for (const bee of frame.bees) {
      if (!bee.alive || frame.tick < bee.firstCrawlTick) continue;
      const tick = bee.firstCrawlTick + 12 * Math.floor((frame.tick - bee.firstCrawlTick) / 12);
      const key = `${bee.id}:${tick}`;
      let window = windows.get(key);
      if (!window) {
        window = {
          id: bee.id,
          tick,
          start: [...bee.position],
          player: [...frame.playerStart],
          steps: [],
          complete: frame.tick === tick,
          observed: 0,
        };
        windows.set(key, window);
      }
      window.observed++;
      if (frame.killed.includes(bee.id) || frame.removed.includes(bee.id)) window.complete = false;
      const move = frame.moves.find((move) => move.id === bee.id);
      if (move) window.steps.push({ tick: frame.tick, position: [...move.to] });
    }
  }
  return [...windows.values()].map(({ observed, ...window }) => ({
    ...window,
    complete: window.complete && observed === 12,
  }));
}
