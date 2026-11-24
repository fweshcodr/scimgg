/**
 * An encounter's own practice session: the state a run is in, and the one or two restarts that
 * state offers. Inferno's waves are the first; any fight that repeats a stage rather than the
 * whole run fits the same shape.
 *
 * Sibling of {@link ./replayPractice}, which carries the replay's restart-from-a-tick session.
 * The two share the top chrome's session slot, and replay practice wins while it is active.
 */

export interface PracticeSessionAction {
  readonly label: string;
  /** Said in the app's hover card, never the browser's title tooltip. */
  readonly hint: string;
  readonly onClick: () => void;
}

export interface PracticeSessionState {
  /** What the run is on now, e.g. "Wave 47". Short: it is a title, not a sentence. */
  readonly title: string;
  /**
   * The restart a player reaches for most: the current stage again, as the encounter defines a
   * retry. Ctrl+R runs it while no replay practice start is set.
   */
  readonly primary: PracticeSessionAction;
  /** A second way to restart the stage, where the run's state offers one (Inferno: back to random spawns). */
  readonly secondary?: PracticeSessionAction;
}
