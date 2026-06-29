# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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