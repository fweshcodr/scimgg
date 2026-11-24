import { describe, expect, it } from 'vitest';
import { PrayerType } from '../../../types/simulation';
import { clickPrayer, clickSelector, openPanelTab } from '../cursorChoreography';

describe('cursorChoreography authoring helpers', () => {
  it('openPanelTab builds a clicking panel-tab cue, tick number -> tick time', () => {
    const cue = openPanelTab('prayer', 1, { label: 'Open the prayer book' });
    expect(cue.target).toEqual({ kind: 'panel-tab', tab: 'prayer' });
    expect(cue.time).toEqual({ kind: 'tick', tick: 1 });
    expect(cue.click).toBe(true);
    expect(cue.label).toBe('Open the prayer book');
  });

  it('clickPrayer builds a clicking prayer cue', () => {
    const cue = clickPrayer(PrayerType.ProtectMagic, 4, { label: 'Pray Magic' });
    expect(cue.target).toEqual({ kind: 'prayer', prayer: 'ProtectMagic' });
    expect(cue.time).toEqual({ kind: 'tick', tick: 4 });
    expect(cue.click).toBe(true);
  });

  it('clickSelector builds a clicking selector cue', () => {
    const cue = clickSelector('#thing', { kind: 'ms', ms: 800 });
    expect(cue.target).toEqual({ kind: 'selector', selector: '#thing' });
    expect(cue.time).toEqual({ kind: 'ms', ms: 800 });
  });

  it('passes through an explicit DemoCursorTime and opts overrides', () => {
    const cue = clickPrayer(
      PrayerType.ProtectRange,
      { kind: 'tick', tick: 2, offsetMs: 150 },
      {
        click: false,
        moveMs: 300,
        required: false,
      },
    );
    expect(cue.time).toEqual({ kind: 'tick', tick: 2, offsetMs: 150 });
    expect(cue.click).toBe(false);
    expect(cue.moveMs).toBe(300);
    expect(cue.required).toBe(false);
  });
});
