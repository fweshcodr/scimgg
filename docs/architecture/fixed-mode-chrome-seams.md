# Fixed-Mode Chrome Seams

Fixed mode draws the 765x503 OSRS client from cache-decoded sprite rectangles at arbitrary scale.
At fractional scales, hairline seams can appear between adjacent chrome sprites.

## The rule

> Every box in fixed mode (the frame, the pinned containers, the pieces inside them) is positioned
> and sized by `scaleRect` from its rect in FRAME space.

Never multiply a coordinate by the scale yourself, and never snap a container-local coordinate:
`round(local * s)` is not `round((origin + local) * s) - round(origin * s)`. `scaleRect` in
[`osrsClientLayout.ts`](../../src/layout/osrsClientLayout.ts) is the only place logical cache
pixels become physical CSS pixels.

## Cause

Not per-primitive rounding: measured in Chrome, siblings in one containing block are edge-snapped
consistently, so adjacent sprites in one `zoom` layer meet exactly. The cause is **fractional layer
offsets**: a box whose own origin or size is fractional puts its compositing layer off the device
pixel grid, and Chrome resamples the whole layer, blending a row at every boundary inside it. One
fractional ancestor smears all chrome beneath it. Hence:

- Frame size comes only from `fixedFrameSizeAtScale`, with height following the *effective*
  (width-derived) scale, never the requested one.
- Pinned panels (`DraggablePanel`) take a `physicalSize` snapped by `scaleRect` in frame space, not
  `logical * scale`. Its inner zoom layer covers and is clipped to that snapped box.
- The frame is centered on whole screen pixels from the measured stage, not `left: 50%` with
  `-width/2` (a half pixel whenever stage or frame is odd). It centers in the room the open
  sidebars leave (`frameOrigin` in `util/viewportLayout.ts`), snapped the same way, and moves there
  at once rather than on the drawers' slide.

Measured across 17 scales: raw `logical * scale` placement seams at nearly every non-integer scale
(1.5 and 2.5 included); snapped placement at none. Locked by `pinned fixed-mode containers` in
[`osrsClientLayout.test.ts`](../../src/layout/__tests__/osrsClientLayout.test.ts).

**Not fixable from CSS:** at fractional `devicePixelRatio` (Windows 125%/150%, browser zoom off
100%) a blended row survives at sprite boundaries whatever the geometry: CSS-integer snapping,
device-grid snapping (`round(v * s * dpr) / dpr`) and a zoom-free layout are all clean at DPR 1 and 2
and all show it at 1.25 and 1.5, because Chrome rasterizes each image primitive on its own grid. A
much-reduced residue also remains at some strongly fractional scales at DPR 1.

## One raster per chrome group

The only way to remove a boundary between two sprites is to collapse the group into one raster.
[`PixelSpriteLayer`](../../src/components/PixelSpriteLayer.tsx) draws a list of placements into ONE
live `<canvas>`, leaving the slots as transparent hit targets.
[`SidePanelColumn`](../../src/components/GamePanel/SidePanelColumn.tsx) uses it for the whole column
(tab rows, stone edges, tab icons), and the inventory, equipment, prayer and spellbook grids for their
slots. A lone sprite, one needing a CSS `filter`, or one moving every frame stays on
[`PixelSprite`](../../src/components/PixelSprite.tsx), as do grids opened deliberately
(`QuickPrayerSetup`, `AutocastSpellPicker`). This does not beat the fractional-DPR floor *between*
groups, only within one.

Do not add a `toBlob` -> `<img>` detour. Measured for the column's ~10 sprites it cost 20 ms
at deviceScale 2 up to 179 ms at 12, >90% of it PNG encode plus browser decode (drawing is 0.2–1 ms),
paid on every scale or DPR change; fit-to-window changes scale on every resize event.

Traps:

1. **Raster density must equal the zoom it is composited at.** A pinned panel covers a snapped box,
   so `DraggablePanel`'s cover factor is ~0.4% off the raw UI scale. Every rasterizing sprite reads
   [`usePanelContentScale()`](../../src/components/panelContentScale.ts) (the APPLIED zoom), never
   `useTooltipScale()`; a mismatch there, not the canvas, is what blurs the tab stones.
2. **No `<img>` in the layer.** An `<img>` sharing a canvas layer rasterizes soft on first paint
   (measured −35% edge energy, healing only on repaint) while the canvas stays sharp (−2%). So
   `SidePanelColumn` puts every single-placement sprite, tab icons included, into the layer.
3. **The buffer is rounded**: `round(cssBox * zoom * dpr)`, so the blit can be up to half a pixel
   off. Accepted.
4. **The swap is synchronous**: drawing in `useLayoutEffect` puts sprites on the canvas in the frame
   the panel appears; there is no stale-raster flash.

Verify against an absolute reference, not by eye: in classic and fixed at DPR 1, 1.25, 1.5 and 2, an
empty tab-stone region of the layer canvas was bit-identical (MAE 0.000) to an independently computed
sharp-bilinear resample of the source PNG, and every sprite canvas's backing store equals
`round(cssBox * appliedZoom * dpr)`. Locked by
[`SidePanelColumn.test.tsx`](../../src/components/GamePanel/__tests__/SidePanelColumn.test.tsx) and
the backing-store tests in [`PixelSprite.test.tsx`](../../src/components/__tests__/PixelSprite.test.tsx).
