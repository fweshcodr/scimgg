import type React from 'react';
import { useCallback, useId, useRef } from 'react';
import type { BossHpPreset } from '../core/encounters/types';
import { npcDisplayName } from '../data/npcDisplayName';
import { THEME } from '../theme';
import type { NpcSnapshot } from '../types/simulation';
import { useHoverCard } from './ui/HoverCard';
import './BossHealthControl.css';

interface BossHealthControlProps {
  targetNpc: NpcSnapshot;
  onSetBossHp: (hp: number) => void;
  /**
   * Applies a preset as a PHASE rather than a bare HP set. Encounters whose phases own
   * actors rebuild them here, so it must NOT be wired to the slider. Falls back to
   * `onSetBossHp` when absent.
   */
  onApplyPreset?: (hp: number) => void;
  /** Encounter-provided HP presets — one per phase. Rendered as quick-set buttons. */
  presets?: readonly BossHpPreset[];
}

/** Sets the current boss HP from Practice's Fight Setup. */
export const BossHealthControl: React.FC<BossHealthControlProps> = ({
  targetNpc,
  onSetBossHp,
  onApplyPreset,
  presets,
}) => {
  const { hp, maxHp } = targetNpc;
  const safeMax = Math.max(1, maxHp);
  const clampedHp = Math.max(0, Math.min(safeMax, hp));
  const pct = Math.round((clampedHp / safeMax) * 100);
  const name = npcDisplayName(targetNpc);

  const fillColor = pct < 33 ? THEME.colors.danger : pct < 66 ? THEME.colors.warning : THEME.colors.success;

  const set = useCallback(
    (value: number) => {
      if (Number.isNaN(value)) return;
      onSetBossHp(Math.max(0, Math.min(safeMax, Math.round(value))));
    },
    [onSetBossHp, safeMax],
  );

  const applyPreset = useCallback(
    (value: number) => {
      if (Number.isNaN(value)) return;
      const clamped = Math.max(0, Math.min(safeMax, Math.round(value)));
      if (onApplyPreset) onApplyPreset(clamped);
      else onSetBossHp(clamped);
    },
    [onApplyPreset, onSetBossHp, safeMax],
  );

  const hasPresets = presets != null && presets.length > 0;

  return (
    <div className="boss-health">
      <div className="boss-health-head">
        <span className="boss-health-name">{name}</span>
        <span className="boss-health-value">
          {clampedHp}
          <span className="boss-health-sep">/</span>
          {maxHp}
        </span>
      </div>

      <input
        type="range"
        className="boss-health-slider"
        min={0}
        max={safeMax}
        step={1}
        value={clampedHp}
        onChange={(e) => set(Number(e.target.value))}
        aria-label={`Set ${name} health`}
        // A property, not an inline background: on touch the stylesheet paints it on the track.
        style={
          {
            '--boss-health-fill': `linear-gradient(to right, ${fillColor} 0%, ${fillColor} ${pct}%, rgba(255, 255, 255, 0.05) ${pct}%, rgba(255, 255, 255, 0.05) 100%)`,
          } as React.CSSProperties
        }
      />

      {hasPresets && (
        <fieldset className="boss-health-phases">
          <legend className="boss-health-name">Jump to phase</legend>
          <div className="boss-health-presets">
            {presets.map((preset) => (
              <PresetButton key={preset.label} preset={preset} bossName={name} onApply={() => applyPreset(preset.hp)} />
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
};

/** One phase button. Its hint, when the encounter gives one, is a hover card under it. */
const PresetButton: React.FC<{ preset: BossHpPreset; bossName: string; onApply: () => void }> = ({
  preset,
  bossName,
  onApply,
}) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cardId = useId();
  const { card } = useHoverCard({
    content: preset.hint,
    anchorRef: buttonRef,
    placement: 'block',
    cardClassName: 'boss-health-preset-card',
    cardId,
  });
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="boss-health-preset"
        onClick={onApply}
        aria-label={`Set ${bossName} to ${preset.label} (${preset.hp} HP)`}
        aria-describedby={preset.hint ? cardId : undefined}
      >
        <span className="boss-health-preset-label">{preset.label}</span>
        <span className="boss-health-preset-hp">{preset.hp}</span>
      </button>
      {preset.hint && card}
    </>
  );
};
