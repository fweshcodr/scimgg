import type React from 'react';
import { createPortal } from 'react-dom';
import './DeathModal.css';
import './OutcomeCrest.css';
import { getMonsterName } from '../data/monsterData';
import type { PracticeSessionState } from '../types/practiceSession';
import type { ReplayPracticeControls } from '../types/replayPractice';
import type { DamageHistoryEntry, PrayerType } from '../types/simulation';
import { OutcomePracticeActions } from './ReplayPractice';

export interface DeathModalProps {
  replayPractice?: ReplayPracticeControls;
  /** The encounter's own restart for the stage the run ended on, where it offers one. */
  encounterSession?: PracticeSessionState | null;
  failedCondition: string;
  /** Full damage history — component filters to player-received hits */
  damageHistory: DamageHistoryEntry[];
  onRestart: () => void;
  visible: boolean;
  onEnterReplay?: () => void;
  /** Whether replay mode is active — hides modal while replaying */
  isReplaying?: boolean;
  onReturnToLobby?: () => void;
}

const FAIL_MESSAGES: Record<string, string> = {
  Death: 'Slain in combat',
  YamaAttack: "Killed by Yama's attack",
  WaveDamage: 'Consumed by the wave',
  VoidFlare: 'Incinerated by void flares',
  RunEnergyDepleted: 'Exhausted — ran out of stamina',
  FireballDamage: 'Engulfed in flames',
  GroundDamage: 'Crushed by falling debris',
};

const mapFailedCondition = (condition: string): string => {
  if (!condition) return 'Slain in combat';
  return FAIL_MESSAGES[condition] ?? condition.replace(/([A-Z])/g, ' $1').trim();
};

// Sparks are cast by Zuk's healers, not by Zuk. `ZukAttack` stays unmapped on purpose: an
// entry that carries only that source may have come from Zuk, a mager, a ranger, Jad or a
// Jad healer, so a fixed name would mislabel any entry without a `sourceNpcTypeId`.
const SOURCE_NAMES: Record<string, string> = {
  YamaAttack: 'Yama',
  WaveDamage: 'Wave',
  VoidFlare: 'Void flare',
  FireballDamage: 'Fireball',
  GroundDamage: 'Ground',
  PlayerAttack: 'Self',
  Death: 'Death',
  ZukSpark: 'Healer spark',
};

const formatSource = (source: string): string => SOURCE_NAMES[source] ?? source.replace(/([A-Z])/g, ' $1').trim();

const formatAttacker = (entry: DamageHistoryEntry): string => {
  const npcName = entry.sourceNpcTypeId === undefined ? undefined : getMonsterName(entry.sourceNpcTypeId);
  return npcName ?? formatSource(entry.source);
};

const ATTACK_STYLE_LABELS: Record<string, string> = {
  melee: 'melee',
  range: 'ranged',
  magic: 'magic',
};

const PRAYER_SHORT: Partial<Record<PrayerType, string>> = {
  ProtectMagic: 'Mage',
  ProtectRange: 'Range',
  ProtectMelee: 'Melee',
};

const getPrayerCell = (entry: DamageHistoryEntry): string => {
  const isTypeless = entry.attackType === 'typeless';
  const prayerName = entry.activePrayer ? (PRAYER_SHORT[entry.activePrayer] ?? null) : null;

  if (prayerName) {
    return prayerName;
  }
  if (!isTypeless) {
    return 'None';
  }
  return '—';
};

export const DeathModal: React.FC<DeathModalProps> = ({
  failedCondition,
  damageHistory,
  onRestart,
  visible,
  onEnterReplay,
  onReturnToLobby,
  isReplaying = false,
  replayPractice,
  encounterSession,
}) => {
  // Modal reappears automatically when replay exits (isReplaying → false)
  // while failedCondition is still set.
  if (!visible || isReplaying) return null;

  const reason = mapFailedCondition(failedCondition);
  const recentDamage = [...damageHistory]
    .filter((entry) => entry.targetId === 'player')
    .reverse()
    .slice(0, 10);

  return createPortal(
    <div className="death-modal-overlay" role="dialog" aria-modal="true" aria-label="Death Screen">
      <div className="death-modal-content-wrapper">
        <div className="death-modal-eyebrow">Defeated</div>
        {/* h2, not h1: an idle crawler sees the sim run and the player die, so an h1 here would
            be the only <h1> in the rendered DOM for /yama. The page <h1> lives in SeoLandmark. */}
        <h2 className="death-modal-heading">YOU DIED</h2>
        <div className="death-modal-emblem" aria-hidden="true">
          <span className="death-modal-emblem-line death-modal-emblem-line--l" />
          <span className="death-modal-emblem-diamond" />
          <span className="death-modal-emblem-line death-modal-emblem-line--r" />
        </div>
        <p className="death-modal-reason">{reason}</p>

        {recentDamage.length > 0 && (
          <div className="death-modal-damage-section">
            <h2 className="death-modal-damage-header">Damage taken</h2>
            <div className="death-modal-table">
              <div className="death-modal-table-headers">
                <span>Tick</span>
                <span>Source</span>
                <span>Hit</span>
                <span>Prayer</span>
              </div>
              {/* Its own scroller so the column headings and the actions below stay put
                  when a short screen cannot fit every row. */}
              <div className="death-modal-table-body">
                {recentDamage.map((entry) => {
                  const attackStyle = ATTACK_STYLE_LABELS[entry.attackType];
                  const isWrongPrayer = entry.prayedCorrectly === false;
                  const isNonePrayer = !isWrongPrayer && entry.attackType !== 'typeless' && !entry.activePrayer;
                  const prayerText = getPrayerCell(entry);
                  const rowClass = isWrongPrayer ? 'is-wrong' : '';
                  const prayerCellClass = isWrongPrayer
                    ? 'death-modal-prayer is-wrong'
                    : isNonePrayer
                      ? 'death-modal-prayer is-none'
                      : 'death-modal-prayer';

                  return (
                    <div
                      key={`${entry.tick}-${entry.source}-${entry.effectiveDamage}-${entry.hpAfter}`}
                      className={`death-modal-row ${rowClass}`.trim()}
                    >
                      <span className="death-modal-tick">{entry.tick}</span>
                      <span className="death-modal-source">
                        {formatAttacker(entry)}
                        {attackStyle && <span className="death-modal-attack-style">{attackStyle}</span>}
                      </span>
                      <span className={`death-modal-amount ${entry.effectiveDamage > 0 ? 'is-damage' : 'is-zero'}`}>
                        {entry.effectiveDamage}
                      </span>
                      <span className={prayerCellClass}>{prayerText}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="death-modal-actions">
          <OutcomePracticeActions
            controls={replayPractice}
            encounterSession={encounterSession}
            onRestart={onRestart}
            onReplay={onEnterReplay}
            onReturnToLobby={onReturnToLobby}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Exported for testing
export { formatSource, getPrayerCell, mapFailedCondition };
