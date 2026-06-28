# Crucible Tailoring

A Foundry VTT v14 module that adds a player-driven Tailoring crafting workflow on top of the [Crucible](https://foundryvtt.com/packages/crucible) game system.

## Overview

The Tailoring Hub lets players with the Tailoring tradeskill craft equipment, trade goods, disguises, and modifications from gathered materials. All world mutations go through a single GM-confirm step — nothing is created or destroyed until the GM clicks confirm.

### Activities

| Activity | Tier | Description |
|---|---|---|
| **Craft Trade Goods** | Novice | Convert materials into sellable goods |
| **Craft Equipment** | Novice | Craft clothing, armour, and accessories |
| **Mend Party Clothing** | Novice | Mend the party's clothing for social-skill boons until next rest |
| **Craft Disguise** | Journeyman | Create social or environmental disguises |
| **Apply Modification** | Journeyman | Apply physical modifications (affixes) to cloth/leather gear |

### How it works

1. Player opens the Tailoring Hub on their character (requires Tailoring training rank ≥ 1)
2. Player selects an activity, chooses materials, and clicks begin
3. The GM's client runs the skill check; the player rolls in their own dialog
4. Player reviews the result in a convert dialog and approves
5. A proposal chat card appears for the GM with a confirm button
6. GM clicks confirm — the materials are consumed and the output is created

## Requirements

- Foundry VTT v14+
- [Crucible](https://foundryvtt.com/packages/crucible) game system

## Installation

Copy this folder into your Foundry VTT `Data/modules/` directory:

```
Data/modules/crucible-tailoring/
```

Then enable the module in your world's Module Settings.

## GM Setup

1. Enable the module in your world
2. On first load, seed items (tools, trade goods, outputs) are automatically created in the world Items directory
3. Players import tailoring materials by dragging items from the sidebar into the Hub's import zone
4. All DCs and thresholds are adjustable in Configure Settings → Crucible Tailoring

## License

MIT