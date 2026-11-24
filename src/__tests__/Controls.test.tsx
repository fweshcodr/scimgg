// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DisplayControls,
  InterfaceControls,
  interfaceScalingSummary,
  ShortcutHintsControl,
  SimulationControls,
  ViewportPopoutControl,
} from '../components/Controls';
import { useIsMobileDevice } from '../hooks/useIsMobileDevice';
import {
  DEFAULT_GAME_RESOLUTION,
  type GameResolutionSettings,
  PERSISTED_SETTINGS_DEFAULTS,
} from '../hooks/usePersistedSettings';
import { DEVICE_MODE_STORAGE_KEY, getDeviceMode, resetDeviceModeForTests } from '../util/deviceMode';

vi.mock('../hooks/useIsMobileDevice', () => ({
  useIsMobileDevice: vi.fn(() => false),
  useDeviceMode: vi.fn(() => 'auto'),
}));

type GameResolutionChangeFn = (resolution: GameResolutionSettings) => void;

/** A stand-in Plugins drawer with the Stretched Mode row, so a link to it has somewhere to land. */
function StretchedModeRow() {
  return (
    <aside className="plugins-overlay">
      <div data-search-id="plugins.stretchedMode" />
    </aside>
  );
}

describe('SimulationControls', () => {
  const mockProps = {
    onReset: vi.fn(),
    speedMultiplier: 1,
    onSpeedChange: vi.fn(),
    autoAdvance: false,
    onAutoAdvanceToggle: vi.fn(),
    pauseWhenUnfocused: true,
    onPauseWhenUnfocusedChange: vi.fn(),
    inputLagMs: 0,
    onInputLagMsChange: vi.fn(),
    fightStartCountdown: true,
    onFightStartCountdownChange: vi.fn(),
    fightStartCountdownTicks: 3,
    onFightStartCountdownTicksChange: vi.fn(),
  };

  it('renders without crashing', () => {
    render(<SimulationControls {...mockProps} />);
    expect(screen.getByText(/Restart/)).toBeDefined();
  });

  it('keeps full reset explicit and hides the Ctrl+R hint when that key retries a practice start', () => {
    const onReset = vi.fn();
    render(<SimulationControls {...mockProps} onReset={onReset} restartShortcutTargetsPractice />);
    expect(screen.queryByText('(Ctrl+R)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Restart Simulation' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('renders all speed buttons', () => {
    render(<SimulationControls {...mockProps} />);
    expect(screen.getByText('0.5x')).toBeDefined();
    expect(screen.getByText('1x')).toBeDefined();
    expect(screen.getByText('2x')).toBeDefined();
  });

  it('calls onReset when restart button clicked', () => {
    render(<SimulationControls {...mockProps} />);
    const resetButton = screen.getByText(/Restart/);
    fireEvent.click(resetButton);
    expect(mockProps.onReset).toHaveBeenCalled();
  });

  it('calls onSpeedChange when speed button clicked', () => {
    render(<SimulationControls {...mockProps} />);
    const fastButton = screen.getByText('2x');
    fireEvent.click(fastButton);
    expect(mockProps.onSpeedChange).toHaveBeenCalledWith(2);
  });

  it('highlights active speed button', () => {
    render(<SimulationControls {...mockProps} speedMultiplier={2} />);
    const fastButton = screen.getByText('2x');
    expect(fastButton).toBeDefined();
  });

  it('renders auto-advance checkbox', () => {
    render(<SimulationControls {...mockProps} />);
    expect(screen.getByText('Auto-Advance')).toBeDefined();
  });

  it('lets the player turn off focus pausing', () => {
    const onPauseWhenUnfocusedChange = vi.fn();
    render(<SimulationControls {...mockProps} onPauseWhenUnfocusedChange={onPauseWhenUnfocusedChange} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Pause simulator when unfocused' });
    expect(checkbox).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(checkbox);

    expect(onPauseWhenUnfocusedChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('resets focus pausing to its enabled default', () => {
    const onPauseWhenUnfocusedChange = vi.fn();
    render(
      <SimulationControls
        {...mockProps}
        pauseWhenUnfocused={false}
        onPauseWhenUnfocusedChange={onPauseWhenUnfocusedChange}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Pause simulator when unfocused' });
    expect(checkbox).toHaveAttribute('aria-checked', 'false');
    const row = checkbox.closest('.setting-row');
    if (!(row instanceof HTMLElement)) throw new Error('Missing setting row');

    fireEvent.click(within(row).getByRole('button', { name: 'Reset to default' }));

    expect(onPauseWhenUnfocusedChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  describe('start of fight countdown', () => {
    const lengthSlider = () => screen.getByRole('slider', { name: 'Countdown length in ticks' });

    it('turns the countdown off and grays out its length with it', () => {
      const onFightStartCountdownChange = vi.fn();
      const { rerender } = render(
        <SimulationControls {...mockProps} onFightStartCountdownChange={onFightStartCountdownChange} />,
      );
      const checkbox = screen.getByRole('checkbox', { name: 'Countdown' });
      expect(checkbox).toHaveAttribute('aria-checked', 'true');
      expect(lengthSlider()).not.toBeDisabled();

      fireEvent.click(checkbox);
      expect(onFightStartCountdownChange).toHaveBeenCalledExactlyOnceWith(false);

      rerender(<SimulationControls {...mockProps} fightStartCountdown={false} />);
      expect(lengthSlider()).toBeDisabled();
      const row = screen.getByRole('checkbox', { name: 'Countdown' }).closest('.setting-row');
      expect(row).toHaveClass('setting-row--modified');
    });

    it('sets the length in whole ticks from 1 to 5, and resets it to 3', () => {
      const onFightStartCountdownTicksChange = vi.fn();
      const { rerender } = render(
        <SimulationControls {...mockProps} onFightStartCountdownTicksChange={onFightStartCountdownTicksChange} />,
      );
      expect(lengthSlider()).toHaveAttribute('min', '1');
      expect(lengthSlider()).toHaveAttribute('max', '5');
      expect(screen.getByText('3 ticks')).toBeDefined();
      expect(lengthSlider()).toHaveAttribute('aria-valuetext', '3 ticks');
      expect(screen.queryByRole('button', { name: 'Reset countdown length to default' })).toBeNull();

      fireEvent.change(lengthSlider(), { target: { value: '5' } });
      expect(onFightStartCountdownTicksChange).toHaveBeenLastCalledWith(5);

      rerender(
        <SimulationControls
          {...mockProps}
          fightStartCountdownTicks={5}
          onFightStartCountdownTicksChange={onFightStartCountdownTicksChange}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Reset countdown length to default' }));
      expect(onFightStartCountdownTicksChange).toHaveBeenLastCalledWith(3);
    });

    it('uses a singular unit for one tick and keeps the game-tick hint', () => {
      render(<SimulationControls {...mockProps} fightStartCountdownTicks={1} />);
      expect(screen.getByText('1 tick')).toBeDefined();
      expect(lengthSlider()).toHaveAttribute('aria-valuetext', '1 tick');
      expect(screen.getByText('Counts down in game ticks before a fight starts.')).toBeDefined();
    });

    it('leaves countdown movement to encounter policy rather than a setting', () => {
      render(<SimulationControls {...mockProps} />);
      expect(screen.queryByRole('checkbox', { name: 'Move during countdown' })).toBeNull();
      expect(screen.getByRole('checkbox', { name: 'Countdown' })).toBeDefined();
      expect(lengthSlider()).toBeDefined();
    });
  });
});

const controlsMockProps = {
  smoothTerrain: false,
  onSmoothTerrainToggle: vi.fn(),
  brightness: 0.6,
  onBrightnessChange: vi.fn(),
  contrast: 1.0,
  onContrastChange: vi.fn(),
  saturation: 1.0,
  onSaturationChange: vi.fn(),
  selectedRenderer: 'webgl' as const,
  onRendererChange: vi.fn(),
  renderScale: 1,
  onRenderScaleChange: vi.fn(),
  fpsCap: 144,
  onFpsCapChange: vi.fn(),
  antiAliasing: 'auto' as const,
  onAntiAliasingChange: vi.fn(),
  gameResolution: DEFAULT_GAME_RESOLUTION,
  onGameResolutionChange: vi.fn(),
  clientLayoutMode: 'modern' as const,
  onClientLayoutModeChange: vi.fn(),
  onOpenPopout: vi.fn(),
  canPopOut: true,
  isPopoutWindow: false,
  viewportSizeWarning: null,
  interfaceScaling: {
    stretchedModeEnabled: true,
    uiScale: 1,
    fixedLayoutScale: 'fit' as const,
    mobileInterfaceScaling: 100,
  },
  transparentChatbox: false,
  onTransparentChatboxChange: vi.fn(),
  clickThroughTransparentChatbox: true,
  onClickThroughTransparentChatboxChange: vi.fn(),
  transparentSidePanel: PERSISTED_SETTINGS_DEFAULTS.transparentSidePanel,
  onTransparentSidePanelChange: vi.fn(),
  hotkeysCloseSidePanel: PERSISTED_SETTINGS_DEFAULTS.hotkeysCloseSidePanel,
  onHotkeysCloseSidePanelChange: vi.fn(),
};

describe('DisplayControls', () => {
  const mockProps = controlsMockProps;
  it('offers Auto, On and Off anti-aliasing and explains the reload requirement', () => {
    const onAntiAliasingChange = vi.fn();
    const { rerender } = render(<DisplayControls {...mockProps} onAntiAliasingChange={onAntiAliasingChange} />);
    const select = screen.getByRole('combobox', { name: 'Anti-aliasing' });
    expect(select).toHaveValue('auto');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Auto', 'On', 'Off']);
    expect(screen.getByText(/Takes effect after reload\./)).toBeDefined();
    expect(screen.getByText(/Auto turns it off on iPhone and iPad/)).toBeDefined();
    fireEvent.change(select, { target: { value: 'off' } });
    expect(onAntiAliasingChange).toHaveBeenLastCalledWith('off');
    rerender(<DisplayControls {...mockProps} antiAliasing="off" onAntiAliasingChange={onAntiAliasingChange} />);
    const row = select.closest('.setting-row');
    if (!(row instanceof HTMLElement)) throw new Error('Missing setting row');
    fireEvent.click(within(row).getByRole('button', { name: 'Reset to default' }));
    expect(onAntiAliasingChange).toHaveBeenLastCalledWith('auto');
  });
  it('renders without crashing', () => {
    render(<DisplayControls {...mockProps} />);
    expect(screen.getByText('Smooth Terrain')).toBeDefined();
  });

  it('names the render scale for the 3D scene and says it leaves the interface size alone', () => {
    render(<DisplayControls {...mockProps} />);
    expect(screen.getByRole('slider', { name: '3D render scale' })).toBeDefined();
    expect(screen.getByText(/Sharpness of the 3D scene\..*the interface keeps its size\./)).toBeDefined();
  });

  describe('2D view warning', () => {
    it('stays hidden while the 3D renderer is selected', () => {
      render(<DisplayControls {...mockProps} selectedRenderer="webgl" />);

      expect(screen.queryByText(/2D view is a debugging aid/)).toBeNull();
    });

    it('warns that 2D view is not fully playable when it is selected', () => {
      render(<DisplayControls {...mockProps} selectedRenderer="canvas2d" />);

      expect(screen.getByText(/not intended to be fully playable/)).toBeDefined();
    });
  });
});

describe('InterfaceControls', () => {
  const mockProps = controlsMockProps;

  describe('Device override', () => {
    afterEach(() => {
      localStorage.removeItem(DEVICE_MODE_STORAGE_KEY);
      resetDeviceModeForTests();
    });

    it('shows in both modes, so a wrong guess is reversible', () => {
      render(<InterfaceControls {...mockProps} />);
      expect(screen.getByRole('radiogroup', { name: 'Device Mode' })).toBeDefined();
      vi.mocked(useIsMobileDevice).mockReturnValue(true);
      try {
        render(<InterfaceControls {...mockProps} />);
        expect(screen.getAllByRole('radiogroup', { name: 'Device Mode' })).toHaveLength(2);
      } finally {
        vi.mocked(useIsMobileDevice).mockReturnValue(false);
      }
    });

    it('checks Auto by default and says what detection picked', () => {
      render(<InterfaceControls {...mockProps} />);
      const group = screen.getByRole('radiogroup', { name: 'Device Mode' });
      expect(within(group).getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'true');
      expect(within(group).getByRole('radio', { name: 'Mobile' })).toHaveAttribute('aria-checked', 'false');
      expect(within(group).getByRole('radio', { name: 'Desktop' })).toHaveAttribute('aria-checked', 'false');
      expect(
        within(group)
          .getAllByRole('radio')
          .map((radio) => radio.textContent),
      ).toEqual(['Auto', 'Mobile', 'Desktop']);
      expect(screen.getByText(/^Auto detects this device as (Mobile|Desktop)\.$/)).toBeDefined();
    });

    it("explains the override from the title's ? mark", () => {
      render(<InterfaceControls {...mockProps} />);
      const mark = screen.getByRole('button', { name: 'About Device Mode' });
      fireEvent.pointerDown(mark, { pointerType: 'touch' });
      fireEvent.pointerUp(mark, { pointerType: 'touch' });
      fireEvent.click(mark);
      expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
        'If Auto picks the wrong mode, choose Mobile or Desktop. Only this browser is affected.',
      );
    });

    it('stores the forced mode for this browser only', () => {
      render(<InterfaceControls {...mockProps} />);
      const group = screen.getByRole('radiogroup', { name: 'Device Mode' });
      fireEvent.click(within(group).getByRole('radio', { name: 'Mobile' }));
      expect(getDeviceMode()).toBe('mobile');
      expect(localStorage.getItem(DEVICE_MODE_STORAGE_KEY)).toBe('"mobile"');
    });
  });

  describe('Game window resolution dropdown', () => {
    let onGameResolutionChange: GameResolutionChangeFn;

    beforeEach(() => {
      onGameResolutionChange = vi.fn();
    });

    it('emits fit-mode defaults when Fit Window is selected', () => {
      render(
        <InterfaceControls
          {...mockProps}
          gameResolution={{ mode: 'fixed', width: 1280, height: 720, presetId: 'hd-720' }}
          onGameResolutionChange={onGameResolutionChange}
        />,
      );
      const select = screen.getByLabelText('Game window resolution') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'fit' } });
      expect(onGameResolutionChange).toHaveBeenCalledWith({ ...DEFAULT_GAME_RESOLUTION });
    });

    it('emits the matching preset dimensions when a preset is selected', () => {
      render(
        <InterfaceControls
          {...mockProps}
          gameResolution={{ ...DEFAULT_GAME_RESOLUTION }}
          onGameResolutionChange={onGameResolutionChange}
        />,
      );
      const select = screen.getByLabelText('Game window resolution') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'hd-1080' } });
      expect(onGameResolutionChange).toHaveBeenCalledWith({
        mode: 'fixed',
        width: 1920,
        height: 1080,
        presetId: 'hd-1080',
      });
    });

    it('preserves current width/height when switching from a preset to Custom', () => {
      render(
        <InterfaceControls
          {...mockProps}
          gameResolution={{ mode: 'fixed', width: 1920, height: 1080, presetId: 'hd-1080' }}
          onGameResolutionChange={onGameResolutionChange}
        />,
      );
      const select = screen.getByLabelText('Game window resolution') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'custom' } });
      expect(onGameResolutionChange).toHaveBeenCalledWith({
        mode: 'fixed',
        width: 1920,
        height: 1080,
        presetId: 'custom',
      });
    });

    it('falls back to default dimensions when switching from Fit to Custom', () => {
      render(
        <InterfaceControls
          {...mockProps}
          gameResolution={{ ...DEFAULT_GAME_RESOLUTION }}
          onGameResolutionChange={onGameResolutionChange}
        />,
      );
      const select = screen.getByLabelText('Game window resolution') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'custom' } });
      expect(onGameResolutionChange).toHaveBeenCalledWith({
        mode: 'fixed',
        width: DEFAULT_GAME_RESOLUTION.width,
        height: DEFAULT_GAME_RESOLUTION.height,
        presetId: 'custom',
      });
    });

    it('does not render the W×H editor unless presetId is custom', () => {
      render(
        <InterfaceControls
          {...mockProps}
          gameResolution={{ mode: 'fixed', width: 1920, height: 1080, presetId: 'hd-1080' }}
          onGameResolutionChange={onGameResolutionChange}
        />,
      );
      expect(screen.queryByLabelText('Width in pixels')).toBeNull();
      expect(screen.queryByLabelText('Height in pixels')).toBeNull();
    });

    it('renders the W×H editor when presetId is custom', () => {
      render(
        <InterfaceControls
          {...mockProps}
          gameResolution={{ mode: 'fixed', width: 1440, height: 900, presetId: 'custom' }}
          onGameResolutionChange={onGameResolutionChange}
        />,
      );
      expect(screen.getByLabelText('Width in pixels')).toBeDefined();
      expect(screen.getByLabelText('Height in pixels')).toBeDefined();
    });
  });

  describe('W×H editor commit-on-blur behavior', () => {
    let onGameResolutionChange: GameResolutionChangeFn;

    beforeEach(() => {
      onGameResolutionChange = vi.fn();
    });

    function renderCustom() {
      return render(
        <InterfaceControls
          {...mockProps}
          gameResolution={{ mode: 'fixed', width: 1440, height: 900, presetId: 'custom' }}
          onGameResolutionChange={onGameResolutionChange}
        />,
      );
    }

    it('commits a valid width on blur and marks presetId as custom', () => {
      renderCustom();
      const widthInput = screen.getByLabelText('Width in pixels') as HTMLInputElement;
      fireEvent.change(widthInput, { target: { value: '1280' } });
      fireEvent.blur(widthInput);
      expect(onGameResolutionChange).toHaveBeenCalledWith({
        mode: 'fixed',
        width: 1280,
        height: 900,
        presetId: 'custom',
      });
    });

    it('commits a valid height on blur', () => {
      renderCustom();
      const heightInput = screen.getByLabelText('Height in pixels') as HTMLInputElement;
      fireEvent.change(heightInput, { target: { value: '720' } });
      fireEvent.blur(heightInput);
      expect(onGameResolutionChange).toHaveBeenCalledWith({
        mode: 'fixed',
        width: 1440,
        height: 720,
        presetId: 'custom',
      });
    });

    it('clamps below-minimum widths up to GAME_RESOLUTION_MIN (320)', () => {
      renderCustom();
      const widthInput = screen.getByLabelText('Width in pixels') as HTMLInputElement;
      fireEvent.change(widthInput, { target: { value: '50' } });
      fireEvent.blur(widthInput);
      expect(onGameResolutionChange).toHaveBeenCalledWith(expect.objectContaining({ width: 320, presetId: 'custom' }));
    });

    it('clamps above-maximum heights down to GAME_RESOLUTION_MAX (7680)', () => {
      renderCustom();
      const heightInput = screen.getByLabelText('Height in pixels') as HTMLInputElement;
      fireEvent.change(heightInput, { target: { value: '99999' } });
      fireEvent.blur(heightInput);
      expect(onGameResolutionChange).toHaveBeenCalledWith(
        expect.objectContaining({ height: 7680, presetId: 'custom' }),
      );
    });

    it('does not call onGameResolutionChange when the committed width equals the current width (no-op blur)', () => {
      renderCustom();
      const widthInput = screen.getByLabelText('Width in pixels') as HTMLInputElement;
      fireEvent.blur(widthInput);
      expect(onGameResolutionChange).not.toHaveBeenCalled();
    });

    it('does not commit a change when the input is garbage and preserves the previous value in the local input state', () => {
      renderCustom();
      const widthInput = screen.getByLabelText('Width in pixels') as HTMLInputElement;
      fireEvent.change(widthInput, { target: { value: 'abc' } });
      fireEvent.blur(widthInput);
      // commitWidth sees NaN → committed = gameResolution.width (1440).
      // No change to gameResolution.width so onGameResolutionChange is not called.
      expect(onGameResolutionChange).not.toHaveBeenCalled();
    });
  });

  describe('Transparent chatbox', () => {
    it.each(['modern', 'classic'] as const)('offers the toggle in %s and reports a change', (clientLayoutMode) => {
      const onTransparentChatboxChange = vi.fn();
      render(
        <InterfaceControls
          {...mockProps}
          clientLayoutMode={clientLayoutMode}
          onTransparentChatboxChange={onTransparentChatboxChange}
        />,
      );

      fireEvent.click(screen.getByText('Transparent chatbox'));

      expect(onTransparentChatboxChange).toHaveBeenCalledWith(true);
    });

    it('offers click-through only while the chatbox is transparent', () => {
      const onClickThroughTransparentChatboxChange = vi.fn();
      const view = render(
        <InterfaceControls
          {...mockProps}
          clientLayoutMode="modern"
          transparentChatbox
          onClickThroughTransparentChatboxChange={onClickThroughTransparentChatboxChange}
        />,
      );

      fireEvent.click(screen.getByText('Click through transparent chatbox'));
      expect(onClickThroughTransparentChatboxChange).toHaveBeenCalledWith(false);

      view.rerender(<InterfaceControls {...mockProps} clientLayoutMode="modern" transparentChatbox={false} />);
      expect(screen.queryByText('Click through transparent chatbox')).toBeNull();
    });

    it('is not offered in Fixed, where the client keeps the chatbox opaque', () => {
      render(<InterfaceControls {...mockProps} clientLayoutMode="fixed" />);

      expect(screen.queryByText('Transparent chatbox')).toBeNull();
    });
  });

  describe('Fixed layout', () => {
    it('has no size picker of its own and links to where the Fixed layout is scaled', () => {
      const listener = vi.fn();
      window.addEventListener('settings:reveal', listener);
      try {
        const { container } = render(
          <>
            <InterfaceControls {...mockProps} clientLayoutMode="fixed" />
            <StretchedModeRow />
          </>,
        );
        expect(screen.queryByLabelText('Game window resolution')).toBeNull();
        expect(screen.queryByLabelText('Fixed layout scale')).toBeNull();
        expect(container.querySelector('.game-window-fixed-note')?.textContent).toBe(
          'The Fixed layout is 765 × 503. Make it bigger with Interface scaling',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Interface scaling' }));
        expect(listener.mock.calls[0]?.[0].detail).toEqual({
          id: 'plugins.stretchedMode.fixed-layout-scale',
          surface: 'plugins',
        });
      } finally {
        window.removeEventListener('settings:reveal', listener);
      }
    });

    it('still warns about a frame bigger than the window', () => {
      render(
        <InterfaceControls
          {...mockProps}
          clientLayoutMode="fixed"
          viewportSizeWarning={{ width: 2295, height: 1509, replay: false }}
        />,
      );
      expect(screen.getByText(/Window too small for 2295×1509/)).toBeDefined();
      expect(screen.getByText(/pick a smaller size/)).toBeDefined();
    });

    it('reports the recorded size and its own advice while replaying an oversized recording', () => {
      // The viewer cannot resize a recording, so "pick a smaller size" would be useless advice:
      // any explicit resolution still preserves the recorded size. Only Fit Window rescales it.
      render(<InterfaceControls {...mockProps} viewportSizeWarning={{ width: 1920, height: 1080, replay: true }} />);
      expect(screen.getByText(/Window too small for 1920×1080/)).toBeDefined();
      expect(screen.getByText(/The replay keeps its recorded size/)).toBeDefined();
      expect(screen.queryByText(/pick a smaller size/)).toBeNull();
    });
  });

  describe('Game window group', () => {
    it('holds the resolution and Pop Out Game under one heading', () => {
      const { container } = render(<InterfaceControls {...mockProps} />);
      const group = container.querySelector<HTMLElement>('[data-search-id="settings.interface.game-window"]');
      if (!group) throw new Error('Game window group not found');
      expect(group.querySelector('.group-title')?.textContent).toBe('Game window');
      expect(within(group).getByLabelText('Game window resolution')).toBeDefined();
      expect(within(group).getByRole('button', { name: /Pop Out Game/ })).toBeDefined();
    });

    it('labels the resolution picker with a visible Resolution label', () => {
      const { container } = render(<InterfaceControls {...mockProps} />);
      const label = container.querySelector<HTMLLabelElement>('label.settings-field-label');
      expect(label?.textContent).toBe('Resolution');
      expect(label?.htmlFor).toBe('viewport-preset');
    });
  });

  describe('section order', () => {
    it('runs Layout and scaling, Keybinds, Game window, appearance, Side panel, Chatbox, shortcut hints, then Device Mode', () => {
      const { container } = render(
        <InterfaceControls
          {...mockProps}
          keybinds={<div className="control-group">Keybinds slot</div>}
          appearance={<div className="control-group">Appearance slot</div>}
        />,
      );
      const groups = Array.from(container.querySelectorAll(':scope > .control-group'), (group) => {
        const title = group.querySelector('.group-title')?.textContent;
        return title ?? group.textContent?.slice(0, 20);
      });
      expect(groups).toEqual([
        'Layout',
        'Keybinds slot',
        'Game window',
        'Appearance slot',
        'Side panel',
        'Chatbox',
        'Show Shortcut Hints',
        'Device Mode',
      ]);
    });

    it('shows a static Mobile layout and scaling on a phone, with Game window hidden', () => {
      vi.mocked(useIsMobileDevice).mockReturnValue(true);
      try {
        render(<InterfaceControls {...mockProps} clientLayoutMode="mobile" />);
        expect(screen.queryByLabelText('Client layout')).toBeNull();
        const group = screen.getByText('Layout').closest('.control-group');
        if (!(group instanceof HTMLElement)) throw new Error('Missing layout group');
        expect(group).toHaveAttribute('data-search-id', 'settings.interface.layout');
        const row = group.querySelector('.setting-row');
        expect(row?.textContent).toBe('Mobile');
        expect(row?.querySelector('select, button, [role], [tabindex]')).toBeNull();
        expect(row?.querySelector('.settings-inline-label')).not.toBeNull();
        expect(screen.queryByText('Game window')).toBeNull();
        expect(screen.getByRole('button', { name: 'Interface scaling: 100%' })).toBeDefined();
      } finally {
        vi.mocked(useIsMobileDevice).mockReturnValue(false);
      }
    });
  });

  describe('desktop Layout choices', () => {
    it('offers only the three desktop choices, preserves change/reset handlers and the search anchor', () => {
      const onClientLayoutModeChange = vi.fn();
      render(
        <InterfaceControls
          {...mockProps}
          clientLayoutMode="classic"
          onClientLayoutModeChange={onClientLayoutModeChange}
        />,
      );
      const select = screen.getByRole('combobox', { name: 'Client layout' });
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => [option.getAttribute('value'), option.textContent]),
      ).toEqual([
        ['fixed', 'Fixed'],
        ['classic', 'Resizable - Classic layout'],
        ['modern', 'Resizable - Modern layout'],
      ]);
      expect(select).toHaveValue('classic');
      fireEvent.change(select, { target: { value: 'fixed' } });
      expect(onClientLayoutModeChange).toHaveBeenLastCalledWith('fixed');
      const row = select.closest('.setting-row');
      if (!(row instanceof HTMLElement)) throw new Error('Missing layout row');
      fireEvent.click(within(row).getByRole('button', { name: 'Reset to default' }));
      expect(onClientLayoutModeChange).toHaveBeenLastCalledWith('modern');
    });
  });

  describe('Interface scaling row', () => {
    const state = mockProps.interfaceScaling;

    it('shows the scale beside Layout and leads to the one place it is set', () => {
      const listener = vi.fn();
      window.addEventListener('settings:reveal', listener);
      try {
        render(
          <>
            <InterfaceControls {...mockProps} interfaceScaling={{ ...state, uiScale: 1.5 }} />
            <StretchedModeRow />
          </>,
        );
        const row = screen.getByRole('button', { name: 'Interface scaling: 150%' });
        expect(screen.getByText('Edit in Plugins → Stretched Mode.')).toBeDefined();
        fireEvent.click(row);
        expect(listener.mock.calls[0]?.[0].detail).toEqual({
          id: 'plugins.stretchedMode.ui-scale',
          surface: 'plugins',
        });
      } finally {
        window.removeEventListener('settings:reveal', listener);
      }
    });

    it('says when Stretched Mode is off, and leads to its switch', () => {
      expect(interfaceScalingSummary('modern', { ...state, stretchedModeEnabled: false })).toEqual({
        value: 'Off',
        hint: 'Edit in Plugins → Stretched Mode.',
        target: 'plugins.stretchedMode',
      });
    });

    it('reports the Fixed layout scale in Fixed', () => {
      expect(interfaceScalingSummary('fixed', state)).toMatchObject({
        value: 'Fit window',
        target: 'plugins.stretchedMode.fixed-layout-scale',
      });
      expect(interfaceScalingSummary('fixed', { ...state, fixedLayoutScale: 1.5 }).value).toBe('1.5×');
      expect(interfaceScalingSummary('fixed', { ...state, fixedLayoutScale: 'stretch' }).value).toBe(
        'Stretch to window',
      );
    });

    it("leads to Mobile's own Interface scaling in the Mobile layout", () => {
      expect(interfaceScalingSummary('mobile', { ...state, mobileInterfaceScaling: 400 })).toEqual({
        value: '400%',
        hint: 'Edit in Settings → Mobile.',
        target: 'settings.mobile.interface-scaling',
      });
    });
  });
});

describe('ViewportPopoutControl', () => {
  afterEach(() => {
    vi.mocked(useIsMobileDevice).mockReturnValue(false);
  });

  it('keeps the popout button available on desktop', () => {
    render(<ViewportPopoutControl {...controlsMockProps} />);
    expect(screen.getByText('Pop Out Game')).toBeDefined();
  });

  it('renders nothing on a mobile device, where a second window is meaningless', () => {
    vi.mocked(useIsMobileDevice).mockReturnValue(true);
    const { container } = render(<ViewportPopoutControl {...controlsMockProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('reports the popout as active instead of offering to open another', () => {
    render(<ViewportPopoutControl {...controlsMockProps} isPopoutWindow />);
    expect(screen.getByText('Popout Active')).toBeDefined();
    expect(screen.queryByText('Pop Out Game')).toBeNull();
  });

  it('disables the button when the browser cannot open a popout', () => {
    render(<ViewportPopoutControl {...controlsMockProps} canPopOut={false} />);
    expect(screen.getByText('Pop Out Game').closest('button')?.disabled).toBe(true);
  });
});

describe('ShortcutHintsControl', () => {
  const DEFAULT = PERSISTED_SETTINGS_DEFAULTS.showShortcutHints;

  it('offers no reset while the toggle sits at its default', () => {
    render(<ShortcutHintsControl showShortcutHints={DEFAULT} onShowShortcutHintsToggle={vi.fn()} />);
    expect((screen.getByLabelText('Reset to default') as HTMLButtonElement).disabled).toBe(true);
  });

  it('resets back to the default once the toggle has been changed', () => {
    const onShowShortcutHintsToggle = vi.fn();
    render(<ShortcutHintsControl showShortcutHints={!DEFAULT} onShowShortcutHintsToggle={onShowShortcutHintsToggle} />);
    const reset = screen.getByLabelText('Reset to default') as HTMLButtonElement;
    expect(reset.disabled).toBe(false);
    fireEvent.click(reset);
    expect(onShowShortcutHintsToggle).toHaveBeenCalledTimes(1);
  });

  it('toggles when the checkbox is clicked', () => {
    const onShowShortcutHintsToggle = vi.fn();
    render(<ShortcutHintsControl showShortcutHints={DEFAULT} onShowShortcutHintsToggle={onShowShortcutHintsToggle} />);
    fireEvent.click(screen.getByText('Show Shortcut Hints'));
    expect(onShowShortcutHintsToggle).toHaveBeenCalledTimes(1);
  });
});
