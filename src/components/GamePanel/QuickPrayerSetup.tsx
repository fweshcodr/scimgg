import type React from 'react';
import { useMemo } from 'react';
import { BUTTON, PRAYER } from '../../resourcePack';
import { THEME } from '../../theme';
import { PixelSprite } from '../PixelSprite';
import { useSpriteCssUrls } from '../useSpriteCss';
import { PRAYER_GRID, type PrayerAvailability, resolvePrayerSlots } from './prayerFilterUtils';

const COLS = 5;
const SLOT_SIZE = 37;
const START_X = 9;
const START_Y = 15;

interface QuickPrayerSetupProps {
  quickPrayerSelections: string[];
  availability?: PrayerAvailability;
  upgradedPrayers?: boolean;
  zealPrayer?: boolean;
  onToggleSelection: (prayer: string) => void;
  onClose: () => void;
}

/** The Done button's tiled face, which the stylesheet paints; the preloader warms it. */
export function quickPrayerStylesheetSprites(): readonly [doneButton: string] {
  return [BUTTON.middle];
}

export const QuickPrayerSetup: React.FC<QuickPrayerSetupProps> = ({
  quickPrayerSelections,
  availability,
  upgradedPrayers,
  zealPrayer,
  onToggleSelection,
  onClose,
}) => {
  const selectedSet = useMemo(() => new Set(quickPrayerSelections), [quickPrayerSelections]);
  const [doneButtonUrl] = useSpriteCssUrls(quickPrayerStylesheetSprites());
  // Same resolver the book uses, so this screen assigns the prayer the square it mirrors prays.
  const grid = useMemo(
    () => resolvePrayerSlots(PRAYER_GRID, availability, { upgradedPrayers, zealPrayer }),
    [availability, upgradedPrayers, zealPrayer],
  );

  return (
    <div style={{ position: 'relative', width: 204, height: 275, userSelect: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      >
        {grid.map((slot, index) => {
          const col = index % COLS;
          const row = Math.floor(index / COLS);
          const x = START_X + col * SLOT_SIZE;
          const y = START_Y + row * SLOT_SIZE;
          const prayer = slot.prayer;
          const prayerAvailable = prayer !== undefined && slot.available;
          const selectionToToggle = prayerAvailable ? (slot.basePrayer ?? prayer) : undefined;
          const isSelected = selectionToToggle !== undefined && selectedSet.has(selectionToToggle);

          return (
            <button
              type="button"
              key={slot.icon}
              onClick={selectionToToggle ? () => onToggleSelection(selectionToToggle) : undefined}
              disabled={!prayerAvailable}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: SLOT_SIZE,
                height: SLOT_SIZE,
                background: 'transparent',
                border: 'none',
                borderRadius: 0,
                cursor: 'default',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                outline: 'none',
              }}
            >
              {isSelected && (
                <PixelSprite
                  src={PRAYER.activatedBackground}
                  alt=""
                  style={{
                    position: 'absolute',
                    width: 34,
                    height: 34,
                    left: (SLOT_SIZE - 34) / 2,
                    top: (SLOT_SIZE - 34) / 2,
                    imageRendering: 'pixelated',
                    pointerEvents: 'none',
                  }}
                />
              )}

              <PixelSprite
                src={prayerAvailable ? PRAYER.icon(slot.displayIcon) : PRAYER.iconDisabled(slot.displayIcon)}
                alt={slot.label}
                style={{
                  opacity: prayerAvailable ? 1 : 0.4,
                  filter: 'none',
                  pointerEvents: 'none',
                  position: 'relative',
                  imageRendering: 'pixelated',
                }}
              />
            </button>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'relative',
            fontFamily: '"RuneScape Bold 12", sans-serif',
            fontSize: '14px',
            color: THEME.colors.native.orange,
            textShadow: '1px 1px 0 #000',
            background: doneButtonUrl ? `url("${doneButtonUrl}") repeat` : 'none',
            backgroundSize: '12px 12px',
            imageRendering: 'pixelated' as const,
            borderTop: '1px solid #6d5a3b',
            borderLeft: '1px solid #6d5a3b',
            borderBottom: '1px solid #2a1f15',
            borderRight: '1px solid #2a1f15',
            padding: '2px 12px',
            margin: 0,
            cursor: 'default',
            outline: 'none',
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
};
