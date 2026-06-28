// queries.mjs — CONFIG.queries handlers (GM-side logic)
// Both handlers validate inputs GM-side and JSON-serialize their return.

import { MODULE_ID, QUERY_REQUEST_ROLL, QUERY_PROPOSE_OUTPUT, FLAGS, getMaterialDC, getMendDC, getStrongSuccessDelta } from "./config.mjs";
import { resolveOutcome } from "./outcome.mjs";
import { actorHasTool } from "./materials.mjs";

/**
 * Register both query handlers in CONFIG.queries.
 * Called from main.mjs ready hook.
 */
export function registerQueryHandlers() {
  CONFIG.queries[QUERY_REQUEST_ROLL] = handleRequestRoll;
  CONFIG.queries[QUERY_PROPOSE_OUTPUT] = handleProposeOutput;
}

/**
 * Validate that the actor possesses the required tool for an activity.
 * @param {Actor} actor
 * @param {string} activityId
 * @returns {{ok: boolean, reason?: string}}
 */
function validateToolRequirement(actor, activityId) {
  const noviceActivities = ["craftTradeGoods", "craftEquipment", "mend"];
  const journeymanActivities = ["craftDisguise", "applyModification"];

  if (journeymanActivities.includes(activityId)) {
    // Journeyman: requires Portable Workbench (portable: true)
    if (!actorHasTool(actor, { portable: true })) {
      return { ok: false, reason: "missingPortableWorkbench" };
    }
  } else if (noviceActivities.includes(activityId)) {
    // Novice: requires Tailor's Toolkit (primary: true)
    if (!actorHasTool(actor, { primary: true })) {
      return { ok: false, reason: "missingToolkit" };
    }
  }

  // Mend additionally requires Repair Kit
  if (activityId === "mend") {
    if (!actorHasTool(actor, { usedBy: ["mend"] })) {
      return { ok: false, reason: "missingRepairKit" };
    }
  }

  return { ok: true };
}

/**
 * Get the DC for an activity based on material quality.
 * @param {string} activityId
 * @param {string} materialQuality
 * @returns {number}
 */
function getActivityDC(activityId, materialQuality) {
  if (activityId === "mend") {
    return getMendDC();
  }
  return getMaterialDC(materialQuality);
}

/**
 * Handler for crucible-tailoring.requestRoll
 *
 * Payload: { actorUuid, activityId, materialQuality, inputUuids }
 * Returns: { ok: true, total, band, quality } or { ok: false, reason }
 */
async function handleRequestRoll(payload) {
  // Validate payload
  if (!payload?.actorUuid || !payload?.activityId) {
    return { ok: false, reason: "invalidPayload" };
  }

  // Resolve actor fresh — never trust the payload's state
  const actor = await fromUuid(payload.actorUuid);
  if (!actor) {
    return { ok: false, reason: "actorNotFound" };
  }

  // Re-validate tool possession GM-side
  const toolCheck = validateToolRequirement(actor, payload.activityId);
  if (!toolCheck.ok) {
    return { ok: false, reason: toolCheck.reason };
  }

  // Determine DC
  const materialQuality = payload.materialQuality ?? "standard";
  const dc = getActivityDC(payload.activityId, materialQuality);

  // Build the skill check
  const check = actor.getSkillCheck("tailoring", { dc });
  if (!check) {
    return { ok: false, reason: "checkBuildFailed" };
  }

  // Run StandardCheck.request() — the player rolls in their own dialog.
  // Wrap in try/catch: if the player disconnects, the roll times out.
  try {
    const result = await check.request();
    const total = result?.total ?? 0;
    const thresholds = { strongSuccess: getStrongSuccessDelta() };
    const { band, quality } = resolveOutcome(total, dc, materialQuality, thresholds);

    return { ok: true, total, band, quality };
  } catch (err) {
    console.warn("crucible-tailoring | requestRoll error:", err);
    return { ok: false, reason: "rollTimeout" };
  }
}

/**
 * Handler for crucible-tailoring.proposeOutput
 *
 * Payload: { actorUuid, activityId, band, quality, inputUuids, outputSpec }
 * Returns: { ok: true, messageId } or { ok: false, reason }
 */
async function handleProposeOutput(payload) {
  // Validate payload
  if (!payload?.actorUuid || !payload?.activityId) {
    return { ok: false, reason: "invalidPayload" };
  }

  // Check for existing unresolved proposal from the same actor
  const existingProposal = game.messages.find(m =>
    m.getFlag(MODULE_ID, FLAGS.proposal)?.actorUuid === payload.actorUuid
    && m.getFlag(MODULE_ID, FLAGS.resolved) !== true
  );
  if (existingProposal) {
    return { ok: false, reason: "proposalAlreadyPending" };
  }

  // Resolve actor fresh
  const actor = await fromUuid(payload.actorUuid);
  if (!actor) {
    return { ok: false, reason: "actorNotFound" };
  }

  // Post the proposal chat card (delegated to chat.mjs)
  const { postProposalCard } = await import("./chat.mjs");
  const message = await postProposalCard(actor, payload);

  return { ok: true, messageId: message?.id };
}