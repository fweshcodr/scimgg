import type React from 'react';
import type { MechanicsChoiceIcon } from '../core/encounters/types';

/**
 * The half in ARM is what makes the row symmetric, so do not round it to look tidy: it puts the
 * outer centers at 3.5 and 14.5, which with a 2px radius leaves the same 1.5px of margin at both
 * ends of the 18px box. At 5 or 6 one end gains a pixel the other loses. Circles are antialiased
 * at any offset, so there is no pixel-grid alignment to trade away for it.
 */
const CENTRE = 9;
const ARM = 5.5;
const DOT = 2;

const VERTICAL: readonly [number, number][] = [
  [CENTRE, CENTRE - ARM],
  [CENTRE, CENTRE],
  [CENTRE, CENTRE + ARM],
];

const HORIZONTAL: readonly [number, number][] = [
  [CENTRE - ARM, CENTRE],
  [CENTRE, CENTRE],
  [CENTRE + ARM, CENTRE],
];

const DOTS = {
  'fireball-line-vertical': VERTICAL,
  'fireball-line-horizontal': HORIZONTAL,
};

export const MechanicsChoiceGlyph: React.FC<{ icon: MechanicsChoiceIcon }> = ({ icon }) => {
  let drawing: React.ReactNode;
  switch (icon) {
    case 'fireball-line-horizontal':
    case 'fireball-line-vertical':
      drawing = DOTS[icon].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={DOT} fill="currentColor" />
      ));
      break;
    case 'left':
      drawing = <path d="M15 9H3m5-5L3 9l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />;
      break;
    case 'right':
      drawing = <path d="M3 9h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />;
      break;
    default:
      return icon satisfies never;
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" focusable="false">
      {drawing}
    </svg>
  );
};
