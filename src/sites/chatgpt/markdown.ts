/**
 * Convert collected chat HTML into an Obsidian Markdown note:
 * Turndown rules, footnotes, place links, media embeds, and frontmatter.
 */
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import type { CollectedMessage, CollectedSource } from "../../collect";
import { idField, type ChatSite } from "../../filename";
import {
  applyFootnoteMarkers,
  collectSources,
  formatSourcesMarkdown,
  replaceSourceLinksInHtml,
  replaceSourceLinksInMarkdown,
  stripSponsoredAds,
} from "./footnotes";
import { stripPromptFromMarkdown, stripResponseLabelsHtml } from "./labels";
import type { MediaExtras } from "../../media";
import { enhancePlaceLinks } from "./places";
import { embedPath, expandMathInHtml, formatMediaMarkdown, formatObsidianMath, formatSavedAt } from "../../note-common";

export {
  collectSources,
  embedPath,
  expandMathInHtml,
  formatMediaMarkdown,
  formatObsidianMath,
  formatSavedAt,
  formatSourcesMarkdown,
  replaceSourceLinksInHtml,
  replaceSourceLinksInMarkdown,
};

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

/**
 * ChatGPT の表セルは div / p 入りで、Turndown がセル内改行にして表を壊す。
 * リンク以外のブロックを1行に畳む。
 */
function flattenTableCells(html: string): string {
  return html.replace(/<(td|th)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (_all, tag: string, attrs: string | undefined, inner: string) => {
    const flat = inner
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?!a\b)[^>]+>/gi, " ")
      .replace(/<(?!a\b|\/a\b)[^>]+>/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return `<${tag}${attrs || ""}>${flat}</${tag}>`;
  });
}

/** Run Turndown (+ GFM / ChatTaker rules) on sanitized message HTML. */
export function htmlToMarkdown(html: string): string {
  return turndown.turndown(flattenTableCells(stripResponseLabelsHtml(html))).replace(/\u00a0/g, " ").trim();
}

/** Drop chrome-only messages and strip repeated UI labels from HTML. */
function withoutSponsoredAds(message: CollectedMessage): CollectedMessage {
  const html = stripSponsoredAds(message.html || "", message.role);
  if (html === (message.html || "")) return message;
  const media = (message.media ?? []).filter((item) => html.includes(`data-ct-media="${item.id}"`));
  return { ...message, html, media };
}

export function prepareMessages(messages: CollectedMessage[]): CollectedMessage[] {
  const kept: CollectedMessage[] = [];
  for (const message of messages.map(withoutSponsoredAds)) {
    if (isChromeHtml(message.html)) continue;
    const text = textFromHtml(message.html);
    const hasMedia = messageHasMedia(message);
    if (!text && !hasMedia) continue;
    let absorbed = false;
    for (let index = 0; index < kept.length; index++) {
      if (kept[index].role !== message.role) continue;
      const previous = textFromHtml(kept[index].html);
      if (!text && hasMedia) break;
      if (!sameTurnText(previous, text)) continue;
      const preferIncoming = text.length > previous.length;
      const primary = preferIncoming ? message : kept[index];
      const extra = preferIncoming ? kept[index] : message;
      kept[index] = mergeTurnMedia(primary, extra);
      absorbed = true;
      break;
    }
    if (!absorbed) kept.push(message);
  }
  return kept;
}

/**
 * ChatGPT はスクロールで同じ回答を別ノードとして出し直す。
 * 引用の開き方で数語だけ違うので、完全一致だけでなく本文の重なりでも1件にまとめる。
 */
function sameTurnText(previous: string, text: string): boolean {
  if (!previous || !text) return false;
  if (previous === text || previous.includes(text) || text.includes(previous)) return true;
  const left = previous.replace(/\s+/g, "");
  const right = text.replace(/\s+/g, "");
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length < 120 || shorter.length / longer.length < 0.6) return false;
  return shingleRatio(shorter, longer) >= 0.85;
}

function shingleRatio(shorter: string, longer: string): number {
  const size = 40;
  const step = 20;
  if (shorter.length < size) return longer.includes(shorter) ? 1 : 0;
  let total = 0;
  let hit = 0;
  for (let index = 0; index + size <= shorter.length; index += step) {
    total += 1;
    if (longer.includes(shorter.slice(index, index + size))) hit += 1;
  }
  return total ? hit / total : 0;
}

function mergeTurnMedia(primary: CollectedMessage, extra: CollectedMessage): CollectedMessage {
  const media = (primary.media ?? []).map((item) => ({ ...item }));
  const byId = new Map(media.map((item) => [item.id, item]));
  let html = primary.html || "";
  let changed = false;
  for (const item of extra.media ?? []) {
    const existing = byId.get(item.id);
    if (existing) {
      if (!existing.base64 && item.base64) {
        existing.base64 = item.base64;
        existing.mime = item.mime || existing.mime;
        changed = true;
      }
      continue;
    }
    if (item.src && media.some((entry) => entry.src === item.src)) continue;
    media.push(item);
    byId.set(item.id, item);
    changed = true;
    if (!html.includes(`data-ct-media="${item.id}"`)) {
      html += `<img data-ct-media="${item.id.replace(/"/g, "")}" alt="">`;
    }
  }
  if (!changed) return primary;
  return { ...primary, html, media };
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
