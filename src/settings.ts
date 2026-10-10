/**
 * Plugin settings model and the Obsidian settings tab UI
 * (save folder, filename template, language, citation debug).
 *
 * Settings are declared with getSettingDefinitions() (Obsidian 1.13+).
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
}
