import { describe, expect, it } from 'vitest';
import {
  AUDIO_SLIDER,
  collectPackAssetPaths,
  MINIMAP,
  MOBILE,
  PANEL,
  PRAYER,
  packSprite,
  RESET_BUTTON,
  TAB_ICONS,
} from '../resourcePack';

describe('resourcePack', () => {
  it('resolves the reset artwork', () => {
    expect(RESET_BUTTON.enabled).toBe('/assets/ui/packs/pack-vanilla/other/reset_killcount_button_hovered.png');
    expect(RESET_BUTTON.disabled).toBe('/assets/ui/packs/pack-vanilla/other/reset_killcount_button.png');
    expect(collectPackAssetPaths()).toEqual(expect.arrayContaining(Object.values(RESET_BUTTON)));
  });

  it('resolves the Zeal sprites', () => {
    expect(PRAYER.icon('zeal')).toBe('/assets/ui/packs/pack-vanilla/prayer/zeal.png');
    expect(PRAYER.iconDisabled('zeal')).toBe('/assets/ui/packs/pack-vanilla/prayer/zeal_disabled.png');
  });

  it('resolves and preloads the audio slider artwork', () => {
    const sprites = [
      ['track', 'empty'],
      ['leftCap', 'left_caret'],
      ['firstNotch', 'dot_darker'],
      ['notch', 'dot_regular'],
      ['halfLeft', 'half_dot_left'],
      ['halfRight', 'half_dot_right'],
      ['rightCap', 'right_caret'],
      ['thumb', 'dot_green'],
    ] as const;
    for (const [key, name] of sprites) {
      expect(AUDIO_SLIDER[key]).toBe(`/assets/ui/packs/pack-vanilla/options/slider_new_${name}.png`);
    }
    expect(collectPackAssetPaths()).toEqual(
      expect.arrayContaining([...Object.values(AUDIO_SLIDER), ...Object.values(RESET_BUTTON)]),
    );
  });

  describe('packSprite()', () => {
    it('resolves a path under the sprite root', () => {
      expect(packSprite('buttons/middle.png')).toBe('/assets/ui/packs/pack-vanilla/buttons/middle.png');
    });

    it("draws Mobile chrome from the sprite root's own files", () => {
      expect(MOBILE.railMiddle).toBe('/assets/ui/packs/pack-vanilla/mobile/rail_middle.png');
      expect(MOBILE.tabStoneSelected).toBe('/assets/ui/packs/pack-vanilla/mobile/tab_stone_selected.png');
    });

    it('resolves every fixed-mode chrome sprite from the sprite root', () => {
      // Fixed mode is drawn from the client's own gameframe set. Nothing here may be
      // synthesized from the resizable art: recoloring it flattened the minimap
      // surround into unreadable mud.
      const fixedPaths = [
        PANEL.fixedBackground,
        PANEL.fixedTabsTopRow,
        PANEL.fixedTabsBottomRow,
        PANEL.fixedWindowFrameEdgeTop,
        PANEL.fixedTopRightCorner,
        PANEL.fixedEdgeLeftUpper,
        PANEL.fixedEdgeLeftLower,
        PANEL.fixedEdgeRight,
        MINIMAP.fixedFrame,
        MINIMAP.fixedLeftEdge,
        MINIMAP.fixedRightEdge,
        MINIMAP.fixedBottom,
      ];
      for (const path of fixedPaths) expect(path).toContain('/packs/pack-vanilla/');
    });
  });

  describe('TAB_ICONS.skills', () => {
    it('resolves the skills tab icon to tabs/stats.png', () => {
      expect(TAB_ICONS.skills).toBe('/assets/ui/packs/pack-vanilla/tabs/stats.png');
    });
  });

  describe('collectPackAssetPaths()', () => {
    it('includes every Skills panel icon', () => {
      const skillPaths = collectPackAssetPaths().filter((path) => path.includes('/skill/'));

      expect(skillPaths).toEqual(
        [
          'attack',
          'hitpoints',
          'mining',
          'strength',
          'agility',
          'smithing',
          'defence',
          'herblore',
          'fishing',
          'ranged',
          'thieving',
          'cooking',
          'prayer',
          'crafting',
          'firemaking',
          'magic',
          'fletching',
          'woodcutting',
          'runecraft',
          'slayer',
          'farming',
          'construction',
          'hunter',
        ].map((name) => `/assets/ui/packs/pack-vanilla/skill/${name}.png`),
      );
    });
  });
});
