import { describe, expect, it } from 'vitest';
import { exportRuneLiteMarkers, importRuneLiteMarkers } from '../tilePackIO';

const YAMA_REGION_ID = (23 << 8) | 157;

const CLIPBOARD_JSON = JSON.stringify([
  { regionId: YAMA_REGION_ID, regionX: 35, regionY: 37, z: 0, color: '#FF5D98AB', label: '1' },
  { regionId: YAMA_REGION_ID, regionX: 36, regionY: 35, z: 0, color: '#FF5D98AB', label: '2' },
  { regionId: 5789, regionX: 30, regionY: 43, z: 2, color: '#FFB312AA' },
]);

describe('importRuneLiteMarkers', () => {
  it('keeps only the encounter region and maps color, opacity and label', () => {
    const markers = importRuneLiteMarkers(CLIPBOARD_JSON, 'yama_p3');

    expect(markers).toEqual([
      { x: 35, y: 37, color: '#5D98AB', opacity: 1, label: '1' },
      { x: 36, y: 35, color: '#5D98AB', opacity: 1, label: '2' },
    ]);
  });

  it('imports into a contract variant, which has no descriptor of its own', () => {
    expect(importRuneLiteMarkers(CLIPBOARD_JSON, 'yama_p3_divine')).toEqual(
      importRuneLiteMarkers(CLIPBOARD_JSON, 'yama_p3'),
    );
  });

  it('returns null for an unknown encounter kind', () => {
    expect(importRuneLiteMarkers(CLIPBOARD_JSON, 'not_an_encounter')).toBeNull();
  });
});

describe('exportRuneLiteMarkers', () => {
  it('stamps a contract variant with its parent encounter region', () => {
    const json = exportRuneLiteMarkers([{ x: 31, y: 38, color: '#B61515', opacity: 1 }], 'yama_p3_forfeit_breath');
    if (json === null) throw new Error('export returned null for a contract variant');

    expect(JSON.parse(json)).toEqual([
      { regionId: YAMA_REGION_ID, regionX: 31, regionY: 38, z: 0, color: '#FFB61515' },
    ]);
  });
});
