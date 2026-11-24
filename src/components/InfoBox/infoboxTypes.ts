export interface InfoBoxData {
  id: string;
  itemId?: number;
  spriteUrl?: string;
  /**
   * Pre-formatted display text. For countdowns this is the tick-boundary value,
   * used as-is outside a {@link TickProgressProvider} (tooltips, isolated tests);
   * when {@link ticksRemaining} is set the rendered tile prefers the smoothly
   * interpolated value instead.
   */
  text: string;
  /**
   * Ticks left on a countdown infobox. Present only for timers, and only so the
   * tile can count down on true one-second boundaries rather than stepping every
   * 0.6s tick.
   */
  ticksRemaining?: number;
  /**
   * Simulation tick {@link ticksRemaining} was sampled at. Paired with the render
   * loop's interpolated tick to work out how far into the tick we are, so a frame
   * where the two sources disagree cancels out instead of dipping a second.
   */
  sampledAtTick?: number;
  /**
   * What a non-timer value means, which picks its color from the pack in InfoBox.css: `boost` for
   * a raised stat or a spare charge, `drain` for a lowered stat. Unset reads as the shared value
   * color, the same one every countdown uses.
   */
  tone?: 'boost' | 'drain';
  /**
   * An explicit color, only for the tick counter, whose colors are the player's own plugin
   * settings. Anything with a meaning uses {@link tone} instead, so it follows the pack.
   */
  textColor?: string;
  tooltipTitle: string;
  tooltipDetail: string;
}
