import { z } from 'zod';
import generatedEquipment from './osrs/equipment.json';
import itemAliases from './osrs/itemAliases.json';
import manualEquipment from './osrs/manualEquipment.json';

const equipmentSlotSchema = z.enum([
  'head',
  'cape',
  'neck',
  'ammo',
  'weapon',
  '2h',
  'body',
  'shield',
  'legs',
  'hands',
  'feet',
  'ring',
]);

const equipmentRowSchema = z.object({
  ids: z.array(z.number().int().nonnegative()).min(1),
  name: z.string().min(1),
  slot: equipmentSlotSchema,
  category: z.string().optional(),
  version: z.string().optional(),
});

const equipmentRowsSchema = z.array(equipmentRowSchema);
const itemAliasesSchema = z.record(z.string(), z.number().int().nonnegative());

export type EquipmentSlot = Exclude<z.infer<typeof equipmentSlotSchema>, '2h'>;

export interface EquipmentCatalogItem {
  readonly id: number;
  readonly name: string;
  readonly slot: EquipmentSlot;
  readonly isTwoHanded: boolean;
  readonly category?: string;
  readonly version?: string;
}

const rows = equipmentRowsSchema.parse([...generatedEquipment, ...manualEquipment]);
const aliases = itemAliasesSchema.parse(itemAliases);
const equipmentById = new Map<number, EquipmentCatalogItem>();
const aliasIdsByCanonicalId = new Map<number, number[]>();

for (const row of rows) {
  const slot = row.slot === '2h' ? 'weapon' : row.slot;
  for (const id of row.ids) {
    equipmentById.set(id, {
      id,
      name: row.name,
      slot,
      isTwoHanded: row.slot === '2h',
      ...(row.category === undefined ? {} : { category: row.category }),
      ...(row.version === undefined ? {} : { version: row.version }),
    });
  }
}

for (const [aliasIdText, canonicalId] of Object.entries(aliases)) {
  const aliasId = Number(aliasIdText);
  const variantIds = aliasIdsByCanonicalId.get(canonicalId) ?? [];
  variantIds.push(aliasId);
  aliasIdsByCanonicalId.set(canonicalId, variantIds);
  const canonical = equipmentById.get(canonicalId);
  if (canonical !== undefined && !equipmentById.has(aliasId)) {
    equipmentById.set(aliasId, { ...canonical, id: aliasId });
  }
}

const equipmentCatalog: readonly EquipmentCatalogItem[] = [...equipmentById.values()].sort(
  (left, right) => left.id - right.id,
);

export function getEquipmentCatalog(): readonly EquipmentCatalogItem[] {
  return equipmentCatalog;
}

export function findEquipmentCatalogItem(itemId: number): EquipmentCatalogItem | undefined {
  return equipmentById.get(itemId);
}

export function resolveEquipmentItemName(itemId: number, cacheName: string | undefined, fallback = 'Item'): string {
  return cacheName && cacheName !== 'null' ? cacheName : (findEquipmentCatalogItem(itemId)?.name ?? fallback);
}

/**
 * An item's inventory actions. Items newer than the loaded cache (e.g. the Necklace of rupture) load
 * with no actions at all, so a cataloged wearable falls back to the action its slot uses in OSRS:
 * "Wield" for weapons and shields, "Wear" for everything else.
 */
export function resolveInventoryActions(
  itemId: number,
  cacheActions: readonly (string | null | undefined)[],
): readonly (string | null | undefined)[] {
  if (cacheActions.some((action) => action !== null && action !== undefined)) return cacheActions;
  const item = findEquipmentCatalogItem(itemId);
  if (!item) return cacheActions;
  return [null, item.slot === 'weapon' || item.slot === 'shield' ? 'Wield' : 'Wear', null, null, null];
}

/**
 * The item's left-click op: the first one present, which is also the hover text and the top
 * of the right-click menu. Unset ops are `undefined` from the cache but `null` in the
 * fallback above, so both must be skipped.
 */
export function resolveDefaultInventoryAction(
  itemId: number,
  cacheActions: readonly (string | null | undefined)[],
): string | undefined {
  return resolveInventoryActions(itemId, cacheActions).find(
    (action): action is string => action !== undefined && action !== null,
  );
}

/** Generated metadata identity only; use equipmentCombatFamilies for curated same-state combat identity. */
export function getCanonicalEquipmentItemId(itemId: number): number {
  return aliases[String(itemId)] ?? itemId;
}

export function getEquipmentAliasIds(canonicalItemId: number): readonly number[] {
  return aliasIdsByCanonicalId.get(canonicalItemId) ?? [];
}
