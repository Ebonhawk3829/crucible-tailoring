// queries.mjs — CONFIG.queries handlers (GM-side logic)
// Both handlers validate inputs GM-side and JSON-serialize their return.

import { MODULE_ID, QUERY_REQUEST_ROLL, QUERY_PROPOSE_OUTPUT, FLAGS, getMaterialDC, getMendDC, getStrongSuccessDelta } from "./config.mjs";
import { resolveOutcome } from "./outcome.mjs";
import { actorHasTool, TOOL_NAMES } from "./materials.mjs";

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
    // Journeyman: requires Portable Workbench
    if (!actorHasTool(actor, TOOL_NAMES.workbench)) {
      return { ok: false, reason: "missingPortableWorkbench" };
    }
  } else if (noviceActivities.includes(activityId)) {
    // Novice: requires Tailor's Toolkit
    if (!actorHasTool(actor, TOOL_NAMES.toolkit)) {
      return { ok: false, reason: "missingToolkit" };
    }
  }

  // Mend additionally requires Repair Kit
  if (activityId === "mend") {
    if (!actorHasTool(actor, TOOL_NAMES.repairKit)) {
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
 * Payload: { actorUuid, activityId, materialQuality, inputUuids, userId }
 * Returns: { ok: true, total, band, quality } or { ok: false, reason }
 *
 * The GM computes the DC, dispatches the roll dialog to the requesting player
 * via check.request({user}), and returns the roll result to the player's client.
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

  // Re-validate training rank GM-side — the query is the authoritative gate.
  // Journeyman activities require rank 2 (Proficient), novice require rank 1 (Trained).
  const rank = actor.system?.training?.tailoring ?? 0;
  const journeymanActivities = ["craftDisguise", "applyModification"];
  const requiredRank = journeymanActivities.includes(payload.activityId) ? 2 : 1;
  if (rank < requiredRank) {
    return { ok: false, reason: "insufficientRank" };
  }

  // Determine DC
  const materialQuality = payload.materialQuality ?? "standard";
  const dc = getActivityDC(payload.activityId, materialQuality);

  // Build the skill check via Crucible's actor.getSkillCheck().
  // Tailoring is not a standard skill in SYSTEM.SKILLS, so getSkillCheck does
  // not compute an ability bonus automatically — ability defaults to 0.
  // We manually compute (dex + int) / 4 to match Crucible's two-ability pattern.
  const dex = actor.system?.abilities?.dexterity?.value ?? 0;
  const int = actor.system?.abilities?.intellect?.value ?? 0;
  const abilityBonus = Math.round((dex + int) / 4);
  const skillBonus = actor.getSkillBonus?.(["tailoring"]) ?? 0;

  const check = new crucible.api.dice.StandardCheck({
    actorId: actor.id,
    dc,
    ability: abilityBonus,
    skill: skillBonus,
    enchantment: 0,
    type: "tailoring"
  });
  if (!check) {
    return { ok: false, reason: "checkBuildFailed" };
  }

  // Resolve the requesting user so we can dispatch the roll dialog to them
  const requestingUser = payload.userId ? game.users.get(payload.userId) : null;
  if (!requestingUser) {
    return { ok: false, reason: "userNotFound" };
  }

  // Dispatch the roll dialog to the player via Crucible's check.request().
  // The GM awaits the result here — the player sees the dialog, rolls, and
  // the result comes back to the GM, who relays it to the player's craft flow.
  // The outer requestRoll timeout must exceed the inner requestSkillCheck timeout.
  //
  // IMPORTANT: check.request({user}) returns a ChatMessage (via
  // StandardCheck.handle → pool.toMessage), NOT a plain {total} object.
  // The roll data is at message.rolls[0].total.
  try {
    const message = await check.request({ user: requestingUser });

    // check.request() returns undefined when the player cancels the roll dialog
    // (StandardCheck.handle returns nothing when response === null).
    // Fail loud — don't silently default to 0.
    if (!message) {
      return { ok: false, reason: "rollCancelled" };
    }

    const total = message.rolls?.[0]?.total;
    if (total === undefined || total === null) {
      console.warn("crucible-tailoring | requestRoll: roll total is undefined — ChatMessage may have no rolls array");
      return { ok: false, reason: "rollFailed" };
    }

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
    && m.getFlag(MODULE_ID, FLAGS.proposal)?.resolved !== true
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