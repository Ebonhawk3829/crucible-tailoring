# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — 2026-06-29

### Added
- **World-level material type registry** — materials are now registered by `system.identifier` (fallback: `name:type`) rather than per-instance flagging. A single import registers the material type; the hub aggregates quantities across all matching stacks in the actor's inventory.
- **Ability bonus to tailoring rolls** — the hub and roll handler now compute `(dexterity + intellect) / 4`, matching Crucible's native two-ability skill pattern. Previously, tailoring had no ability bonus (only training rank); now it uses Dex+Int, the same pairing as Reflex saves.
- **Clear buttons for materials and recipes** — individual `×` buttons on each material and recipe entry, plus "Clear All" buttons with confirmation dialogs. Material clearing untags all stacks of that type; recipe clearing removes only the `recipeTag` flag (preserving `compendiumKey` to prevent re-processing on seed re-run).
- **`untagRecipe()` and `clearAllRecipes()`** — exported functions to remove recipe registrations without touching identity keys.
- **`clearMaterialType(key)` and `clearAllMaterials()`** — exported functions matching the new type-registry model.
- Eight new localization keys for clear-button labels, titles, and confirmations.

### Changed
- **`getActorMaterials()` return shape** — now returns view-model objects with `{ id, uuid, materialKey, name, img, type, system, quantity }` where `quantity` is the aggregated total across all stacks of that material type.
- **Activity click handler** — removed fragile `closest(".app")?.app` DOM walk; uses `this` directly (ApplicationV2 binds it correctly for static action handlers).

### Fixed
- **Ability bonus display in hub** — bonus now shows the total of training rank + ability contribution, not just training rank.

## [0.2.6-dev] — Prerelease

### Fixed
- Material import now infers quality from item name — materials from source modules often embed the quality tier in the name but create everything at default (standard) grade; `tagItemAsMaterial` corrects `system.quality` when a leading quality word is found
- Trade Goods seed entry now has a `compendiumKey` (`tailoredTradeGo0`) — without it the entry was silently skipped in Phase 1 and never created
- Missing `compendiumKey` on create-type seed entries now logs a warning instead of silently skipping

### Changed
- Launch button uses `<button type="button">` with `stopPropagation` — single click reliably opens the hub instead of sometimes requiring a double-click
- Launch button injected into `.header-buttons` when available (Crucible's sheet header container) instead of appending after the title

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