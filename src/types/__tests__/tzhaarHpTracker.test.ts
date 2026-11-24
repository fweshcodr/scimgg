import { describe, expect, it } from 'vitest';
import { WARBAND_SEER_NPC_ID } from '../../npcs/colosseum/constants';
import { INFERNO_WAVE_NPC_IDS, ZUK_HEALER_NPC_ID, ZUK_NPC_ID, ZUK_SHIELD_NPC_ID } from '../../npcs/inferno/constants';
import {
  DEFAULT_TZHAAR_HP_TRACKER_OPTIONS,
  isHiddenByTzhaarHideDead,
  isTzhaarTrackedNpc,
  parseTzhaarHpTrackerOptions,
  TZHAAR_ALIVE_COLOR,
  TZHAAR_DEAD_COLOR,
  tzhaarDynamicColor,
  tzhaarHighlightColor,
  tzhaarHpLocationFor,
  tzhaarHpTextColor,
  tzhaarMenuColor,
} from '../tzhaarHpTracker';

const MAGER = INFERNO_WAVE_NPC_IDS.mager;
const alive = { npcTypeId: MAGER, alive: true, hp: 120, maxHp: 220 };
const dead = { npcTypeId: MAGER, alive: false, hp: 0, maxHp: 220 };

describe('TzHaar HP Tracker NPCs', () => {
  it('tracks the Inferno, Zuk and Colosseum warband NPCs the sim has, not the pillars or the shield', () => {
    expect(isTzhaarTrackedNpc(INFERNO_WAVE_NPC_IDS.nibbler)).toBe(true);
    expect(isTzhaarTrackedNpc(ZUK_NPC_ID)).toBe(true);
    expect(isTzhaarTrackedNpc(WARBAND_SEER_NPC_ID)).toBe(true);
    expect(isTzhaarTrackedNpc(INFERNO_WAVE_NPC_IDS.pillar)).toBe(false);
    expect(isTzhaarTrackedNpc(ZUK_SHIELD_NPC_ID)).toBe(false);
  });

  it('colors a tracked NPC alive or dead in the menu, and only while Recolor menu is on', () => {
    expect(tzhaarMenuColor(alive, DEFAULT_TZHAAR_HP_TRACKER_OPTIONS)).toBe(TZHAAR_ALIVE_COLOR);
    expect(tzhaarMenuColor(dead, DEFAULT_TZHAAR_HP_TRACKER_OPTIONS)).toBe(TZHAAR_DEAD_COLOR);
    expect(tzhaarMenuColor(alive, { ...DEFAULT_TZHAAR_HP_TRACKER_OPTIONS, recolorMenu: false })).toBeUndefined();
    expect(tzhaarMenuColor({ ...alive, npcTypeId: ZUK_SHIELD_NPC_ID }, DEFAULT_TZHAAR_HP_TRACKER_OPTIONS)).toBe(
      undefined,
    );
  });

  it.each([
    ['Inferno Jad', INFERNO_WAVE_NPC_IDS.jad],
    ['Inferno Jad healer', INFERNO_WAVE_NPC_IDS.jad_healer],
    ['Zuk', ZUK_NPC_ID],
    ['Zuk healer', ZUK_HEALER_NPC_ID],
  ])('leaves %s out of the menu colors and Hide dead, like the plugin', (_name, npcTypeId) => {
    const hideDead = { ...DEFAULT_TZHAAR_HP_TRACKER_OPTIONS, hideDead: true };
    expect(tzhaarMenuColor({ ...dead, npcTypeId }, hideDead)).toBeUndefined();
    expect(isHiddenByTzhaarHideDead({ ...dead, npcTypeId }, hideDead)).toBe(false);
  });

  it('hides a dead tracked NPC only with Hide dead on, never a live one', () => {
    const hideDead = { ...DEFAULT_TZHAAR_HP_TRACKER_OPTIONS, hideDead: true };
    expect(isHiddenByTzhaarHideDead(dead, DEFAULT_TZHAAR_HP_TRACKER_OPTIONS)).toBe(false);
    expect(isHiddenByTzhaarHideDead(dead, hideDead)).toBe(true);
    expect(isHiddenByTzhaarHideDead(alive, hideDead)).toBe(false);
  });

  it('shades Dynamic HP Color from the dead color at 0 HP to the alive color at full, channel by channel', () => {
    // rgb(224, 0, 0) to rgb(0, 255, 48), rounded: half HP is rgb(112, 128, 24); 120/220 is rgb(102, 139, 26).
    expect(tzhaarDynamicColor({ hp: 110, maxHp: 220 })).toBe('#708018');
    expect(tzhaarDynamicColor({ hp: 220, maxHp: 220 })).toBe(TZHAAR_ALIVE_COLOR);
    expect(tzhaarDynamicColor({ hp: 300, maxHp: 220 })).toBe(TZHAAR_ALIVE_COLOR);
    expect(tzhaarDynamicColor({ hp: 0, maxHp: 220 })).toBe(TZHAAR_DEAD_COLOR);
  });

  it.each([
    ['off', TZHAAR_ALIVE_COLOR, TZHAAR_ALIVE_COLOR, TZHAAR_ALIVE_COLOR],
    ['highlight', TZHAAR_ALIVE_COLOR, '#668b1a', '#668b1a'],
    ['hp', '#668b1a', TZHAAR_ALIVE_COLOR, '#668b1a'],
    ['both', '#668b1a', '#668b1a', '#668b1a'],
  ] as const)('applies Dynamic HP Color %s to the HP text, the highlight and (any but Off) the menu', (dynamicColor, text, highlight, menu) => {
    const options = { ...DEFAULT_TZHAAR_HP_TRACKER_OPTIONS, dynamicColor };
    expect([
      tzhaarHpTextColor(alive, options),
      tzhaarHighlightColor(alive, options),
      tzhaarMenuColor(alive, options),
    ]).toEqual([text, highlight, menu]);
  });

  it('draws Zuk\'s "Above HP bar" at his center and every other location as chosen', () => {
    expect(tzhaarHpLocationFor(ZUK_NPC_ID, 'aboveHpBar')).toBe('center');
    expect(tzhaarHpLocationFor(ZUK_NPC_ID, 'bottom')).toBe('bottom');
    expect(tzhaarHpLocationFor(MAGER, 'aboveHpBar')).toBe('aboveHpBar');
  });
});

describe('parseTzhaarHpTrackerOptions', () => {
  it('keeps valid stored values and defaults the rest, key by key', () => {
    expect(parseTzhaarHpTrackerOptions({ showHp: 'bottom', highlightStyle: 'hull', hideDead: true })).toEqual({
      ...DEFAULT_TZHAAR_HP_TRACKER_OPTIONS,
      showHp: 'bottom',
      hideDead: true,
    });
    expect(parseTzhaarHpTrackerOptions({ dynamicColor: 'both' }).dynamicColor).toBe('both');
    expect(parseTzhaarHpTrackerOptions({ dynamicColor: 'rainbow' }).dynamicColor).toBe('off');
    expect(parseTzhaarHpTrackerOptions(undefined)).toEqual(DEFAULT_TZHAAR_HP_TRACKER_OPTIONS);
  });
});
