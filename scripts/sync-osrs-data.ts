/**
 * Regenerates the OSRS game-stat datasets under `src/data/osrs/` from the Old
 * School RuneScape Wiki's public Bucket API.
 *
 * Weird Gloop's terms (https://weirdgloop.org/terms/) require their prior consent for automated API access.
 *
 * Run: OSRS_WIKI_USER_AGENT='<project>/<version> (<contact URL or email>)' npx tsx scripts/sync-osrs-data.ts
 *
 * Identify yourself. The Wiki's API etiquette asks automated clients to send a descriptive
 * User-Agent with a way to contact whoever runs them, and its operator's terms govern automated
 * use (see docs/legal/data-provenance.md). A fork must set OSRS_WIKI_USER_AGENT to its own project
 * and contact; the generic default identifies nobody and the script warns when it is used.
 *
 * The wiki is the origin of these facts. The local OSRS cache (public/osrs-cache,
 * from scripts/fetch-cache.ts) is read for one thing only: dropping item ids that
 * cannot be equipped (see `loadWearCheck`).
 * Licensing, attribution and the transformations applied here are recorded in
 * docs/legal/data-provenance.md; update that file's retrieval date whenever this
 * script is run and its output committed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';
import { isEquipInventoryAction } from '../src/data/equipInventoryActions';
import type { CacheInfo } from '../src/rs/cache/CacheInfo';
import { CacheSystem } from '../src/rs/cache/CacheSystem';
import { MemoryStore } from '../src/rs/cache/store/MemoryStore';
import { Bzip2 } from '../src/rs/compression/Bzip2';
import { ArchiveObjTypeLoader } from '../src/rs/config/objtype/ObjTypeLoader';
import { collectCacheRoots } from './cacheRoots';
import { discoverCacheUsage } from './discoverCacheUsage';
import { type DownloadLimits, download } from './httpsDownload';

const API = 'https://oldschool.runescape.wiki/api.php';
const DEFAULT_USER_AGENT = 'osrs-combat-sim-data-sync/1.0 (wiki data regeneration; contact not configured)';
const USER_AGENT = process.env.OSRS_WIKI_USER_AGENT?.trim() || DEFAULT_USER_AGENT;

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(REPO_ROOT, 'src', 'data', 'osrs');
const CACHE_DIR = join(REPO_ROOT, 'public', 'osrs-cache');

/** Bucket API caps a single response at this many rows; larger limits are silently truncated. */
const PAGE_SIZE = 5000;
/**
 * Pages read from one bucket before the sync gives up: 40 pages is 200,000 rows, far more than any
 * bucket read here holds, so reaching it means the API is no longer paging as expected.
 */
const MAX_PAGES = 40;
/** One page of 5,000 rows; 64 MiB is far beyond any real one. */
const WIKI_LIMITS: DownloadLimits = { idleMs: 60_000, deadlineMs: 5 * 60_000, maxBytes: 64 * 1024 * 1024 };

/** Wiki asks for courteous automated access; one request in flight, spaced. */
const REQUEST_SPACING_MS = 250;

type BucketRow = Record<string, unknown>;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQuery(query: string): Promise<BucketRow[]> {
  const url = `${API}?action=bucket&format=json&query=${encodeURIComponent(query)}`;
  const response = await download(url, WIKI_LIMITS, { headers: { 'user-agent': USER_AGENT } });
  if (!response.body) {
    throw new Error(`Bucket API returned ${response.status} for: ${query}`);
  }
  const body = JSON.parse(response.body.toString('utf8')) as { bucket?: BucketRow[]; error?: string };
  if (body.error) {
    throw new Error(`Bucket API rejected query: ${body.error}\n  ${query}`);
  }
  return body.bucket ?? [];
}

/**
 * Pages through a whole bucket. Stops on a short page rather than a row count,
 * because the API exposes no total and a count query would race the sync.
 */
async function fetchBucket(bucket: string, fields: readonly string[]): Promise<BucketRow[]> {
  const selected = fields.map((f) => `'${f}'`).join(',');
  const rows: BucketRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    if (offset >= MAX_PAGES * PAGE_SIZE) {
      throw new Error(`${bucket}: still full pages after ${MAX_PAGES} (${rows.length} rows); refusing to page further`);
    }
    const page = await runQuery(`bucket('${bucket}').select(${selected}).limit(${PAGE_SIZE}).offset(${offset}).run()`);
    rows.push(...page);
    process.stdout.write(`\r  ${bucket}: ${rows.length} rows`);
    if (page.length < PAGE_SIZE) break;
    await sleep(REQUEST_SPACING_MS);
  }
  process.stdout.write('\n');
  return rows;
}

function int(value: unknown): number {
  if (typeof value === 'number') return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  const single = str(value);
  return single ? [single] : [];
}

function ids(value: unknown): number[] {
  return list(value)
    .map((v) => Number.parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v >= 0);
}

/**
 * `infobox_bonuses` carries no version anchor, so a page with several versions
 * yields several stat rows with nothing to tell them apart. In practice those rows
 * are byte-identical — charged/uncharged and cosmetic variants share a stat line —
 * so they collapse to one record covering every id on the page. `main` asserts that
 * identity rather than assuming it, because a page whose versions genuinely differ
 * could not be resolved from this API and must be caught rather than silently
 * assigned one version's stats.
 */
function statSignature(row: BucketRow): string {
  return EQUIPMENT_FIELDS.filter((f) => f !== 'page_name')
    .map((f) => String(row[f] ?? ''))
    .join('|');
}

const EQUIPMENT_FIELDS = [
  'page_name',

  'stab_attack_bonus',
  'slash_attack_bonus',
  'crush_attack_bonus',
  'magic_attack_bonus',
  'range_attack_bonus',
  'stab_defence_bonus',
  'slash_defence_bonus',
  'crush_defence_bonus',
  'magic_defence_bonus',
  'range_defence_bonus',
  'strength_bonus',
  'ranged_strength_bonus',
  'magic_damage_bonus',
  'prayer_bonus',
  'equipment_slot',
  'weapon_attack_speed',
  'weapon_attack_range',
  'combat_style',
] as const;

const ITEM_FIELDS = ['page_name', 'version_anchor', 'item_id', 'item_name'] as const;

const MONSTER_FIELDS = [
  'name',
  'version_anchor',
  'id',
  'size',
  'hitpoints',
  'attack_level',
  'strength_level',
  'defence_level',
  'magic_level',
  'ranged_level',
  'attack_bonus',
  'strength_bonus',
  'magic_attack_bonus',
  'magic_damage_bonus',
  'range_attack_bonus',
  'range_strength_bonus',
  'stab_defence_bonus',
  'slash_defence_bonus',
  'crush_defence_bonus',
  'magic_defence_bonus',
  'range_defence_bonus',
  'light_range_defence_bonus',
  'standard_range_defence_bonus',
  'heavy_range_defence_bonus',
  'flat_armour',
  'attribute',
  'elemental_weakness',
  'elemental_weakness_percent',
  'attack_speed',
  'burn_immune',
  'cannon_immune',
  'thrall_immune',
  'poison_resistance',
  'venom_resistance',
  'freeze_resistance',
] as const;

type WearCheck = (itemId: number) => boolean;

/**
 * Whether the game cache lets an item into an equipment slot. The wiki lists broken and
 * mangled copies, inactive Bounty Hunter gear, morph rings and similar on the same pages as
 * the wearable item; none of them can be equipped, and in the cache they have no worn
 * model and no bonuses, so offering them equips something invisible and statless.
 *
 * A wear position alone is not enough. Degraded Barrows "0" pieces, empty blowpipes,
 * uncharged serpentine helms, broken Moon armour, Sailing cargo crates and the retro Torva
 * models (/w/Torva_platebody_(unobtainable_item)) all have one, but no equip op
 * (`EQUIP_INVENTORY_ACTIONS`), so the player cannot put them on in game either.
 *
 * An id the local cache does not have yet is kept: the wiki can be newer than the cache,
 * and a new item is far more likely wearable than not. The app's inventory falls back to
 * Wear/Wield for exactly those ids (`resolveInventoryActions`).
 */
async function loadWearCheck(): Promise<{ canWear: WearCheck; dropped: Set<number> }> {
  let zipBytes: Buffer;
  try {
    zipBytes = await readFile(join(CACHE_DIR, 'disk.zip'));
  } catch {
    throw new Error(`No OSRS cache at ${CACHE_DIR}; run 'npx tsx scripts/fetch-cache.ts' first.`);
  }
  const manifest = JSON.parse(await readFile(join(CACHE_DIR, 'manifest.json'), 'utf8')) as {
    builds?: Array<{ major?: number }>;
  };
  const revision = manifest.builds?.[0]?.major;
  if (typeof revision !== 'number') throw new Error('OSRS cache manifest has no build revision.');

  await Bzip2.initWasm();
  const zip = await JSZip.loadAsync(zipBytes);
  const files = new Map<string, ArrayBuffer>();
  for (const [path, entry] of Object.entries(zip.files)) {
    const name = path.split('/').pop() ?? '';
    if (!entry.dir && name.startsWith('main_file_cache.')) files.set(name, await entry.async('arraybuffer'));
  }
  // Config index 2, obj archive 10. Trimming keeps every archive the app reads, and this one
  // is read whole, so a trimmed cache carries every item definition.
  const cache = new CacheSystem(CacheSystem.loadIndicesFromStore('dat2', MemoryStore.fromFiles(files, [2])));
  const objArchive = cache.getIndex(2).getArchive(10);
  const cacheInfo: CacheInfo = {
    name: 'osrs',
    game: 'oldschool',
    environment: 'live',
    revision,
    timestamp: '',
    size: 0,
  };
  const objTypes = new ArchiveObjTypeLoader(cacheInfo, objArchive);

  const dropped = new Set<number>();
  const canWear = (itemId: number): boolean => {
    if (!objArchive.getFile(itemId)) return true;
    const objType = objTypes.load(itemId);
    if (objType.wearPos1 !== -1 && objType.inventoryActions.some(isEquipInventoryAction)) {
      return true;
    }
    dropped.add(itemId);
    return false;
  };
  return { canWear, dropped };
}

/**
 * Equipment METADATA only. Combat bonuses, attack speed and attack range are read
 * from the OSRS cache (`computeTotalEquipmentStats`), which is authoritative and
 * already first-party — measured at 96.3% agreement with the wiki across the
 * catalog, with the cache correct on the disagreements sampled.
 *
 * Keeping bonuses here as well would recreate the split-source bug this replaces:
 * the player's defensive stats read the cache while their offensive stats read a
 * dataset, so the two directions of combat could disagree about the same item.
 *
 * `category` is the reason this file still exists: the weapon type is a live varbit
 * the cache cannot express, and the first-party table covers 57 of ~1,582 weapons.
 */
interface EquipmentRecord {
  readonly ids: readonly number[];
  readonly name: string;
  readonly version?: string;
  readonly slot: string;
  readonly category?: string;
}

export interface EquipmentBuildResult {
  readonly records: EquipmentRecord[];
  /** Pages where the stat-row and item-row counts disagree, so no pairing is safe. */
  readonly unpairablePages: string[];
  readonly aliases: Record<number, number>;
}

/**
 * The disambiguator a page title adds to the in-game name, e.g. "Last Man Standing" from
 * "Dharok's helm (Last Man Standing)" for an item named "Dharok's helm". Mode copies, team
 * colors and heraldry live on their own pages with no version anchor, so without this they
 * reach the catalog under the bare name of the item they copy. Stacked qualifiers ("Ghostly
 * robe (top) (Last Man Standing)") are joined with a comma.
 */
function pageQualifier(page: string, name: string): string | undefined {
  if (!page.startsWith(`${name} (`) || !page.endsWith(')')) return undefined;
  return page
    .slice(name.length + 2, -1)
    .split(') (')
    .join(', ');
}

function buildEquipment(bonuses: BucketRow[], items: BucketRow[], canWear: WearCheck): EquipmentBuildResult {
  const itemRowsByPage = new Map<string, BucketRow[]>();
  for (const row of items) {
    if (ids(row.item_id).length === 0) continue;
    const page = String(row.page_name ?? '');
    itemRowsByPage.set(page, [...(itemRowsByPage.get(page) ?? []), row]);
  }

  const statRowsByPage = new Map<string, BucketRow[]>();
  for (const row of bonuses) {
    if (!str(row.equipment_slot)) continue;
    const page = String(row.page_name ?? '');
    statRowsByPage.set(page, [...(statRowsByPage.get(page) ?? []), row]);
  }

  const records: EquipmentRecord[] = [];
  const unpairablePages: string[] = [];
  const aliasGroups = new Map<string, number[]>();
  for (const [page, statRows] of statRowsByPage) {
    const itemRows = itemRowsByPage.get(page) ?? [];
    if (itemRows.length === 0) continue;

    // Both buckets emit one row per version, in the page's declaration order, and
    // `infobox_bonuses` carries no anchor to join on. Pairing by index is what
    // separates a charged Scythe (str 75) from an uncharged one (str 50); collapsing
    // to the first row would silently give every uncharged item its charged stats.
    const paired = statRows.length === itemRows.length;
    if (!paired && new Set(statRows.map(statSignature)).size > 1) {
      unpairablePages.push(page);
      continue;
    }

    // Unpaired here means every stat row was identical, so each item row takes the first.
    // Item rows still keep their own name and version: a page's broken and mangled copies
    // are item rows too, and folding them under the first row's name ships
    // "Infernal cape (broken)" as "Infernal cape" and makes it the family's canonical id.
    const pairs = paired
      ? statRows.map((row, index) => [row, itemRows[index]] as const)
      : itemRows.map((itemRow) => [statRows[0], itemRow] as const);
    for (const [row, itemRow] of pairs) {
      const slot = str(row.equipment_slot);
      if (!slot) continue;

      // Filtered after pairing, never before: dropping an item row would shift the
      // positional pairing onto the wrong stat rows.
      const itemIds = ids(itemRow.item_id).filter(canWear);
      if (itemIds.length === 0) continue;

      const name = str(itemRow.item_name) ?? page;
      const version = str(itemRow.version_anchor) ?? pageQualifier(page, name);
      const sortedIds = [...new Set(itemIds)].sort((a, b) => a - b);

      // Bonuses are not emitted, but they still decide aliasing: two ids alias only
      // when their stat lines are identical. Grouping here, while the source row is
      // in scope, keeps that rule intact without putting stats in the output.
      const aliasKey = `${aliasBaseName(name)}|${slot}|${statSignature(row)}`;
      aliasGroups.set(aliasKey, [...(aliasGroups.get(aliasKey) ?? []), ...sortedIds]);

      records.push({
        ids: sortedIds,
        name,
        ...(version ? { version } : {}),
        slot,
        ...(str(row.combat_style) ? { category: str(row.combat_style) } : {}),
      });
    }
  }
  return {
    records: records.sort((a, b) => (a.ids[0] ?? 0) - (b.ids[0] ?? 0)),
    unpairablePages: unpairablePages.sort(),
    aliases: aliasesFromGroups(aliasGroups),
  };
}

interface MonsterRecord {
  readonly ids: readonly number[];
  readonly name: string;
  readonly version?: string;
  readonly size: number;
  readonly levels: Record<string, number>;
  readonly offensive: Record<string, number>;
  readonly defensive: Record<string, number>;
  readonly attributes: readonly string[];
  readonly elementalWeakness?: { element: string; percent: number };
  readonly attackSpeed?: number;
  readonly immunities: Record<string, boolean | number | BurnImmunity | null>;
}

type BurnImmunity = 'Weak' | 'Normal' | 'Strong';

function burnImmunity(value: unknown): BurnImmunity | null {
  switch (str(value)) {
    case 'Immune (weak)':
      return 'Weak';
    case 'Immune (normal)':
      return 'Normal';
    case 'Immune (strong)':
      return 'Strong';
    default:
      return null;
  }
}

function buildMonsters(rows: BucketRow[]): MonsterRecord[] {
  const records: MonsterRecord[] = [];
  for (const row of rows) {
    const name = str(row.name);
    const monsterIds = ids(row.id);
    if (!name || monsterIds.length === 0) continue;

    const weaknessElement = str(row.elemental_weakness);
    const weaknessPercent = num(row.elemental_weakness_percent);
    const attackSpeed = int(row.attack_speed);

    records.push({
      ids: [...new Set(monsterIds)].sort((a, b) => a - b),
      name,
      ...(str(row.version_anchor) ? { version: str(row.version_anchor) } : {}),
      size: int(row.size) || 1,
      levels: {
        hitpoints: int(row.hitpoints),
        attack: int(row.attack_level),
        strength: int(row.strength_level),
        defence: int(row.defence_level),
        magic: int(row.magic_level),
        ranged: int(row.ranged_level),
      },
      offensive: {
        attack: int(row.attack_bonus),
        strength: int(row.strength_bonus),
        magic: int(row.magic_attack_bonus),
        magicDamage: num(row.magic_damage_bonus),
        ranged: int(row.range_attack_bonus),
        rangedStrength: int(row.range_strength_bonus),
      },
      defensive: {
        stab: int(row.stab_defence_bonus),
        slash: int(row.slash_defence_bonus),
        crush: int(row.crush_defence_bonus),
        magic: int(row.magic_defence_bonus),
        ranged: int(row.range_defence_bonus),
        rangedLight: int(row.light_range_defence_bonus),
        rangedStandard: int(row.standard_range_defence_bonus),
        rangedHeavy: int(row.heavy_range_defence_bonus),
        flatArmour: int(row.flat_armour),
      },
      attributes: list(row.attribute).map((a) => a.toLowerCase()),
      ...(weaknessElement && weaknessPercent > 0
        ? { elementalWeakness: { element: weaknessElement.toLowerCase(), percent: weaknessPercent } }
        : {}),
      ...(attackSpeed > 0 ? { attackSpeed } : {}),
      immunities: {
        burn: burnImmunity(row.burn_immune),
        cannon: str(row.cannon_immune) === 'Yes' || row.cannon_immune === true,
        thrall: str(row.thrall_immune) === 'Yes' || row.thrall_immune === true,
        poison: num(row.poison_resistance),
        venom: num(row.venom_resistance),
        freeze: num(row.freeze_resistance),
      },
    });
  }
  return records.sort((a, b) => (a.ids[0] ?? 0) - (b.ids[0] ?? 0));
}

/**
 * Qualifiers stripped for metadata alias discovery, not proof of combat equivalence.
 *
 * Deliberately retains `(i)` and `(uncharged)` in names to distinguish common
 * upgrade and charge states. Equal names and stats can still produce metadata
 * aliases; neither condition establishes equal combat behavior.
 */
const COSMETIC_SUFFIXES = /\s*\((?:or|or\d|l|deadman|beta|bh|cr|ritual|nz)\)\s*$/i;

function aliasBaseName(name: string): string {
  let base = name;
  for (;;) {
    const stripped = base.replace(COSMETIC_SUFFIXES, '');
    if (stripped === base) return stripped.trim().toLowerCase();
    base = stripped;
  }
}

/**
 * Metadata aliases mapped onto one canonical id; combat families are curated separately.
 *
 * Derived, not curated. Two ids alias when they share a base name (after stripping
 * selected qualifiers), an equipment slot, and a byte-identical stat line. All three
 * conditions are load-bearing: name alone would merge a charged and uncharged staff,
 * and stats alone would merge every zero-bonus item in the game into one group — 569
 * such groups covering 4,810 records exist, so that rule is not close to safe.
 * Even all three do not prove equal charge rules, passives, special attacks, or mode restrictions.
 */
function aliasesFromGroups(groups: ReadonlyMap<string, readonly number[]>): Record<number, number> {
  const aliases: Record<number, number> = {};
  for (const group of groups.values()) {
    const unique = [...new Set(group)].sort((a, b) => a - b);
    if (unique.length < 2) continue;
    const [canonical, ...variants] = unique;
    for (const variant of variants) aliases[variant] = canonical;
  }
  return aliases;
}

async function writeJson(name: string, data: unknown): Promise<void> {
  const path = join(OUT_DIR, name);
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  process.stdout.write(`  wrote ${name}\n`);
}

async function main(): Promise<void> {
  if (USER_AGENT === DEFAULT_USER_AGENT) {
    process.stderr.write(
      'Warning: OSRS_WIKI_USER_AGENT is not set, so requests carry a generic User-Agent with no contact.\n' +
        'Set it to your project and a contact address, as the Wiki asks of automated clients.\n',
    );
  }
  await mkdir(OUT_DIR, { recursive: true });

  process.stdout.write('Fetching from the OSRS Wiki Bucket API\n');
  const [bonuses, items, monsters] = [
    await fetchBucket('infobox_bonuses', EQUIPMENT_FIELDS),
    await fetchBucket('infobox_item', ITEM_FIELDS),
    await fetchBucket('infobox_monster', MONSTER_FIELDS),
  ];

  const { canWear, dropped } = await loadWearCheck();
  const { records: equipment, unpairablePages, aliases } = buildEquipment(bonuses, items, canWear);
  const droppedCount = dropped.size;
  // Only the monsters the simulator can spawn: the NPC roots the cache trim follows.
  const simulatorNpcIds = collectCacheRoots(await discoverCacheUsage(REPO_ROOT)).npcs;
  const monsterRecords = buildMonsters(monsters).filter((m) => m.ids.some((id) => simulatorNpcIds.has(id)));

  // Hand-written metadata for pages the API cannot disambiguate (see the file's `_why`
  // notes). Merged rather than appended blindly: an entry whose ids the API has since
  // started returning is a signal the manual record is now redundant, not a duplicate
  // to ship.
  const manual = JSON.parse(await readFile(join(OUT_DIR, 'manualEquipment.json'), 'utf8')) as EquipmentRecord[];
  const apiIds = new Set(equipment.flatMap((r) => r.ids));
  const redundant = manual.filter((r) => r.ids.some((id) => apiIds.has(id)));
  if (redundant.length > 0) {
    process.stdout.write(
      `\n${redundant.length} manual entries are now covered by the API and should be deleted:\n` +
        `${redundant.map((r) => `  - ${r.name} [${r.ids.join(', ')}]`).join('\n')}\n`,
    );
  }
  // Hand-written, so reported for deletion rather than filtered behind the author's back:
  // equipmentCatalog.ts also reads manualEquipment.json directly.
  const unwearableManual = manual.filter((r) => r.ids.some((id) => !canWear(id)));
  if (unwearableManual.length > 0) {
    process.stdout.write(
      `\n${unwearableManual.length} manual entries hold ids the cache cannot equip and should be fixed:\n` +
        `${unwearableManual.map((r) => `  - ${r.name} [${r.ids.join(', ')}]`).join('\n')}\n`,
    );
  }
  equipment.push(
    // `_why` documents the entry for a maintainer reading the source file; it is not
    // data and must not reach the shipped dataset.
    ...manual
      .filter((r) => !r.ids.some((id) => apiIds.has(id)))
      .map(({ _why, ...record }: EquipmentRecord & { _why?: string }) => record),
  );
  equipment.sort((a, b) => (a.ids[0] ?? 0) - (b.ids[0] ?? 0));

  if (equipment.length === 0 || monsterRecords.length === 0) {
    throw new Error('Refusing to write empty datasets; the API shape has probably changed.');
  }

  if (unpairablePages.length > 0) {
    process.stdout.write(
      `\n${unpairablePages.length} pages have differing stat rows but a mismatched item-row ` +
        'count, so no version pairing is safe. They were DROPPED:\n' +
        `${unpairablePages.map((p) => `  - ${p}`).join('\n')}\n` +
        'Each needs a decision before these datasets are trusted for those items.\n',
    );
  }

  process.stdout.write('\n');
  await writeJson('equipment.json', equipment);
  await writeJson('monsters.json', monsterRecords);
  await writeJson('itemAliases.json', aliases);

  process.stdout.write(
    `\n${equipment.length} equipment lines, ${monsterRecords.length} monster lines, ` +
      `${Object.keys(aliases).length} aliases, ${droppedCount} unequippable item ids dropped\n` +
      'Update the retrieval date in docs/legal/data-provenance.md before committing.\n',
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
