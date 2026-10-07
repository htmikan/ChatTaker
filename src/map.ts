/**
 * Rebuild a simple OpenStreetMap HTML page for ChatGPT map captures
 * when we know coordinates and/or an original map URL.
 */
import type { CollectedMedia, MapState } from "./collect";
import { t } from "./i18n";

export function hasMapCoordinates(state?: MapState): boolean {
  return Boolean(
    state &&
      typeof state.lat === "number" &&
      Number.isFinite(state.lat) &&
      typeof state.lng === "number" &&
      Number.isFinite(state.lng),
  );
}

/** Whether we have enough info to write a companion .html for this map media. */
export function canBuildMapHtml(media: CollectedMedia): boolean {
  if (media.kind !== "map") return false;
  if (media.sourceUrl && /^https?:\/\//i.test(media.sourceUrl)) return true;
  if (hasMapCoordinates(media.mapState)) return true;
  if (media.mapState?.query) return true;
  return false;
}

/** HTML document with OSM embed + link back to the original map when available. */
export function buildMapHtml(media: CollectedMedia): string | null {
  if (!canBuildMapHtml(media)) return null;
  const sourceUrl = media.sourceUrl && /^https?:\/\//i.test(media.sourceUrl) ? media.sourceUrl : "";
  const embedUrl = osmEmbedUrl(media.mapState);
  const parts = [
    "<!DOCTYPE html>",
    `<html lang="${t("pdf.lang")}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(t("map.title"))}</title>`,
    "<style>",
    "body{margin:0;font-family:system-ui,sans-serif;background:#f7f7f7;color:#222}",
    "header{padding:12px 16px;background:#fff;border-bottom:1px solid #ddd}",
    "h1{margin:0 0 8px;font-size:18px}",
    "p{margin:0;font-size:13px;line-height:1.5}",
    "a{color:#0b57d0}",
    ".frame{height:calc(100vh - 88px);min-height:320px}",
    "iframe{border:0;width:100%;height:100%}",
    ".note{padding:16px;font-size:13px;color:#555}",
    "</style>",
    "</head>",
    "<body>",
    "<header>",
    `<h1>${escapeHtml(t("map.title"))}</h1>`,
    `<p>${escapeHtml(t("map.intro"))}</p>`,
  ];
  if (sourceUrl) {
    parts.push(`<p><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("map.openOriginal"))}</a></p>`);
  }
  parts.push("</header>");
  if (embedUrl) {
    parts.push(
      `<div class="frame"><iframe src="${escapeHtml(embedUrl)}" loading="lazy" referrerpolicy="no-referrer" title="${escapeHtml(t("map.iframeTitle"))}"></iframe></div>`,
    );
  } else if (sourceUrl) {
    parts.push(
      `<div class="note"><p>${escapeHtml(t("map.noCoords"))}</p><p><a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("map.openOriginalBrowser"))}</a></p></div>`,
    );
  } else if (media.mapState?.query) {
    const q = encodeURIComponent(media.mapState.query);
    const searchUrl = `https://www.openstreetmap.org/search?query=${q}`;
    parts.push(
      `<div class="note"><p>${escapeHtml(t("map.queryOnly"))}</p><p><a href="${escapeHtml(searchUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("map.searchOsm"))}</a></p></div>`,
    );
  } else {
    return null;
  }
  parts.push("</body></html>");
  return parts.join("\n");
}

function osmEmbedUrl(state?: MapState): string | null {
  if (!hasMapCoordinates(state) || !state) return null;
  const lat = state.lat!;
  const lng = state.lng!;
  const zoom = typeof state.zoom === "number" && Number.isFinite(state.zoom) ? clamp(state.zoom, 1, 19) : 15;
  const delta = Math.max(0.002, 360 / Math.pow(2, zoom + 1));
  const minLng = clamp(lng - delta, -180, 180);
  const maxLng = clamp(lng + delta, -180, 180);
  const minLat = clamp(lat - delta, -85, 85);
  const maxLat = clamp(lat + delta, -85, 85);
  const bbox = [minLng, minLat, maxLng, maxLat].map((value) => value.toFixed(6)).join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
