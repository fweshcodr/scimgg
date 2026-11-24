import { describe, expect, it } from 'vitest';
import { applyPluginSettingsEvent } from '../PluginsPanel';

/**
 * Unit coverage for the tutorial:plugin-settings reducer that drives the
 * Plugins tour's auto-expand. The DOM event wiring in PluginsPanel is a thin
 * addEventListener → setExpandedPlugins shim (browser-verified); this locks the
 * state transformation it delegates to.
 */
describe('applyPluginSettingsEvent', () => {
  it('expands the named row (sets true)', () => {
    expect(applyPluginSettingsEvent({}, { pluginKey: 'camera', expanded: true })).toEqual({ camera: true });
  });

  it('collapses the named row (sets false)', () => {
    expect(applyPluginSettingsEvent({ camera: true }, { pluginKey: 'camera', expanded: false })).toEqual({
      camera: false,
    });
  });

  it('defaults a missing `expanded` to false (collapse)', () => {
    expect(applyPluginSettingsEvent({ camera: true }, { pluginKey: 'camera' })).toEqual({ camera: false });
  });

  it('leaves sibling rows untouched', () => {
    expect(
      applyPluginSettingsEvent({ camera: true, tileMarkers: true }, { pluginKey: 'camera', expanded: false }),
    ).toEqual({ camera: false, tileMarkers: true });
  });

  it('returns the same reference when the row is already in the requested state (no re-render)', () => {
    const prev = { camera: true };
    expect(applyPluginSettingsEvent(prev, { pluginKey: 'camera', expanded: true })).toBe(prev);
  });

  it('ignores events with no pluginKey', () => {
    const prev = { camera: true };
    expect(applyPluginSettingsEvent(prev, { expanded: true })).toBe(prev);
    expect(applyPluginSettingsEvent(prev, {})).toBe(prev);
    expect(applyPluginSettingsEvent(prev, null)).toBe(prev);
    expect(applyPluginSettingsEvent(prev, undefined)).toBe(prev);
  });
});
