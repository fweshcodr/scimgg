import { ZUK_SET_OPENING_TICK, ZUK_SET_TIMER_INTERVAL, ZUK_SET_TIMER_JAD_BONUS } from './constants';
import type { ZukPublicState } from './snapshot';

type SetClock =
  | { readonly phase: 'opening' | 'running' | 'paused' | 'post-jad'; readonly remaining: number }
  | { readonly phase: 'unsupported' | 'stopped' };

// A skipped opening does not freeze what was left of the 72-tick opening: the surviving clock is the
// ordinary 350-tick period with the same time already spent, so the next set lands 525 - elapsed ticks
// after Jad rather than 247 - elapsed. Converting on the way out of `opening` is the whole of that rule;
// restoring the plain opening remainder here silently reintroduces a set roughly 2:45 too early.
// Simulator policy, not capture-proven: docs/encounters/zuk-policy.md (Automatic sets)
const OPENING_SKIP_CARRY = ZUK_SET_TIMER_INTERVAL - ZUK_SET_OPENING_TICK;

export class ZukSetScheduler {
  private clock: SetClock = { phase: 'opening', remaining: ZUK_SET_OPENING_TICK };

  reset(): void {
    this.clock = { phase: 'opening', remaining: ZUK_SET_OPENING_TICK };
  }

  stop(): void {
    this.clock = { phase: 'stopped' };
  }

  // Observe actual post-player HP, including slider changes. The Jad latch releases the interlude whatever set it
  // (a qualifying hit or a raw HP edit); Show Jad alone does not set it.
  advance(hp: number, jadSpawned: boolean, enabled: boolean): boolean {
    const clock = this.clock;
    switch (clock.phase) {
      case 'unsupported':
      case 'stopped':
        return false;
      case 'opening':
      case 'running': {
        const remaining = clock.remaining - Number(enabled);
        const skippedOpening = clock.phase === 'opening' && (jadSpawned || hp < 600);
        const carried = skippedOpening ? remaining + OPENING_SKIP_CARRY : remaining;
        this.clock = jadSpawned
          ? { phase: 'post-jad', remaining: carried + ZUK_SET_TIMER_JAD_BONUS }
          : { phase: hp < 600 ? 'paused' : clock.phase, remaining: carried };
        break;
      }
      case 'paused':
        if (jadSpawned) this.clock = { phase: 'post-jad', remaining: clock.remaining + ZUK_SET_TIMER_JAD_BONUS };
        else if (hp > 600) this.clock = { phase: 'unsupported' };
        return false;
      case 'post-jad':
        this.clock = { ...clock, remaining: clock.remaining - Number(enabled) };
        break;
      default:
        return assertNever(clock);
    }
    if (!enabled || this.clock.phase === 'paused' || this.clock.remaining > 0) return false;
    this.clock = {
      phase: this.clock.phase === 'opening' ? 'running' : this.clock.phase,
      remaining: ZUK_SET_TIMER_INTERVAL,
    };
    // Saturation is not modeled: ordinary admissions are uncapped and never replace or release existing actors.
    return true;
  }

  getSnapshot(enabled: boolean): Pick<ZukPublicState, 'setTimer' | 'timerPaused'> {
    if (!enabled) return { setTimer: null, timerPaused: false };
    const clock = this.clock;
    switch (clock.phase) {
      case 'unsupported':
      case 'stopped':
        return { setTimer: null, timerPaused: false };
      case 'opening':
      case 'running':
      case 'post-jad':
        return { setTimer: clock.remaining, timerPaused: false };
      case 'paused':
        return { setTimer: clock.remaining, timerPaused: true };
      default:
        return assertNever(clock);
    }
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown Zuk clock: ${JSON.stringify(value)}`);
}
