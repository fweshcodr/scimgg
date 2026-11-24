import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** The crest family: the full-screen hero moments. */
const CREST_STYLESHEETS = [
  '../components/EncounterTitleCard.css',
  '../components/DeathModal.css',
  '../components/VictoryModal.css',
  '../tutorial/components/TutorialOverlay.css',
  '../components/CountdownBeats.css',
  '../components/FightStartCountdown.css',
] as const;

/** Selectors carrying crest text. Non-crest rules in the same files are ignored. */
const CREST_SELECTOR =
  /\.encounter-title-card|\.death-modal-(eyebrow|heading|reason)|\.victory-modal-(eyebrow|heading|narrative)|\.tutorial-step-intro|\.countdown-beats|\.fight-start-countdown/;

/** The bitmap faces have unitsPerEm=16, so only these sizes rasterize evenly. */
const ON_GRID_SIZES = new Set([16, 32, 48]);

interface Rule {
  selector: string;
  body: string;
}

/**
 * Flat rule scan with brace-depth tracking, so the `@media` / `@supports`
 * wrappers in these files yield their inner rules rather than one giant block.
 * Adequate because the sources are Biome-formatted and never nest further.
 */
function rules(css: string): Rule[] {
  const found: Rule[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      depth++;
      if (depth === 1 || depth === 2) {
        const prelude = css.slice(start, i).trim();
        if (!prelude.startsWith('@')) found.push({ selector: prelude, body: '' });
      }
      start = i + 1;
    } else if (ch === '}') {
      if (found.length > 0 && found[found.length - 1].body === '') {
        const last = found[found.length - 1];
        if (!css.slice(start, i).includes('{')) last.body = css.slice(start, i);
      }
      depth--;
      start = i + 1;
    }
  }
  return found.filter((r) => r.body !== '');
}

function declaration(body: string, prop: string): string | null {
  const m = body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

describe('crest CSS pixel grid', () => {
  /**
   * Off-grid sizes rasterize one stem of a glyph wider than its twin, which
   * reads as web type in a pixel costume rather than in-game text. A `clamp()`
   * or `vw` size can never satisfy the rule; step sizes at breakpoints instead.
   */
  it.each(CREST_STYLESHEETS)('sets every crest font-size in %s to 16/32/48px', (path) => {
    const css = readFileSync(new URL(path, import.meta.url), 'utf8');
    const offGrid = rules(css)
      .filter((r) => CREST_SELECTOR.test(r.selector))
      .map((r) => ({ selector: r.selector, size: declaration(r.body, 'font-size') }))
      .filter((d): d is { selector: string; size: string } => d.size !== null)
      .filter((d) => !ON_GRID_SIZES.has(Number.parseFloat(d.size)) || !d.size.endsWith('px'));

    expect(offGrid).toEqual([]);
  });

  /**
   * Fractional tracking pushes each successive glyph origin onto a different
   * subpixel phase, undoing the whole-pixel size above.
   */
  it.each(CREST_STYLESHEETS)('keeps crest letter-spacing on whole pixels in %s', (path) => {
    const css = readFileSync(new URL(path, import.meta.url), 'utf8');
    const fractional = rules(css)
      .filter((r) => CREST_SELECTOR.test(r.selector))
      .map((r) => ({ selector: r.selector, tracking: declaration(r.body, 'letter-spacing') }))
      .filter((d): d is { selector: string; tracking: string } => d.tracking !== null)
      .filter((d) => d.tracking !== 'normal' && !/^-?\d+px$/.test(d.tracking));

    expect(fractional).toEqual([]);
  });

  /**
   * A blurred or zero-offset text-shadow makes these pixel fonts fuzzy: depth
   * is a solid-ink hard offset that scales with the glyph. The shared recipes
   * live in `--crest-*` (src/index.css), so a crest rule should reference those
   * rather than spell out its own stack.
   */
  it.each(CREST_STYLESHEETS)('never gives crest text a blurred shadow in %s', (path) => {
    const css = readFileSync(new URL(path, import.meta.url), 'utf8');
    const blurred = rules(css)
      .filter((r) => CREST_SELECTOR.test(r.selector))
      .map((r) => ({ selector: r.selector, shadow: declaration(r.body, 'text-shadow') }))
      .filter((d): d is { selector: string; shadow: string } => d.shadow !== null)
      // A hard offset is `<x> <y> 0`; any third length above zero is a blur radius.
      .filter((d) => /-?\d+px\s+-?\d+px\s+(?!0[^.\d])/.test(d.shadow));

    expect(blurred).toEqual([]);
  });

  it('defines the shared crest recipes with no blur radius', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
    for (const token of ['--crest-shadow-sm', '--crest-shadow-md', '--crest-shadow-lg']) {
      const value = declaration(css, token);
      expect(value, `${token} is missing`).not.toBeNull();
      expect(value).toMatch(/^\d+px \d+px 0 var\(--crest-ink\)$/);
    }
  });
});
