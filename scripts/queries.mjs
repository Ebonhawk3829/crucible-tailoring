// queries.mjs — CONFIG.queries handlers (GM-side logic)
// Both handlers validate inputs GM-side and JSON-serialize their return.

import { MODULE_ID, QUERY_REQUEST_ROLL, QUERY_PROPOSE_OUTPUT, FLAGS, getMaterialDC, getMendDC, getStrongSuccessDelta, QUALITY_TIERS } from "./config.mjs";
import { resolveOutcome } from "./outcome.mjs";
import { actorHasTool, TOOL_NAMES } from "./materials.mjs";

const { DialogV2 } = foundry.applications.api;

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

  // Determine suggested DC from module settings
  const materialQuality = payload.materialQuality ?? "standard";
  const suggestedDC = getActivityDC(payload.activityId, materialQuality);

  // ---- GM configuration dialog ----
  // The GM sees the activity, material quality, and suggested DC.  They can
  // override the DC before formally requesting the roll from the player.
  const confirmedDC = await _promptGMDC(payload.activityId, materialQuality, suggestedDC, actor);
  if (confirmedDC === null) {
    return { ok: false, reason: "rollCancelled" };
  }

  // Build the skill check via Crucible's StandardCheck.
  // Tailoring is not a standard skill in SYSTEM.SKILLS, so we manually compute
  // (dex + int) / 4 to match Crucible's two-ability pattern.
  const dex = actor.system?.abilities?.dexterity?.value ?? 0;
  const int = actor.system?.abilities?.intellect?.value ?? 0;
  const abilityBonus = Math.round((dex + int) / 4);
  const skillBonus = actor.getSkillBonus?.(["tailoring"]) ?? 0;

  const check = new crucible.api.dice.StandardCheck({
    actorId: actor.id,
    dc: confirmedDC,
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
  // The return value over user.query is a SERIALIZED ChatMessage — the .rolls
  // array may be stringified.  Look up the real message from the world
  // collection by ID to get the actual Roll.total.
  try {
    const result = await check.request({ user: requestingUser });

    if (!result) {
      return { ok: false, reason: "rollCancelled" };
    }

    // Extract roll total from the serialized/synced ChatMessage
    let message = game.messages.get(result._id ?? result.id);
    if (!message) {
      // Message may not have synced yet — brief polling retry
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 200));
        message = game.messages.get(result._id ?? result.id);
        if (message) break;
      }
    }

    const total = message?.rolls?.[0]?.total;
    if (total === undefined || total === null) {
      console.warn("crucible-tailoring | requestRoll: could not extract roll total from message");
      return { ok: false, reason: "rollFailed" };
    }

    const thresholds = { strongSuccess: getStrongSuccessDelta() };
    const { band, quality } = resolveOutcome(total, confirmedDC, materialQuality, thresholds);

    return { ok: true, total, band, quality };
  } catch (err) {
    console.warn("crucible-tailoring | requestRoll error:", err);
    return { ok: false, reason: "rollTimeout" };
  }
}

/**
 * Prompt the GM with a configuration dialog showing the suggested DC.
 * The GM may override the DC or cancel the roll request entirely.
 *
 * @param {string} activityId
 * @param {string} materialQuality
 * @param {number} suggestedDC
 * @param {Actor} actor
 * @returns {Promise<number|null>} The confirmed DC, or null if cancelled
 */
async function _promptGMDC(activityId, materialQuality, suggestedDC, actor) {
  // Build a lookup of all DC→label pairs from module settings, merging colliding DCs
  const dcMap = new Map();
  for (const q of QUALITY_TIERS) {
    const dc = getMaterialDC(q);
    const label = `${q.charAt(0).toUpperCase() + q.slice(1)} Material`;
    if (dcMap.has(dc)) {
      dcMap.set(dc, dcMap.get(dc) + " / " + label);
    } else {
      dcMap.set(dc, label);
    }
  }
  const mendDC = getMendDC();
  if (dcMap.has(mendDC)) {
    dcMap.set(mendDC, dcMap.get(mendDC) + " / Mend");
  } else {
    dcMap.set(mendDC, "Mend");
  }
  const dcOptions = Array.from(dcMap.entries()).map(([dc, label]) => ({ dc, label }));

  const activityLabel = game.i18n.localize(`crucible-tailoring.activity.${activityId}.label`);

  let chosenDC = suggestedDC;

  const result = await DialogV2.wait({
    window: {
      title: game.i18n.localize("crucible-tailoring.gmConfig.title"),
      icon: "fa-dice-d8"
    },
    content: `
      <div style="padding:0.5rem;display:flex;flex-direction:column;gap:0.5rem;">
        <p>${game.i18n.format("crucible-tailoring.gmConfig.actorLabel", { actor: actor.name })}</p>
        <p>${game.i18n.format("crucible-tailoring.gmConfig.activityLabel", { activity: activityLabel })}</p>
        <p>${game.i18n.format("crucible-tailoring.gmConfig.materialLabel", { quality: materialQuality })}</p>
        <label style="display:flex;align-items:center;gap:0.5rem;">
          <span>${game.i18n.localize("crucible-tailoring.gmConfig.dcLabel")}:</span>
          <select name="dc" style="flex:1;">
            ${dcOptions.map(o => `
              <option value="${o.dc}" ${o.dc === suggestedDC ? "selected" : ""}>${o.label} (DC ${o.dc})</option>
            `).join("")}
          </select>
        </label>
        <p style="font-size:0.75rem;color:#666;">${game.i18n.localize("crucible-tailoring.gmConfig.hint")}</p>
      </div>
    `,
    buttons: [{
      action: "ok",
      label: game.i18n.localize("crucible-tailoring.gmConfig.request"),
      default: true,
      callback: (event, button, dialog) => {
        const select = dialog.element.querySelector("select[name='dc']");
        chosenDC = Number(select?.value) || suggestedDC;
      }
    }, {
      action: "cancel",
      label: game.i18n.localize("crucible-tailoring.gmConfig.cancel")
    }]
  });

  if (result !== "ok") return null;
  return chosenDC;
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