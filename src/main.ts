/**
 * Plugin entry point.
 * Registers the ChatTaker sidebar view, ribbon icon, command, and settings tab.
 * Does not detach leaves on unload so the user's layout is preserved.
 */
import { normalizePath, Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { PLUGIN_ICON_ID, PLUGIN_ICON_SVG } from "./icon";
import { asUiLanguage, loadI18nYaml, setLanguage, t } from "./i18n";
import { asSaveFormat, ChatTakerSettingTab, DEFAULT_SETTINGS, type ChatTakerSettings } from "./settings";
import { ChatTakerView, VIEW_TYPE_CHATTAKER } from "./view";

export default class ChatTakerPlugin extends Plugin {
  settings: ChatTakerSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadI18n();
    await this.loadSettings();
    addIcon(PLUGIN_ICON_ID, PLUGIN_ICON_SVG);
    this.registerView(VIEW_TYPE_CHATTAKER, (leaf: WorkspaceLeaf) => new ChatTakerView(leaf, this));
    this.addRibbonIcon(PLUGIN_ICON_ID, "ChatTaker", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-view",
      name: t("command.open"),
      callback: () => {
        void this.activateView();
      },
    });
    this.addSettingTab(new ChatTakerSettingTab(this.app, this));
  }

  /** Load optional plugin-folder i18n.yaml overlay (bundled strings stay as fallback). */
  private async loadI18n(): Promise<void> {
    const dir = this.manifest.dir;
    if (!dir) return;
    const path = normalizePath(`${dir}/i18n.yaml`);
    try {
      const adapter = this.app.vault.adapter;
      if (!(await adapter.exists(path))) return;
      loadI18nYaml(await adapter.read(path));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("ChatTaker: i18n.yaml load failed", message);
    }
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<ChatTakerSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
    this.settings.lastSaveFormat = asSaveFormat(this.settings.lastSaveFormat);
    this.settings.debugCitations = Boolean(this.settings.debugCitations);
    this.settings.language = asUiLanguage(this.settings.language);
    setLanguage(this.settings.language);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Push the active UI language into open ChatTaker views. */
  applyLanguage(): void {
    setLanguage(this.settings.language);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CHATTAKER)) {
      const view = leaf.view;
      if (view instanceof ChatTakerView) view.applyLanguage();
    }
  }

  /** Open or focus the ChatTaker leaf in the right sidebar. */
  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_CHATTAKER)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_CHATTAKER, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
