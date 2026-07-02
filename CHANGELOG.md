# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.4-dev] — Prerelease

### Added
- Craft Trade Goods now has a per-material batch quantity selector — pick how many units from each stack
- Hub auto-refreshes when actor inventory changes (hooks on create/update/delete Item)

### Changed
- Material and recipe import drop zones moved to a dedicated Import & Registration section at the bottom of the hub
- Merged DC labels — if two quality tiers share a DC, the dropdown shows concatenated label (e.g. "Shoddy / Standard Material")

### Fixed
- `Set.includes` → `Set.has` in chat.mjs fallback consume path — Crucible's properties field is a Set, not an Array
- Trade Goods base price corrected from 50 to 12 copper (was showing 5 silver instead of 1 silver 2 copper)

## [0.3.3-dev] — Prerelease

### Added
- GM configuration dialog before roll dispatch — GM sees suggested DC from module settings, can override before requesting roll

### Fixed
- Material quality now inferred from item name when importing (e.g. "Shoddy Tailoring Ingredient" → shoddy)
- Roll total extraction fixed — `check.request()` return is a serialized ChatMessage; now looks up the real message in `game.messages`

## [0.3.2-dev] — Prerelease

### Changed
- Material type registry persisted as a world setting instead of flags on world items
- Material matching uses exact name instead of `system.identifier`
- Import drop registers a type definition — no world items created, no duplication on re-import
- Clear operations edit the settings array, no inventory items touched
- Removed dead `materialTag` flag and related scan infrastructure

## [0.3.1-dev] — Prerelease

### Fixed
- Hub window now sizes to content by default
- Material import drop now copies compendium/actor items before tagging
- `getActorMaterials` no longer requires per-stack `isMaterialTagged` flag

## [0.3.0-dev] — Prerelease

### Added
- Materials now registered by item identifier rather than per-instance flag — import a material type once, hub aggregates quantities across all matching stacks in the actor's inventory
- Ability bonus to tailoring rolls — now uses the standard Crucible two-ability formula (Dex + Int) / 4, same pairing as Reflex saves
- Clear buttons on each material and recipe entry, plus "Clear All" with confirmation dialog
- Material clearing untags all stacks of that type; recipe clearing preserves the compendium key to avoid re-processing on seed re-run

### Changed
- Activity click handler no longer walks the DOM to find the app instance — uses ApplicationV2's built-in `this` binding
- Hub bonus display now shows combined training rank + ability contribution instead of training rank only

## [0.2.6-dev] — Prerelease

### Fixed
- Material import now infers quality from item name
- Trade Goods seed entry now has a `compendiumKey` (`tailoredTradeGo0`)
- Missing `compendiumKey` on create-type seed entries now logs a warning instead of silently skipping

### Changed
- Launch button — single click reliably opens the hub instead of sometimes requiring a double-click
- Launch button injected into sheet header container instead of appending after the title

## [0.2.5-dev] — Prerelease

### Fixed
- Drop zones (recipe import, material import) no longer silently break after actions-API refactor — the actions API cannot wire drop events; restored manual `addEventListener` for both `drop` and `dragover`
- Locked (unavailable) activity cards now show a warning instead of silently failing — the actions API fires for all cards regardless of their CSS class; added rank re-validation inside the click handler

## [0.2.4-dev] — Prerelease

### Fixed
- Hub now uses `HandlebarsApplicationMixin` — resolves "not renderable" error on open
- Activity cards use the v14 actions API with rank re-validation in the handler — prevents duplicate event listeners on re-render
- Drop zones (recipe import, material import) reverted to manual `addEventListener` with both `drop` and `dragover` — the actions API cannot wire drop events, so the earlier refactor silently broke drag-and-drop
- Locked (unavailable) activity cards now show a warning instead of silently failing — the actions API fires for all cards regardless of their CSS class
- Seed data loading now handles network errors gracefully instead of crashing module init
- Added error handling around seed item creation in the ready hook

### Changed
- `_prepareContext` now accepts the `options` parameter to match the Handlebars mixin signature
- `render({ force: true })` used instead of boolean positional argument (v2 style)

## [0.2.3-dev] — Prerelease

### Fixed
- Fixed validation error when creating Mend consumables — category is now `"other"` instead of `"consumable"`

## [0.2.2-dev] — Prerelease

### Fixed
- Fixed crash on startup when loading seed items — tools section in seed data is an object, not an iterable array

## [0.2.1-dev] — Prerelease

### Fixed
- Tailoring launch button now appears on hero sheets (Crucible player characters are type `"hero"`, not `"character"`)
- Apply Modification dialog no longer hangs — close hook now correctly listens for the right event name
- Skill checks now resolve correctly — the roll total was always zero due to reading from the wrong return value
- Cancelled roll dialogs now show a clear error instead of silently producing a strong failure
- Duplicate proposal detection now works correctly — guard was reading the wrong flag path
- Drag-and-drop now works across all supported Foundry v14 builds — import path for the drag helper varies by build
- GM now validates training rank when processing roll requests, not just tool possession
- Affix application now validates the dragged document is actually a Crucible affix before writing
- Item names in the convert dialog are now escaped to prevent HTML injection
- Dialog dismissal via Escape/close button no longer throws an unhandled error
- Rank labels now read from Crucible's canonical source instead of a hardcoded map
- Added missing localization keys for new error states

### Changed
- Mend boons are now a visual reminder only — boons are roll-time dice modifiers in Crucible and cannot be modelled as persisted field bonuses
- Removed the rest-event listener — Crucible does not emit a rest hook
- Updated README and design proposal to reflect actual gating mechanics

## [0.2.0-dev] —  Prerelease

### Changed
- Recipe registration: dragging an item into the recipe zone now permanently registers it as a craftable product instead of showing a transient calculation
- Seed data restructured with `seedAction` field: `"create"` for module-specific items, `"reference"` for existing Crucible items that just need recipe tagging
- Item creation runs in two phases — avoids duplicating existing Crucible items
- Tools are no longer seeded as items; they're standard Crucible items checked by name in actor inventory
- Output selection now uses registered recipes exclusively

### Fixed
- Mend action hook now uses Crucible's proper actor hook API instead of the global Hooks bus
- Mend effects are now recorded as effect events during the correct lifecycle phase
- Repeated proposal confirmation no longer nests wrapper elements
- Seed item lookup optimised from linear scan to map lookup

## [0.1.1-dev] —  Prerelease

### Fixed
- Migrated `renderChatMessage` → `renderChatMessageHTML` (v14 hook; native HTMLElement)
- Migrated `renderActorSheet` → `renderActorSheetV2` (ApplicationV2 sheets)
- Fixed DialogV2 DOM scrape race in all five `_select*` methods — form state now captured inside button callbacks before dialog close
- Replaced deprecated `TextEditor.getDragEventData` with `foundry.applications.ux.TextEditor.implementation.getDragEventData`
- Replaced bare `renderTemplate` with `foundry.applications.handlebars.renderTemplate`
- Fixed `check.request()` to target the requesting player via `{user}` parameter
- Fixed Mend ActiveEffect targeting nonexistent `system.skills.<skill>.bonus` → `enchantmentBonus` (Crucible's documented external-modification field)
- Removed nonexistent `useItem` hook; Mend consumables now integrate via `crucible.prepareAction`
- Corrected Crucible skill IDs: `persuasion` → `performance`, removed `society` from social boon set
- Gated `ensureSeedItems()` behind `game.user.isGM` to prevent silent player-side failures
- Replaced hand-rolled stackable consumption with `item.system.consume()`
- Replaced flag-based affix storage with proper `ActiveEffect` of type `"affix"` via `createEmbeddedDocuments`
- Bumped `requestRoll` timeout to 300s to exceed Crucible's internal `requestSkillCheck` timeout
- Removed dead imports from `gating.mjs` and `activity-setup.mjs`
- Documented asymmetric band boundaries in `outcome.mjs`

## [0.1.0-dev] —  Prerelease

### Added
- Tailoring Hub application for GMs and players
- Material import from compendium items
- Craft activities: Trade Goods, Equipment, Mend, Disguise, and Modification
- GM-confirmed write pipeline for crafted items
- Material conversion dialog with outcome resolution