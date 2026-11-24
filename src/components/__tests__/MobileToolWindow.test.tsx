// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from '../../core/SimulationEngine';
import { InfernoEncounter } from '../../encounters/inferno/InfernoEncounter';
import { encounterControlsForKind } from '../../encounters/modules';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import { DEFAULT_MOBILE_TOOL_WINDOW, type MobileToolWindowState } from '../../layout/osmToolWindowState';
import { defaultOsmFrame } from '../../test/helpers/osmFrame';
import { ContextMenuProvider } from '../ContextMenu';
import { MobileToolWindow, type MobileToolWindowProps, type MobileToolWindowReplay } from '../MobileToolWindow';
import { TooltipProvider } from '../Tooltip';
import { makeReplayPractice } from './ReplayPractice.fixtures';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});
const viewport = { width: 844, height: 390 };
const frame = defaultOsmFrame(viewport, { top: 0, right: 0, bottom: 0, left: 0 });
function replayControls(overrides: Partial<MobileToolWindowReplay> = {}): MobileToolWindowReplay {
  return {
    isReplaying: false,
    hasRecording: true,
    onEnterReplay: vi.fn(),
    replayFrameIndex: 3,
    totalFrames: 20,
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
function Harness({
  // The window's own rules start from it opened on its home tab; page loads start closed (the app test).
  initial = { ...DEFAULT_MOBILE_TOOL_WINDOW, open: true },
  replay: given = replayControls(),
  live = false,
  ...overrides
}: Partial<MobileToolWindowProps> & { initial?: MobileToolWindowState; live?: boolean }) {
  const [state, setState] = useState(initial);
  const [playing, setPlaying] = useState(given.isReplaying);
  const [target, setTarget] = useState<Element | null>(null);
  const [engine] = useState(() => new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 33] }));
  const replay = live
    ? {
        ...given,
        isReplaying: playing,
        onEnterReplay: () => {
          given.onEnterReplay();
          setPlaying(true);
        },
        onExitReplay: () => {
          given.onExitReplay();
          setPlaying(false);
        },
      }
    : given;
  return (
    <TooltipProvider>
      <ContextMenuProvider>
        <MobileToolWindow
          frame={frame}
          viewport={viewport}
          state={state}
          onStateChange={setState}
          tutorialTarget={target}
          zIndex={20}
          simulationState={engine.getState()}
          engine={engine}
          mechanicsConfig={{ infiniteHealth: false }}
          onMechanicsConfigChange={vi.fn()}
          mechanicsToggles={[
            {
              key: 'role',
              label: 'Practice as',
              setup: true,
              choices: [
                { label: 'Player 1', value: 'one' },
                { label: 'Player 2', value: 'two' },
              ],
            },
            { key: 'infiniteHealth', label: 'Infinite Health', group: 'aid' },
          ]}
          debugActions={[]}
          onExecuteEncounterCommand={vi.fn()}
          onSetBossHp={vi.fn()}
          menuHostRef={(node) => {
            if (node && !node.firstChild)
              node.innerHTML =
                '<nav class="sidebar-nav sidebar-nav--tools"><button data-tutorial="settings-button">Settings</button><button data-mobile-menu-page="browse" data-tutorial="encounters-button">Encounters</button></nav>';
          }}
          {...overrides}
          replay={replay}
        />
        <button type="button" onClick={() => setTarget(document.querySelector('[data-tutorial="mobile-practice"]'))}>
          point at practice
        </button>
        <button type="button" onClick={() => setTarget(document.querySelector('[data-tutorial="encounters-button"]'))}>
          point at encounters
        </button>
        <button type="button" onClick={() => setTarget(document.querySelector('[data-tool-tab="replay"]'))}>
          point at replay
        </button>
        <button type="button" onClick={() => setTarget(null)}>
          end step
        </button>
        <button type="button" onClick={() => setPlaying(false)}>
          end playback elsewhere
        </button>
      </ContextMenuProvider>
    </TooltipProvider>
  );
}
const tab = (name: string) => screen.getByRole('button', { name });
const win = () => document.querySelector('.osm-tools__window')!;
const dock = () => document.querySelector('.osm-tools__dock-button')!;
const choose = (label: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Back to Practice' }));
  fireEvent.click(screen.getByRole('button', { name: label }));
};

describe('left-slot tools', () => {
  it.each([
    [568, 320],
    [1024, 768],
  ])('renders the footer at the same height and baseline as Tools at %s×%s', (width, height) => {
    const size = { width, height };
    render(<Harness viewport={size} frame={defaultOsmFrame(size)} />);
    const panel = win() as HTMLElement;
    const toggle = document.querySelector('.osm-tools__dock') as HTMLElement;
    const footer = document.querySelector('.osm-tools__tabs') as HTMLElement;
    expect(footer.style.flexBasis).toBe(toggle.style.height);
    expect(Number.parseFloat(panel.style.top) + Number.parseFloat(panel.style.height)).toBe(
      Number.parseFloat(toggle.style.top) + Number.parseFloat(toggle.style.height),
    );
    expect(Number.parseFloat(toggle.style.left) + Number.parseFloat(toggle.style.width)).toBe(
      Number.parseFloat(panel.style.left),
    );
  });
  it('has three labeled tabs and one stable Tools toggle, without an attached Close or stone sprites', () => {
    render(<Harness />);
    expect(tab('Practice')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: 'Set Yama health' })).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Player 1' })).toBeNull();
    expect(screen.queryByText('HUD')).toBeNull();
    expect(document.querySelector('.osm-tools canvas')).toBeNull();
    expect(dock()).toHaveTextContent('Tools');
    expect(dock()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Close')).toBeNull();
  });
  it('uses named launcher glyphs rather than clipping footer labels in a narrowed portrait slot', () => {
    const size = { width: 390, height: 844 };
    render(<Harness viewport={size} frame={defaultOsmFrame(size)} />);
    for (const name of ['Practice', 'Replay', 'Menu']) {
      expect(tab(name).querySelector('svg')).not.toBeNull();
      expect(tab(name).textContent).toBe('');
    }
    fireEvent.click(tab('Menu'));
    expect(tab('Menu')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(tab('Practice'));
    expect(screen.getByRole('slider', { name: 'Set Yama health' })).toBeVisible();
  });
  it('degrades an unusably narrow slot without losing the selected Practice group or starting hidden replay', () => {
    const enter = vi.fn();
    const replay = replayControls({ onEnterReplay: enter });
    const view = render(<Harness replay={replay} />);
    choose('Practice aids');
    const size = { width: 320, height: 284 };
    const tiny = defaultOsmFrame(size, { top: 8, right: 34, bottom: 24, left: 47 }, { devicePixelRatio: 1.25 });
    view.rerender(<Harness viewport={size} frame={tiny} replay={replay} />);
    expect(screen.getByRole('note')).toHaveTextContent('More room needed.');
    expect(screen.getByRole('note')).toHaveTextContent('Increase interface scaling or enlarge the view.');
    expect(screen.queryByRole('checkbox', { name: 'Infinite Health' })).toBeNull();
    for (const name of ['Practice', 'Replay', 'Menu']) expect(tab(name)).toBeDisabled();
    fireEvent.click(tab('Replay'));
    expect(enter).not.toHaveBeenCalled();
    expect(document.querySelector('[data-tutorial="mobile-practice"]')).not.toBeNull();
    fireEvent.click(dock());
    expect(win()).toHaveAttribute('hidden');
    fireEvent.click(dock());
    view.rerender(<Harness replay={replay} />);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Infinite Health' })).toBeVisible();
    fireEvent.click(dock());
    expect(win()).toHaveAttribute('hidden');
  });
  it('changes one control group without growing the window', () => {
    render(<Harness />);
    const box = win().getAttribute('style');
    choose('Practice as');
    expect(screen.queryByRole('slider', { name: 'Set Yama health' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Player 1' })).toBeVisible();
    expect(win().getAttribute('style')).toBe(box);
    choose('Practice aids');
    expect(screen.getByRole('checkbox', { name: 'Infinite Health' })).toBeVisible();
    expect(screen.queryByRole('radio', { name: 'Player 1' })).toBeNull();
  });
  it('opens health directly, returns to the Practice overview, and drills into a group without changing the slot', () => {
    render(<Harness />);
    const box = win().getAttribute('style');
    const back = screen.getByRole('button', { name: 'Back to Practice' });
    expect(back).toHaveTextContent('Boss health');
    expect(back).not.toHaveAttribute('aria-expanded');
    expect(screen.getByRole('slider', { name: 'Set Yama health' })).toBeVisible();
    fireEvent.click(back);
    expect(screen.getByRole('heading', { name: 'Practice' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Back to Practice' })).toBeNull();
    expect(screen.queryByRole('slider', { name: 'Set Yama health' })).toBeNull();
    const role = screen.getByRole('button', { name: 'Practice as' });
    expect(role).not.toHaveAttribute('aria-pressed');
    fireEvent.click(role);
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toHaveTextContent('Practice as');
    expect(screen.getByRole('radio', { name: 'Player 1' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Practice' }));
    expect(screen.getByRole('heading', { name: 'Practice' })).toBeVisible();
    expect(win().getAttribute('style')).toBe(box);
    expect(document.querySelector('[data-tutorial="mobile-practice"]')).toContainElement(
      screen.getByRole('heading', { name: 'Practice' }),
    );
  });
  it('remembers the current group when returning from Menu', () => {
    render(<Harness />);
    choose('Practice as');
    fireEvent.click(tab('Menu'));
    fireEvent.click(tab('Practice'));
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toHaveTextContent('Practice as');
    expect(screen.getByRole('radio', { name: 'Player 1' })).toBeVisible();
  });
  it('uses the real mechanics callback', () => {
    const onMechanicsConfigChange = vi.fn();
    render(<Harness onMechanicsConfigChange={onMechanicsConfigChange} />);
    choose('Practice aids');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Infinite Health' }));
    expect(onMechanicsConfigChange).toHaveBeenCalledWith({ infiniteHealth: true });
  });
  it('uses a compact group title without changing the shared choice or help labels', () => {
    render(
      <Harness
        mechanicsToggles={[
          {
            key: 'direction',
            label: 'Fireball Orientation',
            compactLabel: 'Fireballs',
            setup: true,
            info: 'Choose the direction.',
            choices: [{ label: 'Horizontal', value: 'horizontal' }],
          },
        ]}
      />,
    );
    choose('Fireballs');
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toHaveTextContent('Fireballs');
    expect(screen.getByRole('radiogroup', { name: 'Fireball Orientation' })).toBeVisible();
    expect(
      within(document.querySelector('.osm-tools__group-head') as HTMLElement).getByRole('button', {
        name: 'About Fireball Orientation',
      }),
    ).toBeVisible();
  });
  it('offers the real full-restart shortcut from health, but not during a practice session', () => {
    const onRestart = vi.fn();
    const rendered = render(<Harness onRestart={onRestart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restart fight' }));
    expect(onRestart).toHaveBeenCalledOnce();
    rendered.rerender(<Harness onRestart={onRestart} replayPractice={makeReplayPractice({ startTick: 8 })} />);
    choose('Boss health');
    expect(document.querySelector('.osm-tools__quick-restart')).toBeNull();
  });
  it('puts single-choice help beside the back header without nesting it in the back button', () => {
    render(
      <Harness
        mechanicsToggles={[
          {
            key: 'role',
            label: 'Practice as',
            setup: true,
            info: 'Choose your role.',
            choices: [
              { label: 'Player 1', value: 'one' },
              { label: 'Player 2', value: 'two' },
            ],
          },
        ]}
      />,
    );
    choose('Practice as');
    const header = document.querySelector('.osm-tools__group-head')!;
    expect(within(header as HTMLElement).getByRole('button', { name: 'About Practice as' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to Practice' }).querySelector('button')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Practice as' })).toBeVisible();
    expect(document.querySelector('.osm-tools__practice-content')).toHaveClass(
      'osm-tools__practice-content--single-choice',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to Practice' }));
    expect(within(header as HTMLElement).queryByRole('button', { name: 'About Practice as' })).toBeNull();
  });
  it('keeps dependent choices labeled in the same group rather than suppressing their context', () => {
    render(
      <Harness
        mechanicsToggles={[
          {
            key: 'parent',
            label: 'Pattern',
            setup: true,
            choices: [
              { label: 'On', value: 'on' },
              { label: 'Off', value: 'off' },
            ],
          },
          {
            key: 'child',
            label: 'Direction',
            setup: true,
            dependsOn: 'parent',
            choices: [{ label: 'North', value: 'north' }],
          },
        ]}
      />,
    );
    choose('Pattern');
    expect(screen.getByRole('radiogroup', { name: 'Direction' })).toBeVisible();
    expect(document.querySelector('.osm-tools__practice-content')).not.toHaveClass(
      'osm-tools__practice-content--single-choice',
    );
  });
  it('keeps busy practice actions disabled', () => {
    render(<Harness replayPractice={makeReplayPractice({ startTick: 8, busy: true })} />);
    expect(screen.getByRole('button', { name: 'Restart from tick 8' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear restart point' })).toBeDisabled();
  });
  it('keeps full restart explicit in its own group', () => {
    const onRestart = vi.fn();
    render(<Harness onRestart={onRestart} />);
    choose('Restart fight');
    fireEvent.click(tab('Restart fight'));
    expect(onRestart).toHaveBeenCalledOnce();
  });
  it('leads with the session when present and keeps Restart, Change and Clear reachable', () => {
    const controls = makeReplayPractice({ startTick: 8 });
    render(<Harness replayPractice={controls} />);
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toHaveTextContent('Session');
    fireEvent.click(screen.getByRole('button', { name: 'Restart from tick 8' }));
    fireEvent.click(tab('Change'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear restart point' }));
    expect(controls.onRetry).toHaveBeenCalledOnce();
    expect(controls.onChangeStart).toHaveBeenCalledOnce();
    expect(controls.onClearStart).toHaveBeenCalledOnce();
    choose('Boss health');
    choose('Practice session');
    expect(screen.getByRole('group', { name: 'Practice session' })).toBeVisible();
  });
  it('shows the encounter’s own session on the session page, unless replay practice holds it', () => {
    const onClick = vi.fn();
    const encounterSession = {
      title: 'Wave 47',
      primary: { label: 'Retry wave 47', hint: 'Start wave 47 again.', onClick },
    };
    const rendered = render(<Harness encounterSession={encounterSession} />);
    choose('Practice session');
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toHaveTextContent('Session');
    fireEvent.click(screen.getByRole('button', { name: 'Retry wave 47' }));
    expect(onClick).toHaveBeenCalledOnce();
    rendered.rerender(
      <Harness encounterSession={encounterSession} replayPractice={makeReplayPractice({ startTick: 8 })} />,
    );
    expect(screen.getByRole('button', { name: 'Restart from tick 8' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retry wave 47' })).toBeNull();
  });
  it('lists Random spawns or Lock layout in Actions as the run places its wave, not as the saved setup says', () => {
    const engine = new SimulationEngine({ encounter: new InfernoEncounter(99) });
    engine.setMechanicsConfig({ ...engine.getMechanicsConfig(), infernoStartWave: '6' });
    const random = engine.getState();
    const { encounter } = random;
    if (encounter.kind !== 'inferno') throw new Error('wrong encounter');
    const withState = (state: Partial<typeof encounter.state>) => ({
      ...random,
      encounter: { ...encounter, state: { ...encounter.state, ...state } },
    });
    const custom = withState({ startSpawnLayout: '6:-b-l----b' });
    const execute = vi.fn();
    const shared = {
      engine,
      debugActions: encounterControlsForKind('inferno')?.debugActions ?? [],
      onExecuteEncounterCommand: execute,
    };
    // A layout for wave 6 saved since the run started random: still Lock layout.
    const savedCustom = { infiniteHealth: false, infernoStartWave: '6', infernoSpawnLayout: '6:-b-l----b' };
    const rendered = render(<Harness {...shared} simulationState={random} mechanicsConfig={savedCustom} />);
    choose('Actions');
    const actions = () => within(document.querySelector('.mechanics-actions') as HTMLElement);
    expect(actions().getByRole('button', { name: 'Lock Layout' })).toBeVisible();
    expect(actions().queryByRole('button', { name: 'Random Spawns' })).toBeNull();
    fireEvent.click(actions().getByRole('button', { name: 'Lock Layout' }));
    expect(execute).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'keep-spawns' });
    // The run now keeping those spawns (a run override the saved setup never has): Random spawns.
    rendered.rerender(
      <Harness {...shared} simulationState={withState({ pinnedWave: 6 })} mechanicsConfig={savedCustom} />,
    );
    expect(actions().queryByRole('button', { name: 'Lock Layout' })).toBeNull();
    fireEvent.click(actions().getByRole('button', { name: 'Random Spawns' }));
    expect(execute).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'reroll-wave' });
    // Random spawns dropped the pin: Lock layout again.
    rendered.rerender(<Harness {...shared} simulationState={random} mechanicsConfig={savedCustom} />);
    expect(actions().getByRole('button', { name: 'Lock Layout' })).toBeVisible();
    expect(actions().queryByRole('button', { name: 'Random Spawns' })).toBeNull();
    // The same wave's run now placed from the layout, the saved setup random: Random spawns.
    rendered.rerender(
      <Harness {...shared} simulationState={custom} mechanicsConfig={{ ...savedCustom, infernoSpawnLayout: '' }} />,
    );
    expect(actions().getByRole('button', { name: 'Retry Wave' })).toBeVisible();
    expect(actions().queryByRole('button', { name: 'Lock Layout' })).toBeNull();
    fireEvent.click(actions().getByRole('button', { name: 'Random Spawns' }));
    expect(execute).toHaveBeenLastCalledWith({ encounter: 'inferno', type: 'reroll-wave' });
  });
  it('docks and restores the last tab', () => {
    render(<Harness />);
    fireEvent.click(tab('Menu'));
    fireEvent.click(dock());
    expect(win()).toHaveAttribute('hidden');
    expect(dock()).toHaveTextContent('Tools');
    fireEvent.click(dock());
    expect(tab('Menu')).toHaveAttribute('aria-pressed', 'true');
  });
  it('closes on the selected tab or Escape but never on a scene click', () => {
    render(<Harness />);
    fireEvent.click(document.body);
    expect(win()).not.toHaveAttribute('hidden');
    fireEvent.click(tab('Practice'));
    expect(win()).toHaveAttribute('hidden');
    fireEvent.click(dock());
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(win()).toHaveAttribute('hidden');
  });
  it('keeps menu handoff and Browse inside the slot', () => {
    render(<Harness />);
    fireEvent.click(tab('Menu'));
    const { top, height } = (win() as HTMLElement).style;
    const before = { top, height };
    const bottom = parseFloat(before.top) + parseFloat(before.height);
    fireEvent.click(tab('Browse'));
    const after = (win() as HTMLElement).style;
    expect(parseFloat(after.top) + parseFloat(after.height)).toBe(bottom);
    expect(after.height).toBe(before.height);
    expect(after.top).toBe(before.top);
    expect(document.querySelector('.osm-tools__menu')).toHaveClass('osm-tools__menu--browse');
    fireEvent.click(tab('Encounters'));
    expect(win()).toHaveAttribute('hidden');
    fireEvent.click(dock());
    expect(tab('Practice')).toHaveAttribute('aria-pressed', 'true');
  });
  it('uses app hover hints without browser titles', async () => {
    render(<Harness />);
    fireEvent.pointerEnter(dock(), { pointerType: 'touch' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.pointerEnter(dock(), { pointerType: 'mouse' });
    expect(await waitFor(() => screen.getByRole('tooltip'))).toHaveTextContent('Close tools');
    expect(document.querySelector('.osm-tools [title]:not([title=""])')).toBeNull();
  });
  it('reports its occupied slot and then its dock; unmount clears it', () => {
    const onOccupiedChange = vi.fn();
    const rendered = render(<Harness onOccupiedChange={onOccupiedChange} />);
    expect(onOccupiedChange.mock.lastCall?.[0]).toHaveLength(2);
    expect(onOccupiedChange.mock.lastCall?.[0][0].width).toBeGreaterThanOrEqual(150);
    fireEvent.click(dock());
    expect(onOccupiedChange.mock.lastCall?.[0]).toHaveLength(1);
    expect(onOccupiedChange.mock.lastCall?.[0][0].width).toBeGreaterThanOrEqual(44);
    rendered.unmount();
    expect(onOccupiedChange).toHaveBeenLastCalledWith([]);
  });
});

describe('replay mode', () => {
  it('starts playback in the same native slot without changing position or size', () => {
    const replay = replayControls();
    render(<Harness replay={replay} live />);
    const { top, height, left } = (win() as HTMLElement).style;
    const before = { top, height, left };
    const bottom = parseFloat(before.top) + parseFloat(before.height);
    fireEvent.click(tab('Replay'));
    expect(replay.onEnterReplay).toHaveBeenCalledOnce();
    expect(screen.getByRole('toolbar', { name: 'Replay controls' })).toBeVisible();
    const after = (win() as HTMLElement).style;
    expect(after.left).toBe(left);
    expect(parseFloat(after.top) + parseFloat(after.height)).toBe(bottom);
    expect(after.height).toBe(before.height);
    expect(after.top).toBe(before.top);
  });
  it('explains the empty replay without starting playback', () => {
    const replay = replayControls({ hasRecording: false });
    render(<Harness replay={replay} live />);
    fireEvent.click(tab('Replay'));
    expect(screen.getByText('No fight recorded yet.')).toBeVisible();
    expect(replay.onEnterReplay).not.toHaveBeenCalled();
  });
  for (const how of ['Practice', 'Menu', 'Replay', 'dock', 'Exit'])
    it(`exits playback exactly once via ${how}`, () => {
      const replay = replayControls();
      render(<Harness replay={replay} live />);
      fireEvent.click(tab('Replay'));
      if (how === 'dock') fireEvent.click(dock());
      else if (how === 'Exit') {
        fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
        fireEvent.click(tab('Exit replay'));
      } else fireEvent.click(tab(how));
      expect(replay.onExitReplay).toHaveBeenCalledOnce();
    });
  it('keeps More actions reachable and closes More before exiting on Escape', () => {
    const replay = replayControls();
    render(<Harness replay={replay} replayPractice={makeReplayPractice()} live />);
    fireEvent.click(tab('Replay'));
    expect(screen.getByRole('button', { name: 'More replay actions' })).toHaveTextContent('More');
    fireEvent.click(screen.getByRole('button', { name: 'More replay actions' }));
    expect(document.querySelector('.replay-more-toggle')).toHaveTextContent('Back');
    expect(
      within(screen.getByRole('toolbar', { name: 'Replay controls' })).getByRole('button', { name: 'Practice' }),
    ).toBeVisible();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(replay.onExitReplay).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(replay.onExitReplay).toHaveBeenCalledOnce();
  });
  it('returns to Practice if playback ends elsewhere, without exiting twice', () => {
    const replay = replayControls();
    render(<Harness replay={replay} live />);
    fireEvent.click(tab('Replay'));
    fireEvent.click(tab('end playback elsewhere'));
    expect(tab('Practice')).toHaveAttribute('aria-pressed', 'true');
    expect(replay.onExitReplay).not.toHaveBeenCalled();
  });
  it('brings an externally started replay out of the dock', () => {
    render(<Harness initial={{ open: false, tab: 'practice' }} replay={replayControls({ isReplaying: true })} />);
    expect(win()).not.toHaveAttribute('hidden');
    expect(tab('Replay')).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('tutorial presentation', () => {
  it('explains why setup is unavailable when a tutorial reveals Practice during playback', () => {
    render(<Harness replay={replayControls({ isReplaying: true })} />);
    fireEvent.click(tab('point at practice'));
    expect(screen.getByText('Practice is off while a replay plays.')).toBeVisible();
    expect(screen.queryByRole('slider', { name: 'Set Yama health' })).toBeNull();
  });
  it('temporarily brings up Practice while preserving the closed user state', () => {
    render(<Harness initial={{ open: false, tab: 'menu' }} />);
    fireEvent.click(tab('point at practice'));
    expect(tab('Practice')).toHaveAttribute('aria-pressed', 'true');
    expect(win()).not.toHaveAttribute('hidden');
    fireEvent.click(tab('end step'));
    expect(win()).toHaveAttribute('hidden');
  });
  it('opens the Browse page for a target inside that menu page', () => {
    render(<Harness initial={{ open: false, tab: 'practice' }} />);
    fireEvent.click(tab('point at encounters'));
    expect(tab('Menu')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('.osm-tools__menu')).toHaveClass('osm-tools__menu--browse');
  });
  it('keeps the targeted replay tab actionable, rather than toggling it closed', () => {
    const replay = replayControls();
    render(<Harness replay={replay} live initial={{ open: false, tab: 'practice' }} />);
    fireEvent.click(tab('point at replay'));
    fireEvent.click(tab('Replay'));
    expect(replay.onEnterReplay).toHaveBeenCalledOnce();
  });
});
