# AGENTS.md

Project guidance for anyone working on Scim.GG, a browser-based OSRS combat simulator, or a fork of it. These rules do not depend on a particular assistant, model, or tool. Read the relevant sections of [the detailed reference](./docs/agent-reference.md) when working in the areas below, and [CONTRIBUTING.md](./CONTRIBUTING.md) for the evidence standard every mechanic must meet.

Task guides: [add a plugin](.agents/skills/add-plugin/SKILL.md), [author a combat tutorial](.agents/skills/combat-tutorial/SKILL.md), [reach a UI state](.agents/skills/ui-harness/SKILL.md), [review a visual change](.agents/skills/visual-qa/SKILL.md), [verify LCD text](.agents/skills/subpixel-aa/SKILL.md), and [diagnose a WebGL fault](.agents/skills/webgl-debug/SKILL.md). Start with the guide for the task; for mechanic claims, the evidence and source rules in `CONTRIBUTING.md` still apply.

## Working Practices

- Inspect the existing implementation, callers, and tests before proposing changes. Distinguish verified behavior from assumptions.
- Keep changes within the requested scope. Treat the working tree as shared: preserve unrelated changes, and do not stash, revert, delete, commit, or publish someone else's work without explicit permission.
- Match planning effort to risk. Small, well-defined changes need no formal plan; changes to core contracts or competing architectures need a brief plan explaining tradeoffs and verification. Update an existing plan rather than restarting settled decisions.
- Report what changed, what was verified, and any remaining uncertainty. Do not claim checks passed when they were not run.

## Architecture

Choose the simplest sound architecture with clear ownership and direct data flow.

- Before adding shared behavior, inspect its current owner and callers.
- Share stable behavior at the narrowest appropriate boundary for existing or concretely identified future consumers. Keep encounter sequencing and parameters local; do not put boss-name switches in generic infrastructure or build speculative frameworks.
- When safely in scope, wire real current consumers rather than leaving a detached helper. Test the shared contract and each encounter's meaningful differences.
- File size is a readability signal, not a requirement. Split only at a clear responsibility boundary that makes the code easier to read, test, and change. Never add line-count gates.
- Comments should explain non-obvious constraints or prevent likely mistakes, not restate the code. Keep detailed derivations in canonical documentation.

## Coordinates and Rendering

Simulation, world, and visual coordinates are identical. **Never flip or negate axes between them.** `+X` is east, `+Y` is north, and `+Z` is up. The world transform is `worldX = tileX`, `worldY = tileY`, `worldZ = -osrsHeight / 128`; OSRS angles are `0=south, 512=west, 1024=north, 1536=east`.

- Before changing placement, model transforms, spawn logic, movement, or facing, read [Coordinates and rendering](./docs/agent-reference.md#coordinates-and-rendering).
- Encounter-owned animated LOCs use `SceneObjectController`; encounter code must not call `LocRenderer` internals. Read [`scene-objects.md`](./docs/architecture/scene-objects.md) before adding them.
- Diagnose WebGL issues from source, recent changes, and tests before escalating to frame capture or runtime probes. Keep debug tooling opt-in and absent from production.

## Mechanics and Source Safety

- Non-trivial OSRS mechanic work requires cited research, and the maintainers decide on the proposed behavior and integration **before implementation**. Follow the evidence standard in [CONTRIBUTING.md](./CONTRIBUTING.md#the-evidence-standard).
- Captures cited by file name (e.g. `inferno-waves-69-zuk-packet-data.txt`) are private gameplay captures; the facts the tests need are in committed fixtures next to each test. Before deriving timing, geometry, IDs, or behavior from capture facts, read [Capture fixtures](./docs/agent-reference.md#capture-fixtures). Capture facts take precedence for observed behavior, but one observed case does not establish a universal formula.
- Use OSRS Wiki article text and formula pages, RuneLite (BSD-2-Clause, cited by project, path and commit), the committed capture fixtures, and verified permissively licensed implementations. Verify the relevant code's license at the cited revision **before inspecting it**; cite the exact source beside derived facts.
- **Never consult non-permissively licensed OSRS implementations for implementation, research, or fixes.** This includes GPL, AGPL, LGPL, MPL, restrictive source-available, and unverified-license code.
- Do not consult or use decompiled Jagex client implementations, or projects ported from them, whatever license they claim.
- Use permitted third-party implementations to corroborate mechanic behavior, not as templates to port. Prefer independent code in our existing architecture. Copying or adapting third-party code or implementation structure is a last resort: explain why independent implementation is insufficient, and get a decision from the maintainers before copying anything. Permission to research or implement a mechanic is not permission to derive code from a reference.
- Record any copied or adapted code in `scripts/vendoredNotices.ts` and preserve required license notices. Consultation alone does not make independently written code derived. If permitted sources cannot settle a rule, report the uncertainty rather than inventing behavior or consulting an excluded implementation.

## Testing and Browser Limits

- Start with `npx vitest run <path>`, then widen coverage according to the change's reach and risk. Run `npm test` before merging; use it during development when broader regression coverage is warranted.
- Keep Vitest's worker cap at 8. Never remove cases or disable isolation to make tests faster.
- Restore module-global test state in `afterEach`, not only `beforeEach`. Prefer the module's existing test file; split suites only at a meaningful responsibility or test-environment boundary.
- For code changes, check diagnostics after related edits and run `npm run typecheck` before handoff. Avoid repeating green checks without a relevant change. Read [Testing and workflow details](./docs/agent-reference.md#testing-and-workflow-details) before changing test infrastructure or performance settings.
- Use a browser when visual or interaction evidence is needed. After UI changes, review fresh captures and affected interactions at relevant viewports; scale coverage to the change, not a fixed review ritual.
- **Browser reach limit:** keep automated checks to a page load and a couple of scripted actions. Do not automate cache downloads, fight progression, NPC arrangement, or camera aiming to reach deep encounter states. Cover those with Vitest or a standalone `tsx` driver and state when in-world confirmation remains for the user.
- For UI-only browser work, use [`/ui-harness.html`](./docs/testing/ui-harness.md), not the full app. For unsupported surfaces such as item names, tooltips, or context menus, use focused tests and report any remaining manual verification; do not bypass the browser reach limit.

## UI Safeguards

- Keep `DESIGN.md` visual only (tokens, type, color, layout language, component look) in the DESIGN.md format ([Google's DESIGN.md spec](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)): canonical section headings in order, normative front matter, no token values repeated in prose; put layout geometry, mechanics and behavior in `docs/architecture/` (e.g. `workspace-docking.md`). `src/__tests__/designMd.test.ts` enforces the headings and fails on spec errors, never on warnings.
- Before changing chrome, CSS, or sprite rendering, read [UI rendering safeguards](./docs/agent-reference.md#ui-rendering-safeguards) for required patterns and checks.
- Never put an outer `box-shadow` on the element painting a text background; every scrolling text box needs its own opaque background. When changing text-bearing chrome, verify LCD text with the [two-browser differential](./docs/agent-reference.md#lcd-text), not screenshots.
- Supported inputs are mouse plus keyboard (keys are game hotkeys and typing) and touch; keyboard-only navigation is a non-goal. Design for pointer and touch: no Tab focus, focus rings, focus moves, or arrow/Enter navigation on launchers, menus, popovers, tabs, panels or dialogs. Escape may close overlays and text fields keep normal typing. The loadout editor (slot picker, slot grid, rune pouch, presets) and the Ctrl+K quick search keep their keyboard handling; text fields keep focus borders. Read [Keyboard and focus policy](./docs/agent-reference.md#keyboard-and-focus-policy).
- Render pixel-art item and prayer icons through canvas. Tab-switched sprite grids use one `PixelSpriteLayer`; lone or exceptional moving/filtered sprites use `PixelSprite`. Do not judge sprite sharpness from screenshots.

## Loadout Presets

Before adding or changing a loadout preset in [`src/data/playerPresets.ts`](./src/data/playerPresets.ts), read [Loadout presets](./docs/design/loadout-presets.md). It covers which presets to offer, sourcing, inventory layout (swap clusters, zig-zag order, utilities bottom-right) and ironman item rules.
