// convert-dialog.mjs — player eyeball DialogV2 (craft convert step)
// Shows "consume X, Y, Z → produce at <quality>" with approve/cancel.

const { DialogV2 } = foundry.applications.api;

/**
 * Open the convert dialog for a player to review and approve a craft result.
 *
 * @param {object} params
 * @param {Actor} params.actor - The crafting actor
 * @param {string} params.activityId - The activity being performed
 * @param {string} params.band - The success band
 * @param {string|null} params.quality - The output quality (null on strong failure)
 * @param {Array<{uuid: string, name: string, img: string}>} params.inputs - Input items
 * @param {object} params.outputSpec - What will be produced
 * @returns {Promise<boolean>} True if the player approved, false if cancelled
 */
export async function openConvertDialog({ actor, activityId, band, quality, inputs, outputSpec }) {
  const activityLabel = game.i18n.localize(`crucible-tailoring.activity.${activityId}.label`);
  const bandLabel = game.i18n.localize(`crucible-tailoring.band.${band}`);

  // Build the content HTML — escape user-controllable names to prevent injection
  const inputList = inputs.map(i =>
    `<li><img src="${i.img}" alt="${foundry.utils.escapeHTML(i.name)}" style="width:20px;height:20px;vertical-align:middle;" /> ${foundry.utils.escapeHTML(i.name)}</li>`
  ).join("");

  const qualityDisplay = quality
    ? `<span class="quality-${quality}" style="padding:0.1rem 0.35rem;border-radius:3px;text-transform:capitalize;">${quality}</span>`
    : `<em>${game.i18n.localize("crucible-tailoring.convert.nothing")}</em>`;

  const outputDisplay = outputSpec?.name
    ? `<div><img src="${outputSpec.img}" alt="${foundry.utils.escapeHTML(outputSpec.name)}" style="width:24px;height:24px;vertical-align:middle;" /> ${foundry.utils.escapeHTML(outputSpec.name)}</div>`
    : "";

  const content = `
    <div style="padding:0.5rem;">
      <h3>${activityLabel} — ${bandLabel}</h3>
      <div style="display:flex;gap:1rem;align-items:center;margin:0.75rem 0;">
        <div style="flex:1;">
          <h4>${game.i18n.localize("crucible-tailoring.convert.consuming")}</h4>
          <ul style="list-style:none;padding:0;">${inputList}</ul>
        </div>
        <div style="font-size:1.5rem;">→</div>
        <div style="flex:1;">
          <h4>${game.i18n.localize("crucible-tailoring.convert.producing")}</h4>
          <p>${game.i18n.localize("crucible-tailoring.convert.quality")}: ${qualityDisplay}</p>
          ${outputDisplay}
        </div>
      </div>
      ${!quality ? `<p style="color:#c00;">${game.i18n.localize("crucible-tailoring.convert.strongFailureWarning")}</p>` : ""}
    </div>
  `;

  let result;
  try {
    result = await DialogV2.confirm({
      window: {
        title: game.i18n.localize("crucible-tailoring.convert.title"),
        icon: "fa-scissors"
      },
      content,
      yes: {
        label: game.i18n.localize("crucible-tailoring.convert.approve"),
        default: true
      },
      no: {
        label: game.i18n.localize("crucible-tailoring.convert.cancel")
      }
    });
  } catch (_err) {
    // DialogV2.confirm may reject on Escape/X dismiss in some v14 builds
    result = false;
  }

  return result;
}