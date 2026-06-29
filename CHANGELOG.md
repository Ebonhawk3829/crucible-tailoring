# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2-dev] — Prerelease

### Fixed
- **Seed tools iteration crash**: `collectCreatableEntries` called `for...of` on `seed.tools`, which is a plain object `{ _note: "…" }` in the JSON, not an array — threw `object is not iterable` on module startup, blocking all seed item creation. Removed the dead loop; tools are never seeded as items (they're standard Crucible items checked by name in actor inventory).

## [0.2.1-dev] — Prerelease

### Fixed
- **Actor type**: launch button and party member picker now target `"hero"` instead of `"character"` — Crucible player characters are type `"hero"` (per `actor-hero.mjs`), so the UI entry point and Mend targeting were silently returning empty before this fix
- **ModificationDialog close hook**: replaced `Hooks.once("closeApplication", …)` with `_onClose()` override — ApplicationV2 emits `close{ClassName}`, not a generic `closeApplication`, so the Promise never resolved and the Apply Modification flow hung forever
- **`getSkillCheck()`**: reverted to using `actor.getSkillCheck("tailoring", {dc})` which exists in Crucible 0.10.0 at `module/documents/actor.mjs` — the method correctly populates ability, skill, enchantment, boons, and banes from the actor's prepared data and fires talent hooks
- **`check.request()` return shape**: `StandardCheck.handle()` returns a `ChatMessage` via `pool.toMessage()`, not `{total}` — `result?.total` was always `undefined`, defaulting to 0 and producing a silent strong failure every time; now reads `message.rolls[0].total` and fails loud on undefined
- **Cancelled roll no longer silent**: `check.request()` returns `undefined` when the player cancels the roll dialog — previously the `?? 0` fallback turned cancellation into a strong failure; now returns `{ok: false, reason: "rollCancelled"}`
- **Duplicate proposal guard**: changed `m.getFlag(MODULE_ID, FLAGS.resolved)` to `m.getFlag(MODULE_ID, FLAGS.proposal)?.resolved !== true` — `resolved` is nested inside the proposal flag object, not a top-level flag, so the check was always `undefined !== true` (always passing); same logic with a slightly stronger net
- **`getDragEventData` import**: replaced direct import from `foundry.applications.ux.TextEditor.implementation` with a defensive fallback that tries the `implementation` path, `TextEditor.getDragEventData()`, and raw `dataTransfer` JSON parse — which path works varies across v14 builds, and undefined here silently broke all three drop zones
- **GM-side rank re-validation**: `handleRequestRoll` now re-validates training rank (Journeyman requires rank 2 / Proficient, Novice requires rank 1 / Trained) — previously only tools were re-checked GM-side, and the query is the authoritative gate
- **Affix document type validation**: `confirmProposal` now verifies the dragged document is `documentName === "ActiveEffect"` and `type === "affix"` before cloning its system block — Crucible stores affixes as `ActiveEffect` documents in the `affixes` compendium, so the schema clone is correct, but a non-affix drag would produce a malformed effect; now caught with a clear error
- **XSS in convert dialog**: item names in the convert dialog are now escaped via `foundry.utils.escapeHTML()` — user-controllable item names were concatenated directly into HTML markup
- **DialogV2.confirm dismissal**: wrapped in `try/catch` returning `false` — some v14 builds reject on Escape/X dismiss instead of resolving `false`, which would throw uncaught up through `runCraftFlow`
- **Rank labels from Crucible source**: replaced hardcoded `RANK_LABELS` map with `getRankLabel(rank)` that reads `SYSTEM.TALENT.TRAINING_RANKS` and localizes via `game.i18n`, with English fallback
- Added missing localization keys: `rollCancelled`, `rollFailed`, `insufficientRank`, `notAnAffix`

### Changed
- **Mend boons → visual reminder**: the Mend AE now records a dummy ActiveEffect with `changes: []` (no mechanical changes) — boons are roll-time dice modifiers in Crucible, not persisted actor fields, and writing to `enchantmentBonus` was mechanically incorrect regardless of whether the field exists; the player/GM manually applies boon dice during relevant social checks and removes the effect after a rest
- **Removed `Hooks.on("rest", …)` listener**: Crucible does not emit a `"rest"` hook, and with the dummy-AE approach there is no longer a need for automated cleanup
- **`_selectSourceItem` filter documented**: clarified that accessories match only the `clothing` category (not jewelry/trinket/other) — this is the correct behavior for a tailor modifying cloth-based items
- **Proposal document updated**: Journeyman gating changed from "Character Level 4" to "Training Rank 2 (Proficient)" to match the code's actual gating mechanism
- **README updated**: stale API references corrected throughout

## [0.2.0-dev] —  Prerelease

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