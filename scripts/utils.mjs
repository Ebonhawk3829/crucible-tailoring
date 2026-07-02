// utils.mjs — shared helpers used across the tailoring module
// Extracted to eliminate duplication and provide a single source of truth.

/**
 * Resolve drag event data with a multi-strategy fallback chain.
 * The documented v14 helper path differs between builds; this tries
 * every known variant before falling back to raw dataTransfer parsing.
 *
 * @param {DragEvent} event
 * @returns {object|null}
 */
export function getDragEventData(event) {
  try {
    const impl = foundry.applications.ux.TextEditor.implementation;
    if (typeof impl?.getDragEventData === "function") return impl.getDragEventData(event);
  } catch (_e) { /* fall through */ }
  try {
    if (typeof TextEditor?.getDragEventData === "function") return TextEditor.getDragEventData(event);
  } catch (_e) { /* fall through */ }
  try {
    const json = event.dataTransfer?.getData("text/plain");
    if (json) return JSON.parse(json);
  } catch (_e) { /* fall through */ }
  return null;
}

/**
 * Compute the ability bonus for a tailoring roll.
 * Crucible uses (Dex + Int) / 4 — same pairing as Reflex saves.
 *
 * @param {Actor} actor
 * @returns {number}
 */
export function getAbilityBonus(actor) {
  const dex = actor?.system?.abilities?.dexterity?.value ?? 0;
  const int = actor?.system?.abilities?.intellect?.value ?? 0;
  return Math.round((dex + int) / 4);
}
