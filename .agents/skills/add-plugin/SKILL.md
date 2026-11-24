---
name: add-plugin
description: Add, rename or remove a plugin in the Scim.GG Plugins panel, covering its persisted setting, panel row, App wiring, Plugins tutorial step and settings-search entries, which tests keep in sync.
---

# Adding a plugin

Every plugin is a persisted on/off setting shown as a `<PluginRow>` in the Plugins
panel. Each panel row needs a matching step in the Plugins tutorial tour, in panel
order, and a settings-search entry. The only rows left out of the tour are the
dev-only tooling listed in `TOUR_EXCLUSIONS` in
[`plugins.test.ts`](../../../src/tutorial/content/__tests__/plugins.test.ts)
(`Debug Overlays`). That test and the settings-search anchor tests in
[`PluginsPanel.test.tsx`](../../../src/components/__tests__/PluginsPanel.test.tsx)
fail otherwise, so add the step and the entry in the same change.

Plugins are client-side presentation and input tools. A toggle that changes
simulation behavior is a mechanics toggle in `MechanicsConfig`
([`src/types/simulation.ts`](../../../src/types/simulation.ts)), not a plugin.

For a worked example, `rg -n tickAudioMetronomeEnabled src --glob '!**/__tests__/**'`
lists every integration point of a minimal plugin.

## Checklist

1. **Persisted setting**: in
   [`src/hooks/usePersistedSettings.ts`](../../../src/hooks/usePersistedSettings.ts),
   add `<name>Enabled: boolean` to `PersistedSettings`, to
   `PERSISTED_SETTINGS_DEFAULTS` (choose the default deliberately; overlays usually
   default off), and to the `PersistedSettingsShape` schema as
   `z.boolean().catch(PERSISTED_SETTINGS_DEFAULTS.<name>Enabled)`. Typecheck
   enforces the schema entry.
2. **Panel row**: in
   [`src/components/PluginsPanel.tsx`](../../../src/components/PluginsPanel.tsx),
   add `<name>Enabled` and `on<Name>Toggle` props and a
   `<PluginRow label="..." pluginKey="<key>" isOn={...} onToggle={...}>`, plus
   `hasSettings` and children if it has options. The `label` is both the visible
   name and the exact string the tour uses to find the row. `pluginKey` is the
   row's expand key and its search anchor (`plugins.<key>`). Each option's
   `SettingRow` needs a `searchId`: `pluginSearchId('<key>', '<option label>')`, or
   `null` with a comment when an enclosing group carries the anchor.
3. **App wiring**: in [`src/App.tsx`](../../../src/App.tsx), pass the setting and
   `onToggle={() => updateSetting('<name>Enabled', !<name>Enabled)}` to
   `<PluginsPanel>`, then gate the plugin's render layer or hook on the setting. If
   it changes what a replay viewer sees (panel layout, orbs), check whether it
   belongs in `ReplayPresentationVariants`
   ([`src/core/replayPresentation.ts`](../../../src/core/replayPresentation.ts)), as
   `compactOrbsEnabled` does.
4. **Plugins tutorial step**: in
   [`src/tutorial/content/plugins.ts`](../../../src/tutorial/content/plugins.ts),
   insert `pluginStep('<exact PluginRow label>', '<what it does>', '<settingsKey>')`
   into `STEPS` at the row's position in the panel.
   - `settingsKey` is the row's `expandedPlugins` key in `PluginsPanel.tsx` (for
     example `'tileMarkers'`). It expands the row's options while the step is
     highlighted and collapses them on leave. Omit it for rows with no settings
     caret, such as Prayer Flick Helper.
   - Write one or two plain sentences saying only what the plugin verifiably does,
     in the tone of the existing steps. `<b>` for key terms is fine.
   - Leave the surrounding open, how-it-works, close and done steps alone. The
     Close step's `resumeGuard` index is computed after the array, so insertions
     are safe.
   - Dev-only tooling is excluded instead: add its label to `TOUR_EXCLUSIONS` in
     `plugins.test.ts` with a comment saying why.
5. **Search entries**: in
   [`src/settingsSearch/entries.ts`](../../../src/settingsSearch/entries.ts), add
   `plugin('<key>', '<exact label>', { description, keywords })` in panel order, and
   a `pluginOption(...)` for each option with an anchor. Keywords are the words
   players type instead of the label: everyday words, the RuneLite plugin and
   config names, OSRS slang. Map a word only to rows that really do that thing.
   The "settings-search anchors" tests in `PluginsPanel.test.tsx` render the panel
   with every row and option showing and fail on an anchor with no entry, or an
   entry with no anchor. A row shown only some of the time (Zuk Set Timer) must be
   rendered there too. Dev-only anchors go in that test's expected unindexed list,
   with a comment.
6. **Encounter plugins**: a plugin that acts only in certain encounters goes in
   `ENCOUNTER_PLUGINS`
   ([`src/data/encounterPlugins.ts`](../../../src/data/encounterPlugins.ts)) with its
   encounter kinds; a new encounter also needs its heading in
   `ENCOUNTER_PLUGIN_SECTION_NAMES` there.
   - Its row sits at the top of the panel under the loaded encounter's heading
     (alphabetical there), gated on `isEncounterPluginShown(key, encounterKind)`.
   - Its tour step goes in that group in the same order and is `conditional: true`;
     `plugins.test.ts` checks this.
   - Its search entries carry `whenUnavailable` saying where it is available, as
     the TzHaar HP Tracker's and the Additions plugins' do.
   - Its setting persists everywhere, but App hands the scene its options through
     `encounterPluginOptions(key, settledEncounterKind, enabled, options)`, never
     the raw toggle, so it is off outside its encounters, including the lobby.
   - Prefer one plugin per encounter (Inferno Additions, Colosseum Additions) over
     one row whose options apply in some encounters only.
7. **Verify** with the plugin's own tests plus:

   ```bash
   npx vitest run src/tutorial/content/__tests__/plugins.test.ts src/settingsSearch src/components/__tests__/PluginsPanel.test.tsx src/hooks/__tests__/usePersistedSettings.test.ts
   ```

## Renaming or removing a plugin

Update or delete the matching `pluginStep`. `plugins.test.ts` fails on stale tour
titles; at runtime the steps are `skipIfMissing`, so a stale one would be skipped
silently. Update or delete its search entries too. The `pluginKey` is the search
id (and the tour's `settingsKey`), so keep it on a rename and change only the
label and the entry's title.
