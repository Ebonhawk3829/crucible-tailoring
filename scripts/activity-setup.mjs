// activity-setup.mjs — activity-specific payload assembly
// Each activity has different input selection, tool requirements, and output specs.
// These functions run on the PLAYER's client before the GM pings.

import { MODULE_ID, FLAGS, getMaterialDC, getMendDC } from "./config.mjs";
import { actorHasTool, TOOL_NAMES, inferQualityFromName } from "./materials.mjs";

/**
 * Activity definition registry.
 * Each entry defines how to assemble the payload, validate prerequisites,
 * and build the output spec for a given activity.
 */
export const ACTIVITY_DEFS = {
  craftTradeGoods: {
    id: "craftTradeGoods",
    tier: "novice",
    toolCheck: (actor) => actorHasTool(actor, TOOL_NAMES.toolkit),
    toolFailKey: "crucible-tailoring.query.missingToolkit",

    /**
     * Assemble the requestRoll payload for Craft Trade Goods.
     * Player selects materials → we compute DC from material quality.
     */
    assemblePayload(actor, selectedMaterials, extra = {}) {
      if (!selectedMaterials?.length) return null;
      const materialQuality = inferQualityFromName(selectedMaterials[0].name)
        ?? selectedMaterials[0].system?.quality
        ?? "standard";
      const dc = getMaterialDC(materialQuality);
      // Build per-material quantity map from batch selections
      const materialQuantities = {};
      if (extra.batchSelections) {
        for (const s of extra.batchSelections) {
          materialQuantities[s.material.uuid] = s.quantity;
        }
      }
      return {
        actorUuid: actor.uuid,
        activityId: "craftTradeGoods",
        materialQuality,
        dc,
        inputUuids: selectedMaterials.map(m => m.uuid),
        batchCount: extra.batchCount ?? selectedMaterials.length,
        materialQuantities
      };
    },

    /**
     * Build the output spec for the proposal.
     */
    buildOutputSpec(band, quality, payload, extra = {}) {
      return {
        type: "loot",
        name: "Tailored Trade Goods",
        img: "icons/commodities/cloth/cloth-bolt-gray.webp",
        system: {
          category: "treasure",
          quality: quality ?? "standard",
          price: 12,
          weight: 1,
          quantity: payload.batchCount ?? 1,
          properties: ["stackable"],
          description: {
            public: "<p>Finished textile goods produced by a skilled tailor for sale or trade.</p>"
          }
        },
        _tailoring: {
          role: "tradeGood",
          producedBy: ["craftTradeGoods"],
          qualityScales: true
        }
      };
    }
  },

  craftEquipment: {
    id: "craftEquipment",
    tier: "novice",
    toolCheck: (actor) => actorHasTool(actor, TOOL_NAMES.toolkit),
    toolFailKey: "crucible-tailoring.query.missingToolkit",

    assemblePayload(actor, selectedMaterials, extra = {}) {
      if (!selectedMaterials?.length || !extra.outputItem) return null;
      const materialQuality = inferQualityFromName(selectedMaterials[0].name)
        ?? selectedMaterials[0].system?.quality
        ?? "standard";
      const dc = getMaterialDC(materialQuality);
      // outputItem is always a real Foundry Item (from getRegisteredRecipes or recipe drop zone)
      const outputItemId = extra.outputItem.uuid;
      return {
        actorUuid: actor.uuid,
        activityId: "craftEquipment",
        materialQuality,
        dc,
        inputUuids: selectedMaterials.map(m => m.uuid),
        outputItemUuid: outputItemId
      };
    },

    buildOutputSpec(band, quality, payload, extra = {}) {
      const outputItem = extra.outputItem;
      if (!outputItem) return null;
      // outputItem is always a real Foundry Item
      const compendiumKey = outputItem.getFlag(MODULE_ID, FLAGS.compendiumKey) ?? null;
      return {
        type: outputItem.type,
        name: outputItem.name,
        img: outputItem.img,
        system: foundry.utils.deepClone(outputItem.system ?? {}),
        _tailoring: {
          role: "output",
          compendiumKey
        }
      };
    }
  },

  mend: {
    id: "mend",
    tier: "novice",
    toolCheck: (actor) =>
      actorHasTool(actor, TOOL_NAMES.toolkit) && actorHasTool(actor, TOOL_NAMES.repairKit),
    toolFailKey: "crucible-tailoring.query.missingRepairKit",

    assemblePayload(actor, selectedMaterials, extra = {}) {
      if (!selectedMaterials?.length) return null;
      const materialQuality = inferQualityFromName(selectedMaterials[0].name)
        ?? selectedMaterials[0].system?.quality
        ?? "standard";
      const dc = getMendDC();
      const partyMembers = extra.partyMembers ?? [actor];
      // Build per-material quantity map from batch selections
      const materialQuantities = {};
      if (extra.batchSelections) {
        for (const s of extra.batchSelections) {
          materialQuantities[s.material.uuid] = s.quantity;
        }
      }
      return {
        actorUuid: actor.uuid,
        activityId: "mend",
        materialQuality,
        dc,
        inputUuids: selectedMaterials.map(m => m.uuid),
        partyMemberUuids: partyMembers.map(a => a.uuid),
        partyCount: partyMembers.length,
        materialQuantities
      };
    },

    buildOutputSpec(band, quality, payload, extra = {}) {
      const boonScale = { shoddy: 0, standard: 1, fine: 2, superior: 3, masterwork: 4 };
      const boonCount = boonScale[quality] ?? 0;
      return {
        type: "consumable",
        name: "Mended Presentation",
        img: "icons/commodities/cloth/cloth-thread-needle.webp",
        system: {
          category: "other",
          quality: quality ?? "standard",
          price: 0,
          weight: 0,
          quantity: 1,
          description: {
            public: `<p>The party's clothing and travel gear has been expertly mended, pressed, and presented.</p><p><strong>Quality:</strong> ${quality}</p><p><strong>Boons:</strong> +${boonCount} to social skill checks where appearance matters.</p><p><strong>Duration:</strong> Lasts until the party takes a rest.</p><p><em>Use this item to apply the boon to yourself.</em></p>`
          }
        },
        _tailoring: {
          role: "consumable",
          compendiumKey: "mendConsumable0",
          producedBy: ["mend"],
          useEffect: "applyMendBoons",
          boonScale,
          boonSkills: ["deception", "diplomacy", "intimidation", "performance"],
          duration: "infinite",
          partyMemberUuids: payload.partyMemberUuids ?? []
        }
      };
    }
  },

  craftDisguise: {
    id: "craftDisguise",
    tier: "journeyman",
    toolCheck: (actor) => actorHasTool(actor, TOOL_NAMES.workbench),
    toolFailKey: "crucible-tailoring.query.missingPortableWorkbench",

    assemblePayload(actor, selectedMaterials, extra = {}) {
      if (!selectedMaterials?.length) return null;
      const materialQuality = inferQualityFromName(selectedMaterials[0].name)
        ?? selectedMaterials[0].system?.quality
        ?? "standard";
      const dc = getMaterialDC(materialQuality);
      return {
        actorUuid: actor.uuid,
        activityId: "craftDisguise",
        materialQuality,
        dc,
        inputUuids: selectedMaterials.map(m => m.uuid),
        disguiseType: extra.disguiseType ?? "social",
        context: extra.context ?? ""
      };
    },

    buildOutputSpec(band, quality, payload, extra = {}) {
      const boonScale = { shoddy: 0, standard: 1, fine: 2, superior: 3, masterwork: 4 };
      const boonCount = boonScale[quality] ?? 0;
      const isSocial = payload.disguiseType === "social";
      const boonSkill = isSocial ? "deception" : "stealth";
      const contextLabel = payload.context || (isSocial ? "general social" : "general terrain");

      return {
        type: "armor",
        name: isSocial ? "Social Disguise" : "Environmental Disguise",
        img: isSocial
          ? "icons/equipment/chest/robe-layered-blue.webp"
          : "icons/equipment/chest/robe-layered-green.webp",
        system: {
          category: "unarmored",
          quality: quality ?? "standard",
          price: 80,
          weight: 8,
          description: {
            public: isSocial
              ? `<p>A complete costume designed to help the wearer pass as someone they are not.</p><p><strong>Context:</strong> ${contextLabel}</p><p><strong>Boons:</strong> +${boonCount} to Deception checks to maintain this cover.</p>`
              : `<p>Camouflage coverings tailored to blend into a specific terrain.</p><p><strong>Terrain:</strong> ${contextLabel}</p><p><strong>Boons:</strong> +${boonCount} to Stealth checks in this terrain.</p>`
          }
        },
        _tailoring: {
          role: "disguise",
          compendiumKey: isSocial ? "disguiseSocial0" : "disguiseEnviron0",
          disguiseType: payload.disguiseType ?? "social",
          boonSkill,
          contextPlaceholder: true
        }
      };
    }
  },

  applyModification: {
    id: "applyModification",
    tier: "journeyman",
    toolCheck: (actor) => actorHasTool(actor, TOOL_NAMES.workbench),
    toolFailKey: "crucible-tailoring.query.missingPortableWorkbench",

    assemblePayload(actor, selectedMaterials, extra = {}) {
      if (!selectedMaterials?.length || !extra.sourceItem || !extra.affixItem) return null;
      const materialQuality = selectedMaterials[0].system?.quality ?? "standard";
      const dc = getMaterialDC(materialQuality);
      return {
        actorUuid: actor.uuid,
        activityId: "applyModification",
        materialQuality,
        dc,
        inputUuids: selectedMaterials.map(m => m.uuid),
        sourceItemUuid: extra.sourceItem.uuid,
        affixUuid: extra.affixItem.uuid
      };
    },

    buildOutputSpec(band, quality, payload, extra = {}) {
      const sourceItem = extra.sourceItem;
      const affixItem = extra.affixItem;
      if (!sourceItem || !affixItem) return null;
      return {
        type: sourceItem.type,
        name: `${sourceItem.name} (${affixItem.name})`,
        img: sourceItem.img,
        system: foundry.utils.deepClone(sourceItem.system),
        _tailoring: {
          role: "modified",
          sourceItemUuid: payload.sourceItemUuid,
          affixUuid: payload.affixUuid,
          affixName: affixItem.name
        }
      };
    }
  }
};

/**
 * Get the activity definition for a given activity ID.
 * @param {string} activityId
 * @returns {object|null}
 */
export function getActivityDef(activityId) {
  return ACTIVITY_DEFS[activityId] ?? null;
}

/**
 * Validate that the actor meets the prerequisites for an activity.
 * @param {Actor} actor
 * @param {string} activityId
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateActivityPrerequisites(actor, activityId) {
  const def = getActivityDef(activityId);
  if (!def) return { ok: false, reason: "unknownActivity" };

  // Check talent tier
  const rank = actor.system?.training?.tailoring ?? 0;
  const requiredRank = def.tier === "journeyman" ? 2 : 1;
  if (rank < requiredRank) {
    return { ok: false, reason: "insufficientRank" };
  }

  // Check tool possession
  if (def.toolCheck && !def.toolCheck(actor)) {
    return { ok: false, reason: def.toolFailKey };
  }

  return { ok: true };
}