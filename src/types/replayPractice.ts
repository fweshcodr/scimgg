export interface ReplayPracticeControls {
  readonly startTick: number | null;
  readonly startFrameIndex: number | null;
  readonly busy: boolean;
  readonly message: string | null;
  readonly error: string | null;
  readonly retryUnavailableReason: string | null;
  readonly practiceUnavailableReason: string | null;
  readonly onRetry: () => void;
  readonly onChangeStart: () => void;
  readonly onClearStart: () => void;
  readonly onStartPractice: () => Promise<void>;
}
