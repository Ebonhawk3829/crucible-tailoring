# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0-dev] — Unreleased

### Changed
- **Recipe box → recipe registration**: dragging an item into the recipe zone now registers it as a craftable product (sets `recipeTag` flag) instead of showing a transient calculation; a confirmation toast is shown
- **Seed JSON restructured**: entries now have `seedAction` field — `"create"` for module-specific items (tools, trade goods, consumables, disguises) and `"reference"` for existing Crucible items (armor, accessories, materials) that just need recipe tagging
- **`ensureSeedItems()` two-phase**: Phase 1 creates module-specific items via `Item.create()`; Phase 2 finds existing Crucible items by name+type and tags them with `recipeTag` + role flags (no more duplicate armor/accessory items)
- **Tools removed from seed JSON**: tools are standard Crucible items checked by name in actor inventory (`TOOL_NAMES` constant); `actorHasTool()` now takes a name string instead of flag criteria
- **`_selectOutputItem`** now uses `getRegisteredRecipes()` exclusively — all outputs are real Foundry Items, no more seed-entry fallback
- **`activity-setup.mjs`** simplified: `craftEquipment` payload assembly no longer handles seed-entry objects

### Fixed
- Replaced broken `Hooks.on("crucible.prepareAction", …)` with proper `crucible.api.hooks.action` registration keyed by item ID (`mendConsumable0000`); the global `Hooks` bus never receives Crucible actor hook events
- Mend boons now recorded as effect events via `recordEvent()` during `postActivate` — no direct document writes, per Crucible's lifecycle guidance ("Direct actor mutations within hooks will be lost or double-applied")
- Added sentinel guard to `registerMendHook()` to prevent double-registration across reloads
- Made `confirmProposal` content rewrite idempotent — repeated confirms won't nest `<div>` wrappers
- Optimized `findExistingByCompendiumKey` from O(n) linear scan to O(1) via pre-built `Map<compendiumKey, Item>` during seeding

## [0.1.1-dev] — Unreleased

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

## [0.1.0-dev] — Unreleased

### Added
- Tailoring Hub application for GMs and players
- Material import from compendium items
- Craft activities: Trade Goods, Equipment, Mend, Disguise, and Modification
- GM-confirmed write pipeline for crafted items
- Material conversion dialog with outcome resolution