import type React from 'react';
import { useMemo } from 'react';
import type { ReplayClickType } from '../../core/ReplayRecorder';
import { getAutocastableSpells, spellIconName } from '../../data/spellCatalog';
import { THEME } from '../../theme';
import type { SpellbookType } from '../../types/spellbook';
import { SPELLBOOK_DISPLAY_NAMES } from '../../types/spellbook';
import { NineSliceBg } from '../NineSliceBg';
import { PixelSprite } from '../PixelSprite';
import { useTooltip } from '../Tooltip';
import { getSpellIconPath, SPELLBOOKS } from './spellbookFilterUtils';

/**
 * OSRS "Select an autocast spell" interface (opened from the Combat tab's
 * Autocast / Def. Autocast button).
 */
interface AutocastSpellPickerProps {
  spellbook: SpellbookType;
  selectedSpell: string | null;
  /** True when opened from the Defensive Autocast button — only changes the heading. */
  defensive?: boolean;
  onSelect: (spellName: string) => void;
  onCancel: () => void;
  onReplayCursorClick?: (clientX: number, clientY: number, type: ReplayClickType, nowMs?: number) => void;
}

const PANEL_INSET = 7;
const CONTENT_W = 190;
const SLOT_SIZE = 40;
const MAX_COLS = 4;
const TITLE_H = 26;
const FOOTER_H = 26;
const SHADOW = '1px 1px 0 #000';

export const AutocastSpellPicker: React.FC<AutocastSpellPickerProps> = ({
  spellbook,
  selectedSpell,
  defensive = false,
  onSelect,
  onCancel,
  onReplayCursorClick,
}) => {
  const { bindTooltip } = useTooltip();
  const iconDir = SPELLBOOKS[spellbook].iconDir;
  const spells = useMemo(() => getAutocastableSpells(spellbook), [spellbook]);

  const cols = Math.max(1, Math.min(MAX_COLS, spells.length));
  const gapX = cols > 1 ? Math.floor((CONTENT_W - cols * SLOT_SIZE) / (cols - 1)) : 0;
  const gridW = cols * SLOT_SIZE + (cols - 1) * gapX;
  const startX = PANEL_INSET + Math.floor((CONTENT_W - gridW) / 2);
  const startY = PANEL_INSET + TITLE_H;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
      <div
        style={{
          position: 'absolute',
          left: PANEL_INSET,
          top: PANEL_INSET,
          width: CONTENT_W,
          height: TITLE_H,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"RuneScape Bold 12", sans-serif',
          fontSize: '16px',
          color: THEME.colors.native.orange,
          textShadow: SHADOW,
          textAlign: 'center',
        }}
      >
        <div>Select an autocast spell</div>
      </div>

      {spells.length === 0 ? (
        <div
          style={{
            position: 'absolute',
            left: PANEL_INSET,
            top: startY,
            width: CONTENT_W,
            fontFamily: '"RuneScape Plain 11", sans-serif',
            fontSize: '16px',
            color: THEME.colors.native.orange,
            textShadow: SHADOW,
            textAlign: 'center',
          }}
        >
          No autocast spells on the {SPELLBOOK_DISPLAY_NAMES[spellbook]} spellbook.
        </div>
      ) : (
        spells.map((spell, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const isSelected = spell.name === selectedSpell;
          return (
            <button
              key={spell.name}
              type="button"
              {...bindTooltip({
                lines: [
                  {
                    spans: [
                      { text: defensive ? 'Defensive autocast ' : 'Autocast ', color: '#00ff00' },
                      { text: spell.name, color: THEME.colors.native.info },
                    ],
                  },
                ],
              })}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                onSelect(spell.name);
                onReplayCursorClick?.(e.clientX, e.clientY, 'yellow', e.timeStamp);
              }}
              style={{
                position: 'absolute',
                left: startX + col * (SLOT_SIZE + gapX),
                top: startY + row * (SLOT_SIZE + 6),
                width: SLOT_SIZE,
                height: SLOT_SIZE,
                padding: 0,
                margin: 0,
                border: isSelected ? `1px solid ${THEME.colors.native.orange}` : '1px solid transparent',
                background: 'transparent',
                cursor: 'default',
                outline: 'none',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PixelSprite
                src={getSpellIconPath(iconDir, spellIconName(spell.name), SLOT_SIZE, true)}
                alt={spell.name}
                style={{
                  width: SLOT_SIZE - 2,
                  height: SLOT_SIZE - 2,
                  pointerEvents: 'none',
                  imageRendering: 'pixelated',
                }}
              />
            </button>
          );
        })
      )}

      <button
        type="button"
        onMouseDown={(e) => {
          if (e.button === 0) onCancel();
        }}
        style={{
          position: 'absolute',
          left: PANEL_INSET + Math.floor((CONTENT_W - 56) / 2),
          top: 275 - PANEL_INSET - FOOTER_H,
          width: 56,
          height: 18,
          border: 'none',
          background: 'transparent',
          padding: '1px 0',
          margin: 0,
          cursor: 'default',
          outline: 'none',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"RuneScape Bold 12", sans-serif',
          fontSize: '14px',
          color: THEME.colors.native.orange,
          textShadow: SHADOW,
        }}
      >
        <NineSliceBg />
        <span style={{ position: 'relative', zIndex: 1 }}>Cancel</span>
      </button>
    </div>
  );
};
