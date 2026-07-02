// craft-flow.mjs — player-side orchestrator for the full craft pipeline
// Player clicks an activity → validate → assemble payload → GM ping (roll) →
// convert dialog → GM ping (propose) → done.

import { MODULE_ID, QUERY_REQUEST_ROLL, QUERY_PROPOSE_OUTPUT, TIMEOUTS } from "./config.mjs";
import { getActivityDef, validateActivityPrerequisites } from "./activity-setup.mjs";
import { openConvertDialog } from "./convert-dialog.mjs";

/**
 * Run the full craft flow for an activity.
 *
 * @param {object} params
 * @param {Actor} params.actor - The crafting actor
 * @param {string} params.activityId - e.g. "craftEquipment"
 * @param {Array<Item>} params.selectedMaterials - The input materials
 * @param {object} [params.extra] - Activity-specific extra data
 *   - craftEquipment: { outputItem: Item }
 *   - mend: { partyMembers: Actor[] }
 *   - craftDisguise: { disguiseType: string, context: string }
 *   - applyModification: { sourceItem: Item, affixItem: Item }
 * @returns {Promise<{success: boolean, reason?: string}>}
 */
export async function runCraftFlow({ actor, activityId, selectedMaterials, extra = {} }) {
  // 1. Validate prerequisites
  const prereq = validateActivityPrerequisites(actor, activityId);
  if (!prereq.ok) {
    ui.notifications.warn(game.i18n.localize(`crucible-tailoring.query.${prereq.reason}`));
    return { success: false, reason: prereq.reason };
  }

  const def = getActivityDef(activityId);
  if (!def) {
    return { success: false, reason: "unknownActivity" };
  }

  // 2. Assemble the requestRoll payload (includes userId for GM→player dispatch)
  const payload = def.assemblePayload(actor, selectedMaterials, extra);
  if (!payload) {
    ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.invalidPayload"));
    return { success: false, reason: "invalidPayload" };
  }
  payload.userId = game.user.id;

  // 3. Check for GM
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("crucible-tailoring.query.noGM"));
    return { success: false, reason: "noGM" };
  }

  // 4. First GM ping — requestRoll
  let rollResult;
  try {
    rollResult = await game.users.activeGM.query(
      QUERY_REQUEST_ROLL,
      payload,
      { timeout: TIMEOUTS.requestRoll }
    );
  } catch (err) {
    ui.notifications.error(game.i18n.localize("crucible-tailoring.query.noGM"));
    return { success: false, reason: "queryFailed" };
  }

  if (!rollResult?.ok) {
    const reasonKey = `crucible-tailoring.query.${rollResult?.reason ?? "unknown"}`;
    ui.notifications.warn(game.i18n.localize(reasonKey));
    return { success: false, reason: rollResult?.reason };
  }

  // 5. Build output spec
  const outputSpec = def.buildOutputSpec(
    rollResult.band,
    rollResult.quality,
    payload,
    extra
  );

  // 6. Open convert dialog
  const inputs = selectedMaterials.map(m => ({
    uuid: m.uuid,
    name: m.name,
    img: m.img
  }));

  const approved = await openConvertDialog({
    actor,
    activityId,
    band: rollResult.band,
    quality: rollResult.quality,
    inputs,
    outputSpec
  });

  if (!approved) {
    return { success: false, reason: "cancelled" };
  }

  // 7. Check for GM again (may have changed)
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize("crucible-tailoring.query.noGM"));
    return { success: false, reason: "noGM" };
  }

  // 8. Second GM ping — proposeOutput
  const proposalPayload = {
    actorUuid: actor.uuid,
    activityId,
    band: rollResult.band,
    quality: rollResult.quality,
    inputUuids: payload.inputUuids,
    outputSpec,
    materialQuantities: payload.materialQuantities ?? {}
  };

  let proposalResult;
  try {
    proposalResult = await game.users.activeGM.query(
      QUERY_PROPOSE_OUTPUT,
      proposalPayload,
      { timeout: TIMEOUTS.proposeOutput }
    );
  } catch (err) {
    ui.notifications.error(game.i18n.localize("crucible-tailoring.query.noGM"));
    return { success: false, reason: "queryFailed" };
  }

  if (!proposalResult?.ok) {
    const reasonKey = proposalResult?.reason === "proposalAlreadyPending"
      ? "crucible-tailoring.query.proposalPending"
      : `crucible-tailoring.query.${proposalResult?.reason ?? "unknown"}`;
    ui.notifications.warn(game.i18n.localize(reasonKey));
    return { success: false, reason: proposalResult?.reason };
  }

  ui.notifications.info(game.i18n.localize("crucible-tailoring.flow.proposalSent"));
  return { success: true };
}