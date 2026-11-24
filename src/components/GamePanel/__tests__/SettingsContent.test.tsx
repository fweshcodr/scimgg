// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERSISTED_SETTINGS_DEFAULTS } from '../../../hooks/usePersistedSettings';
import { AUDIO_SLIDER, FILTER_TOGGLE } from '../../../resourcePack';
import { SettingsContent } from '../SettingsContent';

function renderSettingsContent(props: Partial<ComponentProps<typeof SettingsContent>> = {}) {
  return render(<SettingsContent subTab="audio" onSubTabChange={vi.fn()} {...props} />);
}

describe('SettingsContent', () => {
  afterEach(() => vi.restoreAllMocks());

  // The game panel body is translate="no" against page translation; Settings opts back in, but the live
  // volume readout stays untranslated.
  it.each(['audio', 'keybinds'] as const)('keeps the %s tab translatable inside the game panel', (subTab) => {
    const view = renderSettingsContent({ subTab });
    expect(view.container.querySelector('.settings-content')).toHaveAttribute('translate', 'yes');
    if (subTab === 'audio') {
      const output = view.container.querySelector('.audio-volume-heading output');
      expect(output).toHaveAttribute('translate', 'no');
    }
  });

  it('fits the row with native rail pieces and repaints controlled values', () => {
    const view = renderSettingsContent({ masterVolume: 0.65 });
    const canvas = view.container.querySelector('.audio-slider-control canvas');
    const rail = [
      AUDIO_SLIDER.leftCap,
      AUDIO_SLIDER.firstNotch,
      AUDIO_SLIDER.halfLeft,
      AUDIO_SLIDER.halfRight,
      AUDIO_SLIDER.notch,
      AUDIO_SLIDER.halfLeft,
      AUDIO_SLIDER.halfRight,
      AUDIO_SLIDER.notch,
      AUDIO_SLIDER.rightCap,
    ].join(':');
    expect(canvas).toHaveStyle({ width: '184px', height: '24px' });
    expect(canvas).toHaveAttribute(
      'data-composed',
      `audio-slider:${AUDIO_SLIDER.track}:${rail}:${AUDIO_SLIDER.thumb}:184:65`,
    );

    view.rerender(<SettingsContent subTab="audio" onSubTabChange={vi.fn()} masterVolume={1} />);
    expect(canvas).toHaveAttribute(
      'data-composed',
      `audio-slider:${AUDIO_SLIDER.track}:${rail}:${AUDIO_SLIDER.thumb}:184:100`,
    );
  });

  it.each([
    [0.5, 0],
    [0, 1],
  ])('preserves channel artwork when master volume changes from %s to %s', (initial, masterVolume) => {
    const view = renderSettingsContent({ masterVolume: initial, sfxVolume: 0.65, areaVolume: 0.35 });
    const channels = [...view.container.querySelectorAll('.audio-slider-control canvas')].slice(1);
    const originalArt = channels.map((canvas) => canvas.getAttribute('data-composed'));

    view.rerender(
      <SettingsContent
        subTab="audio"
        onSubTabChange={vi.fn()}
        masterVolume={masterVolume}
        sfxVolume={0.65}
        areaVolume={0.35}
      />,
    );

    const currentChannels = [...view.container.querySelectorAll('.audio-slider-control canvas')].slice(1);
    expect(currentChannels.map((canvas) => canvas.getAttribute('data-composed'))).toEqual(originalArt);
    for (const canvas of currentChannels) {
      expect(canvas).toHaveAttribute('data-composed', expect.stringContaining(AUDIO_SLIDER.thumb));
    }
    expect(screen.getByRole('slider', { name: 'Sound Effects' })).toHaveValue('65');
    expect(screen.getByRole('slider', { name: 'Area Sounds' })).toHaveValue('35');
    expect(screen.getByRole('slider', { name: 'Sound Effects' })).toBeEnabled();
  });

  // Guards against the fixed-layout tab-sprite blur.
  //
  // If the segmented sub-tab track paints its own `background`, its labels become an
  // LCD-eligible paint chunk with a provably-opaque backdrop. Adjacent to the scroll
  // property node created by the `.game-panel-scroll` box below it, that changes how Blink
  // squashes paint chunks into compositor layers; under the fixed layout's fractional
  // CSS zoom the shared panel layer keeps a non-ideal raster scale on exit, so leaving
  // the settings tab leaves every tab-strip sprite resampled until the next repaint.
  //
  // These assertions lock the SHAPE that avoids it. They cannot observe the raster
  // itself, so treat them as a tripwire against an innocent-looking "simplification",
  // not as proof the blur is absent.
  describe('segmented sub-tab track (tab-sprite blur guard)', () => {
    it('paints its fill on a text-free sibling rather than on the track itself', () => {
      renderSettingsContent();

      const fill = screen.getByTestId('settings-segment-track-fill');

      // The fill must carry no text of its own - a text-bearing opaque box is the exact
      // shape that reintroduces the blur.
      expect(fill.textContent).toBe('');
      expect(fill.style.background).not.toBe('');
      expect(fill.style.position).toBe('absolute');
    });

    it('leaves the track box itself without an opaque background', () => {
      renderSettingsContent();

      const track = screen.getByTestId('settings-segment-track-fill').parentElement;
      expect(track).not.toBeNull();

      // The track holds the labels, so it must NOT paint a background behind them.
      expect(track?.style.background).toBe('');
      expect(track?.style.backgroundColor).toBe('');
    });

    it('keeps the sub-tab buttons positioned so they paint above the fill', () => {
      renderSettingsContent();

      // Without a positioned button the text-free fill would paint over the labels.
      for (const label of ['Audio', 'Keybindings']) {
        const button = screen.getByRole('button', { name: label });
        expect(button.style.position).toBe('relative');
      }
    });
  });

  it('renders the audio sub-tab by default', () => {
    renderSettingsContent();
    expect(screen.getByText('Master Volume')).toBeDefined();
  });

  it.each([0, 0.5, 1])('keeps the native slider and readout synchronized at volume %s', (volume) => {
    renderSettingsContent({ masterVolume: volume });
    const slider = screen.getByRole('slider', { name: 'Master Volume' });
    expect(slider).toHaveValue(String(volume * 100));
    expect(slider).toHaveAttribute('aria-valuetext', `${volume * 100}%`);
    expect(slider.style.backgroundImage).toBe('');
    expect(within(screen.getByRole('group', { name: 'Master Volume' })).getByRole('status')).toHaveTextContent(
      `${volume * 100}%`,
    );
  });

  it.each([
    ['Master Volume', 'masterVolume'],
    ['Sound Effects', 'sfxVolume'],
    ['Area Sounds', 'areaVolume'],
  ] as const)('labels %s and preserves normalized volume updates', (label, key) => {
    const onVolumeChange = vi.fn();
    renderSettingsContent({ onVolumeChange });

    fireEvent.change(screen.getByRole('slider', { name: label }), { target: { value: '65' } });

    expect(onVolumeChange).toHaveBeenCalledWith(key, 0.65);
  });

  it('resets a modified volume without changing the other channels', () => {
    const onVolumeChange = vi.fn();
    renderSettingsContent({ masterVolume: 0.75, onVolumeChange });

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Master Volume' })).getByRole('button', { name: 'Reset to default' }),
    );

    expect(onVolumeChange).toHaveBeenCalledExactlyOnceWith('masterVolume', PERSISTED_SETTINGS_DEFAULTS.masterVolume);
  });

  it('preserves mute preference changes', () => {
    const onMuteWhenUnfocusedChange = vi.fn();
    renderSettingsContent({ muteWhenUnfocused: true, onMuteWhenUnfocusedChange });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute when unfocused' }));

    expect(onMuteWhenUnfocusedChange).toHaveBeenCalledWith(false);
  });

  it('groups mute with master volume and resets it independently', () => {
    const onVolumeChange = vi.fn();
    const onMuteWhenUnfocusedChange = vi.fn();
    renderSettingsContent({ muteWhenUnfocused: false, onVolumeChange, onMuteWhenUnfocusedChange });
    const masterAudio = within(screen.getByRole('region', { name: 'Master audio' }));

    fireEvent.click(masterAudio.getByRole('button', { name: 'Reset to default' }));

    expect(masterAudio.getByRole('checkbox', { name: 'Mute when unfocused' })).toBeVisible();
    expect(masterAudio.getByRole('slider', { name: 'Master Volume' })).toBeVisible();
    expect(onMuteWhenUnfocusedChange).toHaveBeenCalledExactlyOnceWith(PERSISTED_SETTINGS_DEFAULTS.muteWhenUnfocused);
    expect(onVolumeChange).not.toHaveBeenCalled();
  });

  it('uses the filter toggle art for both controlled mute states', () => {
    const view = renderSettingsContent({ muteWhenUnfocused: false });
    const toggle = screen.getByRole('checkbox', { name: 'Mute when unfocused' });

    expect(toggle.querySelector('canvas')).toHaveAttribute('data-src', FILTER_TOGGLE.unchecked);
    view.rerender(<SettingsContent subTab="audio" onSubTabChange={vi.fn()} muteWhenUnfocused />);

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle.querySelector('canvas')).toHaveAttribute('data-src', FILTER_TOGGLE.checked);
  });

  it('selects a settings page by pointer only, keeping selection controlled', () => {
    const onSubTabChange = vi.fn();
    renderSettingsContent({ onSubTabChange });

    fireEvent.keyDown(screen.getByRole('button', { name: 'Audio' }), { key: 'ArrowRight' });
    expect(onSubTabChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Keybindings' }));
    expect(onSubTabChange).toHaveBeenCalledWith('keybinds');
    expect(screen.getByRole('button', { name: 'Audio' })).toHaveAttribute('aria-pressed', 'true');
  });
});
