# Modal family

The ordinary navigation dialogs share Scim's visual language, not a universal layout component. Each owner keeps its own state and task composition. Visual materials are documented in [DESIGN.md](../../DESIGN.md#modal-family); pointer, Escape and text-field rules are in [UI rendering safeguards](../agent-reference.md#ui-rendering-safeguards).

## Encounter selection

`EncounterPicker` separates encounter navigation from contract actions. Each available contract carries Configure and Enter beside its terms; unavailable contracts have neither action. No preliminary row selection is required. Search has arrow and Enter handling, and Enter configures the highlighted result. Hover does not change that search selection. The registry's defaults, contract order, reward descriptions, Beta labels and tutorial eligibility are authoritative.

The desktop card is bounded to 860 by 560px and to the viewport. Identity and contract terms share one scrolling region, so short landscapes can scroll past the identity to reach every contract and its actions. At phone width, a labeled encounter select replaces the rail and each contract's actions wrap under its text. Return to Lobby is a text-only framed button below the navigation rail on desktop and landscape, and in a separate bottom navigation strip on phones. It keeps its full label and 44px minimum height at every size; Close stays in the upper corner and contract actions stay beside their terms. Reward sprites use `PixelSprite`; their adjacent text paints an opaque backing independently of the canvas.

## Training

`TutorialPickerModal` uses three desktop columns: courses, curriculum and lesson detail. The 880 by 480px desktop window has integer-width course and curriculum columns (176px and 264px), keeping the detail scroller's text aligned to an opaque compositor backing. Each pane scrolls independently and Begin/Resume/Replay remains outside the detail scroller.

At widths up to 600px, curriculum and lesson share a vertically stacked window capped at 640px: curriculum receives two fifths of the body and lesson three fifths. The selected lesson and Begin remain available without a separate detail-navigation step. A labeled course select replaces the course rail on phones and when height is at most 540px. Short landscape keeps curriculum and lesson side by side, with a 280px curriculum column.

Work-in-progress (`availability: 'wip'`) lessons are omitted from the curriculum and from course progress counts, and a track left with no startable lesson is hidden. Section labels appear only when more than one track is shown. Progress counts, device-specific step counts, prerequisites and scene-switch confirmation have their own owners and semantics.

## Reference dialogs

- `KeyboardShortcutsModal`: two desktop reference columns become one on phones, with fixed header and scrollable content. Editing delegates to the game-panel keybindings editor.
- `CreditsModal`: the composition is centered; only the names scroll, leaving close and third-party licenses reachable.

The cache load is not a dialog. `LoadingScreen` covers the app with the stage name, a progress bar, the stage detail and rotating tips; on failure it shows the error message and Retry. The cacheless harness does not mount it, so rendered verification requires a manual cache-loading session.

Native mobile sheets use the `sheet` attributes and host styles. Ordinary dialogs are dismissible through their close, backdrop and Escape paths. Death and Victory are not ordinary dismissible dialogs: they follow their own terminal-overlay rules.

## Centered placement ownership

Ordinary centered cards opt into `useCenteredModalSnap` and `.centered-modal-snap`. Their immediate overlay owns centering and available space; the card must be relatively positioned with no competing placement owner. The hook only adjusts its resting `left`/`top` by the sub-device-pixel correction needed to keep the origin aligned. It observes the open card and overlay, responds to resize and actual DPR changes, and removes its offsets on close. It measures the applied displacement because browsers can quantize fractional CSS offsets; subtracting only the requested value would make repeated measurements drift. The card's own entrance transforms are left alone and are measured only after their animation finishes or is canceled. Fullscreen native phone sheets override the offsets to zero.

This applies to the configurer, encounter picker, modifiers, training, shortcuts and credits cards. It does not apply to drawers, anchored popovers, draggable panels or the mobile host. Do not apply it to every `data-msheet` element: those roles also serve independently positioned surfaces.

## Verification boundaries

Use the cacheless [UI harness](../testing/ui-harness.md). Small phone, short landscape and both desktop sizes exercise distinct compositions. LCD text requires the normal-versus-`--disable-lcd-text` differential; sprite resolution requires backing-store measurements, not screenshot inspection.

Tutorial pause/completion, cache download, cache-backed context pickers and scene rendering require their own focused tests or manual in-world confirmation. This family does not cover the Settings and Plugins sidebars, Practice, native mobile chrome or renderer behavior. The encounter configurer shares the family materials but keeps the state and responsive composition documented in [Encounter configurer](encounter-configurer.md). The standalone Modifiers dialog has its own restart transaction, with native-size names, descriptions and tier labels; it is distinct from the immediate configurer modifier editor.
