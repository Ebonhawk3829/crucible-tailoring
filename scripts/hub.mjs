// hub.mjs — TailoringHub ApplicationV2 (player-facing, read-only display)
import { MODULE_ID, QUALITY_TIERS } from "./config.mjs";
import { canOpenHub } from "./gating.mjs";
import {
  getActorMaterials,
  computeMaterialsRequired,
  actorHasTool,
  TOOL_NAMES,
  getRegisteredRecipes,
  tagItemAsRecipe,
  untagRecipe,
  clearAllRecipes,
  clearMaterialType,
  clearAllMaterials
} from "./materials.mjs";
import { getDragEventData, getAbilityBonus } from "./utils.mjs";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Training rank → display label mapping.
 * Reads from Crucible's canonical SYSTEM.TALENT.TRAINING_RANKS to avoid drift.
 * Falls back to hardcoded English labels if the system constant is unavailable.
 */
function getRankLabel(rank) {
  const ranks = SYSTEM?.TALENT?.TRAINING_RANKS;
  if (ranks) {
    const entry = Object.values(ranks).find(r => r.rank === rank);
    if (entry) return game.i18n.localize(entry.label);
  }
  // Fallback for environments where SYSTEM.TALENT is not yet available
  const fallback = { 0: "Untrained", 1: "Trained", 2: "Proficient", 3: "Expert", 4: "Master" };
  return fallback[rank] ?? "Untrained";
}

/**
 * Activity definitions for the hub display.
 * Each activity has an id, icon, required talent tier, and description key.
 */
const ACTIVITIES = [
  {
    id: "craftTradeGoods",
    icon: "fa-coins",
    requiredTier: 1,
    tierLabel: "Novice"
  },
  {
    id: "craftEquipment",
    icon: "fa-hammer",
    requiredTier: 1,
    tierLabel: "Novice"
  },
  {
    id: "mend",
    icon: "fa-paint-brush",
    requiredTier: 1,
    tierLabel: "Novice"
  },
  {
    id: "craftDisguise",
    icon: "fa-mask",
    requiredTier: 2,
    tierLabel: "Journeyman"
  },
  {
    id: "applyModification",
    icon: "fa-wrench",
    requiredTier: 2,
    tierLabel: "Journeyman"
  }
];

export class TailoringHub extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}.hub`,
    position: { width: 640, height: "auto" },
    window: {
      title: "crucible-tailoring.hub.title",
      icon: "fa-scissors",
      resizable: true
    },
    classes: ["crucible-tailoring", "hub-window"],
    tag: "div",
    actions: {
      "activity-click": TailoringHub.#onActivityClick,
      "clear-material": TailoringHub.#onClearMaterial,
      "clear-all-materials": TailoringHub.#onClearAllMaterials,
      "clear-recipe": TailoringHub.#onClearRecipe,
      "clear-all-recipes": TailoringHub.#onClearAllRecipes
    }
  };

  /** @override */
  static PARTS = {
    hub: {
      template: "modules/crucible-tailoring/templates/hub.hbs",
      scrollable: ["section"]
    }
  };

  /**
   * The actor this hub is viewing.
   * @type {Actor}
   */
  actor = null;

  /**
   * Open the hub for a specific actor. Performs the gate check first.
   * @param {Actor} actor
   */
  static async open(actor) {
    if (!canOpenHub(actor)) return;
    const instance = new this({ actor });
    await instance.render({ force: true });
  }

  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
    // Re-render the hub when any embedded item on this actor changes
    this._actorItemHook = Hooks.on("updateItem", (item, changes, options, userId) => {
      if (item.parent?.id === this.actor?.id) this.render();
    });
    this._actorDeleteHook = Hooks.on("deleteItem", (item, options, userId) => {
      if (item.parent?.id === this.actor?.id) this.render();
    });
    this._actorCreateHook = Hooks.on("createItem", (item, options, userId) => {
      if (item.parent?.id === this.actor?.id) this.render();
    });
  }

  /** @override */
  async close(options) {
    if (this._actorItemHook !== undefined) Hooks.off("updateItem", this._actorItemHook);
    if (this._actorDeleteHook !== undefined) Hooks.off("deleteItem", this._actorDeleteHook);
    if (this._actorCreateHook !== undefined) Hooks.off("createItem", this._actorCreateHook);
    return super.close(options);
  }

  /** @override */
  async _prepareContext(options) {
    const rank = this.actor?.system?.training?.tailoring ?? 0;
    const trainingBonus = this.actor?.getSkillBonus?.(["tailoring"]) ?? 0;
    const abilityBonus = getAbilityBonus(this.actor);
    const totalBonus = trainingBonus + abilityBonus;
    const bonus = totalBonus >= 0 ? `+${totalBonus}` : `${totalBonus}`;

    const materials = getActorMaterials(this.actor);

    // Build activity list with availability gating
    const activities = ACTIVITIES.map(act => ({
      ...act,
      available: rank >= act.requiredTier,
      label: game.i18n.localize(`crucible-tailoring.activity.${act.id}.label`),
      description: game.i18n.localize(`crucible-tailoring.activity.${act.id}.description`),
      requiredTier: act.tierLabel
    }));

    // Build tool list — tools are standard Crucible items checked by name
    const toolDefs = [
      { name: TOOL_NAMES.toolkit, img: "icons/tools/hand/needle-grey.webp", key: "toolkit" },
      { name: TOOL_NAMES.workbench, img: "icons/containers/chest/chest-reinforced-steel.webp", key: "workbench" },
      { name: TOOL_NAMES.repairKit, img: "icons/tools/hand/awl-steel-tan.webp", key: "repairKit" }
    ];
    const tools = toolDefs.map(t => ({
      name: t.name,
      img: t.img,
      possessed: actorHasTool(this.actor, t.name)
    }));

    // Build registered recipes list
    const recipes = getRegisteredRecipes().map(r => ({
      id: r.id,
      name: r.name,
      img: r.img,
      quality: r.system?.quality ?? "standard",
      price: r.system?.price ?? 0,
      materialsRequired: computeMaterialsRequired(r).materialsRequired
    }));

    return {
      rank,
      rankLabel: getRankLabel(rank),
      bonus,
      activities,
      materials: materials.map(m => ({
        id: m.id,
        uuid: m.uuid,
        materialKey: m.name,
        name: m.name,
        img: m.img,
        quality: m.quality ?? "standard",
        quantity: m.quantity
      })),
      tools,
      recipes,
      recipeCount: recipes.length
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // The actions API only handles click/contextmenu — drop events must be
    // wired manually. Bind drop + dragover for both drop zones.
    const dropZones = this.element.querySelectorAll("[data-action='recipe-drop'], [data-action='import-material']");
    for (const zone of dropZones) {
      zone.addEventListener("drop", (e) => this.#handleDropEvent(e));
      zone.addEventListener("dragover", (e) => e.preventDefault());
    }
  }

  /**
   * Shared drop handler for recipe and material import zones.
   * Routes to the correct private method based on data-action.
   * @param {DragEvent} event
   */
  #handleDropEvent(event) {
    event.preventDefault();
    const action = event.currentTarget.dataset.action;
    if (action === "recipe-drop") this.#handleRecipeDrop(event);
    else if (action === "import-material") this.#handleMaterialImportDrop(event);
  }

  /**
   * Handle clicking an activity card (invoked via actions API).
   * ApplicationV2 binds `this` to the TailoringHub instance and `target`
   * is the element with `data-action`. No DOM walk needed.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onActivityClick(event, target) {
    // `this` is the TailoringHub instance; `target` is the [data-action] element
    const activityId = target.dataset.activity;
    if (!activityId) return;

    // Re-check availability — the actions API fires for all cards including locked ones
    const def = ACTIVITIES.find(a => a.id === activityId);
    if (!def) return;
    const rank = this.actor?.system?.training?.tailoring ?? 0;
    if (rank < def.requiredTier) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.query.insufficientRank"));
      return;
    }

    this.#runActivityFlow(activityId);
  }

  /**
   * Handle clicking the clear button on a single material.
   * Clears the material type registration (all stacks matching the key).
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClearMaterial(event, target) {
    const materialKey = target.dataset.materialKey;
    if (!materialKey) return;
    await clearMaterialType(materialKey);
    this.render();
  }

  /**
   * Handle clicking "Clear All Materials".
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClearAllMaterials(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("crucible-tailoring.hub.clearAllMaterialsTitle"),
        icon: "fa-triangle-exclamation"
      },
      content: `<p>${game.i18n.localize("crucible-tailoring.hub.clearAllMaterialsConfirm")}</p>`,
      modal: true
    });
    if (!confirmed) return;
    await clearAllMaterials();
    this.render();
  }

  /**
   * Handle clicking the clear button on a single recipe.
   * Removes recipeTag, keeps compendiumKey.
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClearRecipe(event, target) {
    const itemId = target.dataset.itemId;
    if (!itemId) return;
    const item = game.items.get(itemId);
    if (!item) return;
    await untagRecipe(item);
    this.render();
  }

  /**
   * Handle clicking "Clear All Recipes".
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onClearAllRecipes(event, target) {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("crucible-tailoring.hub.clearAllRecipesTitle"),
        icon: "fa-triangle-exclamation"
      },
      content: `<p>${game.i18n.localize("crucible-tailoring.hub.clearAllRecipesConfirm")}</p>`,
      modal: true
    });
    if (!confirmed) return;
    await clearAllRecipes();
    this.render();
  }

  /**
   * Run the full activity flow for a given activity.
   * @param {string} activityId
   */
  async #runActivityFlow(activityId) {
    const { runCraftFlow } = await import("./craft-flow.mjs");
    const { getActorMaterials } = await import("./materials.mjs");

    const materials = getActorMaterials(this.actor);
    if (materials.length === 0) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.noMaterials"));
      return;
    }

    // Activity-specific setup
    switch (activityId) {
      case "craftTradeGoods": {
        // Batch: select materials with per-stack quantities
        const batch = await this._selectMaterialBatch(materials);
        if (!batch) return;
        await runCraftFlow({ actor: this.actor, activityId, selectedMaterials: batch.materials,
                              extra: { batchCount: batch.totalQuantity, batchSelections: batch.selections } });
        break;
      }

      case "craftEquipment": {
        // Select materials + output item
        const selected = await this._selectMaterials(materials, 1, Infinity);
        if (!selected) return;
        const outputItem = await this._selectOutputItem();
        if (!outputItem) return;
        await runCraftFlow({
          actor: this.actor,
          activityId,
          selectedMaterials: selected,
          extra: { outputItem }
        });
        break;
      }

      case "mend": {
        // Combined party member + material quality assignment grid.
        // Each member gets exactly one quality tier, constrained by inventory.
        const result = await this._selectMendAssignments();
        if (!result) return;

        // Resolve which material items to consume based on quality assignments.
        // Each assignment consumes exactly 1 material of the assigned quality.
        const materialItems = [];
        const materials = getActorMaterials(this.actor);
        const qualityPool = {}; // quality → [material, ...]
        for (const m of materials) {
          const q = m.quality ?? "standard";
          (qualityPool[q] ??= []).push(m);
        }
        for (const [, assignment] of result.assignments) {
          const pool = qualityPool[assignment.quality];
          if (pool?.length) materialItems.push(pool.shift());
        }

        await runCraftFlow({
          actor: this.actor,
          activityId,
          selectedMaterials: materialItems,
          extra: {
            partyMembers: result.members,
            mendAssignments: Object.fromEntries(result.assignments),
            batchCount: result.assignments.size,
          }
        });
        break;
      }

      case "craftDisguise": {
        // Select materials + disguise type + context
        const selected = await this._selectMaterials(materials, 4, 4);
        if (!selected) return;
        const { disguiseType, context } = await this._selectDisguiseOptions();
        if (!disguiseType) return;
        await runCraftFlow({
          actor: this.actor,
          activityId,
          selectedMaterials: selected,
          extra: { disguiseType, context }
        });
        break;
      }

      case "applyModification": {
        // Select materials + source item + affix
        const selected = await this._selectMaterials(materials, 1, Infinity);
        if (!selected) return;
        const { ModificationDialog } = await import("./modification-dialog.mjs");
        // First pick the source item from the actor's equipment
        const sourceItem = await this._selectSourceItem();
        if (!sourceItem) return;
        const result = await ModificationDialog.open({ sourceItem, actor: this.actor });
        if (!result?.affixUuid) return;
        const affixItem = await fromUuid(result.affixUuid);
        if (!affixItem) return;
        await runCraftFlow({
          actor: this.actor,
          activityId,
          selectedMaterials: selected,
          extra: { sourceItem, affixItem }
        });
        break;
      }
    }

    // Refresh the hub to show updated inventory
    this.render();
  }

  /**
   * Combined party member + material quality selection for Mend.
   * Renders an interactive table where each member is assigned exactly
   * one quality tier. Inventory counts constrain assignments in real time.
   *
   * @returns {Promise<{members: Actor[], assignments: Map<string, {member: Actor, quality: string, material: object}>}|null>}
   */
  async _selectMendAssignments() {
    const groupActor = crucible.party;
    if (!groupActor) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.noParty"));
      return null;
    }

    // Resolve party members
    const memberArray = groupActor.system.members ?? [];
    let members;
    if (memberArray.actors) {
      members = Array.from(memberArray.actors);
    } else {
      members = Array.from(memberArray)
        .map(m => game.actors.get(m.actorId ?? m.id))
        .filter(Boolean);
    }
    if (!members.length) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.noPartyMembers"));
      return null;
    }

    // Get available materials grouped by quality
    const materials = getActorMaterials(this.actor);
    const qualityInventory = {};
    for (const tier of QUALITY_TIERS) qualityInventory[tier] = 0;
    for (const m of materials) {
      const q = m.quality ?? "standard";
      if (q in qualityInventory) qualityInventory[q] += m.quantity;
    }

    // Only show quality columns that have at least some inventory
    const availableQualities = QUALITY_TIERS.filter(q => qualityInventory[q] > 0);
    if (availableQualities.length === 0) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.noMaterials"));
      return null;
    }

    // Build the table HTML
    const headerCells = availableQualities.map(q =>
      `<th style="text-align:center;">${q.charAt(0).toUpperCase() + q.slice(1)}<br/>
       <span class="mend-avail" data-quality="${q}">(${qualityInventory[q]})</span></th>`
    ).join("");

    const memberRows = members.map(a => {
      const cells = availableQualities.map(q =>
        `<td style="text-align:center;">
          <input type="radio" name="member-${a.uuid}" value="${q}"
                 class="mend-radio" data-member="${a.uuid}" data-quality="${q}"
                 ${qualityInventory[q] <= 0 ? "disabled" : ""} />
        </td>`
      ).join("");
      return `<tr>
        <td style="display:flex;align-items:center;gap:0.4rem;">
          <img src="${a.img}" alt="${a.name}" style="width:24px;height:24px;border-radius:3px;" />
          <span>${a.name}</span>
        </td>
        ${cells}
      </tr>`;
    }).join("");

    const content = `
      <div class="mend-assignment-grid" style="padding:0.5rem;">
        <p>${game.i18n.localize("crucible-tailoring.flow.mendAssignmentHint")}</p>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr><th>Member</th>${headerCells}</tr></thead>
          <tbody>${memberRows}</tbody>
        </table>
        <p class="mend-validation-msg" style="font-size:0.75rem;color:red;display:none;"></p>
      </div>
    `;

    let assignments = null;

    const result = await DialogV2.wait({
      window: {
        title: game.i18n.localize("crucible-tailoring.flow.mendAssignmentTitle"),
        icon: "fa-paint-brush"
      },
      classes: ["crucible-tailoring"],
      content,
      render: (event, dialog) => {
        // dialog is the DialogV2 instance in v14; get the DOM element from it
        const el = dialog.element;
        const radios = el.querySelectorAll(".mend-radio");
        const recompute = () => {
          // Count current selections per quality
          const used = {};
          for (const q of availableQualities) used[q] = 0;
          radios.forEach(r => { if (r.checked) used[r.dataset.quality]++; });
          // Update availability displays and disable overbudget radios
          for (const q of availableQualities) {
            const remaining = qualityInventory[q] - used[q];
            const availEl = el.querySelector(`.mend-avail[data-quality="${q}"]`);
            if (availEl) availEl.textContent = `(${remaining} left)`;
            // Disable unchecked radios in this column if no remaining
            radios.forEach(r => {
              if (r.dataset.quality === q && !r.checked) {
                r.disabled = remaining <= 0;
              }
            });
          }
        };
        radios.forEach(r => r.addEventListener("change", recompute));
        recompute(); // initial pass
      },
      buttons: [{
        action: "ok",
        label: game.i18n.localize("crucible-tailoring.flow.confirm"),
        default: true,
        callback: (event, button, dialog) => {
          assignments = new Map();
          for (const a of members) {
            const checked = dialog.element.querySelector(
              `input[name="member-${a.uuid}"]:checked`
            );
            if (checked) {
              assignments.set(a.uuid, {
                member: a,
                quality: checked.dataset.quality
              });
            }
          }
        }
      }, {
        action: "cancel",
        label: game.i18n.localize("crucible-tailoring.flow.cancel")
      }]
    });

    if (result !== "ok" || !assignments?.size) return null;
    return { members: [...assignments.values()].map(a => a.member), assignments };
  }

  /**
   * Open a dialog for the player to select materials from their inventory.
   * Uses DialogV2.wait() with a button callback to capture form state
   * before the dialog closes (avoids the document.querySelectorAll race).
   *
   * @param {Item[]} materials - Available tailoring-tagged materials
   * @param {number} minCount - Minimum number to select
   * @param {number} maxCount - Maximum number to select
   * @returns {Promise<Item[]|null>} Selected materials, or null if cancelled
   */
  async _selectMaterials(materials, minCount, maxCount) {
    if (materials.length === 0) return null;

    const options = materials.map(m => ({
      value: m.id,
      label: `${m.name} (${m.system?.quality ?? "standard"})${m.quantity > 1 ? ` x${m.quantity}` : ""}`,
      img: m.img
    }));

    const content = `
      <div style="padding:0.5rem;">
        <p>${game.i18n.localize("crucible-tailoring.flow.selectMaterials")}</p>
        <div class="material-select-list">
          ${options.map((o, i) => `
            <label class="material-select-item" style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0;cursor:pointer;">
              <input type="checkbox" value="${o.value}" class="material-checkbox" />
              <img src="${o.img}" alt="${o.label}" style="width:24px;height:24px;object-fit:contain;" />
              <span>${o.label}</span>
            </label>
          `).join("")}
        </div>
        <p style="font-size:0.75rem;color:#666;">${game.i18n.format("crucible-tailoring.flow.materialCount", { min: minCount, max: maxCount })}</p>
      </div>
    `;

    // Capture form state inside the button callback, before the dialog closes
    let checkedIds = [];
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectMaterialsTitle"), icon: "fa-boxes" },
      classes: ["crucible-tailoring"],
      content,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("crucible-tailoring.flow.confirm"),
        default: true,
        callback: (event, button, dialog) => {
          checkedIds = [];
          dialog.element.querySelectorAll(".material-checkbox:checked").forEach(cb => checkedIds.push(cb.value));
        }
      }, {
        action: "cancel",
        label: game.i18n.localize("crucible-tailoring.flow.cancel")
      }]
    });

    if (result !== "ok") return null;

    const selected = materials.filter(m => checkedIds.includes(m.id));
    if (selected.length < minCount || selected.length > maxCount) {
      ui.notifications.warn(game.i18n.format("crucible-tailoring.flow.materialCount", { min: minCount, max: maxCount }));
      return null;
    }

    return selected;
  }

  /**
   * Open a dialog to select materials with per-stack quantities for Trade Goods.
   * Different from _selectMaterials — this is a batch quantity selector where
   * the player picks how many units from each material stack to consume.
   *
   * @param {Array} materials - Available materials from getActorMaterials
   * @returns {Promise<object|null>} { materials, totalQuantity, selections } or null
   */
  async _selectMaterialBatch(materials, { minTotal = 1, hint } = {}) {
    if (materials.length === 0) return null;

    const displayHint = hint ?? game.i18n.localize("crucible-tailoring.flow.batchHint");

    const content = `
      <div style="padding:0.5rem;">
        <p>${game.i18n.localize("crucible-tailoring.flow.selectBatchMaterials")}</p>
        <div class="batch-material-list">
          ${materials.map(m => `
            <label class="batch-material-item" style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0;">
              <img src="${m.img}" alt="${m.name}" style="width:24px;height:24px;object-fit:contain;" />
              <span style="flex:1;">${m.name} (${m.quality ?? "standard"}) — ${m.quantity} available</span>
              <input type="number" name="qty-${m.id}" min="0" max="${m.quantity}" value="0"
                     style="width:3.5rem;text-align:center;" />
            </label>
          `).join("")}
        </div>
        <p style="font-size:0.75rem;color:#666;">
          ${displayHint}
        </p>
      </div>
    `;

    let selections = [];
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectBatchTitle"), icon: "fa-boxes" },
      classes: ["crucible-tailoring"],
      content,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("crucible-tailoring.flow.confirm"),
        default: true,
        callback: (event, button, dialog) => {
          selections = [];
          for (const m of materials) {
            const input = dialog.element.querySelector(`input[name="qty-${m.id}"]`);
            const qty = Math.clamp(Number(input?.value) || 0, 0, m.quantity);
            if (qty > 0) selections.push({ material: m, quantity: qty });
          }
        }
      }, {
        action: "cancel",
        label: game.i18n.localize("crucible-tailoring.flow.cancel")
      }]
    });

    if (result !== "ok" || selections.length === 0) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.noMaterialsSelected"));
      return null;
    }

    const totalQuantity = selections.reduce((sum, s) => sum + s.quantity, 0);
    if (totalQuantity < minTotal) {
      ui.notifications.warn(game.i18n.format("crucible-tailoring.flow.insufficientBatch", { min: minTotal, actual: totalQuantity }));
      return null;
    }

    return {
      materials: selections.map(s => s.material),
      totalQuantity,
      selections
    };
  }

  /**
   * Open a dialog to select an output item for Craft Equipment.
   * Uses registered recipes (world items tagged with recipeTag).
   * These are populated by ensureSeedItems() Phase 2 (tagging existing
   * Crucible items) and by the recipe drop zone (manual registration).
   * @returns {Promise<Item|null>}
   */
  async _selectOutputItem() {
    const { getRegisteredRecipes } = await import("./materials.mjs");
    const recipes = getRegisteredRecipes();

    if (recipes.length === 0) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.noRecipesAvailable"));
      return null;
    }

    const options = recipes.map(r => ({
      value: r.uuid,
      label: `${r.name} (${r.system?.category ?? "?"}) — ${r.system?.price ?? 0} cp`,
      img: r.img
    }));

    const content = `
      <div style="padding:0.5rem;">
        <p>${game.i18n.localize("crucible-tailoring.flow.selectOutput")}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.25rem;">
          ${options.map((o, i) => `
            <label style="display:flex;align-items:center;gap:0.3rem;padding:0.2rem;border:1px solid #ccc;border-radius:3px;cursor:pointer;">
              <input type="radio" name="outputItem" value="${o.value}" ${i === 0 ? "checked" : ""} />
              <img src="${o.img}" alt="${o.label}" style="width:24px;height:24px;object-fit:contain;" />
              <span style="font-size:0.8rem;">${o.label}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;

    // Capture form state inside the button callback, before the dialog closes
    let selectedUuid = null;
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectOutputTitle"), icon: "fa-hammer" },
      classes: ["crucible-tailoring"],
      content,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("crucible-tailoring.flow.confirm"),
        default: true,
        callback: (event, button, dialog) => {
          const radio = dialog.element.querySelector("input[name='outputItem']:checked");
          selectedUuid = radio?.value ?? null;
        }
      }, {
        action: "cancel",
        label: game.i18n.localize("crucible-tailoring.flow.cancel")
      }]
    });

    if (result !== "ok" || !selectedUuid) return null;

    return await fromUuid(selectedUuid);
  }

  /**
   * Open a dialog to select disguise type and context.
   * @returns {Promise<{disguiseType: string, context: string}|null>}
   */
  async _selectDisguiseOptions() {
    const content = `
      <div style="padding:0.5rem;">
        <p>${game.i18n.localize("crucible-tailoring.flow.selectDisguiseType")}</p>
        <div style="margin-bottom:0.5rem;">
          <label style="display:flex;align-items:center;gap:0.3rem;padding:0.2rem 0;cursor:pointer;">
            <input type="radio" name="disguiseType" value="social" checked />
            <span>${game.i18n.localize("crucible-tailoring.flow.disguiseSocial")}</span>
          </label>
          <label style="display:flex;align-items:center;gap:0.3rem;padding:0.2rem 0;cursor:pointer;">
            <input type="radio" name="disguiseType" value="environmental" />
            <span>${game.i18n.localize("crucible-tailoring.flow.disguiseEnvironmental")}</span>
          </label>
        </div>
        <label style="display:block;margin-top:0.5rem;">
          <span style="font-size:0.85rem;">${game.i18n.localize("crucible-tailoring.flow.disguiseContext")}</span>
          <input type="text" name="disguiseContext" placeholder="${game.i18n.localize("crucible-tailoring.flow.disguiseContextPlaceholder")}"
                 style="width:100%;margin-top:0.2rem;padding:0.25rem;" />
        </label>
      </div>
    `;

    // Capture form state inside the button callback, before the dialog closes
    let disguiseType = "social";
    let context = "";
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectDisguiseTitle"), icon: "fa-mask" },
      classes: ["crucible-tailoring"],
      content,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("crucible-tailoring.flow.confirm"),
        default: true,
        callback: (event, button, dialog) => {
          const typeRadio = dialog.element.querySelector("input[name='disguiseType']:checked");
          const contextInput = dialog.element.querySelector("input[name='disguiseContext']");
          disguiseType = typeRadio?.value ?? "social";
          context = contextInput?.value?.trim() ?? "";
        }
      }, {
        action: "cancel",
        label: game.i18n.localize("crucible-tailoring.flow.cancel")
      }]
    });

    if (result !== "ok") return null;

    return { disguiseType, context };
  }

  /**
   * Open a dialog to select a source item for modification.
   * @returns {Promise<Item|null>}
   */
  async _selectSourceItem() {
    // Tailoring applies to cloth-based equipment: armor of unarmored/light/medium
    // categories, plus clothing-type accessories. Accessories of jewelry/trinket/other
    // types won't match because their category won't be in this list.
    const eligibleItems = this.actor?.items.filter(i =>
      ["armor", "accessory"].includes(i.type) &&
      ["unarmored", "light", "medium", "clothing"].includes(i.system?.category ?? "")
    ) ?? [];

    if (eligibleItems.length === 0) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.flow.noEligibleItems"));
      return null;
    }

    const content = `
      <div style="padding:0.5rem;">
        <p>${game.i18n.localize("crucible-tailoring.flow.selectSourceItem")}</p>
        <div>
          ${eligibleItems.map((item, i) => `
            <label style="display:flex;align-items:center;gap:0.3rem;padding:0.2rem 0;cursor:pointer;">
              <input type="radio" name="sourceItem" value="${item.id}" ${i === 0 ? "checked" : ""} />
              <img src="${item.img}" alt="${item.name}" style="width:24px;height:24px;object-fit:contain;" />
              <span>${item.name} (${item.system?.quality ?? "standard"})</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;

    // Capture form state inside the button callback, before the dialog closes
    let selectedId = null;
    const result = await DialogV2.wait({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectSourceItemTitle"), icon: "fa-wrench" },
      classes: ["crucible-tailoring"],
      content,
      buttons: [{
        action: "ok",
        label: game.i18n.localize("crucible-tailoring.flow.confirm"),
        default: true,
        callback: (event, button, dialog) => {
          const radio = dialog.element.querySelector("input[name='sourceItem']:checked");
          selectedId = radio?.value ?? null;
        }
      }, {
        action: "cancel",
        label: game.i18n.localize("crucible-tailoring.flow.cancel")
      }]
    });

    if (result !== "ok" || !selectedId) return null;

    return this.actor.items.get(selectedId) ?? null;
  }

  /**
   * Handle dropping an item into the recipe box.
   * Tags the item as a tailoring recipe (craftable product).
   * @param {DragEvent} event
   */
  async #handleRecipeDrop(event) {
    event.preventDefault();
    const data = getDragEventData(event);
    if (!data?.uuid) return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    await tagItemAsRecipe(item);
    ui.notifications.info(
      game.i18n.format("crucible-tailoring.hub.recipeRegistered", { name: item.name })
    );
    this.render();
  }

  /**
   * Handle dropping an item into the material import zone.
   * Tags the item as a tailoring material.
   * @param {DragEvent} event
   */
  async #handleMaterialImportDrop(event) {
    event.preventDefault();
    const data = getDragEventData(event);
    if (!data?.uuid) return;

    const source = await fromUuid(data.uuid);
    if (!source) return;

    const { registerMaterialType, inferQualityFromName } = await import("./materials.mjs");
    await registerMaterialType({
      name: source.name,
      quality: inferQualityFromName(source.name) ?? source.system?.quality ?? "standard",
      img: source.img
    });
    ui.notifications.info(
      game.i18n.format("crucible-tailoring.hub.materialImported", { name: source.name })
    );
    this.render();
  }
}