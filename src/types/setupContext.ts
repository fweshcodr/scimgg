/**
 * Which setup an encounter surface (the configurer, Practice) is showing and editing, and the reset
 * it offers. Owned by `useEncounterManager`; see "Setup persistence" in
 * docs/architecture/encounter-configurer.md.
 *
 * - `saved`: the player's remembered options for the encounter/variant. Edits save at once.
 * - `tutorial`: a lesson's own options (encounter defaults, account unlocks, the lesson's settings
 *   and forced Infinite Health). Never saved; offers no reset.
 */
export type SetupMode = 'saved' | 'tutorial';

export interface SetupContextControls {
  readonly mode: SetupMode;
  /**
   * Mechanics, modifiers and starting hitpoints all equal the encounter/variant defaults. Account
   * unlocks (`__player__`) and gear are not compared. Lets a reset be disabled or hidden.
   */
  readonly isDefault: boolean;
  /**
   * `saved` only: put the shown encounter/variant's mechanics, modifiers and starting hitpoints back
   * to their defaults, saved at once. Gear, named presets, account unlocks and sibling variants are
   * left alone. Returns an undo that restores exactly what the reset replaced (for an Undo toast);
   * calling it after later edits restores those three things only, for this encounter/variant.
   */
  readonly onReset?: () => () => void;
}
