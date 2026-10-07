/**
 * Build printable HTML for a chat and render it to PDF via a hidden Electron webview.
 */
import type { App } from "obsidian";
import type { CollectedMessage, CollectedSource } from "./collect";
import { collectSources } from "./footnotes";
import { prepareMessages, formatSavedAt, replaceSourceLinksInHtml, expandMathInHtml } from "./markdown";
import type { ChatSite } from "./filename";
import { t } from "./i18n";
import { createWebviewEl } from "./webview";

export interface PdfWebview extends HTMLElement {
  src: string;
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  printToPDF(options: {
    printBackground?: boolean;
    pageSize?: string;
    landscape?: boolean;
  }): Promise<Uint8Array | ArrayBuffer>;
}

/** Standalone HTML document suitable for webview.printToPDF. */
export function buildPrintHtml(input: {
  site: ChatSite;
  source: string;
  title?: string;
  messages: CollectedMessage[];
  mediaDataUrls?: Map<string, string>;
  savedAt?: Date;
  sources?: CollectedSource[];
}): string | null {
  const mediaDataUrls = input.mediaDataUrls ?? new Map<string, string>();
  const sources = collectSources(input.sources ?? [], input.messages);
  const sections = prepareMessages(input.messages)
    .map((message) => {
      const body = expandMathInHtml(
        replaceSourceLinksInHtml(replaceMediaInHtml(message.html, mediaDataUrls), sources),
      ).trim();
      if (!body) return "";
      const cls = message.role === "user" ? "question" : "answer";
      const label = message.role === "user" ? t("pdf.question") : input.site === "gemini" ? "Gemini" : "ChatGPT";
      return `<section class="${cls}"><div class="label">${escapeHtml(label)}</div><div class="body">${body}</div></section>`;
    })
    .filter((section) => section.length > 0);
  if (!sections.length) return null;

  const meta: string[] = [];
  if (input.savedAt) meta.push(`<div>${escapeHtml(t("pdf.saved", { datetime: formatSavedAt(input.savedAt) }))}</div>`);
  if (input.source) meta.push(`<div>${escapeHtml(t("pdf.source", { url: input.source }))}</div>`);
  const references = formatSourcesHtml(sources);

  return `<!DOCTYPE html>
<html lang="${escapeHtml(t("pdf.lang"))}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(input.title || "ChatTaker")}</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 12pt/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
    color: #111;
    background: #fff;
  }
  header { margin-bottom: 18px; padding-bottom: 10px; border-bottom: 1px solid #ddd; }
  header h1 { margin: 0 0 8px; font-size: 16pt; }
  header .meta { color: #555; font-size: 9pt; }
  header .meta div { margin: 2px 0; word-break: break-all; }
  /* 長大な section に page-break-inside:avoid を付けると、質問後に白紙ページが増える */
  section { margin: 0 0 14px; break-inside: auto; page-break-inside: auto; }
  .label { font-size: 9pt; font-weight: 700; color: #444; margin-bottom: 6px; break-inside: avoid; page-break-inside: avoid; }
  .question {
    padding: 10px 12px;
    border-left: 4px solid #2f6fed;
    background: #f3f7ff;
    break-inside: avoid;
    page-break-inside: avoid;
    break-after: avoid-page;
    page-break-after: avoid;
  }
  .answer {
    padding: 4px 0;
    break-before: avoid-page;
    page-break-before: avoid;
  }
  .body :is(p, ul, ol, pre, table, blockquote) { margin: 0 0 0.75em; }
  .body img {
    max-width: 100%;
    max-height: 220mm;
    height: auto;
    display: block;
    margin: 0.5em 0;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .body pre, .body code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10pt;
  }
  .body pre {
    white-space: pre-wrap;
    word-break: break-word;
    background: #f6f6f6;
    padding: 8px 10px;
    border-radius: 4px;
  }
  .body .math-inline, .body .math-display {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10.5pt;
  }
  .body .math-display {
    white-space: pre-wrap;
    margin: 0.75em 0;
    padding: 8px 10px;
    background: #f7f7f7;
  }
  .body table { border-collapse: collapse; width: 100%; }
  .body th, .body td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
  .refs { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; }
  .refs h2 { margin: 0 0 8px; font-size: 13pt; }
  .refs .fn { margin: 0 0 6px; word-break: break-all; }
  .refs .fn-label { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(input.title || (input.site === "gemini" ? "Gemini" : "ChatGPT"))}</h1>
  <div class="meta">${meta.join("")}</div>
</header>
<main>
${sections.join("\n")}
${references}
</main>
</body>
</html>`;
}

function formatSourcesHtml(sources: CollectedSource[]): string {
  if (!sources.length) return "";
  const items = sources
    .map((source, index) => {
      const title = escapeHtml(source.title || source.url);
      const url = escapeAttr(source.url);
      const n = index + 1;
      return `<div class="fn"><span class="fn-label">[^${n}]:</span> <a href="${url}">${title}</a><div>${escapeHtml(source.url)}</div></div>`;
    })
    .join("");
  return `<section class="refs"><h2>${escapeHtml(t("pdf.refs"))}</h2>${items}</section>`;
}

/** Write HTML into an off-screen webview, print to PDF, save under folder/basename.pdf. */
export async function saveChatPdfFromHtml(
  app: App,
  host: HTMLElement,
  folder: string,
  basename: string,
  html: string,
): Promise<string> {
  await ensureFolder(app, folder);
  const path = uniquePath(app, folder, `${basename}.pdf`);
  const webview = createWebviewEl(host, {
    cls: "chattaker-print-webview",
    attr: { partition: "persist:chattaker-print" },
  }) as PdfWebview;

  try {
    await loadBlank(webview);
    await webview.executeJavaScript(
      `document.open();document.write(${JSON.stringify(html)});document.close();true;`,
      true,
    );
    await webview.executeJavaScript(
      `Promise.all(Array.prototype.map.call(document.images || [], function (img) {
        return img.complete ? Promise.resolve() : new Promise(function (resolve) {
          img.onload = img.onerror = function () { resolve(); };
        });
      })).then(function () { return true; })`,
      true,
    );
    await delay(250);
    const raw = await webview.printToPDF({
      printBackground: true,
      pageSize: "A4",
      landscape: false,
    });
    const data = toArrayBuffer(raw);
    if (!data.byteLength) throw new Error(t("pdf.empty"));
    await app.vault.createBinary(path, data);
    return path;
  } finally {
    webview.remove();
  }
}

function replaceMediaInHtml(html: string, mediaDataUrls: Map<string, string>): string {
  return html.replace(/<img\b[^>]*\bdata-ct-media="([^"]+)"[^>]*>/gi, (_all, id: string) => {
    const url = mediaDataUrls.get(id);
    if (!url) return "";
    return `<img src="${escapeAttr(url)}" alt="">`;
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function loadBlank(webview: PdfWebview): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(t("pdf.timeout"))), 15000);
    const onReady = () => {
      window.clearTimeout(timer);
      webview.removeEventListener("dom-ready", onReady);
      resolve();
    };
    webview.addEventListener("dom-ready", onReady);
    webview.src = "about:blank";
  });
}

function uniquePath(app: App, folder: string, filename: string): string {
  const direct = `${folder}/${filename}`;
  if (!app.vault.getAbstractFileByPath(direct)) return direct;
  const dot = filename.lastIndexOf(".");
  const stem = dot >= 0 ? filename.slice(0, dot) : filename;
  const ext = dot >= 0 ? filename.slice(dot) : "";
  let index = 2;
  while (app.vault.getAbstractFileByPath(`${folder}/${stem}_${index}${ext}`)) index += 1;
  return `${folder}/${stem}_${index}${ext}`;
}

async function ensureFolder(app: App, folder: string): Promise<void> {
  const parts = folder.split("/").filter((part) => part.length > 0);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing) continue;
    await app.vault.createFolder(current);
  }
}

function toArrayBuffer(value: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
