# Mobile Chrome Scale

The Mobile layout draws the native client's chrome (cache interface 601, `toplevel_osm`) in
logical cache pixels. `osmChromeScale` (`src/layout/osmClientLayout.ts`) chooses how many CSS
pixels one logical pixel takes; `osmFrame` (`src/layout/osmFrame.ts`) then turns the viewport less
its safe area into the gameframe that the placement rules measure.

## The rule

All sizes are in device pixels: `W×H` is the whole viewport times the device pixel ratio, and
`safeW×safeH` is the viewport less its safe-area insets, times the ratio.

1. `z = interfaceScaling / 100`. The slider runs 175–400% in steps of 25, and a value off the
   slider falls back to the 400% default.
2. The whole screen's logical size at that setting: `w = floor(W / z)`, `h = floor(H / z)`.
3. The safe area must hold at least 894×503 logical pixels:
   `minW = floor(W × 894 / safeW)`, `minH = floor(H × 503 / safeH)`.
4. If `w < minW`: `w = minW`, `h = round(H × w / W)`.
5. If `h < minH`: `h = minH`, `w = round(W × h / H)`.
6. Device pixels per logical pixel: `min(W / w, H / h)`. Dividing by the ratio gives CSS pixels.

The setting therefore resizes the chrome only until the safe area reaches 894×503. Past that point
every higher setting draws the same size. Because the minimums are floored, the safe area can fall
a fraction of a pixel short of them, for example 502.7 rows on the Pixel below.

The rule matches the measured client:

| Screen | Setting | Measured |
| --- | --- | --- |
| Pixel 10 Pro, 2410×1080 at DPR 2.625, 20 px top and bottom insets | 175% | 1.75 device px per logical px |
| | 200% | 2.0 |
| | 225–400% | about 2.069 |
| Samsung 16:10 tablet | 400% | about 568 rows |

iOS and iPadOS are assumed to use the same rule (unverified). A desktop forced into the Mobile
layout uses it too. No rule depends on the platform or the screen density.

## Simulator choices

- **One scale for both axes.** Step 6 takes the smaller of the two ratios, so the frame always
  holds the whole `w×h` canvas. Using `W / w` alone would sometimes round a binding 503 rows
  down to 502.9 (a 1920×1080 desktop at 400%, or a 932×430 phone without insets). The placement
  rules switch at exactly 503 rows (`frameHeight < 503`), so the side panel and rail would then
  bottom-anchor where the client centers them.
- **Portrait takes the landscape scale.** The client only runs in landscape. A portrait viewport
  is measured as if rotated: width and height swap, and so do the horizontal and vertical inset
  sums. This keeps the chrome the same size either way up. Applied directly to portrait, the
  rule would fit 894 logical columns across the short side (0.44 CSS px per logical px on an
  upright iPhone).
- **Unusable inputs.** A missing or non-positive pixel ratio counts as 1. A viewport that has not
  been measured yet leaves the setting alone (`z / DPR`). Negative or non-finite insets count as
  zero, and insets that leave no safe area are ignored.

## Known gap

The Android client also adds the system's gesture-edge insets (up to 20 device px per side) to
its safe area. A browser cannot see those, so the simulator uses only the CSS
`env(safe-area-inset-*)` insets (`useSafeAreaInsets`). Where gesture navigation is on, the client
can therefore draw the chrome slightly smaller than the simulator does.

## Consumers

App computes one live scale from the frame it lays out (`liveWorkspace.frame`, falling back to the
measured frame and then the window), together with the live safe-area insets. Grid's gameframe,
the left column App draws and the replay recorder all share it. A recording stores its own
`mobileChromeScale` and `safeAreaInsets` (`resolveReplayMobileChromeScale`,
`resolveReplaySafeAreaInsets`). Playback always uses the recorded values, so a recording plays at the
scale it was made at, whatever the live setting. Grid computes its own scale
(default setting, DPR 1) only when App passes none, and replay capture does the same for a sample
with no valid scale.

`src/layout/__tests__/osmFrame.test.ts` pins the measured cases, an iPhone, an iPad, the
503-row cases, portrait and the input guards.
