// main.mjs — init/ready hooks
// Registers settings, queries, launch button, Mend AE rest-cleanup,
// and the Mend consumable action hook via crucible.api.hooks.

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
 * Register the Mend consumable's postActivate hook in crucible.api.hooks.
 * Uses the stable identifier "mendConsumable0000" set on the consumable at creation time.
 *
 * Crucible's action lifecycle: postActivate fires after all rolls are complete and
 * effect events have been recorded. This is the documented place to inspect and
 * modify the event stream. We record the Mend boon as an effect event so Crucible
 * applies it during confirmation — no direct document writes.
 *
 * The consumable itself is consumed by Crucible's normal consumable flow
 * (CrucibleConsumableItem.consume decrements uses automatically).
 *
 * Guarded by a sentinel to prevent double-registration across reloads.
 */
function registerMendHook() {
  const MEND_ID = "mendConsumable0000";
  if (crucible.api.hooks.action[MEND_ID]) return; // sentinel: already registered

  crucible.api.hooks.action[MEND_ID] = {
    postActivate() {
      const item = this.item;
      if (!item) return;
      const boonCount = item.getFlag(MODULE_ID, "mendBoonCount") ?? 0;
      if (boonCount <= 0) return;

      const boonSkills = ["deception", "diplomacy", "intimidation", "performance"];

      // Record the Mend boon as an effect event in the action's event stream.
      // Crucible applies recorded effects during confirmation — no direct writes.
      this.recordEvent({
        type: "effect",
        target: this.actor,
        effects: [{
          name: game.i18n.localize("crucible-tailoring.mend.effectName"),
          img: item.img,
          origin: item.uuid,
          duration: { value: 0, units: "rounds" }, // infinite, cleared by rest hook
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
          }))
        }]
      });
    }
  };

  console.log("crucible-tailoring | Registered Mend consumable action hook");
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

  // Register the Mend consumable action hook via crucible.api.hooks.
  // Crucible's actor hooks are registered keyed by talent/affix/item ID in
  // crucible.api.hooks.action, NOT via the global Hooks bus. The hook fires
  // during Phase 2 (postActivate) and records an effect event — no direct
  // document writes, per Crucible's lifecycle guidance.
  registerMendHook();

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