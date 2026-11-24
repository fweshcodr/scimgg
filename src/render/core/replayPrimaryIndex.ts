import type { ReplayEffectDestination } from './replayEffectIndex';

export type PrimarySpec<Clip> = {
  readonly clip: Clip;
  readonly priority: number;
  readonly duration: number;
  readonly delay: number;
  readonly replaces: boolean;
};

export type PrimarySample<Clip> = {
  readonly clip: Clip;
  readonly duration: number;
  readonly elapsedTicks: number;
  readonly delayClientTicks: number;
  readonly remainderMs: number;
};

export type PrimaryCue<Cue> = {
  readonly frameIndex: number;
  readonly tick: number;
  readonly cycle?: number;
  readonly value: Cue;
};
type Accepted<Clip> = PrimaryCue<PrimarySpec<Clip>>;

export function canReplacePrimary(currentPriority: number | undefined, incomingPriority: number): boolean {
  return currentPriority === undefined || incomingPriority >= currentPriority;
}

export function primaryPhase(delay: number, elapsedCycles: number) {
  const cycles = Math.max(0, elapsedCycles);
  const wholeTicks = Math.floor(cycles);
  return {
    elapsedTicks: Math.max(0, wholeTicks - delay),
    delayClientTicks: Math.max(0, delay - wholeTicks),
    remainderMs: (cycles - wholeTicks) * 20,
  };
}

export class ReplayPrimaryIndex<Cue, Clip> {
  private metadata: object | undefined;
  private cursor = 0;
  private pending = false;
  private readonly accepted: Accepted<Clip>[] = [];

  constructor(private readonly cues: readonly PrimaryCue<Cue>[]) {}

  sample(
    destination: ReplayEffectDestination,
    metadata: object,
    resolve: (cue: Cue) => PrimarySpec<Clip> | null | undefined,
  ): { readonly primary: PrimarySample<Clip> | null; readonly rebuilt: boolean; readonly pending: boolean } {
    const rebuilt = this.metadata !== metadata || this.pending;
    if (this.metadata !== metadata) {
      this.metadata = metadata;
      this.cursor = 0;
      this.accepted.length = 0;
    }
    this.pending = false;
    for (; this.cursor < this.cues.length; this.cursor++) {
      const cue = this.cues[this.cursor];
      const cycle = cue.cycle ?? cue.tick * 30;
      if (cue.frameIndex > destination.throughFrameIndex || cycle > destination.cycle) break;
      const incoming = resolve(cue.value);
      if (incoming === undefined) {
        this.pending = true;
        break;
      }
      if (incoming === null) continue;
      const previous = this.accepted.at(-1);
      const current = previous && this.sampleEntry(previous, cycle) ? previous.value : undefined;
      if (incoming.replaces || canReplacePrimary(current?.priority, incoming.priority)) {
        this.accepted.push({ ...cue, value: incoming });
      }
    }
    let lower = 0;
    let upper = this.accepted.length;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      const entry = this.accepted[middle];
      if (entry.frameIndex <= destination.throughFrameIndex && (entry.cycle ?? entry.tick * 30) <= destination.cycle)
        lower = middle + 1;
      else upper = middle;
    }
    const entry = this.accepted[lower - 1];
    return { primary: entry ? this.sampleEntry(entry, destination.cycle) : null, rebuilt, pending: this.pending };
  }

  private sampleEntry(entry: Accepted<Clip>, cycle: number): PrimarySample<Clip> | null {
    const { clip, duration, delay } = entry.value;
    const phase = primaryPhase(delay, cycle - (entry.cycle ?? entry.tick * 30));
    return phase.delayClientTicks === 0 && phase.elapsedTicks >= duration ? null : { clip, duration, ...phase };
  }
}
