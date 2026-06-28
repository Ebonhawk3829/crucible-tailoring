// main.mjs — init/ready hooks
// Registers settings, queries, launch button, Mend AE rest-cleanup, and consumable usage.

import { MODULE_ID, registerSettings } from "./config.mjs";
import { checkCanOpenHub } from "./gating.mjs";
import { ensureSeedItems } from "./materials.mjs";

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
 * Handle using a Mend consumable item.
 * Applies an ActiveEffect to the user granting social-skill boons.
 * @param {Item} item - The consumable being used
 * @param {Actor} actor - The actor using it
 */
async function useMendConsumable(item, actor) {
  const boonCount = item.getFlag(MODULE_ID, "mendBoonCount") ?? 0;
  if (boonCount <= 0) {
    ui.notifications.warn(game.i18n.localize("crucible-tailoring.mend.noBoons"));
    return;
  }

  const boonSkills = ["diplomacy", "deception", "intimidation", "persuasion", "society"];

  // Create an ActiveEffect with infinite duration (cleared by rest hook)
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
      key: `system.skills.${skill}.bonus`,
      mode: CONST.ACTIVE_EFFECT_MODES.ADD,
      value: `+${boonCount}`
    })),
    description: game.i18n.format("crucible-tailoring.mend.effectDescription", { boonCount })
  };

  await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

  // Consume the item
  const isStackable = item.system?.properties?.includes?.("stackable") ?? false;
  const quantity = Number(item.system?.quantity) || 1;
  if (isStackable && quantity > 1) {
    const newQty = quantity - 1;
    if (newQty <= 0) {
      await actor.deleteEmbeddedDocuments("Item", [item.id]);
    } else {
      await item.update({ "system.quantity": newQty });
    }
  } else {
    await actor.deleteEmbeddedDocuments("Item", [item.id]);
  }

  ui.notifications.info(game.i18n.format("crucible-tailoring.mend.applied", { boonCount }));
}

Hooks.once("init", () => {
  console.log("crucible-tailoring | Initializing");

  // Register world-scoped settings
  registerSettings();

  // Register the two CONFIG.queries handlers (delegated to queries.mjs)
  // We import lazily to avoid circular deps — queries.mjs imports from config.
  CONFIG.queries = CONFIG.queries ?? {};
  // Actual registration happens in the ready hook after all modules are loaded.
});

Hooks.once("ready", async () => {
  console.log("crucible-tailoring | Ready");

  // Ensure seed items exist in the world
  await ensureSeedItems();

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

  // Register consumable usage hook for Mend items
  Hooks.on("useItem", async (item, config, options, userId) => {
    if (item.getFlag(MODULE_ID, "useEffect") !== "applyMendBoons") return;
    const actor = item.parent;
    if (!actor) return;
    await useMendConsumable(item, actor);
    // Prevent default consumption — we handle it ourselves
    return false;
  });

  // Add a launch button to actor sheets (if the system exposes a header hook)
  // We use a generic approach: listen for renderActorSheet and inject a button.
  Hooks.on("renderActorSheet", (app, html, data) => {
    const actor = app.document;
    if (!actor || actor.type !== "character") return;

    // Only add the button if it doesn't already exist
    if (html.find(".crucible-tailoring-launch").length > 0) return;

    const button = $(`
      <a class="crucible-tailoring-launch" title="${game.i18n.localize("crucible-tailoring.hub.launch")}">
        <i class="fas fa-scissors"></i> ${game.i18n.localize("crucible-tailoring.hub.launch")}
      </a>
    `);

    button.on("click", async () => {
      if (!checkCanOpenHub(actor)) return;
      const { TailoringHub } = await import("./hub.mjs");
      await TailoringHub.open(actor);
    });

    // Append to the sheet's header buttons area
    const header = html.find(".window-header .window-title");
    if (header.length > 0) {
      header.after(button);
    } else {
      // Fallback: append to the sheet's title bar
      html.find(".sheet-header")?.append(button);
    }
  });
});