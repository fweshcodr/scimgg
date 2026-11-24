import { vi } from 'vitest';
import type { ReplayPracticeControls } from '../../types/replayPractice';

export function makeReplayPractice(overrides: Partial<ReplayPracticeControls> = {}): ReplayPracticeControls {
  return {
    startTick: null,
    busy: false,
    message: null,
    error: null,
    retryUnavailableReason: null,
    onRetry: vi.fn(),
    onChangeStart: vi.fn(),
    startFrameIndex: null,
    practiceUnavailableReason: null,
    onStartPractice: vi.fn(),
    onClearStart: vi.fn(),
    ...overrides,
  };
}
