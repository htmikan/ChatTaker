/**
 * Site detection helpers and note filename / conversation-id utilities.
 */
export const DEFAULT_FILENAME_TEMPLATE = "ChatGPT_{{date:YYMMDD_HHmmss}}";

export type ChatSite = "chatgpt" | "gemini";

/** Infer chatgpt vs gemini from a conversation URL. */
export function siteOf(url: string): ChatSite {
  try {
    if (new URL(url).hostname.includes("gemini.google")) return "gemini";
  } catch {
    if (url.includes("gemini.google")) return "gemini";
  }
  return "chatgpt";
}

/** Landing URL opened in a new / switched webview. */
export function siteHome(site: ChatSite): string {
  return site === "gemini" ? "https://gemini.google.com/app" : "https://chatgpt.com/";
}

/** Electron persist: partition so each site keeps its own login cookies. */
export function sitePartition(site: ChatSite): string {
  return site === "gemini" ? "persist:chattaker-gemini" : "persist:chattaker-chatgpt";
}

export function siteFilenameTemplate(site: ChatSite): string {
  return site === "gemini" ? "Gemini_{{date:YYMMDD_HHmmss}}" : DEFAULT_FILENAME_TEMPLATE;
}

/** Resolve the configured filename template for the active site (swap ChatGPT→Gemini). */
export function filenameTemplateFor(site: ChatSite, configured: string): string {
  const template = (configured || DEFAULT_FILENAME_TEMPLATE).trim() || DEFAULT_FILENAME_TEMPLATE;
  if (site !== "gemini") return template;
  if (template === DEFAULT_FILENAME_TEMPLATE) return siteFilenameTemplate("gemini");
  return template.replace(/ChatGPT/g, "Gemini");
}

/** Frontmatter key that stores the conversation id. */
export function idField(site: ChatSite): "chatgpt-id" | "gemini-id" {
  return site === "gemini" ? "gemini-id" : "chatgpt-id";
}

const DATE_TOKEN = /\{\{date:([^}]+)\}\}/g;

/** Expand tokens like YY / MM / DD / HH / mm / ss inside a date pattern. */
export function formatDatePattern(date: Date, pattern: string): string {
  const year = String(date.getFullYear());
  const tokens: Record<string, string> = {
    YYYY: year,
    YY: year.slice(-2),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (part) => tokens[part] ?? part);
}

/** Render `{{date:...}}` placeholders and strip a trailing .md/.pdf extension. */
export function renderFilename(template: string, date = new Date()): string {
  const rendered = template.replace(DATE_TOKEN, (_all, format: string) => formatDatePattern(date, format.trim()));
  const withoutExtension = rendered.replace(/\.md$/i, "");
  const cleaned = withoutExtension.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || "ChatGPT";
}

/** Normalize a vault-relative folder path (no leading/trailing slashes, no `..`). */
export function normalizeFolder(input: string): string {
  return input
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== "." && part !== "..")
    .join("/");
}

/** Append _2, _3, … until `exists(name)` is false. */
export function withUniqueSuffix(base: string, exists: (name: string) => boolean): string {
  if (!exists(base)) return base;
  let index = 2;
  while (exists(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

/** Extract the conversation id segment from a ChatGPT or Gemini URL. */
export function conversationId(url: string): string {
  const path = pathnameOf(url);
  if (siteOf(url) === "gemini") {
    const gemini = /\/app\/([^/]+)/.exec(path);
    return gemini ? safeDecode(gemini[1]) : "";
  }
  const chat = /\/(?:c|uc)\/([^/]+)/.exec(path);
  if (chat) return safeDecode(chat[1]);
  const share = /\/share\/([^/]+)/.exec(path);
  if (share) return `share:${safeDecode(share[1])}`;
  return "";
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    const match = /^https?:\/\/[^/]+([^?#]*)/i.exec(url);
    return match ? match[1] : url;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
