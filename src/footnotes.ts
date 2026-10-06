import type { CollectedMessage, CollectedSource } from "./collect";
import { t } from "./i18n";

const SOURCE_CHROME_TAGS =
  "sources-carousel-inline|sources-carousel|structured-sources-block|sources-sidebar|sidebar-sources|model-thoughts|thoughts-animation";

/** 本文中の URL / リンクを脚注 [^N] にし、参照一覧を育てる。URL は捨てない。 */
export function collectSources(base: CollectedSource[], messages: CollectedMessage[]): CollectedSource[] {
  const sources: CollectedSource[] = [];
  for (const item of base) {
    const url = usableUrl(item.url);
    if (!url) continue;
    upsertSource(sources, url, item.title || url);
  }
  for (const message of messages) absorbUrlsFromHtml(message.html || "", sources);
  return sources;
}

export function applyFootnoteMarkers(html: string, sources: CollectedSource[]): string {
  if (!html) return html;
  absorbUrlsFromHtml(html, sources);
  let result = stripSourceChrome(html);
  result = replaceBareCiteChips(result);
  for (const tag of collectAnchorTags(chromeHtml(html))) {
    const href = usableUrl(hrefFromAttrs(tag) || httpUrl(plainTextFromHtml(tag)));
    if (href && !result.includes(href)) result += tag;
  }
  for (const url of bareUrls(chromeHtml(html))) {
    if (!result.includes(url)) result += `<a href="${escapeHtmlAttr(url)}">${escapeHtmlAttr(url)}</a>`;
  }
  absorbUrlsFromHtml(result, sources);

  const sequential = { next: 0 };
  result = result.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (all, attrs: string, inner: string) => {
    const href = hrefFromAttrs(attrs);
    const title = plainTextFromHtml(inner);
    const url = usableUrl(httpUrl(title) || href);
    if (!url) return inner || all;
    return fnSpan(upsertSource(sources, url, title && !httpUrl(title) ? title : title || url));
  });

  result = result.replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (all, attrs: string, inner: string) => {
    if (/\bdata-ct-fn\s*=/.test(attrs) || /\bdata-ct-math\s*=/.test(attrs)) return all;
    const nameMatch =
      /\bdata-ct-cite-name\s*=\s*"([^"]*)"/i.exec(attrs) || /\bdata-ct-cite-name\s*=\s*'([^']*)'/i.exec(attrs);
    if (!nameMatch) return all;
    const name = decodeHtmlAttr(nameMatch[1]).trim() || plainTextFromHtml(inner);
    const url = usableUrl(httpUrl(name) || hostAsUrl(name));
    if (url) {
      const named = findSourceIndexByName(sources, name);
      return fnSpan(named ?? upsertSource(sources, url, name));
    }
    const named = findSourceIndexByName(sources, name);
    if (named != null) return fnSpan(named);
    if (sources.length && sequential.next < sources.length) {
      sequential.next += 1;
      return fnSpan(sequential.next);
    }
    return name ? ` ${name} ` : "";
  });

  return replaceBareUrlsInHtml(result, sources);
}

export function replaceSourceLinksInMarkdown(markdown: string, sources: CollectedSource[]): string {
  const replaced = markdown.replace(/\[([^\]]*)\]\((https?:[^)\s]+)(?:\s+"[^"]*")?\)/g, (_all, text: string, url: string) => {
    return `[^${upsertSource(sources, url, text || url)}]`;
  });
  return replaceBareUrls(replaced, sources);
}

export function replaceSourceLinksInHtml(html: string, sources: CollectedSource[]): string {
  return applyFootnoteMarkers(html, sources).replace(/<span\b([^>]*)>([\s\S]*?)<\/span>/gi, (all, attrs: string) => {
    const fn = /\bdata-ct-fn\s*=\s*"(\d+)"/i.exec(attrs) || /\bdata-ct-fn\s*=\s*'(\d+)'/i.exec(attrs);
    return fn ? `[^${fn[1]}]` : all;
  });
}

export function formatSourcesMarkdown(sources: CollectedSource[]): string {
  if (!sources.length) return "";
  const lines = sources.map((source, index) => {
    const title = escapeMarkdownLinkText(source.title || source.url);
    return `[^${index + 1}]: [${title}](${source.url})`;
  });
  return [t("refs.heading"), "", ...lines].join("\n");
}

function absorbUrlsFromHtml(html: string, sources: CollectedSource[]): void {
  html.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (_all, attrs: string, inner: string) => {
    const href = hrefFromAttrs(attrs);
    const title = plainTextFromHtml(inner);
    const url = usableUrl(httpUrl(title) || href);
    if (url) upsertSource(sources, url, title && !httpUrl(title) ? title : title || url);
    return _all;
  });
  for (const url of bareUrls(html)) upsertSource(sources, url, url);
}

function replaceBareUrlsInHtml(html: string, sources: CollectedSource[]): string {
  const chunks = html.split(/(<(?:pre|code)\b[^>]*>[\s\S]*?<\/(?:pre|code)>)/gi);
  return chunks
    .map((chunk) => {
      if (/^<(?:pre|code)\b/i.test(chunk)) return chunk;
      return chunk.replace(/(<[^>]+>)|([^<]+)/g, (all, tag: string | undefined, text: string | undefined) => {
        if (tag || text == null) return all;
        return text.replace(/https?:\/\/[^\s<>"']+/gi, (raw) => {
          const url = usableUrl(trimUrl(decodeHtmlAttr(raw)));
          return url ? `${fnSpan(upsertSource(sources, url, url))}${raw.slice(url.length)}` : raw;
        });
      });
    })
    .join("");
}

function replaceBareUrls(markdown: string, sources: CollectedSource[]): string {
  const chunks = markdown.split(/(```[\s\S]*?```)/g);
  return chunks
    .map((chunk) => {
      if (chunk.startsWith("```")) return chunk;
      return chunk.replace(/https?:\/\/[^\s<>\[\]`]+/g, (raw, offset: number) => {
        const before = chunk.slice(Math.max(0, offset - 2), offset);
        if (before.endsWith("](") || before.endsWith("]:")) return raw;
        const url = usableUrl(trimUrl(raw));
        return url ? `[^${upsertSource(sources, url, url)}]${raw.slice(url.length)}` : raw;
      });
    })
    .join("");
}

function collectAnchorTags(html: string): string[] {
  return html.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
}

function chromeHtml(html: string): string {
  const matches = html.match(new RegExp(`<(?:${SOURCE_CHROME_TAGS})(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:${SOURCE_CHROME_TAGS})>`, "gi"));
  return matches ? matches.join("") : "";
}

/** ChatGPT が本文に残す「WWebull+1」形式を cite-name マーカーへ */
function replaceBareCiteChips(html: string): string {
  const parts = html.split(/(<[^>]+>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i] || parts[i].startsWith("<")) continue;
    parts[i] = parts[i].replace(
      /([A-Za-z\u3040-\u30ff\u4e00-\u9fff][A-Za-z0-9._\u3040-\u30ff\u4e00-\u9fff -]{0,40}?)\s*[+＋](\d+)(?=[^\w+]|$)/g,
      (_all, name: string) => {
        let cleaned = name.replace(/[\u200b\u200c\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
        if (/^([A-Za-z])\1[A-Za-z]/.test(cleaned)) cleaned = cleaned.slice(1);
        if (!cleaned || cleaned.length < 2) return _all;
        return `<span data-ct-cite-name="${escapeHtmlAttr(cleaned)}"></span>`;
      },
    );
  }
  return parts.join("");
}

function hrefFromAttrs(attrs: string): string {
  const match = /\bhref\s*=\s*"([^"]+)"/i.exec(attrs) || /\bhref\s*=\s*'([^']+)'/i.exec(attrs);
  return match ? trimUrl(decodeHtmlAttr(match[1])) : "";
}

function httpUrl(value: string): string {
  const match = /https?:\/\/[^\s<>"']+/i.exec(value || "");
  return match ? trimUrl(decodeHtmlAttr(match[0])) : "";
}

function hostAsUrl(value: string): string {
  const host = (value || "").trim().replace(/^www\./i, "");
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/\S*)?$/i.test(host)) return "";
  return `https://${host}`;
}

function bareUrls(html: string): string[] {
  const withoutTags = html.replace(/<[^>]+>/g, " ");
  const found: string[] = [];
  for (const match of withoutTags.match(/https?:\/\/[^\s<>"']+/gi) || []) {
    const url = usableUrl(trimUrl(decodeHtmlAttr(match)));
    if (url && !found.includes(url)) found.push(url);
  }
  return found;
}

function trimUrl(url: string): string {
  let value = url.trim().replace(/#:~:.*$/, "").replace(/[.,;:!?)]+$/g, "");
  if (!/^https?:\/\//i.test(value)) return "";
  try {
    const parsed = new URL(value);
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    value = parsed.href;
  } catch {
    // keep trimmed value
  }
  return value;
}

function usableUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname || "/";
    if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) return "";
    if (/help\.openai\.com$/i.test(host)) return "";
    if (
      host === "openai.com" &&
      /^\/(terms|privacy|policies|cookie|chatgpt\/pricing|product|blog|news|about|careers|security|compliance|research|login|signin)\b/i.test(
        path,
      )
    ) {
      return "";
    }
    if (/gemini\.google\.com$/i.test(host) && /^\/(u\/\d+\/)?app\/?/.test(path)) return "";
    if (/google\./i.test(host) && /^\/search\b/.test(path)) return "";
    if (/gstatic\.com$/i.test(host)) return "";
    if (/accounts\.google\.com$/i.test(host)) return "";
  } catch {
    return "";
  }
  return url;
}

function upsertSource(sources: CollectedSource[], url: string, title: string): number {
  const existing = sources.findIndex((source) => source.url === url);
  if (existing >= 0) {
    if (title && title !== url && sources[existing].title === sources[existing].url) {
      sources[existing] = { ...sources[existing], title };
    }
    return existing + 1;
  }
  sources.push({ url, title: title || url });
  return sources.length;
}

function findSourceIndexByName(sources: CollectedSource[], rawName: string): number | null {
  let needle = rawName
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\s*[+＋]\d+\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  // WWebull → webull
  if (/^([a-z])\1[a-z]/.test(needle)) needle = needle.slice(1);
  if (!needle) return null;
  for (let index = 0; index < sources.length; index++) {
    let title = (sources[index].title || "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\s*[+＋]\d+\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/^www\./, "");
    if (/^([a-z])\1[a-z]/.test(title)) title = title.slice(1);
    if (title && (title === needle || title.includes(needle) || needle.includes(title))) return index + 1;
    try {
      const host = new URL(sources[index].url).hostname.replace(/^www\./i, "").toLowerCase();
      const hostStem = host.split(".")[0] || "";
      if (host && (host === needle || host.includes(needle) || needle.includes(host))) return index + 1;
      // TTasmota ↔ tasmota.github.io / WWebull ↔ webull.co.jp
      const needleCompact = needle.replace(/[^a-z0-9]/g, "");
      const stemCompact = hostStem.replace(/[^a-z0-9]/g, "");
      if (stemCompact && needleCompact && (needleCompact.includes(stemCompact) || stemCompact.includes(needleCompact))) {
        return index + 1;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function stripSourceChrome(html: string): string {
  let result = html;
  for (let i = 0; i < 3; i++) {
    const next = result.replace(new RegExp(`<(?:${SOURCE_CHROME_TAGS})(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:${SOURCE_CHROME_TAGS})>`, "gi"), "");
    if (next === result) break;
    result = next;
  }
  return result.replace(new RegExp(`<\\/?(?:${SOURCE_CHROME_TAGS})(?:\\s[^>]*)?>`, "gi"), "");
}

function fnSpan(index: number): string {
  return `<span data-ct-fn="${index}">[^${index}]</span>`;
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/[\[\]]/g, "\\$&").replace(/\r?\n/g, " ").trim() || "link";
}
