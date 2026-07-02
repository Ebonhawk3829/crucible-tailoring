// chat.mjs — proposal card render + GM confirm button handler
// This file owns the ONLY mutation in the module.

import { MODULE_ID, FLAGS, QUALITY_TIERS } from "./config.mjs";

const { renderTemplate } = foundry.applications.handlebars;

/**
 * Post a proposal chat card flagged in the module namespace.
 * The card has a GM-only confirm button.
 *
 * @param {Actor} actor
 * @param {object} payload - { activityId, band, quality, inputUuids, outputSpec }
 * @returns {Promise<ChatMessage>}
 */
export async function postProposalCard(actor, payload) {
  const activityLabel = game.i18n.localize(`crucible-tailoring.activity.${payload.activityId}.label`);
  const bandLabel = game.i18n.localize(`crucible-tailoring.band.${payload.band}`);

  // Resolve input items for display
  const inputItems = [];
  for (const uuid of (payload.inputUuids ?? [])) {
    const item = await fromUuid(uuid);
    if (item) inputItems.push({ name: item.name, img: item.img, uuid });
  }

  // Resolve mend recipients for display
  const mendTargets = [];
  if (payload.outputSpec?._tailoring?.partyMemberUuids) {
    for (const uuid of payload.outputSpec._tailoring.partyMemberUuids) {
      const member = await fromUuid(uuid);
      if (member) mendTargets.push({ name: member.name, img: member.img });
    }
  }

  const content = await renderTemplate(
    "modules/crucible-tailoring/templates/proposal-card.hbs",
    {
      activityLabel,
      actorName: actor.name,
      band: payload.band,
      bandLabel,
      quality: payload.quality,
      inputItems,
      outputSpec: payload.outputSpec,
      mendTargets,
      i18n: (key) => game.i18n.localize(key)
    }
  );

  const message = await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [MODULE_ID]: {
        [FLAGS.proposal]: {
          actorUuid: actor.uuid,
          activityId: payload.activityId,
          band: payload.band,
          quality: payload.quality,
          inputUuids: payload.inputUuids ?? [],
          outputSpec: payload.outputSpec ?? {},
          resolved: false
        }
      }
    }
  });

  return message;
}

/**
 * Confirm handler — gated on game.user.isGM.
 * Re-validates inputs, handles stackable quantity decrement, performs the write.
 *
 * @param {ChatMessage} message - The proposal chat message
 */
export async function confirmProposal(message) {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("crucible-tailoring.confirm.gmOnly"));
    return;
  }

  const proposal = message.getFlag(MODULE_ID, FLAGS.proposal);
  if (!proposal || proposal.resolved) {
    ui.notifications.warn(game.i18n.localize("crucible-tailoring.confirm.alreadyResolved"));
    return;
  }

  // Resolve actor fresh
  const actor = await fromUuid(proposal.actorUuid);
  if (!actor) {
    ui.notifications.error(game.i18n.localize("crucible-tailoring.confirm.actorNotFound"));
    return;
  }

  // Re-validate the actor still holds the claimed inputs in the claimed quantities
  const inputItems = [];
  for (const uuid of proposal.inputUuids) {
    const item = await fromUuid(uuid);
    if (!item || item.parent?.id !== actor.id) {
      ui.notifications.error(game.i18n.localize("crucible-tailoring.confirm.inputsChanged"));
      return;
    }
    inputItems.push(item);
  }

  // --- THE WRITE ---
  // Consume inputs using Crucible's built-in consume() for proper stackable handling
  for (const item of inputItems) {
    if (typeof item.system?.consume === "function") {
      await item.system.consume(1, { save: true });
    } else {
      // Fallback for items without Crucible's consume (e.g. non-physical items)
      const props = item.system?.properties;
      const isStackable = (props instanceof Set)
        ? props.has("stackable")
        : Array.isArray(props) ? props.includes("stackable") : false;
      const quantity = Number(item.system?.quantity) || 1;
      if (isStackable && quantity > 1) {
        await item.update({ "system.quantity": quantity - 1 });
      } else {
        await actor.deleteEmbeddedDocuments("Item", [item.id]);
      }
    }
  }

  // Create output — activity-specific handling
  const outputSpec = proposal.outputSpec;
  const activityId = proposal.activityId;

  if (activityId === "applyModification") {
    // Modification: create an affix-type ActiveEffect on the source item.
    //
    // Crucible stores affixes as ActiveEffect documents (not Items) in the
    // "affixes" compendium (type: "ActiveEffect"). The affix document's system
    // block IS the CrucibleAffixActiveEffect schema (module/models/effect-affix.mjs),
    // so deep-cloning it onto a new ActiveEffect is schema-correct.
    //
    // Crucible validates affix application through _preCreateOperation /
    // validateJoint and the AFFIXABLE budget on the parent item. If the budget
    // is exceeded, the createEmbeddedDocuments call will throw.
    const sourceItemUuid = outputSpec?._tailoring?.sourceItemUuid;
    const affixUuid = outputSpec?._tailoring?.affixUuid;

    if (sourceItemUuid && affixUuid) {
      const sourceItem = await fromUuid(sourceItemUuid);
      const affixDoc = await fromUuid(affixUuid);

      if (sourceItem && sourceItem.parent?.id === actor.id && affixDoc) {
        // Validate the dragged document is actually an affix (ActiveEffect type)
        if (affixDoc.documentName !== "ActiveEffect" || affixDoc.type !== "affix") {
          ui.notifications.error(game.i18n.localize("crucible-tailoring.confirm.notAnAffix"));
          return;
        }

        await sourceItem.createEmbeddedDocuments("ActiveEffect", [{
          type: "affix",
          name: affixDoc.name,
          img: affixDoc.img,
          origin: affixDoc.uuid,
          system: foundry.utils.deepClone(affixDoc.system ?? {}),
          flags: {
            [MODULE_ID]: {
              appliedBy: "tailoring",
              appliedAt: Date.now()
            }
          }
        }]);

        console.log(`crucible-tailoring | Applied affix "${affixDoc.name}" to "${sourceItem.name}"`);
      }
    }
  } else if (outputSpec?.type) {
    // Standard item creation — Craft Equipment, Trade Goods, Disguise
    const itemData = {
      name: outputSpec.name ?? "Crafted Item",
      type: outputSpec.type,
      img: outputSpec.img,
      system: foundry.utils.deepClone(outputSpec.system ?? {})
    };

    // Apply quality if specified
    if (proposal.quality && QUALITY_TIERS.includes(proposal.quality)) {
      itemData.system.quality = proposal.quality;
    }

    // Mend: create one consumable on EACH targeted party member
    if (activityId === "mend" && outputSpec._tailoring?.partyMemberUuids?.length) {
      const memberUuids = outputSpec._tailoring.partyMemberUuids;
      const boonScale = outputSpec._tailoring?.boonScale ?? {};
      const boonCount = boonScale[itemData.system.quality ?? proposal.quality] ?? 0;

      let deliveredCount = 0;
      for (const memberUuid of memberUuids) {
        const member = await fromUuid(memberUuid);
        if (!member) {
          console.warn(`crucible-tailoring | Mend target not found: ${memberUuid}`);
          continue;
        }

        const created = await member.createEmbeddedDocuments("Item",
          [foundry.utils.deepClone(itemData)]);
        if (!created?.length) continue;

        // Set tailoring flags on the created item
        const flagUpdates = {};
        if (outputSpec._tailoring) {
          for (const [key, value] of Object.entries(outputSpec._tailoring)) {
            flagUpdates[`flags.${MODULE_ID}.${key}`] = value;
          }
        }
        if (boonCount > 0) {
          flagUpdates[`flags.${MODULE_ID}.mendBoonCount`] = boonCount;
          flagUpdates[`flags.${MODULE_ID}.mendPartyUuids`] = memberUuids;
        }
        if (Object.keys(flagUpdates).length > 0) {
          await created[0].update(flagUpdates);
        }

        deliveredCount++;
        console.log(`crucible-tailoring | Delivered Mended Presentation to ${member.name}`);
      }

      if (deliveredCount === 0) {
        ui.notifications.error(
          game.i18n.localize("crucible-tailoring.confirm.noMembersReachable")
        );
        return;
      }
    } else {
      // Standard single-item creation
      const created = await actor.createEmbeddedDocuments("Item", [itemData]);
      if (created?.length) {
        // Set tailoring flags on the created item
        const flagUpdates = {};
        if (outputSpec._tailoring) {
          for (const [key, value] of Object.entries(outputSpec._tailoring)) {
            flagUpdates[`flags.${MODULE_ID}.${key}`] = value;
          }
        }
        if (Object.keys(flagUpdates).length > 0) {
          await created[0].update(flagUpdates);
        }

        // For Mend consumables, also create the ActiveEffect template on the item
        // so that when used, it knows what AE to apply.
        if (activityId === "mend" && outputSpec._tailoring?.useEffect === "applyMendBoons") {
          const boonCount = outputSpec._tailoring?.boonScale?.[outputSpec.quality] ?? 0;
          if (boonCount > 0) {
            await created[0].setFlag(MODULE_ID, "mendBoonCount", boonCount);
            await created[0].setFlag(MODULE_ID, "mendPartyUuids", outputSpec._tailoring?.partyMemberUuids ?? []);
          }
        }
      }
    }
  }

  // Mark proposal as resolved and update the card in-place.
  // Idempotent: if the content is already wrapped (e.g. repeated confirm),
  // don't nest another wrapper.
  const updatedFlags = foundry.utils.deepClone(message.flags);
  updatedFlags[MODULE_ID][FLAGS.proposal].resolved = true;

  const alreadyResolved = message.content.includes("proposal-resolved");
  const newContent = alreadyResolved
    ? message.content
    : `<div class="crucible-tailoring proposal-resolved">
      ${message.content}
      <div class="proposal-confirmed-badge">${game.i18n.localize("crucible-tailoring.confirm.confirmed")}</div>
    </div>`;

  await message.update({
    flags: updatedFlags,
    content: newContent
  });

  ui.notifications.info(game.i18n.localize("crucible-tailoring.confirm.success"));
}

/**
 * Register the chat message hook that binds the confirm button.
 * Uses renderChatMessageHTML (v14) which passes a native HTMLElement.
 * Called from main.mjs ready hook.
 */
export function registerChatHook() {
  Hooks.on("renderChatMessageHTML", (message, html, messageData) => {
    const proposal = message.getFlag(MODULE_ID, FLAGS.proposal);
    if (!proposal || proposal.resolved) return;

    // Only show confirm button to GM
    if (!game.user.isGM) return;

    const confirmBtn = html.querySelector(".crucible-tailoring-confirm");
    if (!confirmBtn) return;

    confirmBtn.addEventListener("click", async () => {
      await confirmProposal(message);
    });
  });
}