import { App, PluginSettingTab, Setting } from "obsidian";
import type ChatTakerPlugin from "./main";
import { DEFAULT_FILENAME_TEMPLATE } from "./filename";
import { asUiLanguage, languageOptions, setLanguage, t, type UiLanguage } from "./i18n";

export type SaveFormat = "markdown" | "pdf";

export interface ChatTakerSettings {
  folder: string;
  filenameTemplate: string;
  lastSaveFormat: SaveFormat;
  /** 保存時に引用診断 JSON を追加保存する */
  debugCitations: boolean;
  language: UiLanguage;
}

export const DEFAULT_SETTINGS: ChatTakerSettings = {
  folder: "Chats",
  filenameTemplate: DEFAULT_FILENAME_TEMPLATE,
  lastSaveFormat: "markdown",
  debugCitations: false,
  language: "en",
};

export function asSaveFormat(value: unknown): SaveFormat {
  return value === "pdf" ? "pdf" : "markdown";
}

export class ChatTakerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ChatTakerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dropdown) => {
        for (const option of languageOptions()) dropdown.addOption(option.id, option.label);
        dropdown.setValue(this.plugin.settings.language);
        dropdown.onChange(async (value) => {
          this.plugin.settings.language = asUiLanguage(value);
          setLanguage(this.plugin.settings.language);
          await this.plugin.saveSettings();
          this.plugin.applyLanguage();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(t("settings.folder.name"))
      .setDesc(t("settings.folder.desc"))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.folder)
          .setValue(this.plugin.settings.folder)
          .onChange(async (value) => {
            this.plugin.settings.folder = value.trim() || DEFAULT_SETTINGS.folder;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.filename.name"))
      .setDesc(t("settings.filename.desc"))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.filenameTemplate)
          .setValue(this.plugin.settings.filenameTemplate)
          .onChange(async (value) => {
            this.plugin.settings.filenameTemplate = value.trim() || DEFAULT_SETTINGS.filenameTemplate;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("settings.debug.name"))
      .setDesc(t("settings.debug.desc"))
      .addToggle((toggle) =>
        toggle.setValue(Boolean(this.plugin.settings.debugCitations)).onChange(async (value) => {
          this.plugin.settings.debugCitations = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
