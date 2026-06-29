# Crucible Tailoring

![Foundry v14](https://img.shields.io/badge/Foundry-v14-informational)
![Crucible](https://img.shields.io/badge/System-Crucible-orange)
![Latest Release](https://img.shields.io/github/v/release/Ebonhawk3829/crucible-tailoring?label=Latest)
![License](https://img.shields.io/github/license/Ebonhawk3829/crucible-tailoring)

A player-driven Tailoring crafting module for the [Crucible](https://foundryvtt.com/packages/crucible) game system in [Foundry Virtual Tabletop](https://foundryvtt.com/).

Adds a **Tailoring Hub** where players with the Tailoring tradeskill can craft equipment, trade goods, disguises, and modifications from gathered materials. All world mutations go through a single GM-confirm step — nothing is created or destroyed until the GM clicks confirm.

## Features

- **Tailoring Hub** — A player-facing window showing tailoring rank, skill bonus, tagged materials, owned tools, and available activities.
- **Five Craft Activities** — Craft Trade Goods, Craft Equipment, Mend Party Clothing, Craft Disguise, and Apply Modification, each with its own setup dialog and output.
- **Material Import** — Drag items from the sidebar into the Hub to tag them as tailoring materials.
- **Recipe Registration** — Drag items from the sidebar into the recipe zone to register them as craftable products. The hub displays the materials required for each recipe.
- **Quality-Based Outcomes** — Strong success / success / failure / strong failure bands determine whether the output is one tier higher, matches, drops a tier, or is ruined.
- **Tool Requirements** — Novice activities require a Tailor's Toolkit; Journeyman activities require a Portable Workbench; Mend additionally requires a Repair Kit.
- **Mend Boons** — Mend produces a consumable that applies social-skill boons (Deception, Diplomacy, Intimidation, Performance) until the next rest. 
- **Modification via Affixes** — The Apply Modification dialog lets the player drag a real Crucible affix from the compendium onto the output side. Modifications share affix slots with enchantments.
- **Disguises** — Craft social disguises (Deception boons) or environmental disguises (Stealth boons) for specific contexts.
- **Configurable DCs** — All material DCs, the mend DC, and the strong-success delta are world-scoped settings adjustable from the Configure Settings menu.

## Installation

### From Foundry

1. Open Foundry VTT and go to **Add-on Modules** → **Install Module**.
2. Paste the following URL into the **Manifest URL** field:
   ```
   https://github.com/Ebonhawk3829/crucible-tailoring/releases/latest/download/module.json
   ```
3. Click **Install**.
4. Enable the module in your world.

### Manual

Download `module.zip` from the [latest release](https://github.com/Ebonhawk3829/crucible-tailoring/releases/latest), extract it into your `Data/modules/` directory, and restart Foundry.

## Requirements

| Requirement | Version |
|---|---|
| Foundry VTT | v14+ |
| Crucible | 0.10.0+ |

This module **only** works with the Crucible game system. It uses Crucible's `SYSTEM.CRAFTING.TRAINING.tailoring`, `actor.getSkillCheck()`, `StandardCheck.request()`, and the built-in item quality system.

## Settings

All settings are world-scoped and configurable by the GM under **Settings** → **Module Settings** → **Crucible Tailoring**.

| Setting | Default | Description |
|---|---|---|
| Shoddy Material DC | 8 | DC for working shoddy-quality materials. |
| Standard Material DC | 12 | DC for working standard-quality materials. |
| Fine Material DC | 16 | DC for working fine-quality materials. |
| Superior Material DC | 20 | DC for working superior-quality materials. |
| Masterwork Material DC | 24 | DC for working masterwork-quality materials. |
| Mend DC | 14 | DC for the Mend Party Clothing activity. |
| Strong Success Delta | 8 | How far above/below DC counts as strong success/failure. |
| Materials Per Copper | 15 | Divisor for the price→materials formula: `max(1, round(priceInCopper / this))`. |

## Usage

1. **Open the Hub** — Click the **Tailoring** button on a character sheet (requires Tailoring training rank ≥ 1).
2. **Import materials** — Drag items from the sidebar into the Hub's import zone to tag them as tailoring materials.
3. **Register recipes** — Drag items from the sidebar into the recipe zone to register them as craftable products.
4. **Choose materials and options** — Each activity opens a setup dialog: select materials, pick an output item, choose party members (Mend), set disguise type and context (Disguise), or drag an affix (Modification).
5. **Roll** — The GM's client runs the skill check; the player rolls in their own dialog.
6. **Review** — A convert dialog shows what will be consumed and produced at the rolled quality. Approve or cancel.
7. **GM confirms** — A proposal chat card appears with a GM-only confirm button. The GM clicks confirm to perform the write.

## How It Works (Technical)

The module uses Foundry v14's `User#query` system for all cross-client communication — no sockets. The flow is two GM pings:

1. **`crucible-tailoring.requestRoll`** — GM resolves the actor, validates tool possession, builds the check via `getSkillCheck`, and runs `StandardCheck.request()` so the player rolls in their own dialog. Returns `{ok, total, band, quality}`.
2. **`crucible-tailoring.proposeOutput`** — GM posts a flagged chat card with a confirm button. On confirm, re-validates inputs, handles stackable quantity decrement, and performs the write.

Seed items fall into two categories: **create** (module-specific items like trade goods, consumables, and disguises are created via `Item.create()` on first load) and **reference** (existing Crucible items like armor and accessories are found by name+type and tagged with recipe flags). Tools are standard Crucible items checked by name in the actor's inventory — no item creation needed. Modifications are affix references, not items — the GM authors real affixes in a compendium.

Mend boons use Crucible's action hook system (`crucible.api.hooks.action`) to record an effect event during the `postActivate` lifecycle phase. The boon ActiveEffect is applied by Crucible during action confirmation — no direct document writes. The effect has infinite duration and is cleared by a `Hooks.on("rest", …)` listener, since Crucible has no "until next rest" duration primitive.

## Compatibility

This module targets Crucible's crafting and skill-check APIs and uses Foundry V14 APIs including `ApplicationV2`, `DialogV2`, `CONFIG.queries`, `User#query`, and Handlebars template rendering.

It is designed to be non-destructive — all world mutations happen in a single `confirmProposal()` function in `chat.mjs`. Proposal state is stored as a flag on the chat message. No core Crucible data models are modified.

## License

This module is released under the [MIT License](LICENSE).