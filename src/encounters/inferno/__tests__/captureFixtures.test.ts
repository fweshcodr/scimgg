import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CaptureEventType } from '../../../test/capture/types';
import { INFERNO_CAPTURE_FIXTURES, INFERNO_CAPTURE_VARBITS, INFERNO_REPLAY_DIRECTORY } from './captureFixtures';
import { parseReplayRange } from './replayRange';

/** Account, session and social state: none of it may survive into a committed replay range. */
const ACCOUNT_TERMS = /account|login|credit|membership|ignore|friend|clan|rsn|display/i;
/** The header's capture name is the only free text, so it also must not name a timer or clock. */
const ACCOUNT_LABEL = new RegExp(`${ACCOUNT_TERMS.source}|time`, 'i');
/** Every record kind of the grammar; game messages appear only as `wave` records. */
const RECORD_KINDS: ReadonlySet<CaptureEventType> = new Set([
  'actor',
  'sequence',
  'spotanim',
  'hit',
  'dead',
  'facing',
  'projectile',
  'map_anim',
  'wave',
  'varbit',
]);

describe.each(Object.values(INFERNO_CAPTURE_FIXTURES))('committed replay ranges of $capture', ({ capture, ranges }) => {
  const texts = ranges.map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  const parsed = texts.map(({ path, text }) => parseReplayRange(text, path));
  const events = parsed.flatMap((range) => range.ticks.flatMap((tick) => tick.events));

  it('keeps only the allowlisted varbits and no varps', () => {
    const varbits = new Set([
      ...parsed.flatMap((range) => range.start.varbits.map((entry) => entry.id)),
      ...events.flatMap((event) => (event.type === 'varbit' ? [event.id] : [])),
    ]);
    expect([...varbits].filter((id) => !INFERNO_CAPTURE_VARBITS.has(id))).toEqual([]);
    expect(texts.flatMap(({ text }) => text.split('\n').filter((line) => /^\s*varp\b/.test(line)))).toEqual([]);
    // The allowlist is still read: dropping it would silently blank the prayer and pillar replays.
    expect(varbits).toEqual(INFERNO_CAPTURE_VARBITS);
  });

  it('carries no account, session or social labels, values or messages', () => {
    expect(parsed.map((range) => range.capture)).toEqual(ranges.map(() => capture));
    expect(parsed.map((range) => range.capture).filter((name) => ACCOUNT_LABEL.test(name))).toEqual([]);
    expect(texts.filter(({ text }) => ACCOUNT_TERMS.test(text)).map(({ path }) => path)).toEqual([]);
    expect([...new Set(events.map((event) => event.type))].filter((type) => !RECORD_KINDS.has(type))).toEqual([]);
  });

  it('carries no digest identifying the raw capture', () => {
    expect(texts.flatMap(({ text }) => text.match(/[0-9a-f]{64}/gi) ?? [])).toEqual([]);
  });
});

it('lists every committed replay range file', () => {
  const listed = Object.values(INFERNO_CAPTURE_FIXTURES).flatMap((entry) => entry.ranges);
  const present = readdirSync(INFERNO_REPLAY_DIRECTORY).map((name) => `${INFERNO_REPLAY_DIRECTORY}/${name}`);
  expect(present.sort()).toEqual([...listed].sort());
});
