// materials.mjs — seed JSON loading, seed-to-world conversion, drag-import, recipe box
import { MODULE_ID, FLAGS, QUALITY_TIERS, getMaterialsPerCopper } from "./config.mjs";

// Cache the loaded seed data so we only fetch once.
let _seedData = null;

// ---------------------------------------------------------------------------
// Material type registry — persisted as a world setting, decoupled from
// inventory items.  {"materialTypes": [{name, quality, img}]}
// An actor "has" a material when any owned item's exact name matches a
// registered type.  Tagging happens purely in settings — no flags on items.
// ---------------------------------------------------------------------------

/** Read the registered material type definitions from world settings. */
export function getMaterialTypes() {
  return game.settings.get(MODULE_ID, "materialTypes") ?? [];
}

/** Build a name→def lookup from the settings array for O(1) inventory scans. */
function _nameIndex() {
  return new Map(getMaterialTypes().map(t => [t.name, t]));
}

/** Register a material type by exact name. Idempotent on name. */
export async function registerMaterialType({ name, quality, img }) {
  const types = getMaterialTypes();
  if (types.some(t => t.name === name)) return; // already registered
  types.push({ name, quality: quality ?? "standard", img });
  await game.settings.set(MODULE_ID, "materialTypes", types);
}

/** Remove one registered type by name. Touches no inventory items. */
export async function clearMaterialType(name) {
  const types = getMaterialTypes().filter(t => t.name !== name);
  await game.settings.set(MODULE_ID, "materialTypes", types);
}

/** Remove all registered types. Touches no inventory items. */
export async function clearAllMaterials() {
  await game.settings.set(MODULE_ID, "materialTypes", []);
}

/**
 * Get all tailoring materials aggregated from an actor's inventory by
 * registered material type (exact-name match).  Groups stacks by name,
 * sums quantities.  No per-item flags required.
 *
 * @param {Actor} actor
 * @returns {Array<{id: string, uuid: string, name: string, img: string, type: string, system: object, quantity: number}>}
 */
export function getActorMaterials(actor) {
  if (!actor) return [];
  const byName = _nameIndex();
  const groups = new Map();
  for (const item of actor.items) {
    const def = byName.get(item.name);
    if (!def) continue; // not a registered material type
    if (!groups.has(item.name)) {
      groups.set(item.name, { representative: item, total: 0, def });
    }
    groups.get(item.name).total += item.system?.quantity ?? 1;
  }
  return Array.from(groups.values()).map(({ representative, total, def }) => ({
    id: representative.id,
    uuid: representative.uuid,
    name: representative.name,
    img: representative.img ?? def.img,
    type: representative.type,
    quality: representative.system?.quality ?? def.quality,
    system: representative.system,
    quantity: total
  }));
}

/**
 * Load the seed JSON from data/tailoring-materials.json.
 * Cached — only fetches once per session.
 * @returns {Promise<object|null>}
 */
export async function loadSeedData() {
  if (_seedData) return _seedData;
  try {
    const resp = await fetch("modules/crucible-tailoring/data/tailoring-materials.json");
    if (!resp.ok) {
      console.warn("crucible-tailoring | Failed to load seed data:", resp.status, resp.statusText);
      return null;
    }
    _seedData = await resp.json();
    return _seedData;
  } catch (err) {
    console.warn("crucible-tailoring | Failed to load seed data:", err);
    return null;
  }
}

/**
 * Collect seed entries that should be created as new world items.
 * Only entries with seedAction === "create" and a populated `system` block.
 * @param {object} seed - The loaded seed data
 * @returns {Array<{entry: object, category: string}>}
 */
function collectCreatableEntries(seed) {
  const results = [];

  // Trade goods (create)
  for (const entry of seed.tradeGoods || []) {
    if (entry.system && entry._tailoring?.seedAction === "create") {
      results.push({ entry, category: "tradeGoods" });
    }
  }

  // Consumables (create)
  if (seed.consumables) {
    for (const [key, entry] of Object.entries(seed.consumables)) {
      if (entry && entry.system && key !== "_note" && entry._tailoring?.seedAction === "create") {
        results.push({ entry, category: "consumables" });
      }
    }
  }

  // Disguises (create)
  for (const entry of seed.disguises?.templates || []) {
    if (entry.system && entry._tailoring?.seedAction === "create") {
      results.push({ entry, category: "disguises" });
    }
  }

  // NOTE: outputs (armor/accessories) and materials are reference-type —
  // they already exist in Crucible's system compendiums and are tagged
  // in the reference phase of ensureSeedItems().

  return results;
}

/**
 * Collect seed entries that reference existing Crucible items.
 * These are NOT created — they are found in the world by name+type
 * and tagged with recipeTag + role flags.
 * @param {object} seed - The loaded seed data
 * @returns {Array<{entry: object, category: string}>}
 */
function collectReferenceEntries(seed) {
  const results = [];

  // Outputs — armor (reference)
  for (const entry of seed.outputs?.armor || []) {
    if (entry._tailoring?.seedAction === "reference") {
      results.push({ entry, category: "outputs" });
    }
  }

  // Outputs — accessories (reference)
  for (const entry of seed.outputs?.accessories || []) {
    if (entry._tailoring?.seedAction === "reference") {
      results.push({ entry, category: "outputs" });
    }
  }

  // Materials (reference)
  for (const entry of seed.materials?.confirmed || []) {
    if (entry._tailoring?.seedAction === "reference") {
      results.push({ entry, category: "materials" });
    }
  }

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
 * Build a Map<compendiumKey, Item> from all world items that have the
 * compendiumKey flag set. Used for O(1) lookups during seeding.
 * @returns {Map<string, Item>}
 */
function buildCompendiumKeyMap() {
  const map = new Map();
  for (const item of game.items) {
    const key = item.getFlag(MODULE_ID, FLAGS.compendiumKey);
    if (key) map.set(key, item);
  }
  return map;
}

/**
 * Check if a world item with the given compendiumKey flag already exists.
 * Uses a pre-built Map for O(1) lookup instead of a linear game.items scan.
 * @param {string} compendiumKey
 * @param {Map<string, Item>} keyMap
 * @returns {Item|null}
 */
function findExistingByCompendiumKey(compendiumKey, keyMap) {
  if (!compendiumKey) return null;
  return keyMap.get(compendiumKey) ?? null;
}

/**
 * Ensure all seed items exist in the world.
 * Called at init (GM only). Two phases:
 *
 * Phase 1 — Create: For entries with seedAction === "create", checks if a world
 *   item with a matching compendiumKey flag already exists; if not, creates it
 *   via Item.create() and sets the module flags.
 *
 * Phase 2 — Reference: For entries with seedAction === "reference", finds the
 *   existing world item by name + type and tags it with recipeTag + role flags.
 *   These items already exist in Crucible's system compendiums — the GM must
 *   have imported them into the world. If not found, logs a warning.
 *
 * Modifications are NOT processed — they are affix references only.
 *
 * @returns {Promise<void>}
 */
export async function ensureSeedItems() {
  const seed = await loadSeedData();
  if (!seed) {
    console.warn("crucible-tailoring | Seed data not available — skipping seed item creation");
    return;
  }

  // ---- Phase 1: Create module-specific items ----
  const creatableEntries = collectCreatableEntries(seed);
  const keyMap = buildCompendiumKeyMap();

  for (const { entry } of creatableEntries) {
    const compendiumKey = entry._tailoring?.compendiumKey;
    if (!compendiumKey) {
      console.warn(`crucible-tailoring | Create entry "${entry.name}" has no compendiumKey — skipping. Add one to the seed JSON.`);
      continue;
    }

    const existing = findExistingByCompendiumKey(compendiumKey, keyMap);
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

    // Add to the map so subsequent entries see this newly created item
    keyMap.set(compendiumKey, created);

    console.log(`crucible-tailoring | Created seed item: ${entry.name} (${compendiumKey})`);
  }

  // ---- Phase 2: Tag existing Crucible items as recipes ----
  const referenceEntries = collectReferenceEntries(seed);

  for (const { entry, category } of referenceEntries) {
    const compendiumKey = entry._tailoring?.compendiumKey;

    // Check if already tagged (by compendiumKey flag)
    if (compendiumKey && keyMap.has(compendiumKey)) continue;

    // Find the existing world item by name + type
    const existing = game.items.find(
      i => i.name === entry.name && i.type === entry.type
    );

    if (!existing) {
      console.warn(`crucible-tailoring | Reference item not found in world: ${entry.name} (${entry.type}). The GM should import this item from a Crucible compendium.`);
      continue;
    }

    // Tag it as a recipe and set role + compendiumKey flags
    const flagUpdates = {};
    flagUpdates[`flags.${MODULE_ID}.${FLAGS.recipeTag}`] = true;
    flagUpdates[`flags.${MODULE_ID}.${FLAGS.role}`] = entry._tailoring?.role ?? "output";

    if (compendiumKey) {
      flagUpdates[`flags.${MODULE_ID}.${FLAGS.compendiumKey}`] = compendiumKey;
    }

    // Copy any additional _tailoring flags (composite, template, etc.)
    for (const [key, value] of Object.entries(entry._tailoring ?? {})) {
      if (key === "seedAction" || key === "role" || key === "compendiumKey") continue;
      flagUpdates[`flags.${MODULE_ID}.${key}`] = value;
    }

    await existing.update(flagUpdates);

    // Track in keyMap so we don't double-process
    if (compendiumKey) keyMap.set(compendiumKey, existing);

    console.log(`crucible-tailoring | Tagged reference item as recipe: ${entry.name}`);
  }
}

// =========================================================================
// Recipe tagging (unchanged — recipes are still flags on world items)
// =========================================================================

/**
 * Tag an item as a tailoring recipe (craftable product).
 * Used by the recipe drop zone in the hub.
 * @param {Item} item - The item document to tag as a recipe
 * @returns {Promise<void>}
 */
export async function tagItemAsRecipe(item) {
  await item.setFlag(MODULE_ID, FLAGS.recipeTag, true);
}

/**
 * Remove the recipe tag from an item. Leaves compendiumKey intact
 * so ensureSeedItems doesn't re-process it as new.
 * @param {Item} item
 * @returns {Promise<void>}
 */
export async function untagRecipe(item) {
  await item.setFlag(MODULE_ID, FLAGS.recipeTag, false);
}

/**
 * Clear recipe tags from ALL world items. Leaves compendiumKey intact.
 * @returns {Promise<void>}
 */
export async function clearAllRecipes() {
  for (const item of game.items) {
    if (isRecipeTagged(item)) {
      await item.setFlag(MODULE_ID, FLAGS.recipeTag, false);
    }
  }
}

/**
 * Check if an item is tagged as a tailoring recipe.
 * @param {Item} item
 * @returns {boolean}
 */
export function isRecipeTagged(item) {
  return item.getFlag(MODULE_ID, FLAGS.recipeTag) === true;
}

/**
 * Get all recipe-tagged items from the world.
 * Recipes are world items (not actor inventory) tagged with the recipe flag.
 * @returns {Item[]}
 */
export function getRegisteredRecipes() {
  return game.items.filter(item => isRecipeTagged(item));
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
 * Tool names the module checks for in actor inventory.
 * These are standard Crucible items — the GM imports them from compendiums.
 */
export const TOOL_NAMES = {
  toolkit: "Tailor's Toolkit",
  workbench: "Tailor's Portable Workbench",
  repairKit: "Repair Kit (tailor)"
};

/**
 * Check if an actor possesses a tool matching the given name.
 * @param {Actor} actor
 * @param {string} toolName - Exact name to match against actor's items
 * @returns {boolean}
 */
export function actorHasTool(actor, toolName) {
  if (!actor) return false;
  return actor.items.some(item => item.name === toolName);
}

/**
 * Get all seed entries of a given role for display in the hub.
 * For "output" role: these are reference entries (name+type pointers).
 * The actual tagged world items come from getRegisteredRecipes().
 * @param {string} role - e.g. "output", "modification", "disguise"
 * @returns {Promise<Array>}
 */
export async function getSeedEntriesByRole(role) {
  const seed = await loadSeedData();

  switch (role) {
    case "output": {
      // Reference entries — the real items are tagged in the world by ensureSeedItems()
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