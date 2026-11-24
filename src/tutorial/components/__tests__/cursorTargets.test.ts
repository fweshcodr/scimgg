// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { isSyntheticInput } from '../../../input/inputProvenance';
import { PrayerType } from '../../../types/simulation';
import { dispatchSyntheticClick, resolveCursorElement } from '../cursorTargets';

describe('resolveCursorElement', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves a panel-tab to its [data-tab] button', () => {
    document.body.innerHTML = '<button data-tab="prayer">P</button>';
    const el = resolveCursorElement({ kind: 'panel-tab', tab: 'prayer' });
    expect(el).toBe(document.querySelector('[data-tab="prayer"]'));
  });

  it('resolves a prayer to its [data-prayer] button', () => {
    document.body.innerHTML = '<button data-prayer="ProtectMagic">M</button>';
    const el = resolveCursorElement({ kind: 'prayer', prayer: PrayerType.ProtectMagic });
    expect(el?.getAttribute('data-prayer')).toBe('ProtectMagic');
  });

  it('resolves an arbitrary selector', () => {
    document.body.innerHTML = '<div id="x"></div>';
    expect(resolveCursorElement({ kind: 'selector', selector: '#x' })?.id).toBe('x');
  });

  it('returns null for a missing element', () => {
    expect(resolveCursorElement({ kind: 'selector', selector: '#nope' })).toBeNull();
  });
});

describe('dispatchSyntheticClick', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('fires a real mousedown on the element with the synthetic-input guard active', () => {
    document.body.innerHTML = '<button id="b">x</button>';
    const btn = document.getElementById('b') as HTMLElement;
    let sawMousedown = false;
    let guardActive = false;
    btn.addEventListener('mousedown', () => {
      sawMousedown = true;
      guardActive = isSyntheticInput();
    });

    expect(isSyntheticInput()).toBe(false);
    dispatchSyntheticClick(btn);

    // mousedown is the load-bearing event (prayers toggle on it).
    expect(sawMousedown).toBe(true);
    expect(guardActive).toBe(true);
    expect(isSyntheticInput()).toBe(false);
  });
});
