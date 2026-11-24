// @vitest-environment happy-dom
// (same-origin is a claim about a URL resolved against window.location)
import { describe, expect, it } from 'vitest';
import { getItemSpriteUrl } from '../ItemSpriteService';

describe('getItemSpriteUrl', () => {
  it('resolves to our own origin for every id', () => {
    for (const id of [1, 35, 11802, 34027]) {
      // Rejects protocol-relative `//other-origin/...` too, which `startsWith('/')` alone allows.
      expect(new URL(getItemSpriteUrl(id), window.location.origin).origin).toBe(window.location.origin);
    }
  });

  it('points at the mirrored PNG for the id', () => {
    expect(getItemSpriteUrl(11802)).toBe('/assets/items/11802.png');
  });
});
