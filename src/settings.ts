/**
 * Plugin settings model and the Obsidian settings tab UI
 * (save folder, filename template, language, citation debug).
 *
 * Obsidian 1.13+ uses getSettingDefinitions() for settings search;
 * display() remains as a fallback for older app versions.
 */
import { App, PluginSettingTab, Setting } from "obsidian";
import type ChatTakerPlugin from "./main";
import { DEFAULT_FILENAME_TEMPLATE } from "./filename";
import { asUiLanguage, languageOptions, setLanguage, t, type UiLanguage } from "./i18n";

export type SaveFormat = "markdown" | "pdf";

export interface ChatTakerSettings {
  folder: string;
  filenameTemplate: string;
  lastSaveFormat: SaveFormat;
  /** When true, also write a *.debug.json citation dump next to the note. */
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

/** Settings → ChatTaker panel. */
export class ChatTakerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ChatTakerPlugin) {
    super(app, plugin);
  }

  /**
   * Declarative settings for Obsidian 1.13+ (indexed by settings search).
   * Language uses `render` because changing it must refresh open views.
   */
  getSettingDefinitions() {
    return [
      {
        name: t("settings.language.name"),
        desc: t("settings.language.desc"),
        // Side effect: apply language to open ChatTaker views immediately.
        render: (setting: Setting) => {
          setting.addDropdown((dropdown) => {
            for (const option of languageOptions()) dropdown.addOption(option.id, option.label);
            dropdown.setValue(this.plugin.settings.language);
            dropdown.onChange(async (value) => {
              this.plugin.settings.language = asUiLanguage(value);
              setLanguage(this.plugin.settings.language);
              await this.plugin.saveSettings();
              this.plugin.applyLanguage();
            });
          });
        },
      },
      {
        name: t("settings.folder.name"),
        desc: t("settings.folder.desc"),
        control: {
          type: "text" as const,
          key: "folder",
          placeholder: DEFAULT_SETTINGS.folder,
          defaultValue: DEFAULT_SETTINGS.folder,
        },
      },
      {
        name: t("settings.filename.name"),
        desc: t("settings.filename.desc"),
        control: {
          type: "text" as const,
          key: "filenameTemplate",
          placeholder: DEFAULT_SETTINGS.filenameTemplate,
          defaultValue: DEFAULT_SETTINGS.filenameTemplate,
        },
      },
      {
        name: t("settings.debug.name"),
        desc: t("settings.debug.desc"),
        control: {
          type: "toggle" as const,
          key: "debugCitations",
          defaultValue: false,
        },
      },
    ];
  }

  /** Fallback for Obsidian < 1.13.0 (imperative settings UI). */
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
