// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { act, cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EncounterTitleCard, resolveTitleParts } from '../EncounterTitleCard';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('resolveTitleParts', () => {
  it('returns the name as hero with no subtitle when there is nothing to split', () => {
    expect(resolveTitleParts('TzKal-Zuk', null)).toEqual({
      heroName: 'TzKal-Zuk',
      subtitle: null,
    });
  });

  it('keeps unspaced hyphens in the hero name', () => {
    expect(resolveTitleParts('TzKal-Zuk', null)).toEqual({
      heroName: 'TzKal-Zuk',
      subtitle: null,
    });
  });

  it('moves a spaced-dash qualifier down to the subtitle', () => {
    expect(resolveTitleParts('Yama - Phase 3', null)).toEqual({
      heroName: 'Yama',
      subtitle: 'Phase 3',
    });
  });

  it('splits a single " · " suffix into the subtitle', () => {
    expect(resolveTitleParts('Yama · Tutorial Mode', null)).toEqual({
      heroName: 'Yama',
      subtitle: 'Tutorial Mode',
    });
  });

  it('rejoins multiple " · " suffix segments into one subtitle', () => {
    expect(resolveTitleParts('Yama · Forfeit Breath · Tutorial Mode', null)).toEqual({
      heroName: 'Yama',
      subtitle: 'Forfeit Breath · Tutorial Mode',
    });
  });

  it('combines a dash qualifier with a " · " suffix', () => {
    expect(resolveTitleParts('Yama - Phase 3 · Divine Severance', null)).toEqual({
      heroName: 'Yama',
      subtitle: 'Phase 3 · Divine Severance',
    });
  });

  it('lets an explicit subtitle win over a parsed suffix while keeping the qualifier', () => {
    expect(resolveTitleParts('Yama - Phase 3 · Divine Severance', 'Tutorial Mode')).toEqual({
      heroName: 'Yama',
      subtitle: 'Phase 3 · Tutorial Mode',
    });
  });

  it('uses the explicit subtitle when the name has no " · " suffix', () => {
    expect(resolveTitleParts('Yama - Phase 3', 'Forfeit Breath')).toEqual({
      heroName: 'Yama',
      subtitle: 'Phase 3 · Forfeit Breath',
    });
  });

  it('drops an empty-string explicit subtitle instead of rendering a blank line', () => {
    expect(resolveTitleParts('Yama · Tutorial Mode', '')).toEqual({
      heroName: 'Yama',
      subtitle: null,
    });
  });
});

describe('scene-owned arrival and countdown group', () => {
  const countdown = (key: number, releasedAtMs: number | null = null, encounterName: string | null = null) => ({
    key,
    startsAtMs: 0,
    endsAtMs: 600,
    tickCount: 1,
    tickMs: 600,
    releasedAtMs,
    encounterName,
    onFinished: () => {},
  });
  const arrival = (name: string | null, child: ReturnType<typeof countdown> | null, countdownActive: boolean) =>
    createElement(EncounterTitleCard, {
      encounterName: name,
      countdownActive,
      layoutName: 'Yama - Phase 3',
      subtitle: 'Divine Severance',
      countdown: child ?? undefined,
    });

  it('keeps all arrival data above the countdown in one layout owner', () => {
    const { container } = render(arrival('Yama - Phase 3', countdown(1), true));
    const group = container.querySelector('.encounter-arrival-content');
    const title = group?.firstElementChild;
    expect(title).toHaveClass('encounter-title-card');
    expect(title?.querySelector('.encounter-title-card-eyebrow')?.textContent).toBe('Now Entering');
    expect(title?.querySelector('.encounter-title-card-text-fill')?.textContent).toBe('Yama');
    expect(title?.querySelector('.encounter-title-card-sub')?.textContent).toBe('Phase 3 · Divine Severance');
    expect(group?.lastElementChild).toHaveClass('fight-start-countdown');
  });

  it('does not replay or remount arrival when the countdown key changes, and clears it on actual exit', () => {
    const { container, rerender } = render(arrival('Yama - Phase 3', countdown(1), true));
    const title = container.querySelector('.encounter-title-card');
    act(() => vi.advanceTimersByTime(1000));
    rerender(arrival('Yama - Phase 3', countdown(2, 1000), true));
    expect(container.querySelector('.encounter-title-card')).toBe(title);
    act(() => vi.advanceTimersByTime(600));
    expect(container.querySelector('.encounter-title-card:not(.encounter-title-card--reserved)')).toBeNull();
    rerender(arrival('Yama - Phase 3', null, false));
    expect(container.querySelector('.encounter-arrival')).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(container.querySelector('.encounter-arrival')).toBeNull();
  });

  it('holds arrival beyond the fixed 3.6s deadline and reserves the same title geometry on reset, without announcing entry', () => {
    const { container, rerender } = render(arrival('Yama - Phase 3', countdown(1), true));
    act(() => vi.advanceTimersByTime(3600));
    expect(container.querySelector('.encounter-title-card:not(.encounter-title-card--reserved)')).not.toBeNull();
    rerender(arrival(null, countdown(2, null, 'Yama'), true));
    const slot = container.querySelector('.encounter-title-card--reserved');
    expect(slot).toHaveAttribute('aria-hidden', 'true');
    expect(slot?.querySelector('.encounter-title-card-sub')?.textContent).toBe('Phase 3 · Divine Severance');
    expect(container.querySelector('.encounter-title-card-vignette')).toBeNull();
    expect(container.querySelector('.encounter-title-card--reserved')).toBe(slot);
    expect(container.querySelector('.fight-start-countdown-name')?.textContent).toBe('Yama');
    expect(container.querySelector('.encounter-title-card:not(.encounter-title-card--reserved)')).toBeNull();
    rerender(arrival(null, null, false));
    expect(container.querySelector('.encounter-arrival')).toBeNull();
  });

  it('clears the complete title and row exactly 600ms after a delayed actual release', () => {
    const { container, rerender } = render(arrival('Yama - Phase 3', countdown(1), true));
    act(() => vi.advanceTimersByTime(7000));
    expect(container.querySelector('.encounter-title-card-overlay--countdown')).not.toBeNull();
    rerender(arrival('Yama - Phase 3', countdown(1, 7000), true));
    expect(container.querySelector('.encounter-title-card-overlay--exiting')).not.toBeNull();
    expect(container.querySelector('.fight-start-countdown-numeral')?.textContent).toBe('GO');
    act(() => vi.advanceTimersByTime(599));
    expect(container.querySelector('.encounter-title-card:not(.encounter-title-card--reserved)')).not.toBeNull();
    expect(container.querySelector('.countdown-beats')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('.encounter-title-card:not(.encounter-title-card--reserved)')).toBeNull();
    expect(container.querySelector('.countdown-beats')).toBeNull();
    rerender(arrival('Yama - Phase 3', null, false));
    expect(container.querySelector('.encounter-arrival')).toBeNull();
  });

  it('keeps the original 3600ms title lifetime with no countdown', () => {
    const { container } = render(arrival('Yama - Phase 3', null, false));
    expect(container.querySelector('.encounter-title-card-overlay--countdown')).toBeNull();
    act(() => vi.advanceTimersByTime(3599));
    expect(container.querySelector('.encounter-title-card')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector('.encounter-arrival')).toBeNull();
  });

  it('keeps initial pending arrival beyond four seconds without mistaking an absent descriptor for release', () => {
    const { container, rerender } = render(arrival('Yama - Phase 3', null, true));
    const title = container.querySelector('.encounter-title-card');
    act(() => vi.advanceTimersByTime(4000));
    expect(container.querySelector('.encounter-title-card')).toBe(title);
    expect(container.querySelector('.encounter-title-card-text-fill')?.textContent).toBe('Yama');
    expect(container.querySelector('.encounter-title-card-overlay--countdown')).not.toBeNull();
    expect(container.querySelector('.encounter-title-card-overlay--exiting')).toBeNull();
    expect(container.querySelector('.fight-start-countdown')).toBeNull();
    const timed = { ...countdown(1), startsAtMs: 4100, endsAtMs: 5900, tickCount: 3 };
    act(() => vi.advanceTimersByTime(100));
    rerender(arrival('Yama - Phase 3', timed, true));
    expect(container.querySelector('.encounter-title-card')).toBe(title);
    expect(container.querySelector('.fight-start-countdown-numeral')?.textContent).toBe('3');
  });

  it('retains the same arrival through covered or tempo-rearm pending at 4000ms and resuming at 4100ms', () => {
    const { container, rerender } = render(arrival('Yama - Phase 3', countdown(1), true));
    const title = container.querySelector('.encounter-title-card');
    act(() => vi.advanceTimersByTime(4000));
    rerender(arrival('Yama - Phase 3', null, true));
    act(() => vi.advanceTimersByTime(0));
    expect(container.querySelector('.encounter-title-card')).toBe(title);
    expect(container.querySelector('.encounter-title-card-overlay--countdown')).not.toBeNull();
    expect(container.querySelector('.encounter-title-card-overlay--exiting')).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    rerender(
      arrival('Yama - Phase 3', { ...countdown(2), startsAtMs: 4100, endsAtMs: 5000, tickCount: 3, tickMs: 300 }, true),
    );
    expect(container.querySelector('.encounter-title-card')).toBe(title);
    expect(container.querySelector('.encounter-title-card-text-fill')?.textContent).toBe('Yama');
    expect(container.querySelector('.fight-start-countdown-numeral')?.textContent).toBe('3');
  });

  it.each([2000, 4000])('uses the original lifetime after explicit countdown cancellation at %ims', (atMs) => {
    const { container, rerender } = render(arrival('Yama - Phase 3', null, true));
    act(() => vi.advanceTimersByTime(atMs));
    rerender(arrival('Yama - Phase 3', null, false));
    if (atMs < 3600) {
      act(() => vi.advanceTimersByTime(3599 - atMs));
      expect(container.querySelector('.encounter-title-card')).not.toBeNull();
      act(() => vi.advanceTimersByTime(1));
    } else {
      act(() => vi.advanceTimersByTime(0));
    }
    expect(container.querySelector('.encounter-arrival')).toBeNull();
  });

  it('keeps the restart reserved slot while active but untimed, without an arrival announcement', () => {
    const { container } = render(arrival(null, null, true));
    expect(container.querySelector('.encounter-title-card--reserved')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.encounter-title-card-vignette')).toBeNull();
    expect(container.querySelector('.encounter-title-card-overlay--exiting')).toBeNull();
    expect(container.querySelector('.fight-start-countdown')).toBeNull();
  });

  it('shares the exact GO exit on the arrival ancestor without multiplying the child fade', () => {
    const css = readFileSync('src/components/EncounterTitleCard.css', 'utf8');
    const shared = css.slice(css.indexOf('.encounter-title-card-overlay--exiting {'));
    expect(shared.slice(0, shared.indexOf('}'))).toContain('fight-start-countdown-exit 400ms ease-in-out 200ms both');
    const child = css.slice(
      css.indexOf('.encounter-title-card-overlay--exiting .fight-start-countdown-content--exiting {'),
    );
    expect(child.slice(0, child.indexOf('}'))).toContain('animation: none');
    expect(css).toContain('gap: 20px');
    expect(css).toContain('gap: 12px');
  });

  it('derives compact type and title spacing from the actual scene container, not the window', () => {
    const css = readFileSync('src/components/EncounterTitleCard.css', 'utf8');
    expect(css).toContain('container-type: size');
    expect(css).toContain('container-name: encounter-arrival');
    expect(css).toContain('padding-top: clamp(40px, 8cqh, 80px)');
    expect(css).toContain('@container encounter-arrival (max-width: 720px)');
    const compact = css.slice(css.indexOf('@container encounter-arrival (max-height: 540px)'));
    expect(compact).toContain('padding-top: 48px');
    expect(compact).toContain('font-size: 32px');
    expect(compact).toContain('line-height: 32px');
    expect(compact).toContain('.encounter-arrival .fight-start-countdown-numeral');
    expect(css).toContain('visibility: hidden');
    expect(css).not.toContain('--crest-floating-top');
    expect(css).not.toContain('@media (max-width:');
  });

  it.each([
    { width: 720, height: 541, matching: ['width'] },
    { width: 721, height: 541, matching: [] },
    { width: 721, height: 540, matching: ['height'] },
    { width: 720, height: 540, matching: ['width', 'height'] },
    // Fixed 1x remains compact inside a wider desktop window; a 2x scene does not.
    { width: 512, height: 334, matching: ['width', 'height'] },
    { width: 512, height: 476, matching: ['width', 'height'] },
    { width: 1024, height: 668, matching: [] },
  ])('uses inclusive scene boundaries at $width × $height', ({ width, height, matching }) => {
    const css = readFileSync('src/components/EncounterTitleCard.css', 'utf8');
    const queries = [...css.matchAll(/@container encounter-arrival \(max-(width|height):\s*(\d+)px\)/g)].map(
      ([, axis, px]) => ({ axis, limit: Number(px) }),
    );
    expect(queries).toEqual([
      { axis: 'width', limit: 720 },
      { axis: 'height', limit: 540 },
    ]);
    expect(
      queries.filter(({ axis, limit }) => (axis === 'width' ? width : height) <= limit).map(({ axis }) => axis),
    ).toEqual(matching);
  });
});
