// config.mjs — default constants + setting registration metadata
// Live values come from game.settings.get("crucible-tailoring", key), never from this file directly.

export const MODULE_ID = "crucible-tailoring";

// Query names (must match the handlers registered in queries.mjs)
export const QUERY_REQUEST_ROLL = `${MODULE_ID}.requestRoll`;
export const QUERY_PROPOSE_OUTPUT = `${MODULE_ID}.proposeOutput`;

// Flag keys (stored under flags.crucible-tailoring.*)
export const FLAGS = {
  proposal: "proposal",
  compendiumKey: "compendiumKey",
  recipeTag: "recipeTag",
  role: "role",
  producedBy: "producedBy",
  disguiseType: "disguiseType",
  affixSlotCost: "affixSlotCost",
  applicableTo: "applicableTo",
  tier: "tier",
  effect: "effect",
  qualityScales: "qualityScales",
  contextPlaceholder: "contextPlaceholder",
  useEffect: "useEffect",
  boonScale: "boonScale",
  boonSkills: "boonSkills",
  duration: "duration",
  resolved: "resolved",
  actorUuid: "actorUuid",
  mendBoonCount: "mendBoonCount",
  mendPartyUuids: "mendPartyUuids",
  mendAssignments: "mendAssignments"
};

// Timeout constants (milliseconds)
export const TIMEOUTS = {
  requestRoll: 300_000,   // 5 minutes — must exceed Crucible's requestSkillCheck timeout
                          // since the GM handler awaits check.request({user}) which
                          // suspends for the duration of the player's roll dialog.
  proposeOutput: 600_000  // 10 minutes — generous for GM to review and confirm
};

// Default setting values — registered as world-scoped settings in registerSettings()
export const DEFAULTS = {
  materialDC: {
    shoddy: 8,
    standard: 12,
    fine: 16,
    superior: 20,
    masterwork: 24
  },
  mendDC: 14,
  materialsPerCopper: 15  // divisor for price-in-copper → materials-required formula
};

// Quality tiers in ascending order (used by bandToQualityDelta)
export const QUALITY_TIERS = ["shoddy", "standard", "fine", "superior", "masterwork"];

// Boon count delivered per quality tier for Mend and Disguise activities.
export const BOON_SCALE = { shoddy: 0, standard: 1, fine: 2, superior: 3, masterwork: 4 };

// Success bands
export const BANDS = {
  CRITICAL_SUCCESS: "criticalSuccess",
  SUCCESS: "success",
  FAILURE: "failure",
  CRITICAL_FAILURE: "criticalFailure"
};

/**
 * Register all world-scoped settings.
 * Called from main.mjs init hook.
 */
export function registerSettings() {
  const settings = [
    ["materialDC.shoddy", { name: "Shoddy Material DC", hint: "DC for working shoddy-quality materials.", default: DEFAULTS.materialDC.shoddy, type: Number }],
    ["materialDC.standard", { name: "Standard Material DC", hint: "DC for working standard-quality materials.", default: DEFAULTS.materialDC.standard, type: Number }],
    ["materialDC.fine", { name: "Fine Material DC", hint: "DC for working fine-quality materials.", default: DEFAULTS.materialDC.fine, type: Number }],
    ["materialDC.superior", { name: "Superior Material DC", hint: "DC for working superior-quality materials.", default: DEFAULTS.materialDC.superior, type: Number }],
    ["materialDC.masterwork", { name: "Masterwork Material DC", hint: "DC for working masterwork-quality materials.", default: DEFAULTS.materialDC.masterwork, type: Number }],
    ["mendDC", { name: "Mend DC", hint: "DC for the Mend Party Clothing activity.", default: DEFAULTS.mendDC, type: Number }],
    ["materialsPerCopper", { name: "Materials Per Copper", hint: "Divisor for the price→materials formula: materials = max(1, round(priceInCopper / this)).", default: DEFAULTS.materialsPerCopper, type: Number }]
  ];

  for (const [key, cfg] of settings) {
    game.settings.register(MODULE_ID, key, {
      name: `Crucible Tailoring: ${cfg.name}`,
      hint: cfg.hint,
      scope: "world",
      config: true,
      type: cfg.type,
      default: cfg.default
    });
  }

  // materialTypes — persisted array of {name, quality, img}, decoupled from inventory
  game.settings.register(MODULE_ID, "materialTypes", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
}

/**
 * Get a material DC by quality tier name.
 * @param {string} quality - One of "shoddy"|"standard"|"fine"|"superior"|"masterwork"
 * @returns {number}
 */
export function getMaterialDC(quality) {
  return game.settings.get(MODULE_ID, `materialDC.${quality}`);
}

/**
 * Get the mend DC.
 * @returns {number}
 */
export function getMendDC() {
  return game.settings.get(MODULE_ID, "mendDC");
}

/**
 * Get the materials-per-copper divisor.
 * @returns {number}
 */
export function getMaterialsPerCopper() {
  return game.settings.get(MODULE_ID, "materialsPerCopper");
}