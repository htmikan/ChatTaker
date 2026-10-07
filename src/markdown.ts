/**
 * Convert collected chat HTML into an Obsidian Markdown note:
 * Turndown rules, footnotes, place links, media embeds, and frontmatter.
 */
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { CollectedMessage, CollectedSource } from "./collect";
import { idField, type ChatSite } from "./filename";
import {
  applyFootnoteMarkers,
  collectSources,
  formatSourcesMarkdown,
  replaceSourceLinksInHtml,
  replaceSourceLinksInMarkdown,
} from "./footnotes";
import { stripPromptFromMarkdown, stripResponseLabelsHtml } from "./labels";
import type { MediaExtras } from "./media";
import { enhancePlaceLinks } from "./places";
import { t } from "./i18n";

export { formatSourcesMarkdown, replaceSourceLinksInHtml, replaceSourceLinksInMarkdown };

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
});

turndown.addRule("fencedCode", {
  filter: "pre",
  replacement: (_content, node) => {
    const element = node;
    const code = element.querySelector("code");
    const className = `${code?.getAttribute("class") || ""} ${element.getAttribute("class") || ""}`;
    const match = /language-([A-Za-z0-9_+-]+)/.exec(className);
    const language = match ? match[1] : "";
    const text = (code?.textContent ?? element.textContent ?? "").replace(/\n$/, "");
    return `\n\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
  },
});

turndown.addRule("ctMedia", {
  filter: (node) => node.nodeName === "IMG" && Boolean(node.getAttribute("data-ct-media")),
  replacement: (_content, node) => {
    const id = node.getAttribute("data-ct-media") || "";
    return id ? `\n\n%%CGM_MEDIA:${id}%%\n\n` : "";
  },
});

turndown.addRule("ctMath", {
  filter: (node) => node.nodeName === "SPAN" && Boolean(node.getAttribute("data-ct-math")),
  replacement: (_content, node) => {
    const latex = (node.textContent || "").trim();
    if (!latex) return "";
    return formatObsidianMath(latex, node.getAttribute("data-ct-math") === "display");
  },
});

turndown.addRule("ctFootnote", {
  filter: (node) => node.nodeName === "SPAN" && Boolean(node.getAttribute("data-ct-fn")),
  replacement: (_content, node) => {
    const n = node.getAttribute("data-ct-fn") || "";
    return n ? `[^${n}]` : "";
  },
});

turndown.addRule("paragraphInList", {
  filter: (node) => node.nodeName === "P" && node.parentNode?.nodeName === "LI",
  replacement: (content, node) => {
    const next = nextMeaningfulSibling(node);
    if (!next) return content;
    if (next.nodeName === "UL" || next.nodeName === "OL") return content;
    return `${content}\n\n`;
  },
});

turndown.use(gfm);

function nextMeaningfulSibling(node: Node): Node | null {
  let sibling = node.nextSibling;
  while (sibling) {
    if (sibling.nodeType === 1) return sibling;
    if (sibling.nodeType === 3 && (sibling.textContent || "").trim()) return sibling;
    sibling = sibling.nextSibling;
  }
  return null;
}

/** Emit Obsidian $...$ / $$...$$ math from extracted LaTeX. */
export function formatObsidianMath(latex: string, display = false): string {
  const body = stripMathDelimiters(latex);
  if (!body) return "";
  if (display) return `\n\n$$\n${body}\n$$\n\n`;
  return `$${body}$`;
}

/** Expand data-ct-math spans into visible math markup for PDF HTML. */
export function expandMathInHtml(html: string): string {
  return html.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (all, attrs: string, inner: string) => {
    const mode = /\bdata-ct-math\s*=\s*"(display|inline)"/i.exec(attrs);
    if (!mode) return all;
    const latex = decodeHtmlEntities(inner).trim();
    if (!latex) return "";
    const formatted = formatObsidianMath(latex, mode[1] === "display").trim();
    if (mode[1] === "display") return `<div class="math-display">${escapeHtmlText(formatted)}</div>`;
    return `<span class="math-inline">${escapeHtmlText(formatted)}</span>`;
  });
}

function stripMathDelimiters(latex: string): string {
  const value = latex.trim();
  if (/^\$\$[\s\S]*\$\$$/.test(value)) return value.replace(/^\$\$/, "").replace(/\$\$$/, "").trim();
  if (value.length >= 2 && value.startsWith("$") && value.endsWith("$") && !value.startsWith("$$")) {
    return value.slice(1, -1).trim();
  }
  if (value.startsWith("\\(") && value.endsWith("\\)")) return value.slice(2, -2).trim();
  if (value.startsWith("\\[") && value.endsWith("\\]")) return value.slice(2, -2).trim();
  return value;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Run Turndown (+ GFM / ChatTaker rules) on sanitized message HTML. */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(stripResponseLabelsHtml(html)).replace(/\u00a0/g, " ").trim();
}

/** Drop chrome-only messages and strip repeated UI labels from HTML. */
export function prepareMessages(messages: CollectedMessage[]): CollectedMessage[] {
  const kept: CollectedMessage[] = [];
  for (const message of messages) {
    if (isChromeHtml(message.html)) continue;
    const text = textFromHtml(message.html);
    const hasMedia = messageHasMedia(message);
    if (!text && !hasMedia) continue;
    let absorbed = false;
    for (let index = 0; index < kept.length; index++) {
      if (kept[index].role !== message.role) continue;
      const previous = textFromHtml(kept[index].html);
      if (!text && hasMedia) break;
      if (previous === text || (text && previous && text.includes(previous))) {
        kept[index] = message;
        absorbed = true;
        break;
      }
      if (previous && text && previous.includes(text) && !hasMedia) {
        absorbed = true;
        break;
      }
    }
    if (!absorbed) kept.push(message);
  }
  return kept;
}

/**
 * Build the final vault note: frontmatter, Q&A body, media embeds, references.
 * Returns null when there is nothing meaningful to save.
 */
export function buildNote(input: {
  conversationId: string;
  source: string;
  messages: CollectedMessage[];
  site?: ChatSite;
  savedAt?: Date;
  mediaPaths?: Map<string, string>;
  mediaExtras?: Map<string, MediaExtras>;
  sources?: CollectedSource[];
}): string | null {
  const site = input.site ?? "chatgpt";
  const mediaPaths = input.mediaPaths ?? new Map<string, string>();
  const mediaExtras = input.mediaExtras ?? new Map<string, MediaExtras>();
  const sources = collectSources(input.sources ?? [], input.messages);
  let body = prepareMessages(input.messages)
    .map((message) => {
      const mediaIds = (message.media ?? []).map((item) => item.id);
      let markdown = htmlToMarkdown(applyFootnoteMarkers(message.html, sources));
      if (message.role !== "user") {
        markdown = replaceSourceLinksInMarkdown(markdown, sources);
        if (site === "gemini" || site === "chatgpt") markdown = enhancePlaceLinks(markdown);
      }
      markdown = applyMediaPaths(markdown, mediaPaths, mediaExtras, mediaIds);
      if (!markdown) return "";
      if (message.role === "user") return asQuestionCallout(markdown);
      return markdown;
    })
    .filter((section) => section.length > 0)
    .join("\n\n");
  if (!body) return null;
  const pruned = pruneUnusedFootnotes(body, sources);
  body = pruned.body;
  const references = formatSourcesMarkdown(pruned.sources);
  const frontmatter = [
    "---",
    `${idField(site)}: ${yamlQuote(input.conversationId)}`,
  ];
  if (input.savedAt) frontmatter.push(`datetime: ${formatSavedAt(input.savedAt)}`);
  frontmatter.push("---", "", body);
  if (references) frontmatter.push("", references);
  frontmatter.push("");
  return frontmatter.join("\n");
}

/** 本文に [^N] が無い参照（ホームページ1行リンクなど）を落とし、番号を詰め直す */
function pruneUnusedFootnotes(
  body: string,
  sources: CollectedSource[],
): { body: string; sources: CollectedSource[] } {
  const used = new Set<number>();
  for (const match of body.matchAll(/\[\^(\d+)\]/g)) used.add(Number(match[1]));
  if (!used.size) return { body, sources: [] };
  if (used.size === sources.length && [...used].every((n) => n >= 1 && n <= sources.length)) {
    return { body, sources };
  }
  const map = new Map<number, number>();
  const next: CollectedSource[] = [];
  for (let index = 0; index < sources.length; index++) {
    const old = index + 1;
    if (!used.has(old)) continue;
    next.push(sources[index]);
    map.set(old, next.length);
  }
  const rewritten = body.replace(/\[\^(\d+)\]/g, (_all, raw: string) => {
    const mapped = map.get(Number(raw));
    return mapped ? `[^${mapped}]` : "";
  });
  return { body: rewritten, sources: next };
}

/** ISO-ish local datetime for the note frontmatter `datetime` field. */
export function formatSavedAt(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function embedPath(path: string): string {
  return `![[${path.replace(/\\/g, "/")}]]`;
}

/** Replace %%CGM_MEDIA:id%% placeholders with wiki embeds / map links. */
export function formatMediaMarkdown(
  id: string,
  mediaPaths: Map<string, string>,
  mediaExtras: Map<string, MediaExtras> = new Map(),
): string {
  const path = mediaPaths.get(id);
  if (!path) return "";
  const lines = [embedPath(path)];
  const extras = mediaExtras.get(id);
  const links: string[] = [];
  if (extras?.htmlPath) links.push(`[${t("media.rebuiltMap")}](${pathToLink(extras.htmlPath)})`);
  if (extras?.sourceUrl) links.push(`[${t("media.openOriginal")}](${extras.sourceUrl})`);
  if (links.length) lines.push(links.join(" · "));
  return lines.join("\n\n");
}

function applyMediaPaths(
  markdown: string,
  mediaPaths: Map<string, string>,
  mediaExtras: Map<string, MediaExtras>,
  mediaIds: string[] = [],
): string {
  const used = new Set<string>();
  let result = markdown.replace(/%%CGM_MEDIA:([^%]+)%%/g, (_all, id: string) => {
    used.add(id);
    return formatMediaMarkdown(id, mediaPaths, mediaExtras);
  });
  const orphans = mediaIds
    .filter((id) => !used.has(id) && mediaPaths.has(id))
    .map((id) => formatMediaMarkdown(id, mediaPaths, mediaExtras));
  if (orphans.length) result = `${orphans.join("\n\n")}${result ? `\n\n${result}` : ""}`;
  return result.replace(/\n{3,}/g, "\n\n").trim();
}

function pathToLink(path: string): string {
  return path.replace(/\\/g, "/").replace(/ /g, "%20");
}

function asQuestionCallout(markdown: string): string {
  const cleaned = stripPromptFromMarkdown(markdown);
  const lines = cleaned.split(/\r?\n/).map((line) => (line.length > 0 ? `> ${line}` : ">"));
  return ["> [!question]", ...lines].join("\n");
}

function messageHasMedia(message: CollectedMessage): boolean {
  return Boolean(message.media?.length) || /data-ct-media=/i.test(message.html);
}

function textFromHtml(html: string): string {
  return html
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isChromeHtml(html: string): boolean {
  if (/data-ct-media=/i.test(html) || /data-ct-math=/i.test(html) || /https?:\/\//i.test(html)) return false;
  const text = textFromHtml(html);
  if (/^(chatgpt:?|gemini|思考中|thinking)$/i.test(text)) return true;
  if (/^(chatgpt|gemini)\s*(の回答|の返答)$/i.test(text)) return true;
  const stripped = text
    .replace(/chatgpt:?/gi, "")
    .replace(/(?:chatgpt|gemini)\s*(?:の回答|の返答)/gi, "")
    .replace(/ウェブを検索しています/g, "")
    .replace(/ウェブを検索中/g, "")
    .replace(/検索しています/g, "")
    .replace(/searching the web/gi, "")
    .replace(/searched the web/gi, "")
    .replace(/\d+\s*\./g, "")
    .replace(/\s+/g, "");
  return stripped.length === 0;
}

function yamlQuote(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ");
  return `"${escaped}"`;
}
