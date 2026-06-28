// hub.mjs — TailoringHub ApplicationV2 (player-facing, read-only display)
import { MODULE_ID } from "./config.mjs";
import { canOpenHub } from "./gating.mjs";
import {
  getActorMaterials,
  computeMaterialsRequired,
  actorHasTool,
  getSeedEntriesByRole
} from "./materials.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Training rank → display label mapping.
 * Mirrors Crucible's SYSTEM.TALENT.TRAINING_RANKS.
 */
const RANK_LABELS = {
  0: "Untrained",
  1: "Trained",
  2: "Proficient",
  3: "Expert",
  4: "Master"
};

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

export class TailoringHub extends ApplicationV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}.hub`,
    position: { width: 640, height: 720 },
    window: {
      title: "crucible-tailoring.hub.title",
      icon: "fa-scissors",
      resizable: true
    },
    classes: ["crucible-tailoring", "hub-window"],
    tag: "div"
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
   * Recipe drop result (populated when an item is dragged into the recipe box).
   * @type {object|null}
   */
  recipeResult = null;

  /**
   * Open the hub for a specific actor. Performs the gate check first.
   * @param {Actor} actor
   */
  static async open(actor) {
    if (!canOpenHub(actor)) return;
    const instance = new this({ actor });
    await instance.render(true);
  }

  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
  }

  /** @override */
  async _prepareContext() {
    const rank = this.actor?.system?.training?.tailoring ?? 0;
    const bonus = this.actor?.getSkillBonus?.(["tailoring"]) ?? 0;
    const materials = getActorMaterials(this.actor);

    // Build activity list with availability gating
    const activities = ACTIVITIES.map(act => ({
      ...act,
      available: rank >= act.requiredTier,
      label: game.i18n.localize(`crucible-tailoring.activity.${act.id}.label`),
      description: game.i18n.localize(`crucible-tailoring.activity.${act.id}.description`),
      requiredTier: act.tierLabel
    }));

    // Build tool list
    const seedTools = await getSeedEntriesByRole("tool");
    const tools = seedTools.map(t => ({
      name: t.name,
      img: t.img,
      possessed: actorHasTool(this.actor, {
        compendiumKey: t._tailoring?.compendiumKey
      }) || (t._tailoring?.primary && actorHasTool(this.actor, { primary: true }))
        || (t._tailoring?.portable && actorHasTool(this.actor, { portable: true }))
    }));

    return {
      rank,
      rankLabel: RANK_LABELS[rank] ?? "Untrained",
      bonus: bonus >= 0 ? `+${bonus}` : `${bonus}`,
      activities,
      materials: materials.map(m => ({
        id: m.id,
        name: m.name,
        img: m.img,
        quality: m.system?.quality ?? "standard",
        quantity: m.system?.quantity ?? null
      })),
      tools,
      recipeResult: this.recipeResult
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Bind activity card clicks
    const activityCards = this.element.querySelectorAll(".activity-card:not(.activity-locked)");
    for (const card of activityCards) {
      card.addEventListener("click", (e) => {
        const activityId = card.dataset.activity;
        if (activityId) this._onActivityClick(activityId);
      });
    }

    // Bind drag-and-drop for the recipe box
    const recipeBox = this.element.querySelector("[data-action='recipe-drop']");
    if (recipeBox) {
      recipeBox.addEventListener("drop", this._onRecipeDrop.bind(this));
      recipeBox.addEventListener("dragover", (e) => e.preventDefault());
    }

    // Bind import zone for material tagging
    const importZone = this.element.querySelector("[data-action='import-material']");
    if (importZone) {
      importZone.addEventListener("drop", this._onMaterialImportDrop.bind(this));
      importZone.addEventListener("dragover", (e) => e.preventDefault());
    }
  }

  /**
   * Handle clicking an activity card.
   * Opens the appropriate setup dialog, then runs the craft flow.
   * @param {string} activityId
   */
  async _onActivityClick(activityId) {
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
        // Simple: select materials, one batch per material unit
        const selected = await this._selectMaterials(materials, 1, Infinity);
        if (!selected) return;
        await runCraftFlow({ actor: this.actor, activityId, selectedMaterials: selected });
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
        // Select materials + party members
        const selected = await this._selectMaterials(materials, 1, Infinity);
        if (!selected) return;
        const partyMembers = await this._selectPartyMembers();
        if (!partyMembers) return;
        await runCraftFlow({
          actor: this.actor,
          activityId,
          selectedMaterials: selected,
          extra: { partyMembers }
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
   * Open a dialog for the player to select materials from their inventory.
   * @param {Item[]} materials - Available tailoring-tagged materials
   * @param {number} minCount - Minimum number to select
   * @param {number} maxCount - Maximum number to select
   * @returns {Promise<Item[]|null>} Selected materials, or null if cancelled
   */
  async _selectMaterials(materials, minCount, maxCount) {
    if (materials.length === 0) return null;

    // Build a simple selection dialog
    const options = materials.map(m => ({
      value: m.id,
      label: `${m.name} (${m.system?.quality ?? "standard"})${m.system?.quantity > 1 ? ` x${m.system.quantity}` : ""}`,
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

    const { DialogV2 } = foundry.applications.api;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectMaterialsTitle"), icon: "fa-boxes" },
      content,
      yes: { label: game.i18n.localize("crucible-tailoring.flow.confirm"), default: true },
      no: { label: game.i18n.localize("crucible-tailoring.flow.cancel") }
    });

    if (!confirmed) return null;

    // Read selected checkboxes from the DOM (DialogV2 doesn't return form data natively)
    const checkedIds = [];
    document.querySelectorAll(".material-checkbox:checked").forEach(cb => checkedIds.push(cb.value));
    const selected = materials.filter(m => checkedIds.includes(m.id));

    if (selected.length < minCount || selected.length > maxCount) {
      ui.notifications.warn(game.i18n.format("crucible-tailoring.flow.materialCount", { min: minCount, max: maxCount }));
      return null;
    }

    return selected;
  }

  /**
   * Open a dialog to select an output item for Craft Equipment.
   * @returns {Promise<Item|null>}
   */
  async _selectOutputItem() {
    const { getSeedEntriesByRole } = await import("./materials.mjs");
    const outputs = await getSeedEntriesByRole("output");

    const options = outputs.map(o => ({
      value: o._tailoring?.compendiumKey ?? o.name,
      label: `${o.name} (${o.system?.category ?? "?"}) — ${o.system?.price ?? 0} cp`,
      img: o.img
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

    const { DialogV2 } = foundry.applications.api;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectOutputTitle"), icon: "fa-hammer" },
      content,
      yes: { label: game.i18n.localize("crucible-tailoring.flow.confirm"), default: true },
      no: { label: game.i18n.localize("crucible-tailoring.flow.cancel") }
    });

    if (!confirmed) return null;

    const selectedRadio = document.querySelector("input[name='outputItem']:checked");
    if (!selectedRadio) return null;

    const selectedKey = selectedRadio.value;
    const selected = outputs.find(o => (o._tailoring?.compendiumKey ?? o.name) === selectedKey);
    if (!selected) return null;

    // Try to find the actual world item first, fall back to seed data
    const existing = game.items.find(i =>
      i.getFlag(MODULE_ID, "compendiumKey") === selectedKey
    );
    return existing ?? selected;
  }

  /**
   * Open a dialog to select party members for Mend.
   * @returns {Promise<Actor[]|null>}
   */
  async _selectPartyMembers() {
    const party = game.actors?.filter(a =>
      a.type === "character" && a.hasPlayerOwner
    ) ?? [];

    const content = `
      <div style="padding:0.5rem;">
        <p>${game.i18n.localize("crucible-tailoring.flow.selectPartyMembers")}</p>
        <div>
          ${party.map(a => `
            <label style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0;cursor:pointer;">
              <input type="checkbox" value="${a.uuid}" class="party-checkbox" ${a.id === this.actor?.id ? "checked" : ""} />
              <img src="${a.img}" alt="${a.name}" style="width:24px;height:24px;object-fit:contain;border-radius:3px;" />
              <span>${a.name}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;

    const { DialogV2 } = foundry.applications.api;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectPartyMembersTitle"), icon: "fa-users" },
      content,
      yes: { label: game.i18n.localize("crucible-tailoring.flow.confirm"), default: true },
      no: { label: game.i18n.localize("crucible-tailoring.flow.cancel") }
    });

    if (!confirmed) return null;

    const checkedUuids = [];
    document.querySelectorAll(".party-checkbox:checked").forEach(cb => checkedUuids.push(cb.value));
    const members = [];
    for (const uuid of checkedUuids) {
      const actor = await fromUuid(uuid);
      if (actor) members.push(actor);
    }
    return members.length > 0 ? members : null;
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

    const { DialogV2 } = foundry.applications.api;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectDisguiseTitle"), icon: "fa-mask" },
      content,
      yes: { label: game.i18n.localize("crucible-tailoring.flow.confirm"), default: true },
      no: { label: game.i18n.localize("crucible-tailoring.flow.cancel") }
    });

    if (!confirmed) return null;

    const typeRadio = document.querySelector("input[name='disguiseType']:checked");
    const contextInput = document.querySelector("input[name='disguiseContext']");
    return {
      disguiseType: typeRadio?.value ?? "social",
      context: contextInput?.value?.trim() ?? ""
    };
  }

  /**
   * Open a dialog to select a source item for modification.
   * @returns {Promise<Item|null>}
   */
  async _selectSourceItem() {
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

    const { DialogV2 } = foundry.applications.api;
    const confirmed = await DialogV2.confirm({
      window: { title: game.i18n.localize("crucible-tailoring.flow.selectSourceItemTitle"), icon: "fa-wrench" },
      content,
      yes: { label: game.i18n.localize("crucible-tailoring.flow.confirm"), default: true },
      no: { label: game.i18n.localize("crucible-tailoring.flow.cancel") }
    });

    if (!confirmed) return null;

    const selectedRadio = document.querySelector("input[name='sourceItem']:checked");
    if (!selectedRadio) return null;
    return this.actor.items.get(selectedRadio.value) ?? null;
  }

  /**
   * Handle dropping an item into the recipe box.
   * Reads the item's price and computes materials required.
   * @param {DragEvent} event
   */
  async _onRecipeDrop(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if (!data?.uuid) return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    const { materialsRequired, priceInCopper } = computeMaterialsRequired(item);
    this.recipeResult = {
      name: item.name,
      img: item.img,
      materialsRequired,
      priceInCopper
    };
    this.render();
  }

  /**
   * Handle dropping an item into the material import zone.
   * Tags the item as a tailoring material.
   * @param {DragEvent} event
   */
  async _onMaterialImportDrop(event) {
    event.preventDefault();
    const data = TextEditor.getDragEventData(event);
    if (!data?.uuid) return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    const { tagItemAsMaterial } = await import("./materials.mjs");
    await tagItemAsMaterial(item);
    ui.notifications.info(
      game.i18n.format("crucible-tailoring.hub.materialImported", { name: item.name })
    );
    this.render();
  }
}