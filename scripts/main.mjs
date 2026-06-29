// main.mjs — init/ready hooks
// Registers settings, queries, launch button, Mend AE rest-cleanup,
// and the Mend consumable action hook via crucible.api.hooks.

import { MODULE_ID, registerSettings } from "./config.mjs";
import { checkCanOpenHub } from "./gating.mjs";

/**
 * Register the Mend consumable's postActivate hook in crucible.api.hooks.
 * Uses the stable identifier "mendConsumable0000" set on the consumable at creation time.
 *
 * Crucible's action lifecycle: postActivate fires after all rolls are complete and
 * effect events have been recorded. This is the documented place to inspect and
 * modify the event stream. We record a dummy ActiveEffect as a visual reminder —
 * no mechanical changes are applied. The player manually removes the effect after
 * a rest. This avoids the complexity of trying to model boon dice (which are
 * roll-time modifiers, not persisted actor fields) via ActiveEffect changes.
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

      // Record a dummy ActiveEffect as a visual reminder only.
      // Boons are roll-time dice modifiers in Crucible, not persisted actor fields,
      // so we do NOT write to enchantmentBonus or any other mechanical field.
      // The player/GM manually applies boon dice during relevant social checks
      // and removes this effect after a rest.
      this.recordEvent({
        type: "effect",
        target: this.actor,
        effects: [{
          name: game.i18n.localize("crucible-tailoring.mend.effectName"),
          img: item.img,
          origin: item.uuid,
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
  // Wrapped in try/catch so a missing or malformed seed file doesn't break module init.
  if (game.user.isGM) {
    try {
      const { ensureSeedItems } = await import("./materials.mjs");
      await ensureSeedItems();
    } catch (err) {
      console.warn("crucible-tailoring | Seed item creation failed:", err);
    }
  }

  // Register query handlers (lazy import to avoid circular deps)
  const { registerQueryHandlers } = await import("./queries.mjs");
  registerQueryHandlers();

  // Register the chat message hook for proposal confirm buttons
  const { registerChatHook } = await import("./chat.mjs");
  registerChatHook();

  // Register the Mend consumable action hook via crucible.api.hooks.
  // Crucible's actor hooks are registered keyed by talent/affix/item ID in
  // crucible.api.hooks.action, NOT via the global Hooks bus. The hook fires
  // during Phase 2 (postActivate) and records a dummy ActiveEffect as a
  // visual reminder — no mechanical changes, no direct document writes.
  // The player/GM manually removes the effect after a rest.
  registerMendHook();

  // Add a launch button to Crucible actor sheets.
  // Crucible uses ApplicationV2 sheets — use renderActorSheetV2 with native DOM.
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