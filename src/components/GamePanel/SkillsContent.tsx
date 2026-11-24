import type React from 'react';
import { useMemo } from 'react';
import { STATS } from '../../resourcePack';
import { createDefaultStats, type PlayerStats } from '../../types/playerState';
import { SkillsPanelCanvas } from './SkillsPanelCanvas';
import {
  BASE,
  CELL_H,
  CELL_W,
  CURRENT,
  cellOrigin,
  PANEL_CELLS,
  PANEL_H,
  PANEL_W,
  TEXT_BOX_W,
} from './skillsPanelLayout';

interface SkillsContentProps {
  /** Live stats from the simulation (current = boosted/drained, max = base). */
  stats?: PlayerStats;
}

const YELLOW = '#FFFF00';
const SHADOW = '1px 1px 0 #000';
const FONT = '"RuneScape Plain 11", sans-serif';

// Level text is positioned relative to its cell wrapper, matching the client's offsets exactly.
const levelTextStyle = (left: number, top: number): React.CSSProperties => ({
  position: 'absolute',
  left,
  top,
  width: TEXT_BOX_W,
  textAlign: 'center',
  whiteSpace: 'nowrap',
  fontFamily: FONT,
  fontSize: '16px',
  lineHeight: '12px',
  color: YELLOW,
  textShadow: SHADOW,
});

export const SkillsContent: React.FC<SkillsContentProps> = ({ stats }) => {
  const resolved = stats ?? createDefaultStats();

  const sources = useMemo(
    () => ({
      tileLeft: STATS.tileLeft,
      tileRightWithSlash: STATS.tileRightWithSlash,
      icons: PANEL_CELLS.map((cell) => ({ name: cell.name, src: STATS.skillIcon(cell.name) })),
    }),
    [],
  );

  return (
    <div style={{ width: PANEL_W, height: PANEL_H, position: 'relative' }} data-testid="skills-panel">
      <SkillsPanelCanvas
        tileLeft={sources.tileLeft}
        tileRightWithSlash={sources.tileRightWithSlash}
        icons={sources.icons}
      />
      {PANEL_CELLS.map((cell, index) => {
        const origin = cellOrigin(index);
        const level =
          cell.stat === null
            ? { current: 99, base: 99 }
            : { current: resolved[cell.stat].current, base: resolved[cell.stat].max };
        return (
          <fieldset
            key={cell.name}
            data-testid={`skill-cell-${cell.name}`}
            aria-label={`${cell.label}: level ${level.current}, base ${level.base}`}
            style={{
              position: 'absolute',
              left: origin.x,
              top: origin.y,
              width: CELL_W,
              height: CELL_H,
              minInlineSize: 0,
              margin: 0,
              padding: 0,
              border: 0,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            <div data-testid={`skill-current-${cell.name}`} style={levelTextStyle(CURRENT.x, CURRENT.y)}>
              {level.current}
            </div>
            <div data-testid={`skill-base-${cell.name}`} style={levelTextStyle(BASE.x, BASE.y)}>
              {level.base}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
};
