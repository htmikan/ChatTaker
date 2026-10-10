/**
 * Site-neutral pure helpers shared by the ChatGPT and Gemini note builders:
 * math markup, saved-at formatting, and media embeds. Keep this file tiny and stable;
 * anything that depends on a chat site's DOM or wording belongs under src/sites/<site>/.
 */
import type { MediaExtras } from "./media";
import { t } from "./i18n";

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

function pathToLink(path: string): string {
  return path.replace(/\\/g, "/").replace(/ /g, "%20");
}
