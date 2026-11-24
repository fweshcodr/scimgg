import type React from 'react';
import { useCallback, useId, useRef, useState } from 'react';
import type { PresetRequirements } from '../types/player';
import {
  clampStatLevel,
  createDefaultStats,
  createStatsFromBaseLevels,
  PLAYER_STAT_BOUNDS,
  PLAYER_STAT_DISPLAY_NAMES,
  PLAYER_STAT_KEYS,
  type PlayerBaseStats,
  type PlayerStatName,
  type PlayerStats,
} from '../types/playerState';
import './PlayerSettings.css';
import { PixelSprite } from './PixelSprite';
import { OsrsNumberInput } from './ui/OsrsNumberInput';

interface PlayerSettingsProps {
  stats: PlayerStats;
  onStatsChange: (stats: PlayerStats) => void;
  /** Unmet requirement targets for the selected loadout, marked on each deficient stat. */
  requirements?: PresetRequirements;
  /** Account-level unlocks for this encounter (e.g. a double Death Charge). */
  accountUnlocks?: React.ReactNode;
}

function toBaseLevels(stats: PlayerStats): PlayerBaseStats {
  return {
    attack: stats.attack.max,
    strength: stats.strength.max,
    defence: stats.defence.max,
    ranged: stats.ranged.max,
    magic: stats.magic.max,
    prayer: stats.prayer.max,
    hitpoints: stats.hitpoints.max,
    agility: stats.agility.max,
  };
}

/**
 * Everything about the PLAYER on an encounter config screen, as opposed to the boss: the
 * base levels (current is always pinned to max, since configuration is base stats) and any
 * account-level unlocks the encounter cares about.
 */
export const PlayerSettings: React.FC<PlayerSettingsProps> = ({
  stats,
  onStatsChange,
  requirements = {},
  accountUnlocks,
}) => {
  const headingId = useId();
  const statsGridRef = useRef<HTMLDivElement>(null);
  const [drafts, setDrafts] = useState<Partial<Record<PlayerStatName, string>>>({});

  const commitStat = useCallback(
    (stat: PlayerStatName, level: number) => {
      const nextLevels = toBaseLevels(stats);
      nextLevels[stat] = clampStatLevel(stat, level);
      onStatsChange(createStatsFromBaseLevels(nextLevels));
    },
    [stats, onStatsChange],
  );

  const handleStatInput = (stat: PlayerStatName, raw: string) => {
    setDrafts((prev) => ({ ...prev, [stat]: raw }));
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed)) {
      commitStat(stat, parsed);
    }
  };

  const handleStatBlur = (stat: PlayerStatName) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[stat];
      return next;
    });
  };

  const endStatEdit = useCallback(() => {
    // The shared number input retains its own draft until blur, even when stats are replaced.
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement && statsGridRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
    setDrafts({});
  }, []);

  const handleReset = () => {
    endStatEdit();
    onStatsChange(createDefaultStats());
  };

  return (
    <section className="combat-stats" aria-labelledby={headingId}>
      <div className="combat-stats__header">
        <h3 id={headingId}>Player</h3>
        <div className="combat-stats__actions">
          <button
            type="button"
            className="combat-stats__action"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleReset}
          >
            Set all to 99
          </button>
        </div>
      </div>
      <div className="combat-stats__grid" ref={statsGridRef}>
        {PLAYER_STAT_KEYS.map((stat) => {
          const target = requirements[stat];
          const reqId = `combat-stat-${stat}-req`;
          const inputId = `combat-stat-${stat}`;
          return (
            <div className={`combat-stats__tile${target !== undefined ? ' combat-stats__tile--unmet' : ''}`} key={stat}>
              <label className="combat-stats__tile-name" htmlFor={inputId}>
                {PLAYER_STAT_DISPLAY_NAMES[stat]}
              </label>
              <PixelSprite
                className={`combat-stats__icon${stat === 'agility' ? ' combat-stats__icon--silhouette' : ''}`}
                src={`/assets/ui/skill-${stat}.png`}
                width={20}
                height={20}
                aria-hidden="true"
              />
              <OsrsNumberInput
                id={inputId}
                className="combat-stats__input"
                describedBy={target !== undefined ? reqId : undefined}
                value={drafts[stat] ?? String(stats[stat].max)}
                min={PLAYER_STAT_BOUNDS[stat].min}
                max={PLAYER_STAT_BOUNDS[stat].max}
                onChange={(event) => handleStatInput(stat, event.target.value)}
                onBlur={() => handleStatBlur(stat)}
              />
            </div>
          );
        })}
      </div>
      {PLAYER_STAT_KEYS.some((stat) => requirements[stat] !== undefined) && (
        <div className="combat-stats__requirements">
          <span className="combat-stats__requirements-label">Required for this loadout:</span>
          {PLAYER_STAT_KEYS.map((stat) =>
            requirements[stat] !== undefined ? (
              <span className="combat-stats__req" id={`combat-stat-${stat}-req`} key={stat}>
                {PLAYER_STAT_DISPLAY_NAMES[stat]} {requirements[stat]}
              </span>
            ) : null,
          )}
        </div>
      )}
      {accountUnlocks && (
        <fieldset className="combat-stats__unlocks">
          <legend>Account unlocks</legend>
          {accountUnlocks}
        </fieldset>
      )}
    </section>
  );
};
