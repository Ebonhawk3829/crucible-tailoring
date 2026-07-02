// main.mjs — init/ready hooks
// Wires settings, queries, launch button, Mend consumable hook, AE cleanup.

import { MODULE_ID, registerSettings, FLAGS } from "./config.mjs";
import { checkCanOpenHub } from "./gating.mjs";

/**
 * Register the Mend consumable's postActivate hook in crucible.api.hooks.
 * The hook records a dummy ActiveEffect as a visual reminder — boons are
 * roll-time modifiers in Crucible, not persisted actor fields, so no
 * mechanical changes are applied. Players manually clear the effect post-rest.
 *
 * Guarded by sentinel to prevent double-registration across reloads.
 */
function registerMendHook() {
  const MEND_ID = "mendConsumable0000";
  if (crucible.api.hooks.action[MEND_ID]) return; // sentinel: already registered

  crucible.api.hooks.action[MEND_ID] = {
    postActivate() {
      const item = this.item;
      if (!item) return;
      const boonCount = item.getFlag(MODULE_ID, FLAGS.mendBoonCount) ?? 0;
      if (boonCount <= 0) return;

      const boonSkills = ["deception", "diplomacy", "intimidation", "performance"];
      const skillLabels = boonSkills.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(", ");

      // Dummy ActiveEffect — visual reminder only, no mechanical fields.
      this.recordEvent({
        type: "effect",
        target: this.actor,
        effects: [{
          name: game.i18n.localize("crucible-tailoring.mend.effectName"),
          img: item.img,
          origin: item.uuid,
          description: game.i18n.format("crucible-tailoring.mend.effectTooltip", {
            count: boonCount, skills: skillLabels
          }),
          duration: { value: 0, units: "rounds" }, // infinite, manually cleared
          flags: {
            [MODULE_ID]: {
              useEffect: "applyMendBoons",
              boonCount,
              boonSkills
            }
          },
          changes: []  // No mechanical changes — visual reminder only
        }]
      });
    },

    async confirm(reverse) {
      if (reverse) return;
      const item = this.item;
      if (!item || typeof item.system?.consume !== "function") return;
      await item.system.consume(1, { save: true });
    }
  };

  console.log("crucible-tailoring | Registered Mend consumable action hook");
}

/**
 * Register ActiveEffect hooks for disguise equip actions.
 * When a player equips a disguise, record a visual ActiveEffect
 * showing the boon type, count, and context.
 *
 * Guarded by sentinel to prevent double-registration across reloads.
 */
function registerDisguiseHooks() {
  const DISGUISE_IDS = ["disguiseSocialEquip", "disguiseEnvironEquip"];

  for (const id of DISGUISE_IDS) {
    if (crucible.api.hooks.action[id]) continue; // sentinel

    crucible.api.hooks.action[id] = {
      postActivate() {
        const item = this.item;
        if (!item) return;

        const tailoringFlags = item.flags?.[MODULE_ID] ?? {};
        const disguiseType = tailoringFlags.disguiseType ?? (id === "disguiseSocialEquip" ? "social" : "environmental");
        const boonSkill = tailoringFlags.boonSkill ?? (disguiseType === "social" ? "deception" : "stealth");
        const boonScale = tailoringFlags.boonScale;
        const boonCount = typeof boonScale === "number" ? boonScale : null;

        const isSocial = disguiseType === "social";
        const effectName = isSocial
          ? game.i18n.localize("crucible-tailoring.disguise.effectNameSocial")
          : game.i18n.localize("crucible-tailoring.disguise.effectNameEnvironmental");
        const descKey = isSocial
          ? "crucible-tailoring.disguise.effectTooltipSocial"
          : "crucible-tailoring.disguise.effectTooltipEnvironmental";

        const description = boonCount != null
          ? game.i18n.format(descKey, { count: boonCount })
          : game.i18n.localize(descKey);

        this.recordEvent({
          type: "effect",
          target: this.actor,
          effects: [{
            name: effectName,
            img: item.img,
            origin: item.uuid,
            description,
            duration: { value: 0, units: "rounds" },
            flags: {
              [MODULE_ID]: {
                useEffect: "disguiseEquipped",
                disguiseType,
                boonSkill,
                boonCount
              }
            },
            changes: []
          }]
        });
      }
    };
  }

  console.log("crucible-tailoring | Registered disguise equip action hooks");
}

Hooks.once("init", () => {
  console.log("crucible-tailoring | Initializing");

  // Register world-scoped settings
  registerSettings();

  // CONFIG.queries handlers are registered in the ready hook after all modules are loaded.
  CONFIG.queries = CONFIG.queries ?? {};
});

Hooks.once("ready", async () => {
  console.log("crucible-tailoring | Ready");

  // Seed items (GM only)
  if (game.user.isGM) {
    try {
      const { ensureSeedItems } = await import("./materials.mjs");
      await ensureSeedItems();
    } catch (err) {
      console.warn("crucible-tailoring | Seed item creation failed:", err);
    }
  }

  // Register query handlers
  const { registerQueryHandlers } = await import("./queries.mjs");
  registerQueryHandlers();

  // Register chat hook for proposal confirm buttons
  const { registerChatHook } = await import("./chat.mjs");
  registerChatHook();

  // Register Mend consumable action hook
  registerMendHook();

  // Register disguise equip action hooks
  registerDisguiseHooks();

  // Inject launch button into Crucible actor sheets
  Hooks.on("renderActorSheetV2", (app, element, data) => {
    const actor = app.document;
    if (!actor || actor.type !== "hero") return;

    // Only add the button if it doesn't already exist
    if (element.querySelector(".crucible-tailoring-launch")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "crucible-tailoring-launch";
    button.title = game.i18n.localize("crucible-tailoring.hub.launch");
    button.innerHTML = `<i class="fas fa-scissors"></i> ${game.i18n.localize("crucible-tailoring.hub.launch")}`;

    button.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!checkCanOpenHub(actor)) return;
      const { TailoringHub } = await import("./hub.mjs");
      await TailoringHub.open(actor);
    });

    // Append to the sheet's header buttons area
    const headerButtons = element.querySelector(".window-header .header-buttons");
    if (headerButtons) {
      headerButtons.append(button);
    } else {
      // Fallback: append after the window title
      const header = element.querySelector(".window-header .window-title");
      if (header) header.after(button);
    }
  });
});