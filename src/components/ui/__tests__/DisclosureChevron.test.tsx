// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { cssRuleBlocks } from '../../../test/helpers/cssRules';
import { DisclosureChevron } from '../DisclosureChevron';

afterEach(cleanup);

const points = (d: string) =>
  (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).reduce<[number, number][]>((out, value, index, all) => {
    if (index % 2 === 0) out.push([value, all[index + 1]]);
    return out;
  }, []);

describe('DisclosureChevron', () => {
  it('is a decorative stroked SVG, never a text glyph', () => {
    const { container } = render(<DisclosureChevron />);
    const svg = container.querySelector('svg.disclosure-chevron');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10');
    expect(svg?.querySelector('path')).toHaveAttribute('fill', 'none');
    expect(svg?.querySelector('path')).toHaveAttribute('stroke', 'currentColor');
    expect(container.textContent).toBe('');
  });

  it('marks the open state for a button-driven disclosure', () => {
    const { container, rerender } = render(<DisclosureChevron open={false} />);
    expect(container.querySelector('svg')).not.toHaveClass('is-open');
    rerender(<DisclosureChevron open />);
    expect(container.querySelector('svg')).toHaveClass('is-open');
  });

  // The open state is a CSS quarter turn; on the 10px box that lands exactly on the Wave shortcuts
  // toggle's down path, so both disclosures draw the same pixels.
  it('turns the closed path onto the open down path', () => {
    const { container } = render(<DisclosureChevron />);
    const closed = points(container.querySelector('path')?.getAttribute('d') ?? '');
    const turned = closed.map(([x, y]) => [10 - y, x]);
    const open = points('M2 3 5 6 8 3');
    expect([...turned].sort()).toEqual([...open].sort());

    const css = cssRuleBlocks(readFileSync(join(__dirname, '../DisclosureChevron.css'), 'utf8'));
    const turn = css.find((block) => /rotate\(90deg\)/.test(block.body));
    expect(turn?.selectors).toEqual(['.disclosure-chevron.is-open', 'details[open] > summary > .disclosure-chevron']);
    expect(
      css.some(
        (block) =>
          block.selectors.includes('summary:has(> .disclosure-chevron)') && /list-style:\s*none/.test(block.body),
      ),
    ).toBe(true);
  });
});
