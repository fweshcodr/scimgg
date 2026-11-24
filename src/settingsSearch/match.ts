import type { MatchedOn, MatchKind, Searchable, SearchField, SearchLayout, SearchOptions, SearchResult } from './types';

/**
 * A forgiving search over the sidebar index: it folds case, accents and punctuation, treats word
 * variants (marker / markers / marking) as one word, expands a few synonyms, completes the word
 * being typed, and tolerates typos with a Damerau-Levenshtein budget scaled to word length.
 *
 * Ranking, strongest first: exact title, title prefix, title words (fuzzy included), keyword or
 * synonym, breadcrumb, then description and availability.
 */

const FIELD_WEIGHT: Record<SearchField, number> = {
  title: 10,
  keywords: 6,
  breadcrumb: 4,
  description: 2.5,
  availability: 2.5,
};

const MATCH_QUALITY: Record<Exclude<MatchKind, 'prefix' | 'fuzzy'>, number> = {
  exact: 1,
  variant: 0.95,
  // A synonym in the title scores just under the typed word in keywords (10 × 0.57 = 5.7 < 6), so a
  // synonym never outranks a row that lists the player's own word, even with the broad-row bonus.
  synonym: 0.57,
};

const EXACT_TITLE_BONUS = 20;
const TITLE_PREFIX_BONUS = 8;
/**
 * Scales a prefix match when the typed word is already a whole word somewhere in the index (its
 * own spelling, a variant or a synonym in a title, keyword or breadcrumb). "exp" is then a word the
 * player finished, not the start of "expand", so a title prefix (at most 10 × 0.9 × 0.5 = 4.5)
 * falls below the exact keyword (6). Partial words like "brigh" keep the full prefix score.
 */
const WHOLE_WORD_PREFIX_FACTOR = 0.5;
const ALL_IN_TITLE_BONUS = 3;
const ONE_KEYWORD_BONUS = 3;
/** On otherwise equal evidence, prefer the plugin or section row over one of its controls. */
const BROAD_ROW_BONUS = 0.25;
/**
 * Nudges a row tagged with `layouts` up when it applies in the player's current layout, and down
 * when it does not. Enough to reorder close results ("ui size" in Mobile finds Mobile's own
 * Interface scaling first), never enough to bury an exact title, and nothing is hidden.
 */
const LAYOUT_FIT_BONUS = 2;

/**
 * Description and availability are prose: their words only count when the player typed them (or a
 * variant of them), or is still typing one. No typos and no synonyms there, or every "them" in a
 * sentence would answer "theme".
 */
const PROSE_FIELDS: ReadonlySet<SearchField> = new Set<SearchField>(['description', 'availability']);

/** Filler a player types around the words that matter. Dropped unless the query is nothing else. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'of',
  'for',
  'in',
  'on',
  'off',
  'my',
  'me',
  'i',
  'how',
  'do',
  'does',
  'can',
  'where',
  'is',
  'it',
  'turn',
  'change',
  'enable',
  'disable',
  'toggle',
  'setting',
  'settings',
  'option',
  'options',
  'want',
  'please',
  'make',
  'use',
  // Prose filler, so description words like "them" never stand in for a typed word.
  'or',
  'as',
  'at',
  'by',
  'be',
  'so',
  'with',
  'from',
  'into',
  'you',
  'your',
  'they',
  'them',
  'their',
  'its',
  'this',
  'that',
  'these',
  'those',
]);

/**
 * Single words a player uses interchangeably. Phrases and feature-specific slang belong in an
 * entry's keywords instead, where they cannot leak into unrelated rows.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ['color', 'colour'],
  ['grey', 'gray'],
  ['centre', 'center'],
  ['hp', 'health', 'hitpoints', 'hitpoint', 'life'],
  ['xp', 'exp', 'experience'],
  ['fps', 'framerate'],
  ['sound', 'audio', 'sfx'],
  ['ui', 'interface', 'hud', 'gui'],
  ['size', 'scale', 'scaling'],
  ['big', 'bigger', 'large', 'larger'],
  ['small', 'smaller', 'tiny'],
  ['delete', 'remove', 'clear'],
  ['camera', 'cam'],
  ['inventory', 'inv'],
  ['npc', 'monster', 'mob'],
  ['damage', 'dmg'],
  ['special', 'spec'],
  ['hotkey', 'keybind', 'shortcut', 'keybinding', 'bind'],
  ['resolution', 'res'],
  ['lag', 'latency', 'ping'],
  ['transparent', 'transparency', 'opacity', 'seethrough'],
  ['outline', 'border', 'stroke'],
  ['highlight', 'indicator'],
  ['swap', 'switch'],
];

/** Lowercase, strip accents and punctuation, spell out `&`, collapse whitespace. Digits are kept. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeText(text);
  return normalized ? normalized.split(' ') : [];
}

function undouble(word: string): string {
  const n = word.length;
  return n >= 4 && word[n - 1] === word[n - 2] && !'aeiouls'.includes(word[n - 1]) ? word.slice(0, -1) : word;
}

/**
 * A deliberately light stemmer: enough to fold plural, -ing, -ed and -er forms together
 * (`markers`, `marking`, `marked` → `mark`) without a dictionary. It only needs to be consistent,
 * since both sides of every comparison go through it.
 */
export function stem(word: string): string {
  let w = word;
  if (w.length >= 5 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length >= 5 && /(ches|shes|xes|sses|zes)$/.test(w)) w = w.slice(0, -2);
  else if (w.length >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);

  if (w.length >= 7 && w.endsWith('ness')) w = w.slice(0, -4);
  else if (w.length >= 6 && w.endsWith('ing')) w = undouble(w.slice(0, -3));
  else if (w.length >= 5 && w.endsWith('ed') && !w.endsWith('eed')) w = undouble(w.slice(0, -2));
  else if (w.length >= 5 && w.endsWith('er')) w = undouble(w.slice(0, -2));

  if (w.length >= 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

/**
 * Optimal-string-alignment Damerau-Levenshtein distance: insertions, deletions, substitutions and
 * adjacent transpositions each cost 1. Returns `max + 1` as soon as the distance must exceed `max`.
 */
export function damerauLevenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      row.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = row;
  }
  return prev[b.length];
}

/** Typos allowed for a query word: none for short words, which only match exactly or as a prefix. */
export function allowedEdits(length: number): number {
  return length <= 3 ? 0 : length <= 7 ? 1 : 2;
}

interface Token {
  raw: string;
  stem: string;
}

interface Phrase {
  field: SearchField;
  text: string;
  /** Normalized meaningful words, compared whole against the query for the title bonuses. */
  normalized: string;
  stemmed: string;
  /** The phrase's words plus each adjacent pair joined, so `popout` finds "Pop out" and `hp bar` finds "hpbar". */
  tokens: Token[];
}

interface PreparedEntry {
  entry: Searchable;
  /** The row's label: what a query can name exactly, or be the start of. */
  title: Phrase;
  /**
   * The title the results show (`resultTitle` when the label is too bare to stand alone). A query
   * names the row exactly only if it names this too: "volume" is the whole of the Tick Audio
   * Metronome's label "Volume", but no more the name of "Metronome volume" than of "Master Volume".
   */
  shownTitle: Phrase;
  phrases: Phrase[];
}

function toToken(raw: string): Token {
  return { raw, stem: stem(raw) };
}

/** Drops filler words, unless that would leave nothing. */
function meaningfulWords(words: string[]): string[] {
  const meaningful = words.filter((word) => !STOPWORDS.has(word));
  return meaningful.length > 0 ? meaningful : words;
}

function preparePhrase(field: SearchField, text: string): Phrase {
  const words = tokenize(text);
  const tokens = words.map(toToken);
  for (let i = 0; i + 1 < words.length; i++) {
    // "themenu" would only ever be a false prefix for "theme".
    if (!STOPWORDS.has(words[i]) && !STOPWORDS.has(words[i + 1])) tokens.push(toToken(words[i] + words[i + 1]));
  }
  const kept = meaningfulWords(words);
  return { field, text, normalized: kept.join(' '), stemmed: kept.map(stem).join(' '), tokens };
}

/**
 * The words that match as the row's title: its label, plus the shown title's last word when the
 * label lacks it. That word says what the control is ("Sound effects volume" is a volume slider),
 * where the shown title's other added words only say whose it is ("Zoom inner limit", "Metronome
 * volume") and stay keyword-strength. Not for a one-word label: that is a group heading ("Camera"
 * in the keybind editor), and "keys" would draw "key bindings" from the editor itself.
 */
function titleWords(entry: Searchable): string {
  const label = tokenize(entry.title);
  const head = entry.resultTitle && label.length > 1 ? tokenize(entry.resultTitle).at(-1) : undefined;
  if (!head || label.some((word) => stem(word) === stem(head))) return entry.title;
  return `${entry.title} ${head}`;
}

function prepareEntry(entry: Searchable): PreparedEntry {
  const title = preparePhrase('title', entry.title);
  const shownTitle = entry.resultTitle ? preparePhrase('title', entry.resultTitle) : title;
  const matched = titleWords(entry);
  // The words the title field matches, which can add the shown title's last word (titleWords).
  const phrases = [matched === entry.title ? title : preparePhrase('title', matched)];
  for (const keyword of entry.keywords ?? []) phrases.push(preparePhrase('keywords', keyword));
  for (const crumb of entry.breadcrumb) phrases.push(preparePhrase('breadcrumb', crumb));
  if (entry.description) phrases.push(preparePhrase('description', entry.description));
  if (entry.availability) phrases.push(preparePhrase('availability', entry.availability));
  return { entry, title, shownTitle, phrases };
}

interface PreparedIndex {
  entries: PreparedEntry[];
  /** Raw words and stems of every title, keyword and breadcrumb: the words a query can complete. */
  vocabulary: Set<string>;
}

const preparedCache = new WeakMap<readonly Searchable[], PreparedIndex>();

function prepare(entries: readonly Searchable[]): PreparedIndex {
  let prepared = preparedCache.get(entries);
  if (!prepared) {
    const vocabulary = new Set<string>();
    for (const entry of entries) {
      for (const text of [entry.title, ...(entry.keywords ?? []), ...entry.breadcrumb]) {
        for (const word of tokenize(text)) {
          vocabulary.add(word);
          vocabulary.add(stem(word));
        }
      }
    }
    prepared = { entries: entries.map(prepareEntry), vocabulary };
    preparedCache.set(entries, prepared);
  }
  return prepared;
}

const synonymsByStem = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SYNONYM_GROUPS) {
    const stems = new Set(group.map(stem));
    for (const s of stems) {
      const others = map.get(s) ?? new Set<string>();
      for (const other of stems) if (other !== s) others.add(other);
      map.set(s, others);
    }
  }
  return map;
})();

interface QueryToken extends Token {
  synonyms: ReadonlySet<string>;
  /** The word still being typed, which may be completed from a single letter. */
  isLast: boolean;
  /** Already a whole word in the index, so completing it to a longer word is weak evidence. */
  isWord: boolean;
  /** Matches already worked out against each distinct entry word, for this query only. */
  cache: Map<string, TokenMatch | null>;
}

interface TokenMatch {
  kind: MatchKind;
  quality: number;
}

function parseQuery(
  query: string,
  vocabulary: ReadonlySet<string>,
): { tokens: QueryToken[]; normalized: string; stemmed: string } {
  const kept = meaningfulWords(tokenize(query));
  const tokens = kept.map((raw, index) => {
    const token = toToken(raw);
    const synonyms = synonymsByStem.get(token.stem) ?? synonymsByStem.get(raw) ?? new Set<string>();
    return {
      ...token,
      synonyms,
      isLast: index === kept.length - 1,
      isWord: vocabulary.has(raw) || vocabulary.has(token.stem) || [...synonyms].some((s) => vocabulary.has(s)),
      cache: new Map<string, TokenMatch | null>(),
    };
  });
  return { tokens, normalized: kept.join(' '), stemmed: tokens.map((t) => t.stem).join(' ') };
}

function compareToken(q: QueryToken, f: Token): TokenMatch | null {
  if (f.raw === q.raw) return { kind: 'exact', quality: MATCH_QUALITY.exact };
  if (f.stem === q.stem) return { kind: 'variant', quality: MATCH_QUALITY.variant };
  if (q.synonyms.has(f.stem) || q.synonyms.has(f.raw)) return { kind: 'synonym', quality: MATCH_QUALITY.synonym };

  const qLen = q.raw.length;
  if ((qLen >= 3 || q.isLast) && f.raw.length > qLen && f.raw.startsWith(q.raw)) {
    // Weighted by how much of the word is typed, so "brightn" outranks "b".
    const quality = 0.6 + 0.3 * (qLen / f.raw.length);
    return { kind: 'prefix', quality: q.isWord ? quality * WHOLE_WORD_PREFIX_FACTOR : quality };
  }

  const edits = allowedEdits(qLen);
  if (edits === 0 || f.raw.length < 4) return null;
  // Short words rarely get their first letter wrong; requiring it keeps "time" off "lime".
  if (qLen <= 5 && f.raw[0] !== q.raw[0]) return null;
  const distance = damerauLevenshtein(q.raw, f.raw, edits);
  return distance <= edits ? { kind: 'fuzzy', quality: distance === 1 ? 0.7 : 0.55 } : null;
}

function matchToken(q: QueryToken, f: Token): TokenMatch | null {
  let match = q.cache.get(f.raw);
  if (match === undefined) {
    match = compareToken(q, f);
    q.cache.set(f.raw, match);
  }
  return match;
}

/** How many of `n` query words must match: all of one or two, then all but every third. */
function requiredMatches(n: number): number {
  return n <= 2 ? n : n - Math.floor(n / 3);
}

/**
 * Whether the title begins with the query. When the last word is already a whole word, the title
 * must continue past it at a word break: "pop" starts "Pop Out Game", but "exp" does not start
 * "Expand pitch limit".
 */
function titleStartsWithQuery(title: Phrase, query: ReturnType<typeof parseQuery>): boolean {
  if (!title.normalized.startsWith(query.normalized)) return false;
  const last = query.tokens[query.tokens.length - 1];
  return !last.isWord || title.normalized.startsWith(`${query.normalized} `);
}

/** Whether a match may count in a prose field: exact or variant, or completing the word still being typed. */
function proseAccepts(match: TokenMatch, q: QueryToken): boolean {
  if (match.kind === 'exact' || match.kind === 'variant') return true;
  return match.kind === 'prefix' && q.isLast && !q.isWord;
}

function scoreEntry(
  prepared: PreparedEntry,
  query: ReturnType<typeof parseQuery>,
  layout: SearchLayout | undefined,
): { score: number; matchedOn: MatchedOn[] } | null {
  const { tokens } = query;
  const matchedOn: MatchedOn[] = [];
  let total = 0;
  let inTitle = 0;
  // Per keyword phrase, how many query words it covered: one phrase covering all is a strong signal.
  const keywordHits = new Map<Phrase, number>();

  for (const q of tokens) {
    let best: { score: number; phrase: Phrase; kind: MatchKind } | null = null;
    for (const phrase of prepared.phrases) {
      const prose = PROSE_FIELDS.has(phrase.field);
      let phraseBest: TokenMatch | null = null;
      for (const f of phrase.tokens) {
        if (prose && STOPWORDS.has(f.raw)) continue;
        const match = matchToken(q, f);
        if (!match || (prose && !proseAccepts(match, q))) continue;
        if (!phraseBest || match.quality > phraseBest.quality) phraseBest = match;
      }
      if (!phraseBest) continue;
      if (phrase.field === 'keywords') keywordHits.set(phrase, (keywordHits.get(phrase) ?? 0) + 1);
      // Synonyms, and completions of a word the player already finished, are not the title's own words.
      if (phrase.field === 'title' && phraseBest.kind !== 'synonym' && !(phraseBest.kind === 'prefix' && q.isWord)) {
        inTitle++;
      }
      const score = FIELD_WEIGHT[phrase.field] * phraseBest.quality;
      if (!best || score > best.score) best = { score, phrase, kind: phraseBest.kind };
    }
    if (best) {
      total += best.score;
      matchedOn.push({ queryToken: q.raw, field: best.phrase.field, text: best.phrase.text, kind: best.kind });
    }
  }

  if (matchedOn.length < requiredMatches(tokens.length)) return null;

  let score = (total / tokens.length) * (matchedOn.length / tokens.length);
  const { title, shownTitle } = prepared;
  const names = (phrase: Phrase) => phrase.normalized === query.normalized || phrase.stemmed === query.stemmed;
  // The label and, when it is qualified, the title the results show: a bare "Volume" alone does not
  // name the metronome's slider, nor "line markers" the plugin's "Your Lines".
  if (names(title) && names(shownTitle)) {
    score += EXACT_TITLE_BONUS;
  } else if (query.normalized.length >= 2 && titleStartsWithQuery(title, query)) {
    score += TITLE_PREFIX_BONUS;
  } else if (inTitle === tokens.length) {
    score += ALL_IN_TITLE_BONUS;
  }
  if (tokens.length > 1 && [...keywordHits.values()].some((hits) => hits === tokens.length)) {
    score += ONE_KEYWORD_BONUS;
  }
  if (prepared.entry.kind !== 'setting') score += BROAD_ROW_BONUS;
  const { layouts } = prepared.entry;
  if (layout && layouts) score += layouts.includes(layout) ? LAYOUT_FIT_BONUS : -LAYOUT_FIT_BONUS;
  return { score, matchedOn };
}

/**
 * Where the shown title (`resultTitle`, else `title`) holds words the query matched, by the same
 * word comparison the ranking used. A query word counts when its best match was in the title, or
 * anywhere for a qualified title (its added words come from the keywords), and never as a synonym:
 * the player did not type that word.
 */
function titleSpans(
  entry: Searchable,
  tokens: readonly QueryToken[],
  matchedOn: readonly MatchedOn[],
): Array<readonly [number, number]> {
  const typed = tokens.filter((q) =>
    matchedOn.some(
      (m) => m.queryToken === q.raw && m.kind !== 'synonym' && (m.field === 'title' || !!entry.resultTitle),
    ),
  );
  if (typed.length === 0) return [];
  const spans: Array<readonly [number, number]> = [];
  for (const word of (entry.resultTitle ?? entry.title).matchAll(/[A-Za-z0-9]+/g)) {
    const raw = normalizeText(word[0]);
    if (!raw) continue;
    const token = toToken(raw);
    const matched = typed.some((q) => {
      const kind = matchToken(q, token)?.kind;
      return kind !== undefined && kind !== 'synonym';
    });
    if (matched) spans.push([word.index, word.index + word[0].length]);
  }
  return spans;
}

/**
 * Ranked matches for `query`. Every query word must match somewhere (most of them, for longer
 * queries). Equal scores keep index order. Returns `[]` for an empty query; use `suggest` when
 * this finds nothing.
 */
export function search<E extends Searchable>(
  query: string,
  entries: readonly E[],
  opts: SearchOptions = {},
): SearchResult<E>[] {
  const index = prepare(entries);
  const parsed = parseQuery(query, index.vocabulary);
  if (parsed.tokens.length === 0) return [];
  const results: SearchResult<E>[] = [];
  for (const prepared of index.entries) {
    const scored = scoreEntry(prepared, parsed, opts.layout);
    // The prepared index holds the caller's own entries, in their order.
    if (scored) {
      const titleMatches = titleSpans(prepared.entry, parsed.tokens, scored.matchedOn);
      results.push({ entry: prepared.entry as E, ...scored, titleSpans: titleMatches });
    }
  }
  // Array.prototype.sort is stable, which keeps ties in index order.
  results.sort((a, b) => b.score - a.score);
  return opts.limit === undefined ? results : results.slice(0, opts.limit);
}

const SUGGEST_FIELD_FACTOR: Record<SearchField, number> = {
  title: 1,
  keywords: 0.85,
  breadcrumb: 0.6,
  description: 0.5,
  availability: 0.5,
};

/** 0..1 likeness of two words, also comparing `q` against the start of `f` as though still typing. */
function similarity(q: string, f: string): number {
  const whole = 1 - damerauLevenshtein(q, f) / Math.max(q.length, f.length);
  if (f.length <= q.length) return whole;
  const head = 1 - damerauLevenshtein(q, f.slice(0, q.length)) / q.length;
  return Math.max(whole, head * 0.9);
}

/**
 * The closest entries when `search` finds nothing that passes its thresholds. Scores every entry by
 * how near each query word comes to any of its words, with no typo limit, so it never returns
 * empty for a query that has any letters or digits in it.
 */
export function suggest<E extends Searchable>(
  query: string,
  entries: readonly E[],
  opts: SearchOptions = {},
): SearchResult<E>[] {
  const index = prepare(entries);
  const parsed = parseQuery(query, index.vocabulary);
  if (parsed.tokens.length === 0) return [];
  const limit = opts.limit ?? 5;
  const wordSimilarity = new Map<string, number>();
  const scored = index.entries.map((prepared) => {
    let total = 0;
    const matchedOn: MatchedOn[] = [];
    for (const q of parsed.tokens) {
      let best = { score: 0, phrase: prepared.title };
      for (const phrase of prepared.phrases) {
        for (const f of phrase.tokens) {
          const key = `${q.raw}\u0000${f.raw}`;
          let sim = wordSimilarity.get(key);
          if (sim === undefined) {
            sim = similarity(q.raw, f.raw);
            wordSimilarity.set(key, sim);
          }
          const score = sim * SUGGEST_FIELD_FACTOR[phrase.field];
          if (score > best.score) best = { score, phrase };
        }
      }
      total += best.score;
      matchedOn.push({ queryToken: q.raw, field: best.phrase.field, text: best.phrase.text, kind: 'fuzzy' });
    }
    return {
      entry: prepared.entry as E,
      score: total / parsed.tokens.length,
      matchedOn,
      titleSpans: titleSpans(prepared.entry, parsed.tokens, matchedOn),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
