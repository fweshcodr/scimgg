// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type DirectorState, INITIAL_DIRECTOR_STATE } from '../../runtime/types';
import type { Tutorial, TutorialStep } from '../../types';
import { TutorialOverlay, type TutorialOverlayProps } from '../TutorialOverlay';

const step: TutorialStep = { kind: 'wait-for-event', title: 'Pray melee', body: 'b', eventName: 'prayer' };
const tutorial: Tutorial = { id: 'hints', title: 'Hints', description: 'd', surface: 'app', steps: [step] };

function renderBeam(state: Partial<DirectorState> = {}) {
  const noop = vi.fn();
  const props: TutorialOverlayProps = {
    state: { ...INITIAL_DIRECTOR_STATE, tutorial, stepIndex: 0, currentStep: step, phase: 'running', ...state },
    onNext: noop,
    onPrev: noop,
    onSkip: noop,
    onRetryCheckpoint: noop,
    onRetryStep: noop,
    onStepDemoBack: noop,
    onStepDemoForward: noop,
    onSeekDemo: noop,
    onPlayDemo: noop,
    onPauseDemo: noop,
    onWatchAgain: noop,
    demoPlayback: null,
    demoReview: null,
    onDemoTargetMissing: noop,
    onPause: noop,
    onResume: noop,
    onExit: noop,
    onBackToTraining: noop,
    onStartNextLesson: noop,
    onJumpToStep: noop,
    uiScale: 1,
  };
  return render(<TutorialOverlay {...props} />);
}

describe('TutorialOverlay beam: icon controls', () => {
  it.each(['Pause tutorial', 'Tutorial menu'])('instantly names %s on pointer hover', async (name) => {
    renderBeam();
    const button = await screen.findByRole('button', { name });
    expect(button.title).toBe('');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent(name);
  });
});
