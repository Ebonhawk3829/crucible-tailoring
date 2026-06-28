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
  materialTag: "materialTag",
  role: "role",
  primary: "primary",
  portable: "portable",
  usedBy: "usedBy",
  producedBy: "producedBy",
  disguiseType: "disguiseType",
  boonSkill: "boonSkill",
  affixSlotCost: "affixSlotCost",
  applicableTo: "applicableTo",
  tier: "tier",
  effect: "effect",
  bonus: "bonus",
  conditional: "conditional",
  composite: "composite",
  template: "template",
  qualityScales: "qualityScales",
  authorable: "authorable",
  contextPlaceholder: "contextPlaceholder",
  useEffect: "useEffect",
  boonScale: "boonScale",
  boonSkills: "boonSkills",
  duration: "duration",
  resolved: "resolved",
  actorUuid: "actorUuid"
};

// Timeout constants (milliseconds)
export const TIMEOUTS = {
  requestRoll: 120_000,   // 2 minutes — generous for player to complete roll dialog
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
  strongSuccessDelta: 8,
  materialsPerCopper: 15  // divisor for price-in-copper → materials-required formula
};

// Quality tiers in ascending order (used by bandToQualityDelta)
export const QUALITY_TIERS = ["shoddy", "standard", "fine", "superior", "masterwork"];

// Success bands
export const BANDS = {
  STRONG_SUCCESS: "strongSuccess",
  SUCCESS: "success",
  FAILURE: "failure",
  STRONG_FAILURE: "strongFailure"
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
    ["strongSuccessDelta", { name: "Strong Success Delta", hint: "How far above/below DC counts as strong success/failure.", default: DEFAULTS.strongSuccessDelta, type: Number }],
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
 * Get the strong success delta.
 * @returns {number}
 */
export function getStrongSuccessDelta() {
  return game.settings.get(MODULE_ID, "strongSuccessDelta");
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