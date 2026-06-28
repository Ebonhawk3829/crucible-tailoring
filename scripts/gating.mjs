// gating.mjs — access control for the Tailoring Hub
// Rank-based gate: actor must have tailoring training rank >= 1.

import { MODULE_ID } from "./config.mjs";

/**
 * Silent predicate: does the actor qualify to open the Tailoring Hub?
 * @param {Actor} actor
 * @returns {boolean}
 */
export function canOpenHub(actor) {
  if (!actor) return false;
  const rank = actor.system?.training?.tailoring ?? 0;
  return rank >= 1;
}

/**
 * Notify-and-return wrapper. Calls canOpenHub; on failure, shows a
 * ui.notifications.warn and returns false. The launch point calls this
 * and aborts on false.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function checkCanOpenHub(actor) {
  if (canOpenHub(actor)) return true;

  ui.notifications.warn(
    game.i18n.localize("crucible-tailoring.gate.untrained")
  );
  return false;
}