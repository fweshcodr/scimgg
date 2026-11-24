/**
 * Accepts the same "Custom swaps" rule format as the RuneLite plugin-hub plugin Custom
 * Menu Swaps (github.com/geheur/More-menu-entry-swaps), so existing rules paste in
 * unchanged. Implemented independently, and narrowed to the normal left click: no
 * hotkey swaps, no shift swaps, no bank/deposit modes.
 *
 * One rule per line, 1-4 comma-separated fields:
 *
 *     option,target[,onlyWhenTopOption[,onlyWhenTopTarget]]
 *
 * Fields are matched case-insensitively against the entry's option and target,
 * with `*` as the wildcard.
 */
type FieldMatcher = (value: string) => boolean;

const MATCH_ANYTHING: FieldMatcher = () => true;

/**
 * A field is compiled once at parse time, not per menu entry: the menu is
 * rebuilt on every hover and every click, so re-deriving the match kind (and
 * re-compiling a `RegExp`) there would run this per entry per frame.
 */
function compileField(pattern: string): FieldMatcher {
  const firstStar = pattern.indexOf('*');
  if (firstStar === -1) return (value) => value === pattern;
  if (pattern === '*') return MATCH_ANYTHING;

  const lastStar = pattern.lastIndexOf('*');
  if (firstStar === lastStar) {
    if (firstStar === 0) {
      const suffix = pattern.slice(1);
      return (value) => value.endsWith(suffix);
    }
    if (firstStar === pattern.length - 1) {
      const prefix = pattern.slice(0, -1);
      return (value) => value.startsWith(prefix);
    }
  } else if (firstStar === 0 && lastStar === pattern.length - 1 && pattern.indexOf('*', 1) === lastStar) {
    const middle = pattern.slice(1, -1);
    return (value) => value.includes(middle);
  }

  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const regex = new RegExp(`^${source}$`);
  return (value) => regex.test(value);
}

export interface CustomMenuSwap {
  readonly option: FieldMatcher;
  readonly target: FieldMatcher;
  readonly topOption: FieldMatcher;
  readonly topTarget: FieldMatcher;
}

function normalize(value: string | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

/** A line without a target matches only entries without one, such as "Walk here". */
export function parseCustomMenuSwaps(text: string): CustomMenuSwap[] {
  const swaps: CustomMenuSwap[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const fields = line.split(',');
    swaps.push({
      option: compileField(normalize(fields[0])),
      target: compileField(normalize(fields[1])),
      topOption: fields.length > 2 ? compileField(normalize(fields[2])) : MATCH_ANYTHING,
      topTarget: fields.length > 3 ? compileField(normalize(fields[3])) : MATCH_ANYTHING,
    });
  }
  return swaps;
}

export interface SwappableMenuEntry {
  readonly action: string;
  readonly target?: string;
}

/**
 * The `*` prefixing the NPC the player is already attacking is this app's own
 * marker, not part of the name, so a rule written `attack,yama*` keeps matching
 * once the fight starts.
 */
function entryTarget(entry: SwappableMenuEntry): string {
  const target = normalize(entry.target);
  return target.startsWith('*') ? target.slice(1).trim() : target;
}

/**
 * Index of the entry a rule promotes to the left click, or -1 when none matches.
 *
 * Index 0 is a real result and NOT the same as -1: a rule naming what already leads
 * the menu still decides the click, and collapsing the two sent it back to a
 * fallback order that is not the menu's. Later rules outrank earlier ones; among
 * entries matching the same rule the topmost wins.
 */
export function findCustomMenuSwapIndex(
  entries: readonly SwappableMenuEntry[],
  swaps: readonly CustomMenuSwap[],
): number {
  const top = entries[0];
  if (!top || swaps.length === 0) return -1;

  const topOption = normalize(top.action);
  const topTarget = entryTarget(top);

  let bestEntry = -1;
  let bestSwap = -1;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    const option = normalize(entry.action);
    const target = entryTarget(entry);
    for (let s = swaps.length - 1; s > bestSwap; s--) {
      const swap = swaps[s];
      if (!swap) continue;
      if (swap.option(option) && swap.target(target) && swap.topOption(topOption) && swap.topTarget(topTarget)) {
        bestEntry = i;
        bestSwap = s;
        break;
      }
    }
  }

  return bestEntry;
}
