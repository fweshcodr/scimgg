// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cssRuleBlocks, withoutCssComments } from '../../../test/helpers/cssRules';
import { SystemNotice, type SystemNoticeTone } from '../SystemNotice';

const noticeCss = readFileSync(join(process.cwd(), 'src/components/ui/SystemNotice.css'), 'utf8');

const ruleBody = (selector: string): string => {
  const bodies = cssRuleBlocks(noticeCss)
    .filter((block) => block.selectors.includes(selector))
    .map((block) => block.body);
  expect(bodies.length, `${selector} not found`).toBeGreaterThan(0);
  return bodies.join('\n');
};

const TONES: readonly SystemNoticeTone[] = ['progress', 'caution', 'blocked'];

describe('SystemNotice', () => {
  it('lays every part out in one order: mark, title, body, detail, steps, actions, note', () => {
    const { container } = render(
      <SystemNotice
        tone="blocked"
        title="Title"
        body="Body"
        detail="Detail"
        steps={['First', 'Second']}
        action={<button type="button">Act</button>}
        links={<a href="https://example.com">Link</a>}
        note="Aside"
      />,
    );

    expect(container.querySelector('.sys-notice__icon')).not.toBeNull();
    expect(container.querySelector('.sys-notice__title')?.textContent).toBe('Title');
    expect(container.querySelector('.sys-notice__text')?.textContent).toBe('Body');
    expect(container.querySelector('.sys-notice__detail')?.textContent).toBe('Detail');
    expect([...container.querySelectorAll('.sys-notice__step')].map((n) => n.textContent)).toEqual(['First', 'Second']);
    // The action and its secondary links share one row, so they wrap together.
    const actions = container.querySelector('.sys-notice__actions');
    expect(actions?.contains(screen.getByRole('button', { name: 'Act' }))).toBe(true);
    expect(actions?.contains(screen.getByRole('link', { name: 'Link' }))).toBe(true);
    // The aside comes after what to do, never before it.
    const parts = [...container.querySelectorAll('.sys-notice__content, .sys-notice__actions, .sys-notice__note')];
    expect(parts.map((n) => n.className)).toEqual(['sys-notice__content', 'sys-notice__actions', 'sys-notice__note']);
    expect(container.querySelector('.sys-notice__note')?.textContent).toBe('Aside');
  });

  it('leaves out every part it was given nothing for', () => {
    const { container } = render(<SystemNotice tone="caution" title="Only a title" />);
    for (const part of ['__text', '__detail', '__steps', '__actions', '__note'] as const) {
      expect(container.querySelector(`.sys-notice${part}`), part).toBeNull();
    }
  });

  // `text-muted` is already the last ink that holds 4.5:1 on these fills, so the aside steps down
  // by being ruled off and set apart rather than by going darker.
  it('rules the aside off from the advice above it', () => {
    const note = ruleBody('.sys-notice__note');
    expect(note).toContain('border-top: 1px solid var(--color-border);');
    expect(note).toContain('color: var(--color-text-muted);');
    expect(note).toContain('"RuneScape Plain 11"');
  });

  it('is one line with a pulse and no mark as a strip', () => {
    const { container } = render(<SystemNotice tone="progress" layout="strip" title="Working" role="status" />);
    const strip = screen.getByRole('status');
    expect(strip).toHaveClass('sys-notice--strip', 'sys-notice--progress');
    expect(strip.textContent).toBe('Working');
    expect(container.querySelector('.sys-notice__pulse')).not.toBeNull();
    expect(container.querySelector('.sys-notice__icon')).toBeNull();
  });

  it.each(TONES)('carries its severity in the class, not the markup (%s)', (tone) => {
    const { container } = render(<SystemNotice tone={tone} title="Title" body="Body" />);
    expect(container.querySelector('.sys-notice')).toHaveClass(`sys-notice--${tone}`);
    // One drawn mark for the family: severity never changes the silhouette.
    expect(container.querySelectorAll('svg.sys-notice__icon')).toHaveLength(1);
  });

  describe('the family contract', () => {
    // Severity is the mark and the hairline. A tinted title would be a third signal for the same
    // fact, and `--color-heading` is the most legible ink the palette has.
    it('never tints the title', () => {
      expect(ruleBody('.sys-notice__title')).toContain('color: var(--color-heading);');
      for (const tone of TONES) {
        expect(withoutCssComments(noticeCss)).not.toMatch(
          new RegExp(
            `\\.sys-notice--${tone}[^{]*\\.sys-notice__title\\s*\\{[^}]*color:\\s*var\\(--color-(error|warning)\\)`,
          ),
        );
      }
    });

    it('keeps red for the rung that is actually blocked', () => {
      expect(ruleBody('.sys-notice--blocked')).toContain('--notice-mark: var(--color-error);');
      expect(ruleBody('.sys-notice--caution')).toContain('--notice-mark: var(--color-warning);');
      expect(ruleBody('.sys-notice--progress')).toContain('--notice-mark: var(--color-warning);');
    });

    // `color-mix` arrived in Safari 16.2 and the app supports iOS 15.0. A declaration pair cannot
    // carry the fallback here: `color-mix` inside `var()` parses, then fails at computed-value
    // time, which drops the whole border instead of falling back. So it is gated on `@supports`,
    // and everything it decorates has a plain value outside the gate.
    it('gates every color-mix on @supports, leaving a plain hairline without it', () => {
      const css = withoutCssComments(noticeCss);
      const start = css.indexOf('@supports');
      expect(start, 'no @supports gate').toBeGreaterThan(-1);
      let depth = 0;
      let end = start;
      for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) {
          end = i;
          break;
        }
      }
      const gate = css.slice(start, end + 1);
      const outside = css.slice(0, start) + css.slice(end + 1);

      // Literal colors: the question is whether color-mix works at all, not whether a token does.
      expect(gate.slice(0, gate.indexOf('{'))).toBe('@supports (border-color: color-mix(in srgb, red, black)) ');
      // The tints and the animation that needs them live inside it...
      expect(gate).toContain('border-color: color-mix(in srgb, var(--color-warning) 35%, var(--color-border));');
      expect(gate).toContain('border-color: color-mix(in srgb, var(--color-error) 40%, var(--color-border));');
      expect(gate).toMatch(/\.sys-notice__pulse\s*\{\s*animation:\s*sys-notice-pulse/);
      // ...and the only color-mix left outside is the keyframe the gate's animation refers to.
      expect(outside.replace(/@keyframes sys-notice-pulse\s*\{[\s\S]*?\n\}/, '')).not.toContain('color-mix(');
      // (`animation: none` for reduced motion stays outside: it is a reset, not the animation.)
      expect(outside).not.toMatch(/\.sys-notice__pulse\s*\{[^}]*animation:\s*sys-notice-pulse/);
      // Without the gate the hairline is the plain one from the base rule.
      expect(ruleBody('.sys-notice')).toContain('border: 1px solid var(--color-border);');
      expect(outside).not.toContain('border-color:');
    });

    it('is opaque, shadow-free and set on the native pixel-font em', () => {
      const base = ruleBody('.sys-notice');
      expect(base).toContain('background-color: var(--notice-fill, var(--color-bg-solid));');
      expect(withoutCssComments(noticeCss)).not.toMatch(/box-shadow/);
      expect(withoutCssComments(noticeCss)).not.toMatch(/backdrop-filter|will-change|opacity\s*:/);
      for (const selector of ['.sys-notice__title', '.sys-notice__text', '.sys-notice__detail'] as const) {
        expect(ruleBody(selector), selector).toMatch(/font-size:\s*16px;/);
        expect(ruleBody(selector), selector).toMatch(/line-height:\s*20px;/);
      }
      // The smaller step comes from the face, not from an off-grid size.
      expect(ruleBody('.sys-notice__step')).toContain('"RuneScape Plain 11"');
      expect(ruleBody('.sys-notice__step')).toMatch(/font-size:\s*16px;/);
    });

    it('holds the pulse still for a reduced-motion reader', () => {
      const reduced = cssRuleBlocks(noticeCss).find(
        (block) => block.selectors.includes('.sys-notice__pulse') && block.body.includes('animation: none'),
      );
      expect(reduced, 'no prefers-reduced-motion override for the pulse').toBeDefined();
    });
  });
});
