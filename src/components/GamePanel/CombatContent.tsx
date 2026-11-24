import type React from 'react';
import { useMemo } from 'react';
import { SOULREAPER_MAX_STACKS } from '../../core/combat/player/soulreaper';
import type { ReplayClickType } from '../../core/ReplayRecorder';
import { weaponHasSpecialAttack } from '../../data/specialAttacks';
import { COMBAT_BUTTONS } from '../../resourcePack';
import type { EnumTypeLoader } from '../../rs/config/enumtype/EnumTypeLoader';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import type { StructTypeLoader } from '../../rs/config/structtype/StructTypeLoader';
import { THEME } from '../../theme';
import { getWeaponCategory, resolveActiveSpell } from '../../types/attackStyles';
import { combatLevelFromBaseStats, createDefaultStats, type PlayerStats } from '../../types/playerState';
import { DEFAULT_SPELLBOOK, type SpellbookType } from '../../types/spellbook';
import { PixelSprite } from '../PixelSprite';
import { AutocastSpellPicker } from './AutocastSpellPicker';
import { getSpellIconPath, SPELLBOOKS } from './spellbookFilterUtils';

interface CombatContentProps {
  weaponId?: number;
  specialAttackPercent?: number;
  /**
   * Soul stacks while the Soulreaper axe is worn, else undefined: the bar then reads
   * "Special Attack: N/5" and fills by the stacks.
   */
  soulreaperStacks?: number;
  isSpecialAttackActive?: boolean;
  pendingSpecialAttackToggles?: number;
  onSpecialAttackToggle?: () => void;
  onReplayCursorClick?: (clientX: number, clientY: number, type: ReplayClickType, nowMs?: number) => void;
  hasSpecialAttack?: boolean;
  selectedAttackStyleIndex?: number;
  onAttackStyleChange?: (index: number) => void;
  autoRetaliate?: boolean;
  onAutoRetaliateToggle?: () => void;
  objTypeLoader?: ObjTypeLoader;
  enumTypeLoader?: EnumTypeLoader;
  structTypeLoader?: StructTypeLoader;
  /** Live combat stats from the simulation (current = boosted/drained, max = base). */
  stats?: PlayerStats;
  /** Spellbook the loadout is on. Drives which spells the autocast picker offers. */
  spellbook?: SpellbookType;
  /** Explicitly selected autocast spell name, or null to use the weapon default. */
  selectedSpell?: string | null;
  onSelectedSpellChange?: (spellName: string) => void;
  /**
   * Attack-style row the autocast picker is open on, or `null` when it is closed. Owned
   * by `GamePanel` rather than here so a replay can restore it: the picker REPLACES the
   * style buttons, and a cursor recorded over "Autocast" otherwise lands on a spell.
   */
  pickerStyleIndex: number | null;
  onPickerStyleIndexChange: (index: number | null) => void;
}

const C = {
  get orange() {
    return THEME.colors.native.orange;
  },
  yellow: '#FFD700',
  white: '#ffffff',
  specBg: '#730606',
  specFill: '#397d3b',
  specBorder: '#2c2a23',
  specText: '#000010',
};

const SHADOW = '1px 1px 0 #000';

// OSRS Interface 593 layout (desktop).
// Content area: 190x261 at inset (7,7) inside 204x275 panel.
//   y start 45, button 71x47, column gap 8, row gap 7, margin 20, retaliate height 44
//   Verify: margin + btn_w + col_gap + btn_w + margin = 20+71+8+71+20 = 190
const BTN_W = 71;
const BTN_H = 47;
const COL_GAP = 8;
const ROW_GAP = 7;
const MARGIN = 20;
const COL1_X = 7 + MARGIN; // 27
const COL2_X = COL1_X + BTN_W + COL_GAP; // 106
const ROW1_Y = 7 + 45; // 52
const ROW2_Y = ROW1_Y + BTN_H + ROW_GAP; // 106
const FULL_W = COL_GAP + BTN_W * 2; // 150
const RETAL_Y = 7 + 45 + 2 * (BTN_H + ROW_GAP); // 160
const RETAL_H = 44;
const SPEC_Y = RETAL_Y + RETAL_H + ROW_GAP; // 211

const L = {
  weaponName: { x: 17, y: 7, w: 169, h: 30 },
  combatLevel: { x: 17, y: 33, w: 169, h: 12 },
  category: { x: 7, y: 238, w: 190, h: 28 },

  normalSlots: [
    { x: COL1_X, y: ROW1_Y, w: BTN_W, h: BTN_H },
    { x: COL2_X, y: ROW1_Y, w: BTN_W, h: BTN_H },
    { x: COL1_X, y: ROW2_Y, w: BTN_W, h: BTN_H },
    { x: COL2_X, y: ROW2_Y, w: BTN_W, h: BTN_H },
  ] as const,

  thinSlots: [
    { x: COL1_X, y: ROW1_Y, w: BTN_W, h: 32 },
    { x: COL1_X, y: ROW1_Y + 36, w: BTN_W, h: 32 },
    { x: COL1_X, y: ROW1_Y + 72, w: BTN_W, h: 32 },
  ] as const,

  autocastDef: { x: COL2_X, y: ROW1_Y, w: BTN_W, h: BTN_H },
  autocastNormal: { x: COL2_X, y: ROW2_Y, w: BTN_W, h: BTN_H },

  retaliate: { x: COL1_X, y: RETAL_Y, w: FULL_W, h: RETAL_H },
  retaliateIcon: { x: COL1_X + 4, y: RETAL_Y + 2, w: 26, h: 39 },
  retaliateText: { x: COL1_X + 34, y: RETAL_Y, w: FULL_W - 38, h: RETAL_H },

  specBar: { x: COL1_X, y: SPEC_Y, w: FULL_W, h: 26 },
  specBarInner: { x: COL1_X + 2, y: SPEC_Y + 7, w: FULL_W - 4, h: 12 },
  specBarBorder: { x: COL1_X + 2, y: SPEC_Y + 6, w: FULL_W - 4, h: 14 },
};

import { NineSliceBg } from '../NineSliceBg';

const StoneButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    active?: boolean;
    thin?: boolean;
  }
> = ({ children, active, thin: _thin, style: btnStyle, ...props }) => {
  return (
    <button
      type="button"
      style={{
        position: 'absolute',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: 'default',
        outline: 'none',
        backgroundColor: 'transparent',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? C.white : C.orange,
        textShadow: SHADOW,
        fontFamily: '"RuneScape Plain 11", sans-serif',
        fontSize: '16px',
        imageRendering: 'pixelated' as const,
        ...btnStyle,
      }}
      {...props}
    >
      <NineSliceBg selected={active} />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
        }}
      >
        {children}
      </div>
    </button>
  );
};

export const CombatContent: React.FC<CombatContentProps> = ({
  pickerStyleIndex,
  onPickerStyleIndexChange,
  weaponId,
  specialAttackPercent = 100,
  soulreaperStacks,
  isSpecialAttackActive = false,
  pendingSpecialAttackToggles = 0,
  onSpecialAttackToggle,
  onReplayCursorClick,
  hasSpecialAttack: hasSpecialAttackProp,
  selectedAttackStyleIndex: selectedStyleIndex = 0,
  onAttackStyleChange,
  autoRetaliate = false,
  onAutoRetaliateToggle,
  objTypeLoader,
  enumTypeLoader,
  spellbook = DEFAULT_SPELLBOOK,
  selectedSpell = null,
  onSelectedSpellChange,
  stats,
}) => {
  const category = getWeaponCategory(weaponId);
  const combatLevel = combatLevelFromBaseStats(stats ?? createDefaultStats());

  const displayName = useMemo(() => {
    if (weaponId && objTypeLoader) {
      try {
        const objType = objTypeLoader.load(weaponId);
        if (objType.name && objType.name !== 'null') return objType.name;
      } catch {
        /* empty */
      }
    }
    return category.name;
  }, [weaponId, objTypeLoader, category.name]);

  const styles = category.styles;

  const nonSpell = styles.filter((s) => s.combatStyle !== 'Casting' && s.combatStyle !== 'Defensive Casting');
  const spellRaw = styles.filter((s) => s.combatStyle === 'Casting' || s.combatStyle === 'Defensive Casting');
  const spellSorted = [...spellRaw].sort((a, b) =>
    a.combatStyle === 'Defensive Casting' ? -1 : b.combatStyle === 'Defensive Casting' ? 1 : 0,
  );
  const hasSpells = spellSorted.length > 0;

  const hasSpec = hasSpecialAttackProp ?? weaponHasSpecialAttack(weaponId, enumTypeLoader);
  const specVisuallyActive = pendingSpecialAttackToggles % 2 === 1 ? !isSpecialAttackActive : isSpecialAttackActive;
  const specBarFraction =
    soulreaperStacks === undefined ? specialAttackPercent / 100 : soulreaperStacks / SOULREAPER_MAX_STACKS;

  const renderNormalButton = (style: (typeof styles)[0], slotIndex: number) => {
    const globalIndex = styles.indexOf(style);
    const sel = selectedStyleIndex === globalIndex;
    const slot = L.normalSlots[slotIndex];
    return (
      <StoneButton
        key={globalIndex}
        active={sel}
        onMouseDown={(e: React.MouseEvent) => {
          if (e.button === 0 && onAttackStyleChange) {
            onAttackStyleChange(globalIndex);
            onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
          }
        }}
        style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h }}
      >
        {style.icon && (
          <PixelSprite
            src={`/assets/ui/combat-styles/${style.icon}`}
            alt={style.name}
            style={{ maxHeight: 20, maxWidth: 34, objectFit: 'contain', marginBottom: 2 }}
          />
        )}
        <div style={{ fontSize: '16px', lineHeight: '13px' }}>{style.name}</div>
      </StoneButton>
    );
  };

  const renderThinButton = (style: (typeof styles)[0], slotIndex: number) => {
    const globalIndex = styles.indexOf(style);
    const sel = selectedStyleIndex === globalIndex;
    const slot = L.thinSlots[slotIndex];
    return (
      <StoneButton
        key={globalIndex}
        active={sel}
        thin
        onMouseDown={(e: React.MouseEvent) => {
          if (e.button === 0 && onAttackStyleChange) {
            onAttackStyleChange(globalIndex);
            onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
          }
        }}
        style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h }}
      >
        {style.icon && (
          <PixelSprite
            src={`/assets/ui/combat-styles/${style.icon}`}
            alt={style.name}
            style={{ maxHeight: 18, maxWidth: 30, objectFit: 'contain', marginBottom: 1 }}
          />
        )}
        <div style={{ fontSize: '14px', lineHeight: '12px' }}>{style.name}</div>
      </StoneButton>
    );
  };

  const renderAutocastButton = (style: (typeof styles)[0], slot: typeof L.autocastDef) => {
    const globalIndex = styles.indexOf(style);
    const sel = selectedStyleIndex === globalIndex;
    const isDef = style.combatStyle === 'Defensive Casting';
    const spellInfo = resolveActiveSpell({ weaponId, selectedStyleIndex: globalIndex, selectedSpell, spellbook });
    return (
      <StoneButton
        key={globalIndex}
        active={sel}
        onMouseDown={(e: React.MouseEvent) => {
          if (e.button !== 0) return;
          // OSRS opens the autocast spell-select interface from this button.
          // The stance is committed when a spell is picked.
          if (onSelectedSpellChange) {
            onPickerStyleIndexChange(globalIndex);
          } else {
            onAttackStyleChange?.(globalIndex);
          }
          onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
        }}
        style={{ left: slot.x, top: slot.y, width: slot.w, height: slot.h }}
      >
        {spellInfo ? (
          <PixelSprite
            src={getSpellIconPath(SPELLBOOKS[spellInfo.spellbook].iconDir, spellInfo.icon, 24, true)}
            alt={spellInfo.name}
            style={{ maxHeight: 22, maxWidth: 30, objectFit: 'contain', marginBottom: 1, imageRendering: 'pixelated' }}
          />
        ) : (
          style.icon && (
            <PixelSprite
              src={`/assets/ui/combat-styles/${style.icon}`}
              alt={style.name}
              style={{ maxHeight: 20, maxWidth: 30, objectFit: 'contain', marginBottom: 1 }}
            />
          )
        )}
        <div style={{ fontSize: '14px', lineHeight: '12px' }}>{isDef ? 'Def. Autocast' : 'Autocast'}</div>
      </StoneButton>
    );
  };

  if (pickerStyleIndex !== null) {
    const pickerStyle = styles[pickerStyleIndex];
    return (
      <div style={{ width: 204, height: 275, position: 'relative' }}>
        <AutocastSpellPicker
          spellbook={spellbook}
          selectedSpell={selectedSpell}
          defensive={pickerStyle?.combatStyle === 'Defensive Casting'}
          onSelect={(spellName) => {
            onSelectedSpellChange?.(spellName);
            onAttackStyleChange?.(pickerStyleIndex);
            onPickerStyleIndexChange(null);
          }}
          onCancel={() => onPickerStyleIndexChange(null)}
          onReplayCursorClick={onReplayCursorClick}
        />
      </div>
    );
  }

  return (
    <div style={{ width: 204, height: 275, position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          left: L.weaponName.x,
          top: L.weaponName.y,
          width: L.weaponName.w,
          height: L.weaponName.h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"RuneScape Quill 8", sans-serif',
          fontSize: '16px',
          color: C.orange,
          textShadow: SHADOW,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {displayName}
      </div>

      <div
        style={{
          position: 'absolute',
          left: L.combatLevel.x,
          top: L.combatLevel.y,
          width: L.combatLevel.w,
          height: L.combatLevel.h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"RuneScape Plain 11", sans-serif',
          fontSize: '16px',
          color: C.orange,
          textShadow: SHADOW,
        }}
      >
        Combat Lvl: {combatLevel}
      </div>

      {!hasSpells && nonSpell.map((style, i) => renderNormalButton(style, i))}

      {hasSpells && nonSpell.map((style, i) => renderThinButton(style, i))}
      {hasSpells &&
        spellSorted.map((style) => {
          const isDef = style.combatStyle === 'Defensive Casting';
          const slot = isDef ? L.autocastDef : L.autocastNormal;
          return renderAutocastButton(style, slot);
        })}

      <button
        type="button"
        onMouseDown={(e: React.MouseEvent) => {
          if (e.button === 0) onAutoRetaliateToggle?.();
        }}
        style={{
          position: 'absolute',
          left: L.retaliate.x,
          top: L.retaliate.y,
          width: L.retaliate.w,
          height: L.retaliate.h,
          border: 'none',
          background: 'transparent',
          cursor: 'default',
          outline: 'none',
          padding: 0,
          margin: 0,
          boxSizing: 'border-box',
        }}
      >
        <NineSliceBg selected={autoRetaliate} />
        <PixelSprite
          src={autoRetaliate ? COMBAT_BUTTONS.autoRetaliateSelected : COMBAT_BUTTONS.autoRetaliate}
          alt="Auto Retaliate"
          style={{
            position: 'absolute',
            left: L.retaliateIcon.x - L.retaliate.x,
            top: L.retaliateIcon.y - L.retaliate.y,
            width: L.retaliateIcon.w,
            height: L.retaliateIcon.h,
            imageRendering: 'pixelated',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: L.retaliateText.x - L.retaliate.x,
            top: L.retaliateText.y - L.retaliate.y,
            width: L.retaliateText.w,
            height: L.retaliateText.h,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '"RuneScape Plain 11", sans-serif',
            fontSize: '16px',
            color: C.orange,
            textShadow: SHADOW,
          }}
        >
          <div>Auto Retaliate</div>
          <div>({autoRetaliate ? 'On' : 'Off'})</div>
        </div>
      </button>

      {hasSpec && (
        <button
          type="button"
          onMouseDown={(e: React.MouseEvent) => {
            if (e.button === 0 && onSpecialAttackToggle) {
              onSpecialAttackToggle();
              onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
            }
          }}
          style={{
            position: 'absolute',
            left: L.specBar.x,
            top: L.specBar.y,
            width: L.specBar.w,
            height: L.specBar.h,
            border: 'none',
            background: 'transparent',
            cursor: 'default',
            outline: 'none',
            padding: 0,
            margin: 0,
            boxSizing: 'border-box',
          }}
        >
          <NineSliceBg selected={specVisuallyActive} />
          <div
            style={{
              position: 'absolute',
              left: L.specBarBorder.x - L.specBar.x,
              top: L.specBarBorder.y - L.specBar.y,
              width: L.specBarBorder.w,
              height: L.specBarBorder.h,
              border: `1px solid ${C.specBorder}`,
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: L.specBarInner.x - L.specBar.x,
              top: L.specBarInner.y - L.specBar.y,
              width: L.specBarInner.w,
              height: L.specBarInner.h,
              backgroundColor: C.specBg,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: L.specBarInner.x - L.specBar.x,
              top: L.specBarInner.y - L.specBar.y,
              width: L.specBarInner.w * Math.max(0, Math.min(1, specBarFraction)),
              height: L.specBarInner.h,
              backgroundColor: C.specFill,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: L.specBar.w,
              height: L.specBar.h,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"RuneScape Plain 11", sans-serif',
              fontSize: '16px',
              color: specVisuallyActive ? C.yellow : C.specText,
              textShadow: specVisuallyActive ? SHADOW : 'none',
            }}
          >
            {soulreaperStacks === undefined
              ? `Special Attack: ${Math.floor(specialAttackPercent)}%`
              : `Special Attack: ${soulreaperStacks}/${SOULREAPER_MAX_STACKS}`}
          </div>
        </button>
      )}

      <div
        style={{
          position: 'absolute',
          left: L.category.x,
          top: L.category.y,
          width: L.category.w,
          height: L.category.h,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"RuneScape Plain 11", sans-serif',
          fontSize: '16px',
          color: C.orange,
          textShadow: SHADOW,
        }}
      >
        Category: {category.name}
      </div>
    </div>
  );
};
