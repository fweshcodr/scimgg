import type React from 'react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { FILTER_TOGGLE } from '../../resourcePack';
import { PixelSprite } from '../PixelSprite';

/**
 * The prayer and spellbook filter menus, which the live client draws the same way.
 * They differ only in their row lists, so both panels render this.
 */

/** Both menus are 180 wide. */
const MENU_W = 180;
/** The 204x275 panel has a 7px chrome inset around the 190x261 content box. */
const PANEL_INSET = 7;
const CONTENT_W = 190;
/**
 * The menu container is 180 wide and 28px taller than its rows, which is the chrome it
 * centers them in.
 */
const MENU_CHROME = 28;
const TOGGLE = 17;
/** The toggle sits 5px from the row's left edge. */
const TOGGLE_X = 5;
/**
 * The label is 30 narrower than the menu and right-aligned 5px from its right edge, so
 * it starts at 25.
 */
const LABEL_W = MENU_W - 30;
const LABEL_X = MENU_W - 5 - LABEL_W;
/** A row is at least 25 tall, else its wrapped label's line count * 11 + 3. */
const ROW_MIN_H = 25;
const LINE_H = 11;
const ROW_PAD_TOP = 2;
const ROW_PAD_BOTTOM = 1;

/**
 * Each row is filled with white and driven by transparency alone: 255 (invisible) at
 * rest, 225 while the mouse is over it, 210 for the click flash. Alpha is
 * `(255 - t) / 255`.
 */
const HOVER_ALPHA = (255 - 225) / 255;
const PRESS_ALPHA = (255 - 210) / 255;
const PRESS_DURATION_MS = 800;

/** The label color of a row the client has grayed out. */
const DISABLED_LABEL = '#9f9f9f';
const LABEL_COLOR = '#ff981f';

export interface FilterMenuRow {
  key: string;
  /**
   * A `ReactNode` so a row can color part of its label the way the client's
   * `<col=ffffff>Combat</col>` markup does.
   */
  label: ReactNode;
  checked: boolean;
  /**
   * Grayed and inert. The client disables a row whose meaning depends on another
   * row's state, and still draws it rather than removing it.
   */
  disabled?: boolean;
  height?: number;
  onToggle: () => void;
}

export const FilterMenu: React.FC<{ rows: readonly FilterMenuRow[] }> = ({ rows }) => {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pressTimerRef.current !== null) clearTimeout(pressTimerRef.current);
    },
    [],
  );

  const flashPressed = (key: string) => {
    if (pressTimerRef.current !== null) clearTimeout(pressTimerRef.current);
    setPressedKey(key);
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      setPressedKey(null);
    }, PRESS_DURATION_MS);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: PANEL_INSET + Math.floor((CONTENT_W - MENU_W) / 2),
        top: PANEL_INSET + MENU_CHROME / 2,
        width: MENU_W,
        zIndex: 3,
      }}
    >
      {rows.map((row) => {
        const rowHeight = row.height ?? ROW_MIN_H;
        const highlight = row.disabled
          ? 0
          : pressedKey === row.key
            ? PRESS_ALPHA
            : hoveredKey === row.key
              ? HOVER_ALPHA
              : 0;
        return (
          <button
            key={row.key}
            type="button"
            data-filter-menu-row={row.key}
            aria-pressed={row.checked}
            disabled={row.disabled}
            onMouseEnter={() => setHoveredKey(row.key)}
            onMouseLeave={() => {
              setHoveredKey(null);
            }}
            onMouseDown={() => flashPressed(row.key)}
            onClick={row.onToggle}
            style={{
              position: 'relative',
              display: 'block',
              width: '100%',
              height: rowHeight,
              paddingTop: ROW_PAD_TOP,
              paddingBottom: ROW_PAD_BOTTOM,
              paddingLeft: 0,
              paddingRight: 0,
              margin: 0,
              border: 'none',
              borderRadius: 0,
              background: 'transparent',
              boxSizing: 'border-box',
              cursor: 'default',
              outline: 'none',
              textAlign: 'left',
            }}
          >
            {highlight > 0 && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `rgba(255, 255, 255, ${highlight})`,
                  pointerEvents: 'none',
                }}
              />
            )}
            <PixelSprite
              src={
                row.disabled ? FILTER_TOGGLE.disabled : row.checked ? FILTER_TOGGLE.checked : FILTER_TOGGLE.unchecked
              }
              alt=""
              style={{
                position: 'absolute',
                left: TOGGLE_X,
                top: Math.trunc(rowHeight / 2) - 8,
                width: TOGGLE,
                height: TOGGLE,
                imageRendering: 'pixelated',
                pointerEvents: 'none',
              }}
            />
            <span
              style={{
                display: 'block',
                marginLeft: LABEL_X,
                width: LABEL_W,
                fontFamily: '"RuneScape Plain 11", sans-serif',
                fontSize: '16px',
                lineHeight: `${LINE_H}px`,
                color: row.disabled ? DISABLED_LABEL : LABEL_COLOR,
                textShadow: '1px 1px 0 #000',
              }}
            >
              {row.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
