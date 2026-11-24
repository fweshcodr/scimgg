/**
 * What the fight readouts show and what Practice edits, independent of how either is drawn. The
 * desktop Practice pane (launcher/PracticePane.tsx, its Stats tab) and the Mobile layout's tool
 * window (MobileToolWindow.tsx) render the same readouts and the same practice controls from these.
 */
import { useCallback, useMemo, useState } from 'react';
import type { BossHpPreset, MechanicsToggleInfo } from '../core/encounters/types';
import type { SimulationEngine } from '../core/SimulationEngine';
import { npcDisplayName } from '../data/npcDisplayName';
import { encounterControlsForKind } from '../encounters/modules';
import { THEME } from '../theme';
import type { NpcSnapshot, SimulationState } from '../types/simulation';
import { loadSetting, saveSetting } from '../util/storage';

const SECONDS_PER_TICK = 0.6;

function hpFillColor(pct: number): string {
  return pct < 33 ? THEME.colors.danger : pct < 66 ? THEME.colors.warning : THEME.colors.success;
}

/**
 * Whether the boss readouts show `npc` yet: from its spawn tick. An encounter may add a boss before
 * it (TzKal-Zuk rises at C-8 of wave 69's intro, but his spawn tick is control C, as the game opens
 * his HP bar then).
 */
export function isBossPresented(npc: Pick<NpcSnapshot, 'spawnTick'>, currentTick: number): boolean {
  return npc.spawnTick === undefined || npc.spawnTick <= currentTick;
}

export interface HudReadouts {
  readonly currentTick: number;
  readonly playerHP: number;
  readonly maxHP: number;
  readonly hpPct: number;
  /** A 1px sliver whenever any HP remains, so 1 HP never reads as empty. */
  readonly hpHasFill: boolean;
  readonly hpColor: string;
  readonly targetNpc: NpcSnapshot | undefined;
  readonly targetName: string;
  readonly targetHpPct: number;
  readonly targetHasFill: boolean;
  readonly targetHpColor: string;
  readonly actualText: string;
  readonly expectedText: string;
  readonly maxHitText: string;
  /** `dps-lucky` / `dps-unlucky` against the expected rate, or ''. */
  readonly dpsLuckClass: string;
}

export function useHudReadouts({
  simulationState,
  engine,
  dpsProjection,
}: {
  readonly simulationState: SimulationState;
  readonly engine?: SimulationEngine;
  readonly dpsProjection?: ReturnType<SimulationEngine['getAdjustedTheoreticalDps']>;
}): HudReadouts {
  const { currentTick, playerHP, maxHP, damageHistory } = simulationState;

  const targetNpc = useMemo<NpcSnapshot | undefined>(() => {
    const boss = () => simulationState.npcs.find((n) => n.role === 'boss' && isBossPresented(n, currentTick));
    // A manual cast ends the interaction, so the remembered target keeps the readouts on what was cast at.
    const targetId = simulationState.attackTarget ?? simulationState.lastAttackTarget;
    if (targetId) {
      return simulationState.npcs.find((n) => n.id === targetId) ?? boss();
    }
    return boss();
  }, [simulationState.attackTarget, simulationState.lastAttackTarget, simulationState.npcs, currentTick]);

  const dpsResult = dpsProjection === undefined ? (engine?.getAdjustedTheoreticalDps() ?? null) : dpsProjection;

  // Split into two memos: heavy work (filter/reduce) only when data changes,
  // light work (division) runs each tick but is O(1).
  const targetId = targetNpc?.id;

  // biome-ignore lint/correctness/useExhaustiveDependencies: damageHistory is append-only, so its length is a sufficient and much cheaper change signal than the array identity, which is replaced every tick. Depending on the array itself would re-run this filter+reduce on every tick of every fight.
  const attackStats = useMemo(() => {
    if (!targetId) return null;
    const hits = damageHistory.filter((e) => e.source === 'PlayerAttack' && e.targetId === targetId);
    if (hits.length === 0) return null;
    const totalDamage = hits.reduce((sum, e) => sum + e.effectiveDamage, 0);
    // Sum per-hit expected values (locked in at time of each attack)
    const totalExpected = hits.reduce((sum, e) => sum + (e.expectedHit ?? 0), 0);
    const firstTick = hits[0].tick;
    return { totalDamage, totalExpected, firstTick };
  }, [damageHistory.length, targetId]);

  const perTargetDps = useMemo(() => {
    if (!attackStats) return null;
    const elapsedTicks = currentTick - attackStats.firstTick;
    const elapsedSeconds = elapsedTicks * SECONDS_PER_TICK;
    const actual = elapsedSeconds > 0 ? attackStats.totalDamage / elapsedSeconds : 0;
    const expected = elapsedSeconds > 0 ? attackStats.totalExpected / elapsedSeconds : 0;
    return { actual, expected };
  }, [attackStats, currentTick]);

  const targetName = useMemo(() => (targetNpc ? npcDisplayName(targetNpc) : 'Target'), [targetNpc]);

  const hpPct = Math.max(0, Math.min(100, (playerHP / maxHP) * 100));
  const targetHpPct = targetNpc ? Math.max(0, Math.min(100, (targetNpc.hp / Math.max(1, targetNpc.maxHp)) * 100)) : 0;

  return {
    currentTick,
    playerHP,
    maxHP,
    hpPct,
    hpHasFill: playerHP > 0,
    hpColor: hpFillColor(hpPct),
    targetNpc,
    targetName,
    targetHpPct,
    targetHasFill: Boolean(targetNpc && targetNpc.hp > 0),
    targetHpColor: hpFillColor(targetHpPct),
    actualText: perTargetDps ? perTargetDps.actual.toFixed(2) : '—',
    expectedText: perTargetDps ? perTargetDps.expected.toFixed(2) : '—',
    maxHitText: dpsResult ? `${dpsResult.maxHit}` : '—',
    dpsLuckClass:
      perTargetDps && perTargetDps.expected > 0
        ? perTargetDps.actual >= perTargetDps.expected * 1.05
          ? 'dps-lucky'
          : perTargetDps.actual < perTargetDps.expected * 0.9
            ? 'dps-unlucky'
            : ''
        : '',
  };
}

export interface PracticeControls {
  readonly optionsExpanded: boolean;
  readonly setOptionsExpanded: (expanded: boolean) => void;
  /** Account unlocks are configured before the fight; the in-fight panel is for the boss. */
  readonly inFightMechanicsToggles: readonly MechanicsToggleInfo[];
  readonly bossNpc: NpcSnapshot | undefined;
  readonly bossHpPresets: readonly BossHpPreset[];
  /** Practice has something to show: a toggle, or a boss to set the health of. */
  readonly hasPracticeControls: boolean;
}

export function usePracticeControls({
  engine,
  mechanicsToggles,
  simulationState,
}: {
  readonly engine?: SimulationEngine;
  readonly mechanicsToggles: readonly MechanicsToggleInfo[];
  readonly simulationState: SimulationState;
}): PracticeControls {
  const [optionsExpanded, setExpanded] = useState(() => loadSetting<boolean>('practice-options-expanded') === true);
  const setOptionsExpanded = useCallback((expanded: boolean) => {
    setExpanded(expanded);
    saveSetting('practice-options-expanded', expanded);
  }, []);
  const inFightMechanicsToggles = useMemo(
    () => mechanicsToggles.filter((toggle) => toggle.group !== 'player'),
    [mechanicsToggles],
  );
  const bossNpc = simulationState.npcs.find((npc) => npc.role === 'boss');
  const bossHpPresets = useMemo<readonly BossHpPreset[]>(
    () => (engine ? (encounterControlsForKind(engine.getEncounterKind())?.bossHpPresets ?? []) : []),
    [engine],
  );
  return {
    inFightMechanicsToggles,
    optionsExpanded,
    setOptionsExpanded,
    bossNpc,
    bossHpPresets,
    hasPracticeControls: mechanicsToggles.length > 0 || bossNpc !== undefined,
  };
}
