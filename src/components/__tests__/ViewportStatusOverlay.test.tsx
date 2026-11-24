// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderStatus } from '../../render/core/renderer';
import { cssRuleBlocks } from '../../test/helpers/cssRules';
import { VIEWPORT_STATUS_RECOVERING_DELAY_MS, ViewportStatusOverlay } from '../ViewportStatusOverlay';

const css = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const overlayCss = css('src/components/ViewportStatusOverlay.css');
const noticeCss = css('src/components/ui/SystemNotice.css');

const ruleBody = (selector: string, sheet = overlayCss): string => {
  const bodies = cssRuleBlocks(sheet)
    .filter((block) => block.selectors.includes(selector))
    .map((block) => block.body);
  expect(bodies.length, `${selector} not found`).toBeGreaterThan(0);
  return bodies.join('\n');
};

const FAILED_REASONS = ['context-restore', 'context-timeout', 'render-loop'] as const;

describe('ViewportStatusOverlay', () => {
  it('shows nothing while the renderer is drawing', () => {
    const { container } = render(<ViewportStatusOverlay status={{ kind: 'ok' }} />);
    expect(container.firstChild).toBeNull();
  });

  describe('a lost context', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it.each(['lost', 'restoring'] as const)('rides out a brief %s blip before saying anything', (kind) => {
      const { container, rerender } = render(
        <ViewportStatusOverlay status={{ kind }} recoveringDelayMs={VIEWPORT_STATUS_RECOVERING_DELAY_MS} />,
      );
      act(() => void vi.advanceTimersByTime(VIEWPORT_STATUS_RECOVERING_DELAY_MS - 1));
      expect(container.firstChild).toBeNull();

      rerender(<ViewportStatusOverlay status={{ kind: 'ok' }} />);
      act(() => void vi.advanceTimersByTime(VIEWPORT_STATUS_RECOVERING_DELAY_MS));
      expect(container.firstChild).toBeNull();
    });

    it('explains the wait once it lasts, as the family strip with no action', () => {
      const { container, rerender } = render(<ViewportStatusOverlay status={{ kind: 'lost' }} />);
      act(() => void vi.advanceTimersByTime(VIEWPORT_STATUS_RECOVERING_DELAY_MS));

      const strip = screen.getByRole('status');
      expect(strip.textContent).toBe('Restoring the 3D view');
      // Waiting is not a failure: the strip takes the progress rung, never the blocked one.
      expect(strip).toHaveClass('sys-notice', 'sys-notice--strip', 'sys-notice--progress');
      expect(container.querySelector('[data-render-status="lost"]')).not.toBeNull();
      expect(screen.queryByRole('button')).toBeNull();

      // `lost` → `restoring` is the same episode continuing, so the strip stays up rather than
      // restarting the wait, and it clears the moment the view is back.
      rerender(<ViewportStatusOverlay status={{ kind: 'restoring' }} />);
      expect(screen.getByRole('status').textContent).toBe('Restoring the 3D view');
      rerender(<ViewportStatusOverlay status={{ kind: 'ok' }} />);
      expect(container.firstChild).toBeNull();
    });
  });

  it.each(FAILED_REASONS)('offers a reload when the renderer gives up (%s)', (reason) => {
    const onReload = vi.fn();
    const { container } = render(<ViewportStatusOverlay status={{ kind: 'failed', reason }} onReload={onReload} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('sys-notice', 'sys-notice--blocked');
    expect(alert.textContent).toContain('The 3D view stopped');
    expect(alert.textContent).toContain('It may still come back on its own.');
    expect(container.querySelector(`[data-render-status="failed-${reason}"]`)).not.toBeNull();

    screen.getByRole('button', { name: 'Reload page' }).click();
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  // The hold is a fact about the session, so it takes the family's quieter detail line rather than
  // trailing the instruction; with nothing held there is no line at all.
  it.each([
    ['fight' as const, 'The fight is paused.'],
    ['replay' as const, 'Replay playback is paused.'],
  ])('names what the %s hold paused, on its own line', (heldActivity, sentence) => {
    const { container } = render(
      <ViewportStatusOverlay status={{ kind: 'failed', reason: 'render-loop' }} heldActivity={heldActivity} />,
    );
    expect(container.querySelector('.sys-notice__detail')?.textContent).toBe(sentence);
    expect(container.querySelector('.sys-notice__text')?.textContent).not.toContain('paused');
  });

  it.each([undefined, null])('says nothing about a hold when there is none (%s)', (heldActivity) => {
    const { container } = render(
      <ViewportStatusOverlay status={{ kind: 'failed', reason: 'render-loop' }} heldActivity={heldActivity} />,
    );
    expect(container.querySelector('.sys-notice__detail')).toBeNull();
    expect(screen.getByRole('alert').textContent).not.toContain('paused');
  });

  // A context the browser will not give is not a context a reload produces, so this state carries
  // what to try instead of an action that cannot work.
  it('offers guidance, not a reload, when the context is unsupported', () => {
    const { container } = render(<ViewportStatusOverlay status={{ kind: 'failed', reason: 'unsupported' }} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('sys-notice', 'sys-notice--blocked');
    expect(alert.textContent).toContain('3D graphics unavailable');
    expect(container.querySelectorAll('.sys-notice__step').length).toBeGreaterThan(1);
    expect(screen.queryByRole('button', { name: 'Reload page' })).toBeNull();
  });

  it('covers the rectangle it is given rather than the whole frame', () => {
    const { container } = render(
      <ViewportStatusOverlay
        status={{ kind: 'failed', reason: 'render-loop' }}
        rect={{ top: 4, left: 8, width: 300, height: 200 }}
      />,
    );
    const layer = container.querySelector<HTMLElement>('.viewport-status');
    expect([layer?.style.top, layer?.style.left, layer?.style.width, layer?.style.height]).toEqual([
      '4px',
      '8px',
      '300px',
      '200px',
    ]);
  });

  describe('a box taller than it is wide', () => {
    it('becomes a banner on the top edge, keeping the title, the reason and the action', () => {
      const { container } = render(
        <ViewportStatusOverlay status={{ kind: 'failed', reason: 'render-loop' }} portrait heldActivity="fight" />,
      );
      const layer = container.querySelector('.viewport-status');
      expect(layer).toHaveClass('viewport-status--portrait');
      expect(layer).toHaveAttribute('data-portrait', 'true');
      expect(screen.getByRole('alert')).toHaveClass('sys-notice--banner');
      expect(container.querySelector('.sys-notice__title')).not.toBeNull();
      expect(container.querySelector('.sys-notice__text')).not.toBeNull();
      expect(container.querySelector('.sys-notice__detail')).not.toBeNull();
      expect(screen.getByRole('button', { name: 'Reload page' })).toBeDefined();
    });

    it('top-aligns the recovering strip the same way', () => {
      vi.useFakeTimers();
      try {
        const { container } = render(<ViewportStatusOverlay status={{ kind: 'lost' }} portrait />);
        act(() => void vi.advanceTimersByTime(VIEWPORT_STATUS_RECOVERING_DELAY_MS));
        expect(container.querySelector('.viewport-status')).toHaveClass('viewport-status--portrait');
        expect(screen.getByRole('status').textContent).toBe('Restoring the 3D view');
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the centered card when the box is not taller than it is wide', () => {
      const { container } = render(<ViewportStatusOverlay status={{ kind: 'failed', reason: 'render-loop' }} />);
      expect(container.querySelector('.viewport-status')).not.toHaveClass('viewport-status--portrait');
      expect(screen.getByRole('alert')).toHaveClass('sys-notice--card');
    });

    it('is laid out as a top banner, not a centered card', () => {
      const banner = ruleBody('.viewport-status--portrait');
      expect(banner).toContain('align-items: flex-start;');
      expect(banner).toMatch(/padding-block-start:\s*calc\(12px \+ var\(--safe-top, 0px\)\);/);
      expect(ruleBody('.viewport-status--portrait .viewport-status__notice')).toMatch(/max-width:\s*560px;/);
      expect(ruleBody('.sys-notice--banner', noticeCss)).toMatch(/padding:\s*12px;/);
      // Beside the text while there is room, under it once the content hits its basis.
      expect(ruleBody('.sys-notice--banner .sys-notice__body', noticeCss)).toContain('flex-wrap: wrap;');
      expect(ruleBody('.sys-notice--banner .sys-notice__content', noticeCss)).toMatch(/flex:\s*1 1 240px;/);
      // A finger's target.
      expect(ruleBody('.viewport-status--portrait .viewport-status__reload')).toMatch(/min-height:\s*44px;/);
    });

    // The Mobile layout's corner stones are fixed at z 67, outside this frame's stacking, so the
    // banner goes beside them rather than under them.
    it('leaves the Mobile layout its top-left corner', () => {
      expect(ruleBody('.viewport-status--portrait.viewport-status--corner')).toMatch(
        /padding-inline-start:\s*calc\(96px \+ max\(12px, var\(--safe-left, 0px\)\)\);/,
      );
    });

    // iOS 15.0 has no `:has()`, so the reservation cannot be sniffed from the stones' presence:
    // it would silently not apply on the one platform that needs it most.
    it('takes the reservation from a class, never from :has()', () => {
      const { container, rerender } = render(
        <ViewportStatusOverlay status={{ kind: 'failed', reason: 'render-loop' }} portrait cornerOccupied />,
      );
      expect(container.querySelector('.viewport-status')).toHaveClass('viewport-status--corner');

      rerender(<ViewportStatusOverlay status={{ kind: 'failed', reason: 'render-loop' }} portrait />);
      expect(container.querySelector('.viewport-status')).not.toHaveClass('viewport-status--corner');

      // Landscape has no top edge to share, so the reservation never applies there.
      rerender(<ViewportStatusOverlay status={{ kind: 'failed', reason: 'render-loop' }} cornerOccupied />);
      expect(container.querySelector('.viewport-status')).not.toHaveClass('viewport-status--corner');

      // The comment above the rule names `:has()` as the thing it is avoiding, so check selectors.
      expect(
        cssRuleBlocks(overlayCss)
          .flatMap((block) => block.selectors)
          .join(' '),
      ).not.toContain(':has(');
    });
  });

  describe('its layer', () => {
    const zIndexOf = (selector: string) => Number(/z-index:\s*(\d+)/.exec(ruleBody(selector))?.[1]);

    // Grid's ladder: the scene is 0, Fixed's bezels 5, and ONE container at 20 holds every
    // readout, the Mobile side panel included. That panel covers the middle of the scene, so a
    // notice inside it was invisible on iPad and iPhone portrait, the state it exists to explain.
    // Above it, and below the Alt overlap guide at 25 and the replay stack at 30.
    it('clears the readouts that would otherwise hide it, and stops below the replay stack', () => {
      expect(zIndexOf('.viewport-status')).toBeGreaterThan(20);
      expect(zIndexOf('.viewport-status')).toBeLessThan(25);
    });

    // The layer is a hole so the scene and the panels around the notice stay usable, but the
    // opaque notice in it takes its own presses: a press passing through opaque text would land
    // on an inventory slot the player cannot see.
    it('is a hole, except for the opaque notice in it', () => {
      expect(ruleBody('.viewport-status')).toContain('pointer-events: none;');
      expect(ruleBody('.viewport-status .sys-notice')).toContain('pointer-events: auto;');
    });

    // Over a dead scene the notice is the raised thing; the browser support screen sets the
    // inset fill instead. Both are opaque, which is what the text needs.
    it('paints the chrome fill over the scene', () => {
      expect(ruleBody('.viewport-status .sys-notice')).toContain('--notice-fill: var(--color-bg-solid);');
    });
  });
});

// A compile-time check that every failure reason has a shown state: adding one to RenderStatus
// without deciding what the player sees should not pass silently.
const _exhaustive: Record<Extract<RenderStatus, { kind: 'failed' }>['reason'], true> = {
  'context-restore': true,
  'context-timeout': true,
  'render-loop': true,
  unsupported: true,
};
void _exhaustive;
