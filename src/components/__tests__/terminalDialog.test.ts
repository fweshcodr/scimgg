import { describe, expect, it } from 'vitest';
import { resolveTerminalDialog, type TerminalDialogInput } from '../terminalDialog';

function makeInput(overrides: Partial<TerminalDialogInput> = {}): TerminalDialogInput {
  return {
    outcomePhase: 'victory',
    playerFailed: false,
    tutorialOwned: false,
    isReplaying: false,
    hasVictoryDescriptor: true,
    ...overrides,
  };
}

describe('resolveTerminalDialog', () => {
  it('shows victory for a live, non-replay, non-tutorial victory with descriptor metadata', () => {
    expect(resolveTerminalDialog(makeInput())).toBe('victory');
  });

  it('lets player death win a same-tick mutual defeat', () => {
    const decision = resolveTerminalDialog(makeInput({ playerFailed: true }));

    expect(decision).toBe('death');
  });

  it('suppresses victory while a tutorial owns completion', () => {
    expect(resolveTerminalDialog(makeInput({ tutorialOwned: true }))).toBe('none');
  });

  it('suppresses the live victory overlay while a replay is being watched', () => {
    expect(resolveTerminalDialog(makeInput({ isReplaying: true }))).toBe('none');
  });

  it('mounts nothing for encounters without victory metadata (lobby)', () => {
    expect(resolveTerminalDialog(makeInput({ hasVictoryDescriptor: false }))).toBe('none');
  });

  it('mounts nothing before the outcome resolves to victory', () => {
    expect(resolveTerminalDialog(makeInput({ outcomePhase: 'active' }))).toBe('none');
    expect(resolveTerminalDialog(makeInput({ outcomePhase: 'resolving' }))).toBe('none');
  });

  it('shows death regardless of replay or tutorial ownership', () => {
    const decision = resolveTerminalDialog(
      makeInput({ playerFailed: true, isReplaying: true, tutorialOwned: true, hasVictoryDescriptor: false }),
    );

    expect(decision).toBe('death');
  });
});
