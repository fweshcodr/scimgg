import type React from 'react';
import './StatusBadge.css';

/**
 * Quiet metadata marker for something the player CAN use but that is not final.
 *
 * Layout-neutral on purpose: it sets no margin of its own, so each surface decides where the
 * badge sits. Putting placement in here is what produced the version that had to be centered by
 * hand at three different call sites.
 *
 * `compact` drops the frame for a DENSE row — the boss rail and the contract list, where the row
 * already carries its own border when selected and the badge sits beside 11-12px text rather than
 * a heading. The word stays 11px in both: that is the floor of the type scale, and these are pixel
 * faces that fuzz below it, so the weight comes off the box instead of the glyphs.
 */
export const StatusBadge: React.FC<{ children: React.ReactNode; compact?: boolean }> = ({ children, compact }) => (
  <span className={`status-badge${compact ? ' status-badge--compact' : ''}`}>{children}</span>
);

/**
 * Playable with known limitations: parts rest on thin or unverified evidence.
 *
 * NOT "WIP": these encounters and contracts run end to end, and a player reading "work in
 * progress" one click from Enter hears "broken". Beta says the same thing about our confidence
 * without lying about whether it works.
 */
export const BetaBadge: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <StatusBadge compact={compact}>Beta</StatusBadge>
);
