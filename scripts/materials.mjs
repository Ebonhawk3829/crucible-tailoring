// materials.mjs — seed JSON loading, seed-to-world conversion, drag-import, recipe box
import { MODULE_ID, FLAGS, getMaterialsPerCopper } from "./config.mjs";

// Cache the loaded seed data so we only fetch once.
let _seedData = null;

/**
 * Load the seed JSON from data/tailoring-materials.json.
 * Cached — only fetches once per session.
 * @returns {Promise<object>}
 */
export async function loadSeedData() {
  if (_seedData) return _seedData;
  const resp = await fetch("modules/crucible-tailoring/data/tailoring-materials.json");
  _seedData = await resp.json();
  return _seedData;
}

/**
 * Collect all seed entries that have a `system` block (i.e. are creatable world items).
 * Excludes modifications — those are affix references, not items.
 * Returns a flat array of {entry, category} objects.
 * @param {object} seed - The loaded seed data
 * @returns {Array<{entry: object, category: string}>}
 */
function collectCreatableEntries(seed) {
  const results = [];

  // Tools
  for (const entry of seed.tools || []) {
    if (entry.system) results.push({ entry, category: "tools" });
  }

  // Trade goods
  for (const entry of seed.tradeGoods || []) {
    if (entry.system) results.push({ entry, category: "tradeGoods" });
  }

  // Outputs — armor
  for (const entry of seed.outputs?.armor || []) {
    if (entry.system) results.push({ entry, category: "outputs" });
  }

  // Outputs — accessories
  for (const entry of seed.outputs?.accessories || []) {
    if (entry.system) results.push({ entry, category: "outputs" });
  }

  // Materials
  for (const entry of seed.materials?.confirmed || []) {
    if (entry.system) results.push({ entry, category: "materials" });
  }

  // Consumables (mend, etc.)
  if (seed.consumables) {
    for (const [key, entry] of Object.entries(seed.consumables)) {
      if (entry && entry.system && key !== "_note") {
        results.push({ entry, category: "consumables" });
      }
    }
  }

  // Disguises
  for (const entry of seed.disguises?.templates || []) {
    if (entry.system) results.push({ entry, category: "disguises" });
  }

  // NOTE: modifications are intentionally excluded — they are affix references,
  // not items to create. The GM authors real affixes in a compendium.

  return results;
}

/**
 * Translate a seed entry's _tailoring key into proper Foundry flags.
 * The seed JSON uses _tailoring as a top-level key for readability;
 * this function returns an object suitable for item.setFlag() calls.
 *
 * @param {object} entry - A seed entry with an optional _tailoring block
 * @returns {Array<[string, any]>} Array of [flagKey, flagValue] pairs
 */
function translateTailoringFlags(entry) {
  const flags = [];
  const t = entry._tailoring;
  if (!t) return flags;

  for (const [key, value] of Object.entries(t)) {
    flags.push([key, value]);
  }
  return flags;
}

/**
 * Check if a world item with the given compendiumKey flag already exists.
 * @param {string} compendiumKey
 * @returns {Item|null}
 */
function findExistingByCompendiumKey(compendiumKey) {
  if (!compendiumKey) return null;
  for (const item of game.items) {
    if (item.getFlag(MODULE_ID, FLAGS.compendiumKey) === compendiumKey) {
      return item;
    }
  }
  return null;
}

/**
 * Ensure all seed items exist in the world.
 * Called at init. For each creatable seed entry, checks if a world item
 * with a matching compendiumKey flag already exists; if not, creates it
 * via Item.create() and sets the module flags.
 *
 * Modifications are NOT created — they are affix references only.
 *
 * @returns {Promise<void>}
 */
export async function ensureSeedItems() {
  const seed = await loadSeedData();
  const entries = collectCreatableEntries(seed);

  for (const { entry } of entries) {
    const compendiumKey = entry._tailoring?.compendiumKey;
    if (!compendiumKey) continue;

    const existing = findExistingByCompendiumKey(compendiumKey);
    if (existing) continue;

    // Build the item data from the seed entry
    const itemData = {
      name: entry.name,
      type: entry.type,
      img: entry.img,
      system: foundry.utils.deepClone(entry.system)
    };

    // Create the item
    const created = await Item.create(itemData);
    if (!created) continue;

    // Set all _tailoring fields as module flags
    const flagUpdates = {};
    const tailoringFlags = translateTailoringFlags(entry);
    for (const [key, value] of tailoringFlags) {
      flagUpdates[`flags.${MODULE_ID}.${key}`] = value;
    }

    if (Object.keys(flagUpdates).length > 0) {
      await created.update(flagUpdates);
    }

    console.log(`crucible-tailoring | Created seed item: ${entry.name} (${compendiumKey})`);
  }
}

/**
 * Tag an item as tailoring-relevant by setting the material tag flag.
 * Used by the drag-from-compendium import panel.
 * @param {Item} item - The item document to tag
 * @returns {Promise<void>}
 */
export async function tagItemAsMaterial(item) {
  await item.setFlag(MODULE_ID, FLAGS.materialTag, true);
}

/**
 * Check if an item is tagged as a tailoring material.
 * @param {Item} item
 * @returns {boolean}
 */
export function isMaterialTagged(item) {
  return item.getFlag(MODULE_ID, FLAGS.materialTag) === true;
}

/**
 * Get all tailoring-tagged materials from an actor's inventory.
 * @param {Actor} actor
 * @returns {Item[]}
 */
export function getActorMaterials(actor) {
  if (!actor) return [];
  return actor.items.filter(item => isMaterialTagged(item));
}

/**
 * Compute materials required for crafting an item from its price.
 * Formula: max(1, round(priceInCopper / divisor))
 * @param {Item} item - The item to compute materials for
 * @returns {{materialsRequired: number, priceInCopper: number}}
 */
export function computeMaterialsRequired(item) {
  const price = item.system?.price ?? 0;
  // Crucible stores price in copper
  const priceInCopper = Number(price) || 0;
  const divisor = getMaterialsPerCopper();
  const materialsRequired = Math.max(1, Math.round(priceInCopper / divisor));
  return { materialsRequired, priceInCopper };
}

/**
 * Get the tailoring role flag from an item.
 * @param {Item} item
 * @returns {string|null}
 */
export function getItemRole(item) {
  return item.getFlag(MODULE_ID, FLAGS.role) ?? null;
}

/**
 * Check if an item has a specific tailoring flag value.
 * @param {Item} item
 * @param {string} flagKey - The flag key (from FLAGS)
 * @param {any} value - The expected value
 * @returns {boolean}
 */
export function itemHasFlag(item, flagKey, value) {
  return item.getFlag(MODULE_ID, flagKey) === value;
}

/**
 * Check if an actor possesses a tool matching the given criteria.
 * @param {Actor} actor
 * @param {object} criteria - e.g. {primary: true}, {portable: true}, {usedBy: "mend"}
 * @returns {boolean}
 */
export function actorHasTool(actor, criteria) {
  if (!actor) return false;
  for (const item of actor.items) {
    if (getItemRole(item) !== "tool") continue;
    let match = true;
    for (const [key, value] of Object.entries(criteria)) {
      const flagVal = item.getFlag(MODULE_ID, key);
      if (Array.isArray(value)) {
        if (!Array.isArray(flagVal) || !value.some(v => flagVal.includes(v))) {
          match = false;
          break;
        }
      } else if (flagVal !== value) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

/**
 * Get all seed entries of a given role for display in the hub.
 * @param {string} role - e.g. "output", "modification", "disguise"
 * @returns {Promise<Array>}
 */
export async function getSeedEntriesByRole(role) {
  const seed = await loadSeedData();

  switch (role) {
    case "output": {
      const armor = seed.outputs?.armor || [];
      const accessories = seed.outputs?.accessories || [];
      return [...armor, ...accessories];
    }
    case "modification":
      return seed.modifications?.entries || [];
    case "disguise":
      return seed.disguises?.templates || [];
    case "tool":
      return seed.tools || [];
    case "tradeGood":
      return seed.tradeGoods || [];
    case "material":
      return seed.materials?.confirmed || [];
    default:
      return [];
  }
}