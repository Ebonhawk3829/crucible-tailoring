// modification-dialog.mjs — ApplicationV2 with drop zone for dragging affixes onto output
// The Apply Modification flow: shows the existing item on both sides;
// the player drags an affix from the compendium onto the output side.

import { MODULE_ID, FLAGS } from "./config.mjs";

const { ApplicationV2 } = foundry.applications.api;

/**
 * Resolve drag event data, with a fallback for v14 builds where the import
 * path may differ.
 * @param {DragEvent} event
 * @returns {object|null}
 */
function getDragEventData(event) {
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

export class ModificationDialog extends ApplicationV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}.modification-dialog`,
    position: { width: 500, height: 400 },
    window: {
      title: "crucible-tailoring.modification.title",
      icon: "fa-wrench",
      resizable: false
    },
    classes: ["crucible-tailoring", "modification-dialog"],
    tag: "div"
  };

  /** @override */
  static PARTS = {
    main: {
      template: "modules/crucible-tailoring/templates/modification-dialog.hbs",
      scrollable: []
    }
  };

  /**
   * The item being modified.
   * @type {Item}
   */
  sourceItem = null;

  /**
   * The affix dragged onto the output side.
   * @type {Item|null}
   */
  selectedAffix = null;

  /**
   * The actor who owns the source item.
   * @type {Actor}
   */
  actor = null;

  constructor(options = {}) {
    super(options);
    this.sourceItem = options.sourceItem ?? null;
    this.actor = options.actor ?? null;
  }

  /** @override */
  async _prepareContext() {
    return {
      sourceItem: this.sourceItem ? {
        name: this.sourceItem.name,
        img: this.sourceItem.img,
        quality: this.sourceItem.system?.quality ?? "standard"
      } : null,
      selectedAffix: this.selectedAffix ? {
        name: this.selectedAffix.name,
        img: this.selectedAffix.img
      } : null,
      hasAffix: this.selectedAffix !== null
    };
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);

    // Bind the drop zone for the affix
    const dropZone = this.element.querySelector("[data-action='affix-drop']");
    if (dropZone) {
      dropZone.addEventListener("drop", this._onAffixDrop.bind(this));
      dropZone.addEventListener("dragover", (e) => e.preventDefault());
    }

    // Bind confirm button
    const confirmBtn = this.element.querySelector("[data-action='confirm-modification']");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", this._onConfirm.bind(this));
    }
  }

  /**
   * Handle dropping an affix from the compendium onto the output side.
   * @param {DragEvent} event
   */
  async _onAffixDrop(event) {
    event.preventDefault();
    const data = getDragEventData(event);
    if (!data?.uuid) return;

    const item = await fromUuid(data.uuid);
    if (!item) return;

    // Validate it's an affix (Crucible affix items have a specific type)
    // We accept any item dragged — the GM confirms at proposal time.
    this.selectedAffix = item;
    this.render();
  }

  /**
   * Handle confirm — resolves the stored promise with the result.
   */
  async _onConfirm() {
    if (!this.selectedAffix) {
      ui.notifications.warn(game.i18n.localize("crucible-tailoring.modification.noAffix"));
      return;
    }

    this._resolve?.({
      sourceItemUuid: this.sourceItem?.uuid,
      affixUuid: this.selectedAffix?.uuid
    });
    this._resolve = null;
    this.close();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this._resolve?.(null);  // cancelled path
    this._resolve = null;
  }

  /**
   * Open the modification dialog and wait for the result.
   * @param {object} params
   * @param {Item} params.sourceItem - The item to modify
   * @param {Actor} params.actor - The owning actor
   * @returns {Promise<{sourceItemUuid: string, affixUuid: string}|null>}
   */
  static async open({ sourceItem, actor }) {
    return new Promise(resolve => {
      const dialog = new this({ sourceItem, actor });
      dialog._resolve = resolve;
      dialog.render(true);
    });
  }
}