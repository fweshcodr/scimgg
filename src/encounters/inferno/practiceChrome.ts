/**
 * What the run's chrome shows and offers while the Inferno is being practiced: the wave the
 * player is on, and the restarts that wave has.
 *
 * Pure reads of the encounter's published snapshot, so the chrome can never disagree with the
 * fight about which wave it is retrying.
 */
import type { InfoBoxData } from '../../components/InfoBox/infoboxTypes';
import type { EncounterSnapshot } from '../../core/encounters/snapshot';
import { isInfernoSnapshot } from '../../core/encounters/snapshot';
import { getItemSpriteUrl } from '../../services/ItemSpriteService';
import type { PracticeSessionState } from '../../types/practiceSession';
import type { MechanicsConfig } from '../../types/simulation';
import { type InfernoCommand, infernoSecondaryRestart } from './commands';
import { ZUK_WAVE } from './constants';
import { infernoLinkMechanics, infernoRunSetupKey } from './controls';
import { parseSpawnLayout } from './spawnLayout';
import { INFERNO_PRACTICE_START_TILE, parseInfernoStartTile } from './startTile';

/** The Inferno's own mark, so the tile is read as this fight rather than as another counter. */
const WAVE_TILE_SPRITE = getItemSpriteUrl(21295); // Infernal cape

/** The wave being fought, or the one a countdown is about to spawn. Null in any other encounter. */
export function infernoCurrentWave(snapshot: EncounterSnapshot): number | null {
  return isInfernoSnapshot(snapshot) ? snapshot.state.wave : null;
}

/** A faithful copy of the spawned wave, never the pending setup or damaged live pillars. */
export function infernoCurrentSetup(snapshot: EncounterSnapshot): Partial<MechanicsConfig> | undefined {
  if (!isInfernoSnapshot(snapshot)) return undefined;
  const layout = parseSpawnLayout(snapshot.state.waveSpawnLayout);
  const startTile = snapshot.state.waveStartPlayerTile;
  if (layout && layout.wave !== snapshot.state.wave) return undefined;
  if (!layout && !startTile) return undefined;
  return infernoLinkMechanics({
    startWave: snapshot.state.wave,
    layout,
    destroyedPillars: snapshot.state.waveStartDestroyedPillars,
    startTile,
  });
}

/**
 * The setup this run was started with, as a key the setup control can compare its own saved choice
 * against. Read from the run rather than remembered by a component, so closing and reopening the
 * Practice pane cannot lose a change that has not been applied.
 */
export function infernoRunStartedWith(snapshot: EncounterSnapshot): string {
  if (!isInfernoSnapshot(snapshot)) return '';
  return infernoRunSetupKey({
    startWave: snapshot.state.startWave,
    destroyedPillars: snapshot.state.startDestroyedPillars,
    spawnLayout: parseSpawnLayout(snapshot.state.startSpawnLayout),
    // Already resolved by the run; '' (a wave 1 or 69 start) is the default.
    startTile: parseInfernoStartTile(snapshot.state.startPlayerTile) ?? INFERNO_PRACTICE_START_TILE,
  });
}

/**
 * The run's wave as an infobox tile: the one readout that is up in both layouts without opening
 * anything, beside the counters a player already watches.
 */
export function infernoWaveInfobox(snapshot: EncounterSnapshot): InfoBoxData | null {
  const wave = infernoCurrentWave(snapshot);
  if (wave === null) return null;
  return {
    id: 'inferno-wave',
    spriteUrl: WAVE_TILE_SPRITE,
    // A count, not a countdown, so `ticksRemaining` is deliberately unset: setting it would make
    // the tile render an interpolated timer instead of this text.
    text: String(wave),
    tooltipTitle: 'Inferno',
    tooltipDetail: `Wave ${wave} of ${ZUK_WAVE}`,
  };
}

/**
 * The session controls for the wave in progress.
 *
 * Every restart here begins the current wave again rather than the wave the setup names, which is
 * the whole point of practicing a wave: dying on 52 after starting at 35 should cost one press, not
 * a trip back through setup. Beside Retry (also Ctrl+R) sits Lock layout on a random wave, New
 * spawns once its spawn layout is locked (run-only, unlike a saved custom layout), or Random spawns
 * on a custom layout's wave: one reroll worded for what it drops, as `infernoSecondaryRestart` picks
 * (the Actions list shares it, its reroll always Random Spawns). The encounter's
 * `planPracticeRestart` owns what each does; this only words them.
 */
export function infernoSession(
  snapshot: EncounterSnapshot,
  run: (command: InfernoCommand) => void,
): PracticeSessionState | null {
  const wave = infernoCurrentWave(snapshot);
  if (wave === null || !isInfernoSnapshot(snapshot)) return null;
  const secondary = infernoSecondaryRestart(snapshot);
  const customHere = parseSpawnLayout(snapshot.state.startSpawnLayout)?.wave === wave;
  // A locked spawn layout (kept spawns), which New spawns clears (`infernoSecondaryRestart`). The
  // title names the mode too: touch shows no hint, and the swapped button alone is easy to misread.
  const pinnedHere = !customHere && secondary === 'reroll-wave';
  return {
    title: pinnedHere ? `Wave ${wave} · spawn layout locked` : `Wave ${wave}`,
    primary: {
      label: `Retry wave ${wave}`,
      hint: customHere
        ? `Start wave ${wave} again with your custom layout. Ctrl+R does the same.`
        : pinnedHere
          ? `Start wave ${wave} again with the locked spawn layout. Ctrl+R does the same.`
          : secondary === 'keep-spawns'
            ? `Start wave ${wave} again with new random spawns. Ctrl+R does the same.`
            : // 67 and 69 have no random spawns to promise.
              `Start wave ${wave} again. Ctrl+R does the same.`,
      onClick: () => run({ encounter: 'inferno', type: 'retry-wave' }),
    },
    ...(secondary === 'reroll-wave'
      ? {
          secondary: customHere
            ? {
                label: 'Random spawns',
                hint: `Restart wave ${wave} with random spawns instead of your custom layout for this run. Retry and Ctrl+R generate new spawns on each attempt. Your custom layout stays saved for Go and Restart fight.`,
                onClick: () => run({ encounter: 'inferno', type: 'reroll-wave' }),
              }
            : {
                label: 'New spawns',
                hint: `Restart wave ${wave} with new random spawns and clear the layout lock. Retry and Ctrl+R generate new spawns on each attempt.`,
                onClick: () => run({ encounter: 'inferno', type: 'reroll-wave' }),
              },
        }
      : secondary === 'keep-spawns'
        ? {
            secondary: {
              label: 'Lock layout',
              hint: `Restart wave ${wave} with this spawn layout and lock it for retries. Retry and Ctrl+R repeat it until you leave the wave. Go and Restart fight clear the lock. Your saved custom layout is unchanged.`,
              onClick: () => run({ encounter: 'inferno', type: 'keep-spawns' }),
            },
          }
        : {}),
  };
}
