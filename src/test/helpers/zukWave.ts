import { type EncounterSnapshot, zukWaveState } from '../../core/encounters/snapshot';
import { InfernoEncounter } from '../../encounters/inferno/InfernoEncounter';
import type { ZukWaveDirector } from '../../encounters/zuk/ZukWaveDirector';

/**
 * The Inferno opening on wave 69, TzKal-Zuk, as practicing Zuk directly does: the run starts at
 * wave 69's control tick with the glyph and Zuk in place. `seed` is the run seed. Wave 69 is the
 * default start (`INFERNO_DEFAULT_START_WAVE`), so mechanics that name no start wave keep it.
 */
export function createZukWaveEncounter(seed?: number): InfernoEncounter {
  return new InfernoEncounter(seed);
}

/** Wave 69's director, for tests that reach into its clocks and streams. Throws before wave 69. */
export function zukDirector(encounter: InfernoEncounter): ZukWaveDirector {
  const director = Reflect.get(encounter, 'zuk') as ZukWaveDirector | null;
  if (!director) throw new TypeError('Wave 69 has not begun');
  return director;
}

/** A run's snapshot with `state` narrowed to wave 69's (`zukWaveState`), as Zuk's own suites read it. */
export function zukWaveView(engine: { getEncounterSnapshot(): EncounterSnapshot }) {
  const snapshot = engine.getEncounterSnapshot();
  return { kind: snapshot.kind, state: zukWaveState(snapshot), visuals: snapshot.visuals };
}
