# Replay Recording

Local recording keeps per-track capture limits in [`capture.ts`](../../src/replay/format/capture.ts), enforced by [`ReplayCaptureBudget`](../../src/core/ReplayCaptureBudget.ts), and records truthful cutoff metadata. Work bounds for reconstruction live in [`replaySafety.ts`](../../src/core/replaySafety.ts). Combat frames, events, actions, damage history, and clicks are never thinned to fit.

## Mouse storage and playback

- Replay movement storage keeps only the latest observation per 60 Hz simulation-time bucket, plus protected anchors: first/final position, click pins, stationary arrival/departure, visibility transitions, and coordinate-context boundaries. Live input handling is unaffected. Resampling never restores an already-truncated track.
- Playback binary-searches mouse, click, and presentation tracks. It interpolates only between visible positions at most 50 ms apart, never before the first position, through hidden samples, or across presentation/coordinate boundaries. `breakBefore: true` on a sample marks a coordinate discontinuity that pixel coordinates cannot reveal.
- Clicks are exact, ordered occurrences. At a shared timestamp the last click sets the cursor position; every click marker is kept.
