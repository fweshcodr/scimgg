import { describe, expect, it } from 'vitest';
import { freshReplayCapture } from '../../replay/format/capture';
import { ReplayCaptureBudget } from '../ReplayCaptureBudget';

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const empty = {
  cursorSamples: [],
  viewportSamples: [],
  cursorClicks: [],
  menuEvents: [],
  presentationSamples: [],
  modifierSamples: [],
  overlays: null,
};

describe('ReplayCaptureBudget UTF8 accounting', () => {
  it('accepts the exact UTF8 limit and rejects one additional retained entry', () => {
    const value = { tMs: 0, label: '\u732b\ud83d\ude00' };
    const limit = bytes({ ...empty, menuEvents: [value] });
    const budget = new ReplayCaptureBudget({ ancillaryBytes: limit });

    const accepted = budget.accept('menuEvents', { tMs: 0, value });
    const exceeded = budget.accept('menuEvents', { tMs: 1, value: { tMs: 1 } });

    expect(accepted).toBe(true);
    expect(exceeded).toBe(false);
    expect(budget.getStats().ancillaryBytes).toBe(limit);
    expect(budget.getCapture().menuEvents).toEqual({ provenance: 'bounded-v1', stoppedAtMs: 1, reason: 'byte-limit' });
  });

  it('accounts replacements, commas, removals and overlay snapshots exactly', () => {
    const budget = new ReplayCaptureBudget();
    const first = { tMs: 0, mask: 1 };
    const second = { tMs: 10, mask: 2 };
    const replacement = { tMs: 10, mask: 12 };
    const overlays = { label: '\ud83d\ude00' };
    budget.reset({ modifierSamples: [first, second], overlays });

    budget.accept('modifierSamples', { tMs: 10, value: replacement, previous: second });
    budget.remove('modifierSamples', replacement);

    expect(budget.getStats().ancillaryBytes).toBe(bytes({ ...empty, modifierSamples: [first], overlays }));
    expect(budget.getStats().counts.modifierSamples).toBe(1);
  });

  it('keeps a track stopped even after a sibling removal frees byte capacity', () => {
    const value = { tMs: 0, mask: 1 };
    const budget = new ReplayCaptureBudget({ ancillaryBytes: bytes({ ...empty, modifierSamples: [value] }) });
    budget.accept('modifierSamples', { tMs: 0, value });
    budget.accept('menuEvents', { tMs: 1, value: { tMs: 1 } });
    budget.remove('modifierSamples', value);

    const accepted = budget.accept('menuEvents', { tMs: 2, value: {} });

    expect(accepted).toBe(false);
    expect(budget.getCapture().menuEvents.stoppedAtMs).toBe(1);
    expect(budget.getStats().ancillaryBytes).toBe(bytes(empty));
  });

  it('rejects a larger replacement without changing retained counts or bytes', () => {
    const previous = { tMs: 0, mask: 1 };
    const limit = bytes({ ...empty, modifierSamples: [previous] });
    const budget = new ReplayCaptureBudget({ ancillaryBytes: limit });
    budget.reset({ modifierSamples: [previous] }, freshReplayCapture());

    const accepted = budget.accept('modifierSamples', { tMs: 0, value: { tMs: 0, mask: 15 }, previous });

    expect(accepted).toBe(false);
    expect(budget.getStats().ancillaryBytes).toBe(limit);
    expect(budget.getStats().counts.modifierSamples).toBe(1);
  });
});
