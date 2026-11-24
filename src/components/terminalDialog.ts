import type { EncounterOutcome } from '../core/encounters/outcome';

/** Which terminal overlay (if any) the arena should mount this frame. */
export type TerminalDialog = 'death' | 'victory' | 'none';

export type TerminalDialogInput = {
  readonly outcomePhase: EncounterOutcome['phase'];
  /** True when the player is dead or a fail condition is set. */
  readonly playerFailed: boolean;
  /** True when a tutorial owns completion (encounter never enters shared victory). */
  readonly tutorialOwned: boolean;
  /** True while a replay is being watched (live terminal overlays are suppressed). */
  readonly isReplaying: boolean;
  /** True when the active encounter has authored victory presentation metadata. */
  readonly hasVictoryDescriptor: boolean;
};

/**
 * Arbitrate exactly one terminal dialog for the arena.
 *
 * Player death/failure always wins a same-tick mutual defeat: it takes priority
 * over victory.
 */
export function resolveTerminalDialog(input: TerminalDialogInput): TerminalDialog {
  if (input.playerFailed) return 'death';
  if (input.outcomePhase === 'victory' && !input.tutorialOwned && !input.isReplaying && input.hasVictoryDescriptor) {
    return 'victory';
  }
  return 'none';
}
