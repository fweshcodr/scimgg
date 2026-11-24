---
name: visual-qa
description: Check that a changed Scim.GG UI surface renders and behaves as intended, using fresh captures of its affected states, viewports and interactions, and report what was and was not verified.
---

# Visual QA

Verify the rendered UI against the change's intent with the least ceremony that
still catches real defects. Scale the review to the change: a color tweak needs
one look at one state; a new or restructured surface needs every state it can be
in.

## Capture

- Review the surface the change actually touched, in the real component tree, not
  a mock-up or a raster stand-in.
- Take captures fresh, after the last edit to the rendered source. Never judge
  stale ones.
- For UI-only surfaces, use the [UI harness](../ui-harness/SKILL.md)
  (`./dev harness '<query>'`, or `/ui-harness.html?<query>` on the URL that
  `npm run dev` prints) with `chrome=0`.
- Stay within the browser reach limit in
  [`AGENTS.md`](../../../AGENTS.md#testing-and-browser-limits): only states a page
  load and a couple of scripted actions reach. Leave deep in-world states to a
  manual check and say so.

## Checklist

- [ ] Every state the change affects: empty, filled, hover, pressed, open,
      disabled, error, and the start, middle and end of any motion.
- [ ] The viewports and layouts the change can affect, such as Fixed, resizable
      and Mobile, or a narrow width if responsive behavior changed.
- [ ] Clipping and overflow: long labels, wrapped text, scrollers, edges of the
      game window.
- [ ] Alignment, spacing and color against [`DESIGN.md`](../../../DESIGN.md).
- [ ] The interactions: each control is wired and does what it says, with no
      dead controls.
- [ ] No new console errors.

Screenshots cannot establish two things:

- **LCD text.** After changing text-bearing chrome, run the two-browser
  differential in the [LCD text guide](../subpixel-aa/SKILL.md).
- **Pixel-sprite sharpness.** Check each canvas backing store against its CSS box,
  as [Pixel-art icons](../../../docs/agent-reference.md#pixel-art-icons) describes.

## Evidence and reporting

Keep the kinds of evidence apart: a capture shows how it looks, a DOM query shows
structure and attributes, and engine state or a test shows that the behavior is
wired. Say which one supports each finding.

Report what you checked, what you found (with file and line where you can), and
what you did not verify, such as a viewport you skipped, a state beyond the reach
limit, or LCD text you did not run the differential on.

Screenshots are temporary local evidence, not repo assets; delete them when done.
Captures must not show account names, chat or private links.
