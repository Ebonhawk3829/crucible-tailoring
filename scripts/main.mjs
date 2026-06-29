// main.mjs — init/ready hooks
// Registers settings, queries, launch button, Mend AE rest-cleanup.

import { MODULE_ID, registerSettings } from "./config.mjs";
import { checkCanOpenHub } from "./gating.mjs";

/**
 * Find and delete all Mend boon ActiveEffects from an actor.
 * Called when a rest completes to clear "until next rest" effects.
 * @param {Actor} actor
 */
async function clearMendBoons(actor) {
  if (!actor) return;
  const effects = actor.effects?.filter(e =>
    e.getFlag(MODULE_ID, "useEffect") === "applyMendBoons"
  ) ?? [];
  if (effects.length === 0) return;
  await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map(e => e.id));
  console.log(`crucible-tailoring | Cleared ${effects.length} Mend boon(s) from ${actor.name}`);
}

/**
 * Apply Mend boons to an actor via Crucible's enchantmentBonus system.
 * Crucible skills are derived data ({rank, abilityBonus, skillBonus, enchantmentBonus, score, passive})
 * and are recomputed every prepare cycle. enchantmentBonus is the documented field for
 * external skill modification — it starts at 0 and is added to score in #prepareFinalSkills().
 *
 * @param {Item} item - The Mend consumable being used
 * @param {Actor} actor - The actor using it
 */
async function useMendConsumable(item, actor) {
  const boonCount = item.getFlag(MODULE_ID, "mendBoonCount") ?? 0;
  if (boonCount <= 0) {
    ui.notifications.warn(game.i18n.localize("crucible-tailoring.mend.noBoons"));
    return;
  }

  // Crucible social skill IDs (verified against SYSTEM.SKILLS)
  const boonSkills = ["deception", "diplomacy", "intimidation", "performance"];

  // Create an ActiveEffect with infinite duration (cleared by rest hook).
  // Target enchantmentBonus — the Crucible field designed for external skill modification.
  const effectData = {
    name: game.i18n.localize("crucible-tailoring.mend.effectName"),
    icon: item.img,
    origin: item.uuid,
    duration: { value: 0, units: "rounds" }, // infinite
    flags: {
      [MODULE_ID]: {
        useEffect: "applyMendBoons",
        boonCount,
        boonSkills
      }
    },
    changes: boonSkills.map(skill => ({
      key: `system.skills.${skill}.enchantmentBonus`,
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: boonCount
    })),
    description: game.i18n.format("crucible-tailoring.mend.effectDescription", { boonCount })
  };

  await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

  // Consume the item using Crucible's built-in consume() for proper stackable handling
  if (typeof item.system?.consume === "function") {
    await item.system.consume(1, { save: true });
  } else {
    const isStackable = item.system?.properties?.includes?.("stackable") ?? false;
    const quantity = Number(item.system?.quantity) || 1;
    if (isStackable && quantity > 1) {
      await item.update({ "system.quantity": quantity - 1 });
    } else {
      await actor.deleteEmbeddedDocuments("Item", [item.id]);
    }
  }

  ui.notifications.info(game.i18n.format("crucible-tailoring.mend.applied", { boonCount }));
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

  // Ensure seed items exist in the world (GM only — Item.create requires GM permission)
  if (game.user.isGM) {
    const { ensureSeedItems } = await import("./materials.mjs");
    await ensureSeedItems();
  }

  // Register query handlers (lazy import to avoid circular deps)
  const { registerQueryHandlers } = await import("./queries.mjs");
  registerQueryHandlers();

  // Register the chat message hook for proposal confirm buttons
  const { registerChatHook } = await import("./chat.mjs");
  registerChatHook();

  // Register the Mend AE rest-cleanup hook
  Hooks.on("rest", async (actor, result) => {
    if (!actor) return;
    await clearMendBoons(actor);
  });

  // Register a Crucible talent hook for Mend consumable usage.
  // Crucible does not fire a generic "useItem" hook; item usage flows through
  // CrucibleAction/useAction. We register a prepareAction hook that checks
  // for Mend consumables and applies their boons when the item is used.
  // The actual integration point depends on how Mend consumables are configured
  // as actions — this hook fires during action preparation on the actor.
  Hooks.on("crucible.prepareAction", (item, action) => {
    if (item.getFlag(MODULE_ID, "useEffect") !== "applyMendBoons") return;
    const actor = item.parent;
    if (!actor) return;
    // Defer to the action's postActivate to apply the boon after the action completes
    const origPostActivate = action.postActivate;
    action.postActivate = async function () {
      if (origPostActivate) await origPostActivate.call(this);
      await useMendConsumable(item, actor);
    };
  });

  // Add a launch button to Crucible actor sheets.
  // Crucible uses ApplicationV2 sheets — use renderActorSheetV2 with native DOM.
  Hooks.on("renderActorSheetV2", (app, element, data) => {
    const actor = app.document;
    if (!actor || actor.type !== "character") return;

    // Only add the button if it doesn't already exist
    if (element.querySelector(".crucible-tailoring-launch")) return;

    const button = document.createElement("a");
    button.className = "crucible-tailoring-launch";
    button.title = game.i18n.localize("crucible-tailoring.hub.launch");
    button.innerHTML = `<i class="fas fa-scissors"></i> ${game.i18n.localize("crucible-tailoring.hub.launch")}`;

    button.addEventListener("click", async () => {
      if (!checkCanOpenHub(actor)) return;
      const { TailoringHub } = await import("./hub.mjs");
      await TailoringHub.open(actor);
    });

    // Append to the sheet's header buttons area
    const header = element.querySelector(".window-header .window-title");
    if (header) {
      header.after(button);
    } else {
      // Fallback: append to the sheet's title bar
      const sheetHeader = element.querySelector(".sheet-header");
      if (sheetHeader) sheetHeader.append(button);
    }
  });
});