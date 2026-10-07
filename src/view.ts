/**
 * Sidebar ItemView that embeds ChatGPT / Gemini in an Electron <webview>
 * and saves the current conversation as Markdown or PDF into the vault.
 */
import { ItemView, Notice, Platform, TFolder, Vault, WorkspaceLeaf } from "obsidian";
import type ChatTakerPlugin from "./main";
import { PLUGIN_ICON_ID } from "./icon";
import { asCollectedChat, collectScript, type CollectedChat } from "./collect";
import {
  conversationId,
  filenameTemplateFor,
  normalizeFolder,
  renderFilename,
  siteHome,
  siteOf,
  sitePartition,
  withUniqueSuffix,
  type ChatSite,
} from "./filename";
import { buildNote } from "./markdown";
import { loadCollectedMediaData, saveCollectedMedia, type CaptureRect, type MediaWebview } from "./media";
import { buildPrintHtml, saveChatPdfFromHtml } from "./pdf";
import { asSaveFormat, DEFAULT_SETTINGS, type SaveFormat } from "./settings";
import { buildCitationDebugDump, writeCitationDebugDump } from "./debug";
import { t } from "./i18n";
import { createWebviewEl } from "./webview";

export const VIEW_TYPE_CHATTAKER = "chattaker-view";

interface ChatWebview extends HTMLElement, MediaWebview {
  src: string;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  capturePage(rect?: CaptureRect): Promise<{
    isEmpty(): boolean;
    toPNG(): Uint8Array | ArrayBuffer;
  }>;
}

export class ChatTakerView extends ItemView {
  /** Live Electron webview for the selected chat site. */
  private webview: ChatWebview | null = null;
  private statusEl: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private newChatButton: HTMLButtonElement | null = null;
  private saveWrap: HTMLElement | null = null;
  private saveMenu: HTMLElement | null = null;
  private siteSelect: HTMLSelectElement | null = null;
  private site: ChatSite = "chatgpt";
  private menuOpen = false;
  private outsideHandler: ((event: MouseEvent) => void) | null = null;
  private keyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: ChatTakerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_CHATTAKER;
  }

  getDisplayText(): string {
    return "ChatTaker";
  }

  getIcon(): string {
    return PLUGIN_ICON_ID;
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("chattaker-view");

    const bar = this.contentEl.createDiv({ cls: "chattaker-toolbar" });
    const siteSelect = bar.createEl("select", { cls: "chattaker-site" });
    siteSelect.createEl("option", { text: "ChatGPT", value: "chatgpt" });
    siteSelect.createEl("option", { text: "Gemini", value: "gemini" });
    siteSelect.value = this.site;
    siteSelect.addEventListener("change", () => {
      const next = siteSelect.value === "gemini" ? "gemini" : "chatgpt";
      void this.switchSite(next);
    });
    this.siteSelect = siteSelect;
    const button = bar.createEl("button", { text: t("view.newChat") });
    button.type = "button";
    button.addEventListener("click", () => {
      void this.newChat();
    });
    this.newChatButton = button;

    const saveWrap = bar.createDiv({ cls: "chattaker-save-wrap" });
    const saveButton = saveWrap.createEl("button", { text: t("view.save"), cls: "mod-cta" });
    saveButton.type = "button";
    saveButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleSaveMenu();
    });
    this.saveButton = saveButton;
    this.saveWrap = saveWrap;
    this.buildSaveMenu(saveWrap);

    this.statusEl = bar.createSpan({ cls: "chattaker-status" });
    this.mountWebview(siteHome(this.site));
  }

  async onClose(): Promise<void> {
    this.closeSaveMenu();
    this.webview = null;
  }

  private buildSaveMenu(parent: HTMLElement): void {
    const menu = parent.createDiv({ cls: "chattaker-save-menu" });
    menu.hide();
    const last = asSaveFormat(this.plugin.settings.lastSaveFormat);

    const md = menu.createEl("button", {
      text: "Markdown",
      cls: last === "markdown" ? "is-preferred" : "",
    });
    md.type = "button";
    md.addEventListener("click", (event) => {
      event.stopPropagation();
      this.closeSaveMenu();
      void this.saveAs("markdown");
    });

    const pdf = menu.createEl("button", {
      text: "PDF",
      cls: last === "pdf" ? "is-preferred" : "",
    });
    pdf.type = "button";
    pdf.addEventListener("click", (event) => {
      event.stopPropagation();
      this.closeSaveMenu();
      void this.saveAs("pdf");
    });

    this.saveMenu = menu;
  }

  private toggleSaveMenu(): void {
    if (!this.saveButton || this.saveButton.disabled) return;
    if (this.menuOpen) {
      this.closeSaveMenu();
      return;
    }
    this.openSaveMenu();
  }

  private openSaveMenu(): void {
    if (!this.saveMenu) return;
    const last = asSaveFormat(this.plugin.settings.lastSaveFormat);
    for (const button of Array.from(this.saveMenu.querySelectorAll("button"))) {
      const preferred = button.textContent === "PDF" ? "pdf" : "markdown";
      button.classList.toggle("is-preferred", preferred === last);
    }
    this.saveMenu.show();
    this.menuOpen = true;
    this.outsideHandler = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (this.saveWrap && target && this.saveWrap.contains(target)) return;
      this.closeSaveMenu();
    };
    this.keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") this.closeSaveMenu();
    };
    window.setTimeout(() => {
      if (this.outsideHandler) document.addEventListener("mousedown", this.outsideHandler, true);
      if (this.keyHandler) document.addEventListener("keydown", this.keyHandler, true);
    }, 0);
  }

  private closeSaveMenu(): void {
    if (this.saveMenu) this.saveMenu.hide();
    this.menuOpen = false;
    if (this.outsideHandler) {
      document.removeEventListener("mousedown", this.outsideHandler, true);
      this.outsideHandler = null;
    }
    if (this.keyHandler) {
      document.removeEventListener("keydown", this.keyHandler, true);
      this.keyHandler = null;
    }
  }

  /** Create / replace the site webview with a desktop Chrome user-agent. */
  private mountWebview(url: string): void {
    if (this.webview) {
      this.webview.remove();
      this.webview = null;
    }
    const webview = createWebviewEl(this.contentEl, {
      cls: "chattaker-webview",
      attr: {
        partition: sitePartition(this.site),
        allowpopups: "true",
        useragent: chromeUserAgent(),
      },
    }) as ChatWebview;
    webview.addEventListener("dom-ready", () => {
      void this.inject();
    });
    this.webview = webview;
    webview.src = url;
  }

  private async switchSite(site: ChatSite): Promise<void> {
    if (site === this.site) return;
    this.site = site;
    if (this.siteSelect) this.siteSelect.value = site;
    this.mountWebview(siteHome(site));
    this.setStatus(site === "gemini" ? "Gemini" : "ChatGPT");
  }

  /** Inject collect-page.txt into the webview so Save can harvest the DOM. */
  private async inject(): Promise<void> {
    if (!this.webview) return;
    try {
      await this.webview.executeJavaScript(collectScript);
    } catch (error) {
      console.error("ChatTaker: inject failed", error);
    }
  }

  applyLanguage(): void {
    if (this.newChatButton) this.newChatButton.setText(t("view.newChat"));
    if (this.saveButton && !this.saveButton.disabled) this.saveButton.setText(t("view.save"));
  }

  /** Save the current chat as Markdown or PDF (shared UI lock / notices). */
  private async saveAs(format: SaveFormat): Promise<void> {
    if (!this.webview || !this.saveButton || this.saveButton.disabled) return;
    const button = this.saveButton;
    button.disabled = true;
    button.setText(t("view.saving"));
    this.setStatus(t("view.saving"));
    this.plugin.settings.lastSaveFormat = format;
    await this.plugin.saveSettings();
    try {
      if (format === "pdf") {
        await this.savePdf();
      } else {
        await this.saveMarkdown();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(t("view.saveFailed", { message }));
      this.setStatus(t("view.saveFailedStatus"));
      console.error("ChatTaker: save failed", error);
    } finally {
      button.disabled = false;
      button.setText(t("view.save"));
    }
  }

  /** Collect chat HTML, download media, write a vault note (+ optional debug JSON). */
  private async saveMarkdown(): Promise<void> {
    if (!this.webview) return;
    const data = await this.collectForSave();
    if (!data || data.items.length === 0) {
      new Notice(t("view.nothingToSave"));
      this.setStatus(t("view.nothingToSaveStatus"));
      return;
    }
    const site = siteOf(data.url);
    const savedAt = new Date();
    const folder = this.folderPath();
    await ensureFolder(this.app.vault, folder);
    const basename = this.nextBasename(folder, savedAt, site, "md");
    const attachmentFolder = `${folder}/attachments`;
    this.setStatus(t("view.savingImages"));
    const media = await saveCollectedMedia(this.app, this.webview, data, attachmentFolder, basename);
    const note = buildNote({
      site,
      conversationId: conversationId(data.url),
      source: data.url,
      messages: data.items,
      savedAt,
      mediaPaths: media.paths,
      mediaExtras: media.extras,
      sources: data.sources,
    });
    if (!note) {
      new Notice(t("view.nothingToSave"));
      this.setStatus(t("view.nothingToSaveStatus"));
      return;
    }
    const file = await this.app.vault.create(`${folder}/${basename}.md`, note);
    const debugPath = await this.writeDebugIfEnabled({
      site,
      format: "markdown",
      savedAt,
      folder,
      basename,
      data,
      noteMarkdown: note,
    });
    const extra = mediaExtra(media.saved, media.failed);
    const debugExtra = debugPath ? t("view.debug", { path: debugPath }) : "";
    new Notice(t("view.saved", { path: file.path, extra, debug: debugExtra }));
    this.setStatus(t("view.savedStatus", { name: file.basename, extra }));
  }

  /** Collect chat HTML and print it to a PDF via a hidden webview. */
  private async savePdf(): Promise<void> {
    if (!this.webview) return;
    const data = await this.collectForSave();
    if (!data || data.items.length === 0) {
      new Notice(t("view.nothingToSave"));
      this.setStatus(t("view.nothingToSaveStatus"));
      return;
    }
    const site = siteOf(data.url);
    const savedAt = new Date();
    const folder = this.folderPath();
    const basename = this.nextBasename(folder, savedAt, site, "pdf");
    this.setStatus(t("view.loadingImages"));
    const media = await loadCollectedMediaData(this.webview, data);
    const html = buildPrintHtml({
      site,
      source: data.url,
      title: data.title,
      messages: data.items,
      mediaDataUrls: media.dataUrls,
      savedAt,
      sources: data.sources,
    });
    if (!html) {
      new Notice(t("view.nothingToSave"));
      this.setStatus(t("view.nothingToSaveStatus"));
      return;
    }
    this.setStatus(t("view.makingPdf"));
    const path = await saveChatPdfFromHtml(this.app, this.contentEl, folder, basename, html);
    const noteForDebug = this.plugin.settings.debugCitations
      ? buildNote({
          site,
          conversationId: conversationId(data.url),
          source: data.url,
          messages: data.items,
          savedAt,
          sources: data.sources,
        })
      : null;
    const debugPath = await this.writeDebugIfEnabled({
      site,
      format: "pdf",
      savedAt,
      folder,
      basename,
      data,
      noteMarkdown: noteForDebug,
    });
    const extra = mediaExtra(media.saved, media.failed);
    const debugExtra = debugPath ? t("view.debug", { path: debugPath }) : "";
    new Notice(t("view.savedPdf", { path, extra, debug: debugExtra }));
    this.setStatus(t("view.savedStatus", { name: `${basename}.pdf`, extra }));
  }

  /** Optionally write *.debug.json beside the saved note when citation debug is on. */
  private async writeDebugIfEnabled(input: {
    site: ChatSite;
    format: SaveFormat;
    savedAt: Date;
    folder: string;
    basename: string;
    data: CollectedChat;
    noteMarkdown?: string | null;
  }): Promise<string | null> {
    if (!this.plugin.settings.debugCitations) return null;
    const dump = buildCitationDebugDump({
      site: input.site,
      format: input.format,
      savedAt: input.savedAt,
      data: input.data,
      noteMarkdown: input.noteMarkdown,
    });
    return writeCitationDebugDump(this.app.vault, input.folder, input.basename, dump);
  }

  /** Ask the injected page script for the current conversation payload. */
  private async collectForSave(): Promise<CollectedChat | null> {
    const webview = this.webview;
    if (!webview) return null;
    await webview.executeJavaScript(
      `window.__ctDebugCitations = ${this.plugin.settings.debugCitations ? "true" : "false"};`,
      true,
    );
    await webview.executeJavaScript(collectScript, true);
    const raw = await webview.executeJavaScript(
      "window.__ctSave ? window.__ctSave() : (window.__ctExport ? window.__ctExport() : null)",
      true,
    );
    return asCollectedChat(raw);
  }

  /** Build a unique note basename from the configured filename template. */
  private nextBasename(folder: string, date: Date, site: ChatSite, ext: "md" | "pdf"): string {
    const template = filenameTemplateFor(site, this.plugin.settings.filenameTemplate || DEFAULT_SETTINGS.filenameTemplate);
    const base = renderFilename(template, date);
    return withUniqueSuffix(base, (candidate) => this.app.vault.getAbstractFileByPath(`${folder}/${candidate}.${ext}`) != null);
  }

  private async newChat(): Promise<void> {
    if (!this.webview) return;
    const home = siteHome(this.site);
    try {
      await this.webview.executeJavaScript(
        `window.__ctReset && window.__ctReset(); if (location.href.replace(/\\/$/, "") === ${JSON.stringify(home.replace(/\/$/, ""))}) location.reload(); else location.assign(${JSON.stringify(home)});`,
      );
    } catch (error) {
      console.error("ChatTaker: new chat failed", error);
      this.mountWebview(home);
    }
    this.setStatus(t("view.newChatStatus"));
  }

  private folderPath(): string {
    return normalizeFolder(this.plugin.settings.folder) || DEFAULT_SETTINGS.folder;
  }

  private setStatus(text: string): void {
    if (this.statusEl) this.statusEl.setText(text);
  }
}

/** Create each path segment under the vault if missing. */
async function ensureFolder(vault: Vault, folder: string): Promise<void> {
  const parts = folder.split("/").filter((part) => part.length > 0);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(t("view.folderCollision", { path: current }));
    await vault.createFolder(current);
  }
}

function mediaExtra(saved: number, failed: number): string {
  if (!saved && !failed) return "";
  const failedPart = failed ? t("view.imagesFailed", { failed }) : "";
  return t("view.imagesExtra", { saved, failed: failedPart });
}

/** Spoof a normal desktop Chrome UA so chat sites do not treat Obsidian as mobile. */
function chromeUserAgent(): string {
  if (Platform.isMacOS) {
    return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  }
  if (Platform.isLinux) {
    return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  }
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
}
