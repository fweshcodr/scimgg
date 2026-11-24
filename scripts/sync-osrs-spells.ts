/**
 * Regenerates `src/data/osrs/spells.json` from the Old School RuneScape Wiki.
 *
 * Weird Gloop's terms (https://weirdgloop.org/terms/) require their prior consent for automated API access.
 *
 * Run:   OSRS_WIKI_USER_AGENT='<project>/<version> (<contact URL or email>)' npx tsx scripts/sync-osrs-spells.ts
 * Check: the same with `--check`, which compares the Wiki against the committed file field by field,
 *        prints every difference, writes nothing and exits 1 if any field differs.
 * Add `--refresh` to ignore cached responses. Responses are cached under `$SPELLS_WIKI_CACHE_DIR`
 * (default `.setup-cache/wiki/spells/`, which git ignores), so a rerun makes no requests. Each
 * response is capped by `WIKI_LIMITS`, and the requests by the fixed title list.
 *
 * Sources, and nothing else:
 *   - each spell's own article: the `{{Infobox Spell}}` fields `spellbook`, `element`, `damage` and
 *     `type`, read from the page wikitext (the `infobox_spell` bucket does not carry damage);
 *   - the spell-family articles Smoke spells, Shadow spells, Blood spells and Ice spells for the
 *     Ancient Magicks secondary effects;
 *   - the Elemental weakness article for which spells carry an element.
 * Every page is read through one `action=query&prop=revisions` request per batch, and the revision
 * ids are printed so a rebuild can be tied to the exact text it read.
 *
 * Which spells are listed, and in what order, is this project's choice: the combat spells the
 * simulator can cast (see `CATALOG`). The order is the autocast picker's order.
 *
 * The Wiki is CC BY-NC-SA 3.0; docs/legal/data-provenance.md records the terms, the retrieval date
 * and the revisions. Update it whenever this script's output is committed. The User-Agent rules are
 * the same as scripts/sync-osrs-data.ts.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { OsrsSpell, SpellSecondaryEffect } from '../src/data/spellCatalog';
import { SPELL_CAST_SPEED } from '../src/data/spellCatalog';
import { RUNE, SPELL_LEVEL_REQUIREMENTS, SPELL_RUNE_REQUIREMENTS } from '../src/data/spellRunes';
import type { SpellbookType } from '../src/types/spellbook';
import { type DownloadLimits, download } from './httpsDownload';

const API = 'https://oldschool.runescape.wiki/api.php';
const DEFAULT_USER_AGENT = 'osrs-combat-sim-data-sync/1.0 (wiki data regeneration; contact not configured)';
const USER_AGENT = process.env.OSRS_WIKI_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = process.env.SPELLS_WIKI_CACHE_DIR?.trim() || join(REPO_ROOT, '.setup-cache', 'wiki', 'spells');
const OUT_PATH = join(REPO_ROOT, 'src', 'data', 'osrs', 'spells.json');

/** One request in flight, spaced well beyond what the Wiki asks of automated clients. */
const REQUEST_SPACING_MS = 1000;
/** MediaWiki's per-request title limit for clients without the bot right. */
const TITLES_PER_REQUEST = 50;
/** A batch of up to 50 articles of wikitext; 16 MiB is far beyond any real one. */
const WIKI_LIMITS: DownloadLimits = { idleMs: 30_000, deadlineMs: 120_000, maxBytes: 16 * 1024 * 1024 };

/** The simulator's combat spells, in picker order. Names are the Wiki article titles. */
const CATALOG: readonly string[] = [
  'Wind Strike',
  'Water Strike',
  'Earth Strike',
  'Fire Strike',
  'Wind Bolt',
  'Water Bolt',
  'Earth Bolt',
  'Fire Bolt',
  'Wind Blast',
  'Water Blast',
  'Earth Blast',
  'Fire Blast',
  'Wind Wave',
  'Water Wave',
  'Earth Wave',
  'Fire Wave',
  'Wind Surge',
  'Water Surge',
  'Earth Surge',
  'Fire Surge',
  'Saradomin Strike',
  'Claws of Guthix',
  'Flames of Zamorak',
  'Crumble Undead',
  'Iban Blast',
  'Magic Dart',
  'Smoke Rush',
  'Shadow Rush',
  'Blood Rush',
  'Ice Rush',
  'Smoke Burst',
  'Shadow Burst',
  'Blood Burst',
  'Ice Burst',
  'Smoke Blitz',
  'Shadow Blitz',
  'Blood Blitz',
  'Ice Blitz',
  'Smoke Barrage',
  'Shadow Barrage',
  'Blood Barrage',
  'Ice Barrage',
  'Ghostly Grasp',
  'Skeletal Grasp',
  'Undead Grasp',
  'Inferior Demonbane',
  'Superior Demonbane',
  'Dark Demonbane',
];

const FAMILY_PAGES = ['Smoke spells', 'Shadow spells', 'Blood spells', 'Ice spells', 'Elemental weakness'] as const;

const SPELLBOOKS: Readonly<Record<string, SpellbookType>> = {
  Normal: 'standard',
  Ancient: 'ancient',
  Lunar: 'lunar',
  Arceuus: 'arceuus',
};

/**
 * Wiki, Elemental weakness: elemental spells are the standard book's strike, bolt, blast, wave and
 * surge spells, and "does not include spells which could be viewed as elemental, such as Flames of
 * Zamorak, or spells from other spellbooks, such as Ice Rush". The infobox `element` of the others
 * (God, None, Smoke, Shadow, Blood, Ice) is therefore stored as null.
 */
const ELEMENTS = ['air', 'water', 'earth', 'fire'] as const;
type Element = (typeof ELEMENTS)[number];
const ELEMENTAL_SPELL = /^(?:Wind|Water|Earth|Fire) (?:Strike|Bolt|Blast|Wave|Surge)$/;

interface WikiPage {
  readonly title: string;
  readonly revid: number;
  readonly timestamp: string;
  readonly content: string;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;

/** Wikitext and revision of each title, from the cache when present. Redirects are refused. */
async function fetchPages(titles: readonly string[], refresh: boolean): Promise<Map<string, WikiPage>> {
  const pages = new Map<string, WikiPage>();
  for (let start = 0; start < titles.length; start += TITLES_PER_REQUEST) {
    const batch = titles.slice(start, start + TITLES_PER_REQUEST);
    const params = new URLSearchParams({
      action: 'query',
      prop: 'revisions',
      rvprop: 'ids|timestamp|content',
      rvslots: 'main',
      format: 'json',
      formatversion: '2',
      maxlag: '5',
      titles: batch.join('|'),
    });
    const url = `${API}?${params}`;
    const cachePath = join(CACHE_DIR, `query-${createHash('sha256').update(url).digest('hex').slice(0, 16)}.json`);
    let body: string | undefined;
    if (!refresh) body = await readFile(cachePath, 'utf8').catch(() => undefined);
    if (body === undefined) {
      const wait = lastRequestAt + REQUEST_SPACING_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      const response = await download(url, WIKI_LIMITS, { headers: { 'user-agent': USER_AGENT } });
      if (!response.body) throw new Error(`Wiki API returned ${response.status} for ${batch.length} titles`);
      body = response.body.toString('utf8');
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cachePath, body, 'utf8');
      process.stdout.write(`  fetched ${batch.length} pages -> ${cachePath}\n`);
    } else {
      process.stdout.write(`  cached  ${batch.length} pages <- ${cachePath}\n`);
    }
    const parsed = JSON.parse(body) as {
      error?: { info?: string };
      query?: {
        redirects?: unknown[];
        normalized?: unknown[];
        pages?: Array<{
          title: string;
          missing?: boolean;
          revisions?: Array<{ revid: number; timestamp: string; slots: { main: { content: string } } }>;
        }>;
      };
    };
    if (parsed.error) throw new Error(`Wiki API error: ${parsed.error.info ?? 'unknown'}`);
    if (parsed.query?.normalized || parsed.query?.redirects) {
      throw new Error('A title was normalized or redirected; use the exact article title.');
    }
    for (const page of parsed.query?.pages ?? []) {
      const revision = page.revisions?.[0];
      if (page.missing || !revision) throw new Error(`Wiki page missing: ${page.title}`);
      pages.set(page.title, {
        title: page.title,
        revid: revision.revid,
        timestamp: revision.timestamp,
        content: revision.slots.main.content,
      });
    }
  }
  for (const title of titles) if (!pages.has(title)) throw new Error(`Wiki returned no page for ${title}`);
  return pages;
}

/** The `{{Infobox Spell}}` parameters of a page. Throws if the page has no single unversioned box. */
function infoboxSpell(page: WikiPage): Record<string, string> {
  const boxes = [...page.content.matchAll(/\{\{Infobox Spell\n([\s\S]*?)\n\}\}/g)];
  if (boxes.length !== 1) throw new Error(`${page.title}: expected one Infobox Spell, found ${boxes.length}`);
  const fields: Record<string, string> = {};
  for (const [, key, value] of boxes[0][1].matchAll(/^\|\s*([a-z0-9_]+)\s*=\s*(.*?)\s*$/gm)) fields[key] = value;
  if (Object.keys(fields).some((key) => /\d$/.test(key))) {
    throw new Error(`${page.title}: versioned infobox; this script reads only single-version spells`);
  }
  return fields;
}

function field(page: WikiPage, fields: Record<string, string>, key: string): string {
  const value = fields[key];
  if (value === undefined || value === '') throw new Error(`${page.title}: infobox has no ${key}`);
  return value;
}

/**
 * The simulator's base maximum hit from the infobox `damage`. Only these shapes are accepted;
 * anything else throws so a changed page is read by a person, not guessed at.
 *
 *  - `16`: a fixed base maximum.
 *  - `2, 4, 6, or 8`: a standard elemental spell. Its article says the base maximum rises with the
 *    highest spell of the same tier the player can cast ("up to 8 at level 13 Magic" for Wind
 *    Strike). The simulator stores the tier's top value, the one every spell of a tier reaches once
 *    the player can cast the tier's last spell; it does not model the lower values.
 *  - `{{*}} 20 <br/>'''Charged & <god> cape worn:'''<br/> {{*}} 30`: a god spell. The first value is
 *    the uncharged maximum; Charge is not modeled.
 *  - Magic Dart's `{{*}} 10% of level + 10 ...`: `maxHit` 0 with `scalesWithMagic`, resolved by
 *    `playerAttackRuntime.ts` as floor(Magic / 10) + 10. Its Slayer's staff (e) on-task line is not
 *    modeled.
 */
function baseMaxHit(page: WikiPage, damage: string): { maxHit: number; scalesWithMagic?: 'magic_dart' } {
  if (/^\d+$/.test(damage)) return { maxHit: Number(damage) };
  if (/^\d+(?:, \d+)*,? or \d+$/.test(damage)) {
    const values = damage.match(/\d+/g)!.map(Number);
    if (!ELEMENTAL_SPELL.test(page.title)) throw new Error(`${page.title}: level-dependent damage on a non-elemental`);
    return { maxHit: Math.max(...values) };
  }
  const god = damage.match(/^\{\{\*\}\}\s*(\d+)\s*<br\s*\/?>\s*'''Charged & \w+ cape worn:'''/);
  if (god) return { maxHit: Number(god[1]) };
  if (page.title === 'Magic Dart' && /^\{\{\*\}\}\s*10% of level \+ 10\s*<br\s*\/?>/.test(damage)) {
    return { maxHit: 0, scalesWithMagic: 'magic_dart' };
  }
  throw new Error(`${page.title}: unrecognized damage value ${JSON.stringify(damage)}`);
}

/** `value` is undefined when the infobox has no `element` line, as on Crumble Undead or the Grasps. */
function element(page: WikiPage, value: string | undefined): Element | null {
  const lower = (value ?? '').toLowerCase();
  const isElement = (ELEMENTS as readonly string[]).includes(lower);
  if (isElement !== ELEMENTAL_SPELL.test(page.title)) {
    throw new Error(`${page.title}: infobox element ${value ?? '(none)'} disagrees with the Elemental weakness rule`);
  }
  return isElement ? (lower as Element) : null;
}

/** The first wikitable on a page as rows of cell text keyed by header text, with rowspans carried down. */
function wikitable(page: WikiPage): Array<Record<string, string>> {
  const table = page.content.match(/\n\{\|[^\n]*\n([\s\S]*?)\n\|\}/);
  if (!table) throw new Error(`${page.title}: no table`);
  const attrs = /^((?:\s*[a-z-]+\s*=\s*"[^"]*")+)\s*\|(.*)$/;
  const [head, ...rows] = table[1].split(/\n\|-[^\n]*\n?/);
  const headers = head
    .split('\n')
    .filter((line) => line.startsWith('!'))
    .map((line) => {
      const text = line.slice(1).trim();
      if (/colspan|rowspan/.test(text)) throw new Error(`${page.title}: spanned header cells are not supported`);
      return text;
    });
  const carried: Array<{ value: string; rows: number } | undefined> = [];
  return rows.map((row) => {
    const cells = row.split('\n').filter((line) => line.startsWith('|') && !line.startsWith('|}'));
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      const carry = carried[column];
      if (carry && carry.rows > 0) {
        carry.rows--;
        record[header] = carry.value;
        return;
      }
      const raw = cells.shift();
      if (raw === undefined) throw new Error(`${page.title}: short table row`);
      const match = raw.slice(1).match(attrs);
      const value = (match ? match[2] : raw.slice(1)).trim();
      if (match && /colspan/.test(match[1])) throw new Error(`${page.title}: spanned columns are not supported`);
      const span = match?.[1].match(/rowspan\s*=\s*"(\d+)"/);
      carried[column] = span ? { value, rows: Number(span[1]) - 1 } : undefined;
      record[header] = value;
    });
    return record;
  });
}

/** A number from the family table's row for `spell`, in the column whose header starts with `header`. */
function tableValue(page: WikiPage, spell: string, header: string, pattern: RegExp): number {
  const row = wikitable(page).find((candidate) => candidate.Spell === `[[${spell}]]`);
  const column = row && Object.keys(row).find((key) => key.startsWith(header));
  const match = column === undefined ? null : row?.[column].match(pattern);
  if (!match) throw new Error(`${page.title}: no ${JSON.stringify(header)} value for ${spell}`);
  return Number(match[1]);
}

function prose(page: WikiPage, pattern: RegExp): RegExpMatchArray {
  const match = page.content.match(pattern);
  if (!match) throw new Error(`${page.title}: text no longer matches ${pattern}`);
  return match;
}

/**
 * The Ancient Magicks secondary effect, read from the family page. Smoke's 1/8 roll is the same for
 * the whole family and lives beside the roll in `spellHitEffects.ts`, not here.
 */
function secondaryEffect(spell: string, families: ReadonlyMap<string, WikiPage>): SpellSecondaryEffect | undefined {
  const [family, tier] = spell.split(' ');
  const page = families.get(`${family} spells`);
  if (!page || !['Rush', 'Burst', 'Blitz', 'Barrage'].includes(tier)) return undefined;
  const lowTier = tier === 'Rush' || tier === 'Burst';
  switch (family) {
    case 'Smoke': {
      // "Poison severity for the lower-level spells (Smoke Rush and Smoke Burst) is 10, while poison
      // severity for the higher-level spells (Smoke Blitz and Smoke Barrage) is 20."
      const [, low, high] = prose(
        page,
        /\[\[Poison severity\]\] for the lower-level spells \(\[\[Smoke Rush\]\] and \[\[Smoke Burst\]\]\) is (\d+), while poison severity for the higher-level spells \(\[\[Smoke Blitz\]\] and \[\[Smoke Barrage\]\]\) is (\d+)/,
      );
      return { kind: 'poison', severity: Number(lowTier ? low : high) };
    }
    case 'Shadow':
      return { kind: 'drain_attack', percent: tableValue(page, spell, "Target's Attack<br />reduced", /^(\d+)%$/) };
    case 'Blood': {
      // "heals the caster by 25% of the damage dealt", the same for all four.
      const [, percent] = prose(page, /heals the caster by (\d+)% of the damage dealt/);
      return { kind: 'leech_hp', percentOfDamage: Number(percent) };
    }
    case 'Ice':
      // The table's base duration, e.g. "8t ''(+0)''"; the bracket is the Ancient sceptre's bonus.
      return { kind: 'freeze', durationTicks: tableValue(page, spell, 'Freeze<br>duration', /^(\d+)t\b/) };
    default:
      return undefined;
  }
}

/** Facts the infobox also states that live in other modules; reported, never written here. */
function crossCheck(page: WikiPage, fields: Record<string, string>): string[] {
  const notes: string[] = [];
  const level = Number(field(page, fields, 'level'));
  if (SPELL_LEVEL_REQUIREMENTS[page.title] !== level) {
    notes.push(`level: Wiki ${level}, spellRunes.ts ${SPELL_LEVEL_REQUIREMENTS[page.title]}`);
  }
  const speed = field(page, fields, 'speed');
  if (speed !== `${SPELL_CAST_SPEED} ticks`) notes.push(`speed: Wiki ${speed}, SPELL_CAST_SPEED ${SPELL_CAST_SPEED}`);
  const runeReq = field(page, fields, 'cost').match(/\{\{RuneReq\|([^}]*)\}\}/);
  const runeNames = (runeReq?.[1] ?? '').split('|').map((part) => part.split('=')[0].trim().toLowerCase());
  const wikiRunes = runeNames.map((name) => RUNE[name as keyof typeof RUNE] ?? -1).sort((a, b) => a - b);
  const ourRunes = [...(SPELL_RUNE_REQUIREMENTS[page.title] ?? [])].sort((a, b) => a - b);
  if (wikiRunes.join(',') !== ourRunes.join(',')) {
    notes.push(`runes: Wiki ${runeNames.join('+')}, spellRunes.ts ids ${ourRunes.join(',')}`);
  }
  return notes;
}

function buildSpell(page: WikiPage, families: ReadonlyMap<string, WikiPage>): OsrsSpell {
  const fields = infoboxSpell(page);
  if (field(page, fields, 'name') !== page.title) throw new Error(`${page.title}: infobox name differs from title`);
  if (field(page, fields, 'type') !== 'Combat') throw new Error(`${page.title}: not a combat spell`);
  const book = SPELLBOOKS[field(page, fields, 'spellbook')];
  if (!book) throw new Error(`${page.title}: unknown spellbook ${fields.spellbook}`);
  const effect = secondaryEffect(page.title, families);
  return {
    name: page.title,
    spellbook: book,
    element: element(page, fields.element),
    ...baseMaxHit(page, field(page, fields, 'damage')),
    ...(effect ? { secondaryEffect: effect } : {}),
  };
}

function compare(generated: readonly OsrsSpell[], current: readonly OsrsSpell[]): string[] {
  const diffs: string[] = [];
  const currentByName = new Map(current.map((spell) => [spell.name, spell]));
  if (generated.map((s) => s.name).join('|') !== current.map((s) => s.name).join('|')) {
    diffs.push('order or membership of the spell list differs');
  }
  for (const spell of generated) {
    const old = currentByName.get(spell.name);
    if (!old) {
      diffs.push(`${spell.name}: not in the current file`);
      continue;
    }
    const keys = new Set([...Object.keys(spell), ...Object.keys(old)]) as Set<keyof OsrsSpell>;
    for (const key of keys) {
      const [next, prev] = [JSON.stringify(spell[key]), JSON.stringify(old[key])];
      if (next !== prev) diffs.push(`${spell.name}.${key}: current ${prev}, Wiki ${next}`);
    }
  }
  for (const spell of current) if (!generated.some((s) => s.name === spell.name)) diffs.push(`${spell.name}: dropped`);
  return diffs;
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const refresh = process.argv.includes('--refresh');
  if (USER_AGENT === DEFAULT_USER_AGENT) {
    process.stderr.write(
      'Warning: OSRS_WIKI_USER_AGENT is not set, so requests carry a generic User-Agent with no contact.\n' +
        'Set it to your project and a contact address, as the Wiki asks of automated clients.\n',
    );
  }

  process.stdout.write('Reading spell articles from the OSRS Wiki\n');
  const spellPages = await fetchPages(CATALOG, refresh);
  const familyPages = await fetchPages(FAMILY_PAGES, refresh);

  const spells = CATALOG.map((title) => buildSpell(spellPages.get(title)!, familyPages));
  const notes = CATALOG.flatMap((title) => {
    const page = spellPages.get(title)!;
    return crossCheck(page, infoboxSpell(page)).map((note) => `  ${title}: ${note}`);
  });

  process.stdout.write('\nRevisions read:\n');
  for (const page of [...CATALOG.map((t) => spellPages.get(t)!), ...FAMILY_PAGES.map((t) => familyPages.get(t)!)]) {
    process.stdout.write(`  ${page.title}: ${page.revid} (${page.timestamp})\n`);
  }
  process.stdout.write(
    notes.length === 0
      ? '\nLevels, rune types and cast speed agree with spellRunes.ts and spellCatalog.ts.\n'
      : `\nInfobox facts that disagree with other modules (not written here):\n${notes.join('\n')}\n`,
  );

  const current = JSON.parse(await readFile(OUT_PATH, 'utf8').catch(() => '[]')) as OsrsSpell[];
  const diffs = compare(spells, current);
  process.stdout.write(
    diffs.length === 0
      ? `\nAll ${spells.length} spells match the current file field for field.\n`
      : `\n${diffs.length} differences from the current file:\n${diffs.map((d) => `  ${d}`).join('\n')}\n`,
  );

  if (check) {
    if (diffs.length > 0) process.exitCode = 1;
    return;
  }
  await writeFile(OUT_PATH, `${JSON.stringify(spells, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `\nwrote ${spells.length} spells to src/data/osrs/spells.json\n` +
      'Update the retrieval date and revisions in docs/legal/data-provenance.md before committing.\n',
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
