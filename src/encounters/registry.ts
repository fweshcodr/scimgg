/**
 * The composition root for the simulation encounter registry.
 *
 * The populated singleton lives HERE, beside the manifest that fills it, so importing
 * `encounterRegistry` always yields a populated registry with no bootstrap ordering to get
 * wrong — and so `src/core/**` never has to import concrete encounter implementations.
 * Core keeps only the `EncounterRegistry` class and descriptor types; anything that needs
 * the real registered encounters imports this module instead.
 */
import { EncounterRegistry } from '../core/encounters/encounterFactory';
import { ENCOUNTER_CORE_MODULES, encounterKindsOf } from './modules';

export const encounterRegistry = new EncounterRegistry();

/**
 * A variant kind gets its own factory but NOT its own descriptor — it is selected through its
 * parent, so `getDescriptor(variantKind)` is undefined while `getDescriptorForKind` resolves it
 * from the parent's `variants` list.
 */
for (const module of ENCOUNTER_CORE_MODULES) {
  encounterRegistry.register(module.kind, module.factory, module.descriptor);
  for (const [variantKind, variantFactory] of Object.entries(module.variantFactories ?? {})) {
    encounterRegistry.register(variantKind, variantFactory);
  }
}

export const ALL_ENCOUNTER_KINDS: readonly string[] = ENCOUNTER_CORE_MODULES.flatMap(encounterKindsOf);
