// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, EventAudioPlayer, FrameSoundTracker } from '../../audio';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../core/constants';
import type { ReplayChapterSet } from '../../core/replayTimeline';
import { SimulationEngine } from '../../core/SimulationEngine';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import { useAppHotkeys } from '../../hooks/useAppHotkeys';
import { useSimulationWiring } from '../../hooks/useSimulationWiring';
import { __resetKeyStateForTest } from '../../input/keyState';
import { freshReplayCapture } from '../../replay/format/capture';
import { createEmptyCombatSupplies } from '../../types/encounterLoadout';
import { createEmptyInventory } from '../../types/inventory';
import { DEFAULT_PLAYER_CONFIG } from '../../types/player';
import { DEFAULT_MECHANICS_CONFIG } from '../../types/simulation';
import { animationFrames } from '../../util/animationFrames';
import { prayerFlickTimeline } from '../prayerFlickTimeline';
import { ReplayControls } from '../ReplayControls';
import { makeReplayPractice } from './ReplayPractice.fixtures';

const replayControlsCss = readFileSync(join(process.cwd(), 'src/components/ReplayControls.css'), 'utf8');

const tooltipMocks = vi.hoisted(() => ({
  moveClientX: undefined as number | undefined,
  boundContents: [] as unknown[],
  onMouseEnter: vi.fn(),
  onMouseLeave: vi.fn(),
  onMouseMove: vi.fn((event?: { clientX: number }) => {
    tooltipMocks.moveClientX = event?.clientX;
  }),
  hideTooltip: vi.fn(),
}));

vi.mock('../Tooltip', () => ({
  useTooltip: () => ({
    bindTooltip: (content: unknown) => ({
      ...(tooltipMocks.boundContents.push(content) ? {} : {}),
      'data-tooltip-bound': 'true',
      onMouseEnter: tooltipMocks.onMouseEnter,
      onMouseLeave: tooltipMocks.onMouseLeave,
      onMouseMove: tooltipMocks.onMouseMove,
    }),
    hideTooltip: tooltipMocks.hideTooltip,
  }),
}));

function makeProps(
  overrides: Partial<ComponentProps<typeof ReplayControls>> = {},
): ComponentProps<typeof ReplayControls> {
  return {
    compact: false,
    replayFrameIndex: 4,
    totalFrames: 12,
    onExitReplay: vi.fn(),
    onStepBack: vi.fn(),
    onStepForward: vi.fn(),
    onJumpToStart: vi.fn(),
    onJumpToEnd: vi.fn(),
    onSeek: vi.fn(),
    onPreviewSeek: vi.fn(),
    onPlayPause: vi.fn(),
    isPlaying: false,
    onTakeOver: vi.fn(),
    replayCursorVisible: true,
    onReplayCursorVisibleChange: vi.fn(),
    ...overrides,
  };
}

describe('ReplayControls', () => {
  it('offers both direct actions and an inline tick field, without a setup mode', () => {
    render(<ReplayControls {...makeProps({ replayPractice: makeReplayPractice() })} />);
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('5');
    expect(screen.getByRole('button', { name: 'Take over' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Practice' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Start practice' })).toBeNull();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it.each(['Practice', 'Take over'])('%s synchronously seeks and invokes only its own action', (name) => {
    const order: string[] = [];
    const controls = makeReplayPractice({
      onStartPractice: vi.fn(async () => {
        order.push('practice');
      }),
    });
    const onTakeOver = vi.fn(() => order.push('takeover'));
    render(
      <ReplayControls
        {...makeProps({
          replayPractice: controls,
          onSeek: vi.fn((index: number) => order.push(`seek:${index}`)),
          onTakeOver,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name }));
    expect(order).toEqual(['seek:4', name === 'Take over' ? 'takeover' : 'practice']);
    expect(controls.onStartPractice).toHaveBeenCalledTimes(name === 'Practice' ? 1 : 0);
    expect(onTakeOver).toHaveBeenCalledTimes(name === 'Take over' ? 1 : 0);
  });

  it.each(['Practice', 'Take over'])('preserves an untouched duplicate-tick frame for %s', (name) => {
    const onSeek = vi.fn();
    render(
      <ReplayControls
        {...makeProps({
          frameTicks: [0, 0, 1],
          totalFrames: 3,
          replayFrameIndex: 1,
          onSeek,
          replayPractice: makeReplayPractice(),
        })}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name }));
    expect(onSeek).toHaveBeenCalledExactlyOnceWith(1);
  });

  it.each([
    'Practice',
    'Take over',
  ])('preserves the pending duplicate-tick scrub index for %s before props catch up', (name) => {
    const onSeek = vi.fn();
    render(
      <ReplayControls
        {...makeProps({
          frameTicks: [0, 0, 1],
          totalFrames: 3,
          replayFrameIndex: 0,
          onSeek,
          replayPractice: makeReplayPractice(),
        })}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Seek replay' });
    fireEvent.change(slider, { target: { value: '1' } });
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('0');
    act(() => {
      fireEvent.pointerUp(slider);
      fireEvent.click(screen.getByRole('button', { name }));
    });
    expect(onSeek.mock.calls.map(([index]) => index)).toEqual([1, 1]);
  });

  it.each([
    'Practice',
    'Take over',
  ])('uses the newest scrub intent for %s even before its local render commits', (name) => {
    const onSeek = vi.fn();
    render(
      <ReplayControls
        {...makeProps({
          replayFrameIndex: 9,
          frameTicks: Array.from({ length: 12 }, (_, tick) => tick),
          onSeek,
          replayPractice: makeReplayPractice(),
        })}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Seek replay' });
    act(() => {
      fireEvent.change(slider, { target: { value: '8' } });
      fireEvent.pointerUp(slider);
      fireEvent.click(screen.getByRole('button', { name }));
    });
    expect(onSeek.mock.calls.map(([index]) => index)).toEqual([8, 8]);
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('8');
  });

  it.each([
    [10, 8, 9, true],
    [6, 8, 7, false],
  ] as const)('bases the warning on scrub %s→%s relative to point %s', (initial, scrubbed, point, warned) => {
    render(
      <ReplayControls
        {...makeProps({
          replayFrameIndex: initial,
          frameTicks: Array.from({ length: 12 }, (_, tick) => tick),
          replayPractice: makeReplayPractice({ startTick: point, startFrameIndex: point }),
        })}
      />,
    );
    fireEvent.change(screen.getByRole('slider', { name: 'Seek replay' }), { target: { value: String(scrubbed) } });
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue(String(scrubbed));
    expect(screen.queryByText(`Clears restart tick ${point}`) !== null).toBe(warned);
  });

  it('keeps only the labeled exact-index nub with More closed, without a saved-point row or Clear', () => {
    const controls = makeReplayPractice({ startTick: 40, startFrameIndex: 1 });
    const onSeek = vi.fn();
    const { container } = render(
      <ReplayControls
        {...makeProps({
          compact: true,
          frameTicks: [40, 40, 41],
          totalFrames: 3,
          replayFrameIndex: 2,
          replayPractice: controls,
          onSeek,
        })}
      />,
    );
    expect(screen.getByRole('img', { name: 'Restart: tick 40' })).toBeInTheDocument();
    expect(container.querySelector('.replay-status-row')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear restart point' })).toBeNull();
    expect(screen.getByRole('button', { name: 'More replay actions' })).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector<HTMLElement>('.replay-restart-mark')?.style.getPropertyValue('--at')).toBe('0.5');
    expect(controls.onClearStart).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('keeps a point that sits just after a freshly forked tail on the track, labeled by its chosen tick', () => {
    // Practicing tick 8 forks at frame 7, so the branch holds frames 0–7 until tick 8 runs again.
    const { container } = render(
      <ReplayControls
        {...makeProps({
          frameTicks: Array.from({ length: 8 }, (_, tick) => tick),
          totalFrames: 8,
          replayFrameIndex: 7,
          replayPractice: makeReplayPractice({ startTick: 8, startFrameIndex: 8 }),
        })}
      />,
    );
    expect(screen.getByRole('img', { name: 'Restart: tick 8' })).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>('.replay-restart-mark')?.style.getPropertyValue('--at')).toBe('1');
    // Taking over tick 7 forks at 6, before the point's anchor 7, so it would clear the point.
    expect(screen.getByText('Clears restart tick 8')).toBeInTheDocument();
  });

  it('warns before an earlier branch by index, even with equal tick numbers', () => {
    const props = makeProps({
      compact: true,
      frameTicks: [0, 0, 1],
      totalFrames: 3,
      replayFrameIndex: 0,
      replayPractice: makeReplayPractice({ startTick: 0, startFrameIndex: 1 }),
    });
    const { rerender } = render(<ReplayControls {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
    expect(screen.getByText('Clears restart tick 0')).toBeVisible();
    rerender(<ReplayControls {...props} replayFrameIndex={1} />);
    expect(screen.queryByText(/Clears restart tick/)).toBeNull();
    rerender(<ReplayControls {...props} replayFrameIndex={2} />);
    expect(screen.queryByText(/Clears restart tick/)).toBeNull();
  });

  it('locks editing, metadata and playback while restoring', () => {
    render(
      <ReplayControls
        {...makeProps({ replayPractice: makeReplayPractice({ busy: true, message: 'Restoring tick…' }) })}
      />,
    );
    for (const name of ['Previous tick', 'Next tick', 'Play replay', 'Take over', 'Practice'])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toBeDisabled();
    expect(screen.getByRole('slider')).toBeDisabled();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Replay controls' })).toHaveAttribute('aria-busy', 'true');
  });

  it('keeps actual errors distinct from routine restore progress', () => {
    render(
      <ReplayControls
        {...makeProps({
          replayPractice: makeReplayPractice({ busy: true, message: 'Restoring tick…' }),
          playbackError: 'Replay failed.',
        })}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Replay failed.');
    expect(screen.getByRole('status')).not.toHaveClass('replay-takeover-error--busy');
  });

  it('reserves the error line for failures, without growing it for notices or restore progress', () => {
    const props = makeProps({ replayPractice: makeReplayPractice({ error: 'Restart failed.' }) });
    const view = render(<ReplayControls {...props} />);
    expect(screen.getByRole('status')).toHaveTextContent('Restart failed.');
    expect(screen.getByRole('status')).toHaveClass('replay-takeover-error');
    expect(screen.getByRole('status')).not.toHaveClass('replay-takeover-error--busy');
    view.rerender(
      <ReplayControls {...props} replayPractice={makeReplayPractice({ message: 'Close the dialog first.' })} />,
    );
    expect(screen.queryByRole('status')).toBeNull();
    view.rerender(
      <ReplayControls {...props} replayPractice={makeReplayPractice({ busy: true, message: 'Restoring tick…' })} />,
    );
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not add a row when the point arrives before the replay closes', () => {
    const props = makeProps({ replayPractice: makeReplayPractice() });
    const { container, rerender } = render(<ReplayControls {...props} />);
    const rows = [...container.querySelector('.replay-bar')!.children].map((node) => node.className);
    rerender(
      <ReplayControls
        {...props}
        replayPractice={makeReplayPractice({
          startTick: 5,
          startFrameIndex: 4,
          busy: true,
          message: 'Restoring tick…',
        })}
      />,
    );
    expect([...container.querySelector('.replay-bar')!.children].map((node) => node.className)).toEqual(rows);
    expect(screen.getByRole('img', { name: 'Restart: tick 5' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses an app hover card at the nub without intercepting seek or opening it on touch', () => {
    render(
      <ReplayControls {...makeProps({ replayPractice: makeReplayPractice({ startTick: 5, startFrameIndex: 4 }) })} />,
    );
    const mark = screen.getByRole('img', { name: 'Restart: tick 5' });
    mark.getBoundingClientRect = () => new DOMRect(100, 10, 4, 4);
    const slider = screen.getByRole('slider', { name: 'Seek replay' });
    fireEvent.pointerMove(slider, { pointerType: 'mouse', clientX: 102, clientY: 12, buttons: 0 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Restart: tick 5');
    expect(screen.getByRole('tooltip')).toHaveClass('hover-card');
    fireEvent.pointerDown(slider, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerMove(slider, { pointerType: 'touch', clientX: 102, clientY: 12, buttons: 0 });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(mark).not.toHaveAttribute('title');
  });

  it('keeps the seek rail in the marker coordinate system without native input margins', () => {
    const seekRule = replayControlsCss.match(/\.replay-seek\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    expect(seekRule).toContain('margin: 0;');
    expect(seekRule).toContain('width: 100%;');
  });

  it('keeps both actions labeled in More without opening another editor', () => {
    const controls = makeReplayPractice();
    render(<ReplayControls {...makeProps({ compact: true, replayPractice: controls })} />);
    fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practice' }));
    expect(controls.onStartPractice).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Take over' })).toBeVisible();
    expect(screen.getByText('Play + set restart')).toBeVisible();
    expect(screen.getByText('Play from tick 5')).toBeVisible();
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('edits actual recorded ticks and commits them synchronously before takeover', () => {
    const calls: string[] = [];
    const props = makeProps({
      frameTicks: [40, 41, 45, 46],
      totalFrames: 4,
      replayFrameIndex: 1,
      onSeek: vi.fn((index: number) => calls.push(`seek:${index}`)),
      onTakeOver: vi.fn(() => calls.push('takeover')),
    });
    const { rerender } = render(<ReplayControls {...props} />);
    const field = screen.getByRole('textbox', { name: 'Replay tick' });
    fireEvent.change(field, { target: { value: '45' } });
    expect(calls).toEqual(['seek:2']);
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(calls.slice(-2)).toEqual(['seek:2', 'takeover']);
    // Acknowledge the selected frame before a subsequent ordinary playhead update takes over.
    rerender(<ReplayControls {...props} replayFrameIndex={2} />);
    expect(field).toHaveValue('45');
    rerender(<ReplayControls {...props} replayFrameIndex={3} />);
    expect(field).toHaveValue('46');
  });

  it.each([
    { transport: 'Jump to last tick', finalIndex: 11, action: 'Practice' },
    { transport: 'Jump to last tick', finalIndex: 11, action: 'Take over' },
    { transport: 'Next tick', finalIndex: 5, action: 'Practice' },
    { transport: 'Next tick', finalIndex: 5, action: 'Take over' },
  ])('retires superseded tick seeks: $transport then $action', ({ transport, finalIndex, action }) => {
    const props = makeProps({ replayPractice: makeReplayPractice({ startTick: 5, startFrameIndex: 4 }) });
    const { rerender } = render(<ReplayControls {...props} />);
    const field = screen.getByRole('textbox', { name: 'Replay tick' });
    fireEvent.change(field, { target: { value: '3' } });
    expect(props.onSeek).toHaveBeenLastCalledWith(2);
    expect(screen.getByText('Clears restart tick 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: transport }));
    expect(transport === 'Next tick' ? props.onStepForward : props.onJumpToEnd).toHaveBeenCalledOnce();
    // The interrupted seek to index 2 never reaches React props.
    rerender(<ReplayControls {...props} replayFrameIndex={finalIndex} />);
    expect(field).toHaveValue(String(finalIndex + 1));
    expect(screen.getByRole('slider', { name: 'Seek replay' })).toHaveValue(String(finalIndex));
    expect(screen.queryByText('Clears restart tick 5')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(props.onSeek).toHaveBeenLastCalledWith(finalIndex);
    expect(action === 'Practice' ? props.replayPractice!.onStartPractice : props.onTakeOver).toHaveBeenCalledOnce();
  });

  it.each([
    { key: 'Home', finalIndex: 0 },
    { key: 'End', finalIndex: 11 },
    { key: 'ArrowLeft', finalIndex: 1 },
    { key: 'ArrowRight', finalIndex: 3 },
    { key: ' ', finalIndex: 3 },
  ])('retires an unacknowledged seek for transport key "$key"', ({ key, finalIndex }) => {
    const props = makeProps();
    const { rerender } = render(<ReplayControls {...props} />);
    const field = screen.getByRole('textbox', { name: 'Replay tick' });
    fireEvent.change(field, { target: { value: '3' } });
    fireEvent.keyDown(document.body, { key });
    rerender(<ReplayControls {...props} replayFrameIndex={finalIndex} />);
    expect(field).toHaveValue(String(finalIndex + 1));
    expect(screen.getByRole('slider')).toHaveValue(String(finalIndex));
  });

  it.each(['', '42', '44.5', '1000', '1e2'])('blocks invalid tick %s without seeking or adopting', (value) => {
    const props = makeProps({
      frameTicks: [40, 41, 45],
      totalFrames: 3,
      replayFrameIndex: 1,
      replayPractice: makeReplayPractice(),
    });
    render(<ReplayControls {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Replay tick' }), { target: { value } });
    expect(props.onSeek).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Take over' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Practice' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Enter a recorded tick from 40 to 45.');
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveAttribute(
      'aria-describedby',
      screen.getByRole('status').id,
    );
  });

  it('pauses editing and does not erase invalid typing on a same-frame array update', () => {
    const props = makeProps({ isPlaying: true, frameTicks: [0, 1, 2], totalFrames: 3, replayFrameIndex: 1 });
    const { rerender } = render(<ReplayControls {...props} />);
    const field = screen.getByRole('textbox', { name: 'Replay tick' });
    fireEvent.focus(field);
    expect(props.onPlayPause).toHaveBeenCalledOnce();
    fireEvent.change(field, { target: { value: '99' } });
    rerender(<ReplayControls {...props} frameTicks={[0, 1, 2]} />);
    expect(field).toHaveValue('99');
    rerender(<ReplayControls {...props} replayFrameIndex={2} />);
    expect(field).toHaveValue('2');
  });

  it('leaves typing and undo native, and Escape cancels only the field draft', () => {
    const props = makeProps();
    render(<ReplayControls {...props} />);
    const field = screen.getByRole('textbox', { name: 'Replay tick' });
    expect(fireEvent.keyDown(field, { key: 'z', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(field, { key: 'ArrowLeft' })).toBe(true);
    fireEvent.change(field, { target: { value: '99' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(field).toHaveValue('5');
    expect(props.onExitReplay).not.toHaveBeenCalled();
  });

  it.each(['99', '7'])('returns hotkeys to replay after a pointer transport click discards draft %s', (draft) => {
    const props = makeProps();
    render(<ReplayControls {...props} />);
    const field = screen.getByRole('textbox', { name: 'Replay tick' });
    act(() => field.focus());
    fireEvent.change(field, { target: { value: draft } });
    expect(field).toHaveFocus();
    const seekCount = vi.mocked(props.onSeek).mock.calls.length;

    const play = screen.getByRole('button', { name: 'Play replay' });
    expect(fireEvent.mouseDown(play, { button: 0 })).toBe(false);
    fireEvent.click(play);
    fireEvent.keyDown(document.activeElement!, { key: ' ' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });

    expect(props.onPlayPause).toHaveBeenCalledTimes(2);
    expect(props.onStepForward).toHaveBeenCalledOnce();
    expect(field).not.toHaveFocus();
    expect(play).not.toHaveFocus();
    expect(field).toHaveValue('5');
    expect(props.onSeek).toHaveBeenCalledTimes(seekCount);
  });

  it.each([
    'Jump to first tick',
    'Previous tick',
    'Play replay',
    'Next tick',
    'Jump to last tick',
  ])('instantly names %s on pointer hover', async (name) => {
    render(<ReplayControls {...makeProps()} />);
    const button = screen.getByRole('button', { name });
    expect(button).toHaveAttribute('title', '');
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent(name);
  });

  it('shows capture cutoffs without disabling the full fight timeline', () => {
    render(
      <ReplayControls
        {...makeProps({
          capture: {
            ...freshReplayCapture(),
            cursorSamples: { provenance: 'bounded-v1', stoppedAtMs: 60000, reason: 'entry-limit' },
          },
        })}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Mouse path/);
    expect(screen.getByRole('status')).toHaveTextContent(/1:00/);
    expect(screen.getByRole('button', { name: 'Play replay' })).toBeEnabled();
    expect(screen.getByRole('slider')).toHaveAttribute('max', '11');
  });
  beforeEach(() => {
    tooltipMocks.moveClientX = undefined;
    tooltipMocks.boundContents = [];
    tooltipMocks.onMouseEnter.mockClear();
    tooltipMocks.onMouseLeave.mockClear();
    tooltipMocks.onMouseMove.mockClear();
    tooltipMocks.hideTooltip.mockClear();
  });

  it('dispatches playback and step controls', () => {
    const onPlayPause = vi.fn();
    const onStepBack = vi.fn();
    const onStepForward = vi.fn();
    const { container } = render(<ReplayControls {...makeProps({ onPlayPause, onStepBack, onStepForward })} />);

    const playButton = container.querySelector('.replay-btn--play') as HTMLButtonElement;
    fireEvent.click(playButton);
    const buttons = container.querySelectorAll('.replay-transport .replay-btn');
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[3]);

    expect(onPlayPause).toHaveBeenCalledTimes(1);
    expect(onStepBack).toHaveBeenCalledTimes(1);
    expect(onStepForward).toHaveBeenCalledTimes(1);
  });

  it('updates the thumb and previews a drag without committing it', async () => {
    const onSeek = vi.fn();
    const onPreviewSeek = vi.fn();
    render(<ReplayControls {...makeProps({ onSeek, onPreviewSeek })} />);

    const seek = screen.getByRole('slider');
    fireEvent.change(seek, { target: { value: '7' } });

    expect((seek as HTMLInputElement).value).toBe('7');
    // Previews are coalesced to one per animation frame.
    await waitFor(() => expect(onPreviewSeek).toHaveBeenCalledWith(7));
    // A drag must never commit: that is the whole-tree re-render that lags.
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('coalesces a burst of drag values into one commit on release', async () => {
    const onSeek = vi.fn();
    const onPreviewSeek = vi.fn();
    render(<ReplayControls {...makeProps({ onSeek, onPreviewSeek })} />);

    const seek = screen.getByRole('slider');
    for (const value of ['1', '5', '9', '3', '8']) {
      fireEvent.change(seek, { target: { value } });
    }

    await waitFor(() => expect(onPreviewSeek).toHaveBeenCalledTimes(1));
    expect(onPreviewSeek).toHaveBeenCalledWith(8);
    expect(onSeek).not.toHaveBeenCalled();

    fireEvent.pointerUp(seek);
    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek).toHaveBeenCalledWith(8);
  });

  it('displays current and total tick information', () => {
    render(<ReplayControls {...makeProps({ replayFrameIndex: 5, totalFrames: 20 })} />);

    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue('6');
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
  });

  it('reserves the current tick width from the total so the bar never jitters', () => {
    // Given: a two-digit total. RuneScape Bold 12 digits are not fixed-width, so a
    // an auto-width counter would resize the content-sized bar tick by tick.
    const { container, rerender } = render(<ReplayControls {...makeProps({ replayFrameIndex: 0, totalFrames: 12 })} />);
    const current = () => container.querySelector<HTMLInputElement>('.replay-tick-input');

    // When / Then: the reserved width is the total's digit count in ch and holds across
    // indices, including over the 9 -> 10 digit boundary.
    expect(current()).toHaveStyle({ width: '3ch' });
    rerender(<ReplayControls {...makeProps({ replayFrameIndex: 8, totalFrames: 12 })} />);
    expect(current()).toHaveStyle({ width: '3ch' });
    rerender(<ReplayControls {...makeProps({ replayFrameIndex: 9, totalFrames: 12 })} />);
    expect(current()).toHaveValue('10');
    expect(current()).toHaveStyle({ width: '3ch' });
    rerender(<ReplayControls {...makeProps({ replayFrameIndex: 11, totalFrames: 12 })} />);
    expect(current()).toHaveStyle({ width: '3ch' });

    // And: a three-digit total reserves three digits.
    rerender(<ReplayControls {...makeProps({ replayFrameIndex: 99, totalFrames: 120 })} />);
    expect(current()).toHaveStyle({ width: '3ch' });
  });

  it('makes the current tick a right-aligned box so the reserved width holds', () => {
    // Given: a plain inline span ignores width, and left-aligned digits would drift off
    // the separator whenever the tick is narrower than the reserved box.
    const rule = replayControlsCss.match(/\.replay-tick-current\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    // When / Then.
    expect(rule).toContain('display: inline-block;');
    expect(rule).toContain('text-align: right;');
  });

  it('names the seek slider and voices the displayed tick', () => {
    // Given: the slider, whose displayed tick is 1-based while its value is 0-based.
    render(<ReplayControls {...makeProps({ replayFrameIndex: 4, totalFrames: 12 })} />);

    // When / Then: assistive tech gets a name for the control and the readout the bar shows,
    // not the raw frame index.
    const seek = screen.getByRole('slider', { name: 'Seek replay' });
    expect(seek).toHaveAttribute('aria-valuetext', 'Tick 5 of 12');
  });

  describe('late ticks', () => {
    const lateTicks = [
      { frameIndex: 2, lateByMs: 64 },
      { frameIndex: 4, lateByMs: 120.4 },
      { frameIndex: 11, lateByMs: 340 },
    ];

    it('marks each late tick on the seek bar by its frame index', () => {
      const { container } = render(<ReplayControls {...makeProps({ totalFrames: 12, lateTicks })} />);

      const marks = [...container.querySelectorAll<HTMLElement>('.replay-late-mark')];
      expect(marks.map((mark) => Number(mark.style.getPropertyValue('--at')))).toEqual([2 / 11, 4 / 11, 1]);
      // Decoration only: the warning and the slider carry the meaning for assistive tech.
      expect(container.querySelector('.replay-late-marks')).toHaveAttribute('aria-hidden', 'true');
    });

    it('counts them in a labeled warning whose tooltip names the worst first', () => {
      render(<ReplayControls {...makeProps({ lateTicks })} />);

      const warning = screen.getByRole('note', {
        name: '3 late ticks: the game stalled during this run. Worst: tick 12, 340 ms late.',
      });
      // An icon and a figure, so the warning never rests on its color alone.
      expect(warning).toHaveTextContent('3 late');
      expect(warning.querySelector('svg')).not.toBeNull();
      const tipText = (tooltipMocks.boundContents as ({ lines?: { spans: { text: string }[] }[] } | null)[]).map(
        (tip) => tip?.lines?.map((line) => line.spans.map((span) => span.text).join('')),
      );
      expect(tipText).toContainEqual([
        '3 late ticks: the game stalled during this run',
        'Tick 12 ran 340 ms late',
        'Tick 5 ran 120 ms late',
        'Tick 3 ran 64 ms late',
      ]);
    });

    it('voices the lateness when the playhead is on a late tick', () => {
      const { rerender } = render(<ReplayControls {...makeProps({ replayFrameIndex: 4, lateTicks })} />);
      expect(screen.getByRole('slider', { name: 'Seek replay' })).toHaveAttribute(
        'aria-valuetext',
        'Tick 5 of 12, ran 120 ms late',
      );

      rerender(<ReplayControls {...makeProps({ replayFrameIndex: 5, lateTicks })} />);
      expect(screen.getByRole('slider', { name: 'Seek replay' })).toHaveAttribute('aria-valuetext', 'Tick 6 of 12');
    });

    it('spells the summary out behind More, where there is no hover', () => {
      render(<ReplayControls {...makeProps({ compact: true, moreMenu: true, lateTicks })} />);
      // Compact: the figure alone beside the icon.
      expect(screen.getByRole('note')).toHaveTextContent(/^3$/);
      expect(screen.queryByText(/the game stalled/)).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
      expect(
        screen.getByText('3 late ticks: the game stalled during this run. Worst: tick 12, 340 ms late.'),
      ).toBeInTheDocument();
    });

    it('draws nothing at all when no tick ran late', () => {
      for (const props of [makeProps(), makeProps({ lateTicks: [] })]) {
        const { container, unmount } = render(<ReplayControls {...props} />);
        expect(container.querySelector('.replay-late-marks, .replay-late-mark, .replay-late')).toBeNull();
        expect(screen.queryByRole('note')).toBeNull();
        expect(screen.getByRole('slider')).not.toHaveAttribute('data-tooltip-bound');
        unmount();
      }
    });
  });

  describe('waves', () => {
    /** Four waves of ten frames, the first and last of them landmarks, ending on a death. */
    const chapters: ReplayChapterSet = {
      title: 'Waves',
      chapters: [
        {
          startFrame: 0,
          endFrame: 10,
          label: 'Wave 1',
          shortLabel: '1',
          detail: '1 bat',
          landmark: true,
          cleared: true,
          attempt: 1,
        },
        { startFrame: 10, endFrame: 20, label: 'Wave 2', shortLabel: '2', detail: '2 bats', cleared: true, attempt: 1 },
        { startFrame: 20, endFrame: 30, label: 'Wave 3', shortLabel: '3', cleared: true, attempt: 1 },
        {
          startFrame: 30,
          endFrame: 40,
          label: 'Wave 4',
          shortLabel: '4',
          detail: 'First blob',
          landmark: true,
          cleared: false,
          attempt: 1,
        },
      ],
    };
    const waveProps = (overrides: Partial<ComponentProps<typeof ReplayControls>> = {}) =>
      makeProps({ chapters, totalFrames: 40, replayFrameIndex: 25, ...overrides });

    it.each([
      ['Previous wave', 20],
      ['Next wave', 30],
      ['Wave 2: 2 bats', 10],
    ] as const)('returns hotkeys to replay after %s discards an invalid tick draft', (name, frame) => {
      const props = waveProps();
      render(<ReplayControls {...props} />);
      const field = screen.getByRole('textbox', { name: 'Replay tick' });
      act(() => field.focus());
      fireEvent.change(field, { target: { value: '99' } });
      expect(field).toHaveFocus();
      expect(field).toHaveAttribute('aria-invalid', 'true');

      if (name === 'Wave 2: 2 bats') {
        const toggle = screen.getByRole('button', { name: /Choose a wave$/ });
        fireEvent.mouseDown(toggle, { button: 0 });
        fireEvent.click(toggle);
        expect(field).toHaveFocus();
      }
      const button = screen.getByRole('button', { name });
      expect(fireEvent.mouseDown(button, { button: 0 })).toBe(false);
      fireEvent.click(button);

      expect(field).not.toHaveFocus();
      expect(document.activeElement).toBe(document.body);
      expect(field).toHaveValue('26');
      expect(props.onSeek).toHaveBeenCalledExactlyOnceWith(frame);

      fireEvent.keyDown(document.activeElement!, { key: ' ' });
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      expect(props.onPlayPause).toHaveBeenCalledOnce();
      expect(props.onStepForward).toHaveBeenCalledOnce();
      expect(props.onSeek).toHaveBeenCalledExactlyOnceWith(frame);
    });

    it('marks only the landmark waves under the rail, and names the current one everywhere', () => {
      const { container } = render(<ReplayControls {...waveProps()} />);

      const marks = [...container.querySelectorAll<HTMLElement>('.replay-wave-mark')];
      expect(marks.map((mark) => Number(mark.style.getPropertyValue('--at')))).toEqual([0, 30 / 39]);
      expect(container.querySelector('.replay-wave-marks')).toHaveAttribute('aria-hidden', 'true');
      expect(screen.getByRole('button', { name: /^Wave 3\./ })).toHaveTextContent('Wave 3');
      expect(screen.getByRole('slider', { name: 'Seek replay' })).toHaveAttribute(
        'aria-valuetext',
        'Tick 26 of 40, Wave 3',
      );
    });

    it('leaves the bar exactly as it was without chapters', () => {
      for (const props of [makeProps(), makeProps({ chapters: null })]) {
        const { container, unmount } = render(<ReplayControls {...props} />);
        expect(container.querySelector('.replay-wave, .replay-wave-marks, .replay-waves')).toBeNull();
        expect(screen.queryByRole('button', { name: /wave/i })).toBeNull();
        expect(container.querySelector<HTMLElement>('.replay-seek')?.style.getPropertyValue('--seek-waves')).toBe('');
        unmount();
      }
    });

    it('steps back to the wave being watched, then to the one before it', () => {
      const onSeek = vi.fn();
      const view = render(<ReplayControls {...waveProps({ onSeek })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Previous wave' }));
      expect(onSeek).toHaveBeenLastCalledWith(20);

      view.rerender(<ReplayControls {...waveProps({ onSeek, replayFrameIndex: 20 })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Previous wave' }));
      expect(onSeek).toHaveBeenLastCalledWith(10);
    });

    it('steps forward to the next wave, and stops at either end of the recording', () => {
      const onSeek = vi.fn();
      const view = render(<ReplayControls {...waveProps({ onSeek })} />);
      fireEvent.click(screen.getByRole('button', { name: 'Next wave' }));
      expect(onSeek).toHaveBeenLastCalledWith(30);

      view.rerender(<ReplayControls {...waveProps({ onSeek, replayFrameIndex: 0 })} />);
      expect(screen.getByRole('button', { name: 'Previous wave' })).toBeDisabled();
      view.rerender(<ReplayControls {...waveProps({ onSeek, replayFrameIndex: 35 })} />);
      expect(screen.getByRole('button', { name: 'Next wave' })).toBeDisabled();
    });

    it('follows a scrub before it is committed, so the readout names where the thumb is', () => {
      render(<ReplayControls {...waveProps()} />);
      fireEvent.change(screen.getByRole('slider', { name: 'Seek replay' }), { target: { value: '12' } });
      expect(screen.getByRole('button', { name: /Choose a wave$/ })).toHaveTextContent('Wave 2');
    });

    it('opens a picker of every wave and jumps to the one pressed', () => {
      const onSeek = vi.fn();
      render(<ReplayControls {...waveProps({ onSeek })} />);
      const toggle = screen.getByRole('button', { name: /Choose a wave$/ });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const picker = screen.getByRole('group', { name: 'Waves' });
      expect([...picker.querySelectorAll('.replay-waves__cell')].map((cell) => cell.textContent)).toEqual([
        '1',
        '2',
        '3',
        '4',
      ]);
      // The line below the grid names the current wave until the pointer names another.
      expect(picker.querySelector('.replay-waves__detail')).toHaveTextContent('Wave 3');

      fireEvent.click(screen.getByRole('button', { name: 'Wave 4: First blob (not finished)' }));
      expect(onSeek).toHaveBeenCalledExactlyOnceWith(30);
      expect(screen.queryByRole('group', { name: 'Waves' })).toBeNull();
    });

    it('marks the current, landmark and unfinished waves in the picker', () => {
      render(<ReplayControls {...waveProps()} />);
      fireEvent.click(screen.getByRole('button', { name: /Choose a wave$/ }));
      const cell = (name: string) => screen.getByRole('button', { name });

      expect(cell('Wave 3')).toHaveClass('replay-waves__cell--current');
      expect(cell('Wave 3')).toHaveAttribute('aria-current', 'true');
      expect(cell('Wave 1: 1 bat')).toHaveClass('replay-waves__cell--landmark');
      expect(cell('Wave 2: 2 bats')).not.toHaveClass('replay-waves__cell--landmark');
      expect(cell('Wave 4: First blob (not finished)')).toHaveClass('replay-waves__cell--open');
      expect(cell('Wave 2: 2 bats')).not.toHaveClass('replay-waves__cell--open');
    });

    it('closes the picker on Escape, on a press outside it, and when More takes its place', () => {
      render(<ReplayControls {...waveProps({ compact: true })} />);
      const open = () => fireEvent.click(screen.getByRole('button', { name: /Choose a wave$/ }));
      const picker = () => screen.queryByRole('group', { name: 'Waves' });

      open();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(picker()).toBeNull();

      open();
      fireEvent.pointerDown(document.body);
      expect(picker()).toBeNull();

      open();
      fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
      expect(picker()).toBeNull();
      expect(screen.getByRole('button', { name: 'More replay actions' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('keeps the readout and the picker in the narrow and tool-window layouts', () => {
      for (const props of [waveProps({ compact: true }), waveProps({ compact: true, moreMenu: true })]) {
        const { unmount } = render(<ReplayControls {...props} />);
        expect(screen.getByRole('button', { name: 'Previous wave' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Choose a wave$/ }));
        expect(screen.getByRole('group', { name: 'Waves' })).toBeInTheDocument();
        unmount();
      }
    });

    it('is a readout only when the recording holds one wave', () => {
      render(
        <ReplayControls
          {...makeProps({
            chapters: { title: 'Waves', chapters: [chapters.chapters[0]!] },
            totalFrames: 10,
            replayFrameIndex: 4,
          })}
        />,
      );
      expect(screen.getByRole('note', { name: 'Wave 1: 1 bat' })).toHaveTextContent('Wave 1');
      expect(screen.queryByRole('button', { name: 'Previous wave' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Choose a wave$/ })).toBeNull();
    });

    it('names the wave under the pointer on the rail, with its late tick when it has one', () => {
      render(<ReplayControls {...waveProps({ lateTicks: [{ frameIndex: 20, lateByMs: 90 }] })} />);
      const slider = screen.getByRole('slider', { name: 'Seek replay' });
      slider.getBoundingClientRect = () => new DOMRect(0, 0, 400, 14);
      Object.defineProperty(slider, 'offsetWidth', { value: 400, configurable: true });

      // Frame 20 on this rail: the start of wave 3, which is also where the late tick is.
      fireEvent.mouseMove(slider, { clientX: 205, clientY: 7, buttons: 0 });
      const tips = (tooltipMocks.boundContents as (unknown | (() => unknown))[])
        .filter((tip): tip is () => { lines: { spans: { text: string }[] }[] } | null => typeof tip === 'function')
        .map((tip) => tip())
        .filter((tip): tip is { lines: { spans: { text: string }[] }[] } => tip !== null)
        .map((tip) => tip.lines.map((line) => line.spans.map((span) => span.text).join('')));
      expect(tips).toContainEqual(['Wave 3', 'Tick 21 ran 90 ms late']);
    });
  });

  it('keeps every text run on the pixel-font native grid', () => {
    // Given: the bar is pixel-font chrome, where fractional
    // pixel-font sizes blur (DESIGN.md pixel-font rules: 16px is the crisp reading size).
    const barRule = replayControlsCss.match(/\.replay-bar\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    // When / Then: the bar declares the native size plus the `--hud-*` text ramp, and no run steps
    // off-grid.
    expect(barRule).toContain('font-size: 16px;');
    expect(barRule).toContain('--hud-label:');
    expect(replayControlsCss).not.toMatch(/font-size:\s*1[0-5]px/);
  });

  it('renders and toggles replay cursor visibility in regular and compact toolbars', () => {
    const onReplayCursorVisibleChange = vi.fn();
    const { rerender } = render(
      <ReplayControls {...makeProps({ onReplayCursorVisibleChange, replayCursorVisible: true })} />,
    );

    const cursorButton = screen.getByRole('button', { name: 'Replay cursor' });
    expect(screen.getByRole('toolbar')).toHaveAttribute('data-replay-viewer-chrome');

    expect(cursorButton).toHaveTextContent('Cursor');
    expect(cursorButton).not.toHaveTextContent('Shown');
    expect(cursorButton).not.toHaveTextContent('Hidden');
    expect(cursorButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Replay cursor' }));
    expect(onReplayCursorVisibleChange).toHaveBeenCalledWith(false);

    rerender(<ReplayControls {...makeProps({ onReplayCursorVisibleChange, replayCursorVisible: false })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Replay cursor' }));
    expect(onReplayCursorVisibleChange).toHaveBeenCalledWith(true);

    rerender(<ReplayControls {...makeProps({ compact: true, replayCursorVisible: false })} />);

    expect(screen.getByRole('toolbar')).toHaveAttribute('data-replay-viewer-chrome');
    fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
    expect(screen.getByRole('button', { name: 'Replay cursor' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Replay cursor' })).toHaveTextContent('Cursor');
  });

  it('keeps the compact replay toolbar above foreground panels at narrow widths', () => {
    const { container } = render(<ReplayControls {...makeProps({ compact: true })} />);
    const barRule = replayControlsCss.match(/\.replay-bar\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const responsiveRule =
      replayControlsCss.match(/@media\s*\(pointer:\s*coarse\)\s*\{(?<body>[\s\S]*)\}\s*$/)?.groups?.body ?? '';

    expect(barRule).toContain('position: relative;');
    expect(barRule).toContain('z-index: 30;');
    expect(barRule).toContain('pointer-events: auto;');
    expect(responsiveRule).toContain('min-width: 240px;');
    expect(replayControlsCss).not.toMatch(/@media[^{]*max-width:\s*720px/);
    expect(container.querySelector('.replay-seek')).toBeInTheDocument();
    expect(container.querySelectorAll('.replay-actions button')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
    expect(container.querySelectorAll('.replay-actions button')).toHaveLength(3);
  });

  it('sizes the shell to its controls so a new control can never eject the last one', () => {
    const barRule = replayControlsCss.match(/\.replay-bar\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const fullRule = replayControlsCss.match(/\.replay-bar--full\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';
    const compactRule = replayControlsCss.match(/\.replay-bar--compact\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    // A fixed width here would push Exit outside the border when a control is added.
    expect(barRule).toContain('width: max-content;');
    expect(fullRule).toContain('min-width: min(420px, calc(var(--transport-room, 422px) - 2px));');
    expect(fullRule).not.toMatch(/[^-]width:\s*\d/);
    expect(compactRule).toContain(
      'min-width: min(320px, calc(96vw / var(--overlay-scale, 1) - 2px), calc(var(--transport-room, 322px) - 2px));',
    );
    expect(compactRule).not.toMatch(/[^-]width:\s*\d/);
  });

  it('keeps the transport to playback controls only', () => {
    const { container } = render(<ReplayControls {...makeProps()} />);

    const transport = container.querySelector('.replay-transport');
    expect(transport?.querySelectorAll('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Exit replay' }).closest('.replay-actions')).not.toBeNull();
  });

  it('names Take Over with the shared instant card instead of the game tooltip', async () => {
    render(<ReplayControls {...makeProps()} />);

    const takeOverButton = screen.getByRole('button', { name: 'Take over' });
    expect(takeOverButton).not.toHaveAttribute('data-tooltip-bound');
    fireEvent.pointerEnter(takeOverButton.parentElement as HTMLElement, { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent(
      'Play from tick 5. Later ticks are replaced.',
    );
  });

  it('names every icon-only control for assistive technology', () => {
    // Given: the compact bar, where every control renders as a bare glyph.
    render(<ReplayControls {...makeProps({ compact: true })} />);
    fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));

    // When / Then: a toolbar of unnamed buttons is unusable without sight of the icons.
    for (const name of ['Previous tick', 'Play replay', 'Next tick', 'Replay cursor', 'Take over', 'Exit replay']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('sizes the compact cursor toggle from the action box token', () => {
    const rule = replayControlsCss.match(/\.replay-cursor-toggle--compact\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? '';

    expect(rule).toContain('width: var(--action-box);');
    expect(rule).toContain('height: var(--action-box);');
    expect(replayControlsCss).toContain('--action-box: 28px;');
  });

  describe('with its actions behind More', () => {
    const more = () => screen.getByRole('button', { name: 'More replay actions' });

    it('keeps full actions direct and uses More to avoid crowding compact bars', () => {
      const full = render(<ReplayControls {...makeProps()} />);
      expect(screen.queryByRole('button', { name: 'More replay actions' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Exit replay' })).toBeInTheDocument();
      full.unmount();
      render(<ReplayControls {...makeProps({ compact: true })} />);
      expect(screen.getByRole('button', { name: 'More replay actions' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Exit replay' })).toBeNull();
    });

    it('opens labeled actions on demand and closes them again', () => {
      const onReplayCursorVisibleChange = vi.fn();
      const { container } = render(
        <ReplayControls {...makeProps({ compact: true, moreMenu: true, onReplayCursorVisibleChange })} />,
      );
      expect(container.querySelector('.replay-actions')).toBeNull();
      expect(more()).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(more());
      expect(more()).toHaveAttribute('aria-expanded', 'true');
      const labels = [...(container.querySelector('.replay-actions--more')?.querySelectorAll('button') ?? [])].map(
        (button) => button.getAttribute('aria-label'),
      );
      expect(labels).toEqual(['Replay cursor', 'Exit replay', 'Take over']);
      expect(container.querySelectorAll('.replay-utilities button')).toHaveLength(2);
      // The cursor is a toggle: it stays open to show its new state.
      fireEvent.click(screen.getByRole('button', { name: 'Replay cursor' }));
      expect(onReplayCursorVisibleChange).toHaveBeenCalledWith(false);
      expect(more()).toHaveAttribute('aria-expanded', 'true');

      fireEvent.click(more());
      expect(container.querySelector('.replay-actions')).toBeNull();
    });

    it('closes More on Escape from one of its actions without exiting the replay', () => {
      const onExitReplay = vi.fn();
      const { container } = render(<ReplayControls {...makeProps({ compact: true, moreMenu: true, onExitReplay })} />);
      fireEvent.click(more());
      fireEvent.keyDown(screen.getByRole('button', { name: 'Replay cursor' }), { key: 'Escape' });
      expect(container.querySelector('.replay-actions')).toBeNull();
      expect(onExitReplay).not.toHaveBeenCalled();
    });

    it('writes out why Take Over is unavailable, where a touch user can read it', () => {
      const { container } = render(
        <ReplayControls
          {...makeProps({ compact: true, moreMenu: true, takeOverUnavailableReason: 'terminal-predecessor' })}
        />,
      );
      fireEvent.click(more());
      expect(screen.getByRole('button', { name: /^Take over unavailable/ })).toBeDisabled();
      expect(container.querySelector('.replay-more-note')).toHaveTextContent(
        'The run was already over before this tick',
      );
      // No native title: the note is the explanation.
      expect(container.querySelector('.replay-takeover-wrap')).not.toHaveAttribute('title');
    });
  });

  describe('take over availability', () => {
    function takeOverButton(container: HTMLElement): HTMLButtonElement {
      return container.querySelector('.replay-action--takeover') as HTMLButtonElement;
    }

    async function tooltipText(container: HTMLElement): Promise<string> {
      fireEvent.pointerEnter(container.querySelector('.replay-takeover-wrap') as HTMLElement, { pointerType: 'mouse' });
      return (await waitFor(() => screen.getByRole('tooltip'))).textContent ?? '';
    }

    it('offers Take Over when the displayed frame can be resumed', async () => {
      const { container } = render(<ReplayControls {...makeProps()} />);

      expect(takeOverButton(container).disabled).toBe(false);
      expect(await tooltipText(container)).toContain('Play from tick 5');
    });

    it.each([
      'terminal-predecessor',
      'intro-frame',
      'first-tick',
      'fight-start',
      'nonconsecutive-tick',
    ] as const)('blocks both actions on %s but keeps seek usable', (reason) => {
      render(
        <ReplayControls
          {...makeProps({
            takeOverUnavailableReason: reason,
            replayPractice: makeReplayPractice({ practiceUnavailableReason: 'Choose a playable tick.' }),
          })}
        />,
      );
      expect(screen.getByRole('button', { name: /^Take over unavailable/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Practice' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Previous tick' })).toBeEnabled();
    });

    it('explains why the tick cannot be taken over', async () => {
      const { container } = render(
        <ReplayControls {...makeProps({ takeOverUnavailableReason: 'nonconsecutive-tick' })} />,
      );

      expect(takeOverButton(container).disabled).toBe(true);
      expect(await tooltipText(container)).toContain('The tick before this one was not recorded');
    });

    it('shows a refusal notice without leaving the replay', () => {
      // Given: a Take Over that could not rebuild the tick exactly. The replay is untouched, so
      // the message is the only signal the click did anything at all.
      const { container, rerender } = render(<ReplayControls {...makeProps()} />);
      expect(container.querySelector('.replay-takeover-error')).toBeNull();

      rerender(<ReplayControls {...makeProps({ takeOverError: 'Take Over could not rebuild this tick exactly.' })} />);

      expect(container.querySelector('.replay-takeover-error')?.textContent).toContain('could not rebuild');
    });
  });

  describe('playback failure', () => {
    const FAILURE = 'Replay playback stopped because this recording could not be rendered.';

    it('shows the failure and disables every control that cannot work, keeping Exit', () => {
      const onExitReplay = vi.fn();
      render(<ReplayControls {...makeProps({ playbackError: FAILURE, onExitReplay })} />);

      expect(screen.getByRole('status')).toHaveTextContent(/could not be rendered/);
      for (const name of [
        'Play replay',
        'Previous tick',
        'Next tick',
        'Jump to first tick',
        'Jump to last tick',
        'Take over',
      ]) {
        expect(screen.getByRole('button', { name }), name).toBeDisabled();
      }
      expect(screen.getByRole('slider')).toBeDisabled();

      const exit = screen.getByRole('button', { name: 'Exit replay' });
      expect(exit).toBeEnabled();
      fireEvent.click(exit);
      expect(onExitReplay).toHaveBeenCalledTimes(1);
    });

    it('ignores transport keys while failed and still exits on Escape', () => {
      const onPlayPause = vi.fn();
      const onStepForward = vi.fn();
      const onExitReplay = vi.fn();
      render(<ReplayControls {...makeProps({ playbackError: FAILURE, onPlayPause, onStepForward, onExitReplay })} />);

      fireEvent.keyDown(document.body, { key: ' ' });
      fireEvent.keyDown(document.body, { key: 'ArrowRight' });
      expect(onPlayPause).not.toHaveBeenCalled();
      expect(onStepForward).not.toHaveBeenCalled();

      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onExitReplay).toHaveBeenCalledTimes(1);
    });

    it('keeps playback usable after a Take Over refusal, which stays retryable', () => {
      render(<ReplayControls {...makeProps({ takeOverError: 'Take Over could not rebuild this recording.' })} />);

      expect(screen.getByRole('button', { name: 'Play replay' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Take over' })).toBeEnabled();
      expect(screen.getByRole('slider')).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Exit replay' })).toBeEnabled();
    });

    it('shows the latched playback failure instead of a stale Take Over refusal', () => {
      render(
        <ReplayControls {...makeProps({ playbackError: FAILURE, takeOverError: 'Take Over could not rebuild.' })} />,
      );

      const statuses = screen.getAllByRole('status');
      expect(statuses).toHaveLength(1);
      expect(statuses[0]).toHaveTextContent(/could not be rendered/);
    });
  });
});

describe('ReplayControls pending scrub with real simulation wiring', () => {
  let now: number;
  let frames: Map<number, FrameRequestCallback>;
  let audio: AudioEngine;
  let arena: ReturnType<typeof getArenaConfig>;
  let unbounded: boolean;
  const storageKeys = ['osrs-unified-keybinds'];
  let savedStorage: Array<string | null>;

  beforeEach(() => {
    arena = getArenaConfig();
    unbounded = getArenaAllowUnboundedFallback();
    savedStorage = storageKeys.map((key) => localStorage.getItem(key));
    now = 0;
    frames = new Map();
    audio = new AudioEngine();
    let id = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => {
      frames.delete(frame);
    });
    animationFrames.clock.reset();
  });

  afterEach(() => {
    cleanup();
    audio.dispose();
    prayerFlickTimeline.reset();
    __resetKeyStateForTest();
    animationFrames.setSuspended(false);
    animationFrames.clock.reset();
    setArenaConfig(arena, unbounded);
    storageKeys.forEach((key, index) => {
      const value = savedStorage[index];
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    });
    vi.restoreAllMocks();
  });

  function advanceFrame(at: number) {
    now = at;
    const queued = [...frames.values()];
    frames.clear();
    act(() => {
      for (const callback of queued) callback(at);
    });
  }

  function mountWiredReplay({ countdown }: { countdown: boolean }) {
    let current: ReturnType<typeof useSimulationWiring> | undefined;
    const previewCalls = vi.fn();
    const params: Parameters<typeof useSimulationWiring>[0] = {
      activeMechanicsConfig: { ...DEFAULT_MECHANICS_CONFIG, infiniteHealth: true },
      attackStylePerCategory: {},
      autoAdvance: true,
      pauseWhenUnfocused: false,
      modalPaused: false,
      fightStartCountdownTicks: countdown ? 3 : null,
      audioEngine: audio,
      eventAudioPlayerRef: { current: new EventAudioPlayer(audio) },
      frameSoundTrackerRef: { current: new FrameSoundTracker(audio) },
      getEncounterEquipment: () => ({}),
      getEncounterInventory: createEmptyInventory,
      getEncounterSupplies: createEmptyCombatSupplies,
      setEncounterSupplies: vi.fn(),
      isFullyLoaded: true,
      instantInventoryEnabled: false,
      instantPrayerEnabled: false,
      objTypeLoader: null,
      persistEquipmentEncounterKind: null,
      playerConfig: DEFAULT_PLAYER_CONFIG,
      setPlayerConfig: vi.fn(),
      getReplayUiState: () => ({ activeGamePanelTab: 'inventory' }),
      onReplayUiStateChange: vi.fn(),
      rendererType: 'none',
      sceneState: { kind: 'encounter', encounterKind: 'yama_p3' },
      setSceneState: vi.fn(),
      speedMultiplier: 1,
      inputLagMs: 0,
      updateAttackStylePerCategory: vi.fn(),
    };
    function Driver() {
      const wiring = useSimulationWiring(params);
      current = wiring;
      useAppHotkeys({
        onReset: wiring.replay.replayPractice.onRetry,
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      });
      return wiring.replay.replayMode ? (
        <ReplayControls
          compact={false}
          {...wiring.replay.controlProps}
          replayPractice={wiring.replay.replayPractice}
          onPreviewSeek={(index) => {
            previewCalls(index);
            wiring.replay.controlProps.onPreviewSeek(index);
          }}
        />
      ) : null;
    }
    render(<Driver />);
    const live = () => {
      if (!current) throw new Error('Missing real simulation wiring');
      return current;
    };
    act(() =>
      live().setEngine(
        new SimulationEngine({
          encounter: new YamaEncounter(undefined, 1234),
          combatSeed: 5678,
          startPos: [31, 37],
          enableIntro: false,
        }),
      ),
    );
    return { live, previewCalls };
  }

  it.each([
    [9, 8, 'Practice', true, true],
    [9, 8, 'Take over', true, true],
    [6, 7, 'Practice', true, true],
    [6, 7, 'Take over', false, true],
    [9, 8, 'Practice', false, true],
    [9, 8, 'Practice', true, false],
    [9, 8, 'Take over', true, false],
  ] as const)('scrub %s→%s through %s plays the shown tick from its predecessor before parent commit, countdown=%s, released=%s', (initial, selected, action, countdown, release) => {
    const { live, previewCalls } = mountWiredReplay({ countdown });
    act(() => live().fastForwardTicks(12));
    act(() => live().replay.controlProps.onEnterReplay());
    act(() => live().replay.controlProps.onSeek(initial));
    const slider = screen.getByRole('slider', { name: 'Seek replay' });
    fireEvent.change(slider, { target: { value: String(selected) } });
    if (release) advanceFrame(50);
    expect(screen.getByRole('textbox', { name: 'Replay tick' })).toHaveValue(String(selected));
    act(() => {
      if (release) fireEvent.pointerUp(slider);
      fireEvent.click(screen.getByRole('button', { name: action }));
    });
    // The preflight is the completed predecessor; its end is where the selected tick starts.
    expect
      .soft(live().replay.replayFrameStore.getSnapshot().preview)
      .toMatchObject({ frameIndex: selected - 1, completedBoundary: true });
    advanceFrame(100);
    advanceFrame(116);
    if (!release) expect(previewCalls).not.toHaveBeenCalled();
    expect.soft(live().engine.currentTick).toBe(selected - 1);
    expect.soft(live().simulationState.currentTick).toBe(selected - 1);
    expect.soft(live().replay.replayPractice.startTick).toBe(action === 'Practice' ? selected : null);
    expect.soft(live().replay.replayPractice.startFrameIndex).toBe(action === 'Practice' ? selected : null);
    const go = countdown ? 1916 : 116;
    if (countdown) {
      expect(live().fightStartCountdown?.endsAtMs).toBe(go);
      advanceFrame(go);
      expect.soft(live().engine.currentTick).toBe(selected - 1);
    }
    advanceFrame(go + 599);
    expect.soft(live().engine.currentTick).toBe(selected - 1);
    advanceFrame(go + 600);
    expect.soft(live().engine.currentTick).toBe(selected);
    if (!countdown && action === 'Practice') {
      act(() => live().fastForwardTicks(12));
      fireEvent.keyDown(window, { key: 'r', ctrlKey: true });
      advanceFrame(800);
      advanceFrame(816);
      expect.soft(live().engine.currentTick).toBe(selected - 1);
      expect.soft(live().replay.replayPractice.startTick).toBe(selected);
      advanceFrame(1415);
      expect.soft(live().engine.currentTick).toBe(selected - 1);
      advanceFrame(1416);
      expect.soft(live().engine.currentTick).toBe(selected);
    }
  });

  it('plays typed tick 8 from recorded tick 7: GO keeps 7, and only the new input reaches tick 8', () => {
    const { live } = mountWiredReplay({ countdown: true });
    act(() => live().fastForwardTicks(7));
    // The original run toggled run on tick 8; practice must not replay that.
    act(() => live().handleRunToggle());
    act(() => live().fastForwardTicks(12));
    const original = live().replay.exportReplayData();
    expect(original.frames[8]?.actions).toEqual([{ type: 'runToggle' }]);
    act(() => live().replay.controlProps.onEnterReplay());
    const field = screen.getByRole('textbox', { name: 'Replay tick' });
    fireEvent.change(field, { target: { value: '8' } });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Practice' }));
    });
    const preview = live().replay.replayFrameStore.getSnapshot().preview;
    expect(preview).toMatchObject({ frameIndex: 7, completedBoundary: true });
    expect(preview?.state.currentTick).toBe(7);
    expect(preview?.events).toEqual(original.frames[7]?.events);
    advanceFrame(100);
    advanceFrame(116);
    expect(live().replay.replayMode).toBe(false);
    expect(live().engine.currentTick).toBe(7);
    expect(live().simulationState.currentTick).toBe(7);
    expect(live().replay.replayPractice).toMatchObject({ startTick: 8, startFrameIndex: 8 });
    expect(live().replay.restoredPresentation).toMatchObject({
      tick: 7,
      timeMs: 8 * 600,
      history: { throughFrameIndex: 7 },
    });
    expect(live().replay.restoredPresentation?.history.frames).toHaveLength(8);
    const runBefore = original.frames[7]?.state.isRunEnabled;
    expect(live().engine.getState().isRunEnabled).toBe(runBefore);

    const go = 1916;
    expect(live().fightStartCountdown?.endsAtMs).toBe(go);
    advanceFrame(go);
    expect(live().engine.currentTick).toBe(7);
    advanceFrame(go + 100);
    expect(live().engine.currentTick).toBe(7);
    act(() => live().handleAttackStyleChange(1));
    advanceFrame(go + 599);
    expect(live().engine.currentTick).toBe(7);
    advanceFrame(go + 600);
    expect(live().engine.currentTick).toBe(8);
    const branch = live().replay.exportReplayData();
    expect(branch.frames).toHaveLength(9);
    expect(branch.frames[8]?.state.currentTick).toBe(8);
    expect(branch.frames[8]?.actions).toEqual([{ type: 'attackStyleChange', index: 1 }]);
    expect(branch.frames[8]?.state.isRunEnabled).toBe(runBefore);
    expect(branch.frames[8]?.state.isRunEnabled).not.toBe(original.frames[8]?.state.isRunEnabled);
    expect(branch.frames[8]?.state.selectedAttackStyleIndex).toBe(1);
    expect(live().replay.replayPractice.startTick).toBe(8);
  });
});
