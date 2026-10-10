/**
 * Download chat images / screenshots / map captures into the vault attachments folder.
 * Optionally write a reconstructed OpenStreetMap HTML companion for map media.
 */
import { requestUrl, type App } from "obsidian";
import type { CollectedChat, CollectedMedia } from "./collect";
import { buildMapHtml, canBuildMapHtml } from "./map";

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaWebview {
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
  capturePage(rect?: CaptureRect): Promise<NativeImageLike>;
}

interface NativeImageLike {
  isEmpty(): boolean;
  toPNG(): Uint8Array | ArrayBuffer;
}

interface FetchImageResult {
  ok: boolean;
  mime?: string;
  base64?: string;
  error?: string;
}

export interface MediaBinary {
  data: ArrayBuffer;
  ext: string;
  mime: string;
  /** How the bytes were obtained (debug only): page-fetch, host-request, page-bytes, materialize, screenshot. */
  via?: string;
}

export interface MediaExtras {
  htmlPath?: string;
  sourceUrl?: string;
}

export interface MediaSaveResult {
  paths: Map<string, string>;
  extras: Map<string, MediaExtras>;
  /** media id → acquisition route (debug sidecar). */
  routes: Map<string, string>;
  saved: number;
  failed: number;
}

export interface MediaDataResult {
  dataUrls: Map<string, string>;
  saved: number;
  failed: number;
}

/** Persist every CollectedMedia item; returns vault paths and success counts. */
export async function saveCollectedMedia(
  app: App,
  webview: MediaWebview,
  chat: CollectedChat,
  attachmentFolder: string,
  noteBasename: string,
): Promise<MediaSaveResult> {
  const paths = new Map<string, string>();
  const extras = new Map<string, MediaExtras>();
  const routes = new Map<string, string>();
  const bySrc = new Map<string, string>();
  let saved = 0;
  let failed = 0;
  let index = 0;

  for (const message of chat.items) {
    for (const media of message.media ?? []) {
      if (paths.has(media.id)) continue;
      // Same picture collected twice (re-render / duplicate turn) → one file.
      const srcKey = dedupeKey(media);
      const existing = srcKey ? bySrc.get(srcKey) : undefined;
      if (existing) {
        paths.set(media.id, existing);
        routes.set(media.id, "same-src");
        continue;
      }
      index += 1;
      try {
        const binary = await loadMediaBinary(webview, media);
        if (!binary) {
          failed += 1;
          routes.set(media.id, "failed");
          continue;
        }
        routes.set(media.id, binary.via || "unknown");
        await ensureFolder(app, attachmentFolder);
        const filename = `${noteBasename}_${String(index).padStart(2, "0")}.${binary.ext}`;
        const path = uniquePath(app, attachmentFolder, filename);
        await app.vault.createBinary(path, binary.data);
        paths.set(media.id, path);
        if (srcKey) bySrc.set(srcKey, path);
        saved += 1;

        if (media.kind === "map") {
          const mapExtras = await saveMapHtmlIfPossible(app, attachmentFolder, path, media);
          if (mapExtras) extras.set(media.id, mapExtras);
        }
      } catch (error) {
        failed += 1;
        console.error("ChatTaker: media save failed", media.id, error);
      }
    }
  }

  return { paths, extras, routes, saved, failed };
}

/** Load media as data URLs for in-memory PDF printing (no vault writes). */
export async function loadCollectedMediaData(
  webview: MediaWebview,
  chat: CollectedChat,
): Promise<MediaDataResult> {
  const dataUrls = new Map<string, string>();
  const bySrc = new Map<string, string>();
  let saved = 0;
  let failed = 0;

  for (const message of chat.items) {
    for (const media of message.media ?? []) {
      if (dataUrls.has(media.id)) continue;
      const srcKey = dedupeKey(media);
      const existing = srcKey ? bySrc.get(srcKey) : undefined;
      if (existing) {
        dataUrls.set(media.id, existing);
        continue;
      }
      try {
        const binary = await loadMediaBinary(webview, media);
        if (!binary) {
          failed += 1;
          continue;
        }
        const dataUrl = arrayBufferToDataUrl(binary.data, binary.mime);
        dataUrls.set(media.id, dataUrl);
        if (srcKey) bySrc.set(srcKey, dataUrl);
        saved += 1;
      } catch (error) {
        failed += 1;
        console.error("ChatTaker: media load failed", media.id, error);
      }
    }
  }

  return { dataUrls, saved, failed };
}

async function saveMapHtmlIfPossible(
  app: App,
  attachmentFolder: string,
  pngPath: string,
  media: CollectedMedia,
): Promise<MediaExtras | null> {
  const extras: MediaExtras = {};
  if (media.sourceUrl && /^https?:\/\//i.test(media.sourceUrl)) {
    extras.sourceUrl = media.sourceUrl;
  }
  if (!canBuildMapHtml(media)) {
    return Object.keys(extras).length ? extras : null;
  }
  try {
    const html = buildMapHtml(media);
    if (!html) {
      return Object.keys(extras).length ? extras : null;
    }
    const htmlName = pngPath.replace(/\.png$/i, ".html").split("/").pop()!;
    const htmlPath = uniquePath(app, attachmentFolder, htmlName);
    const data = new TextEncoder().encode(html).buffer;
    await app.vault.createBinary(htmlPath, data);
    extras.htmlPath = htmlPath;
    return extras;
  } catch {
    return Object.keys(extras).length ? extras : null;
  }
}

/** Images with a stable http(s) src are the same picture wherever they were collected. */
function dedupeKey(media: CollectedMedia): string {
  if (media.kind !== "image" || !media.src) return "";
  if (!/^https?:\/\//i.test(media.src)) return "";
  return media.src;
}

async function loadMediaBinary(webview: MediaWebview, media: CollectedMedia): Promise<MediaBinary | null> {
  // A screenshot can be the ad popup covering the picture, so a real URL is always tried first:
  // 1) fetch inside the page, 2) download from Obsidian (no CORS), only then pixels from the screen.
  if (media.kind === "image" && media.src && /^https?:\/\//i.test(media.src)) {
    const fetched = await fetchMedia(webview, media);
    if (fetched) return { ...fetched, via: "page-fetch" };
    const downloaded = await downloadImage(media.src);
    if (downloaded) return { ...downloaded, via: "host-request" };
  }
  const inline = binaryFromBase64(media.base64, media.mime);
  if (inline) return { ...inline, via: "page-bytes" };
  const materialized = await materializeMedia(webview, media.id);
  if (materialized) return { ...materialized, via: "materialize" };
  if (media.kind === "capture" || media.kind === "map" || media.kind === "image") {
    const shot = await captureMedia(webview, media.id);
    if (shot) return { ...shot, via: "screenshot" };
  }
  const late = await fetchMedia(webview, media);
  return late ? { ...late, via: "page-fetch-late" } : null;
}

/** Download an http(s) image through Obsidian's requestUrl, which is not subject to page CORS. */
async function downloadImage(src: string): Promise<MediaBinary | null> {
  try {
    const response = await requestUrl({ url: src, method: "GET", throw: false });
    if (response.status < 200 || response.status >= 300) return null;
    const data = response.arrayBuffer;
    if (!data || !data.byteLength) return null;
    const mime = String(response.headers?.["content-type"] || response.headers?.["Content-Type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (mime && !mime.startsWith("image/")) return null;
    const type = mime || "image/png";
    return { data, ext: extensionForMime(type), mime: type };
  } catch {
    return null;
  }
}

function binaryFromBase64(base64: string | undefined, mime: string | undefined): MediaBinary | null {
  if (!base64) return null;
  const data = base64ToArrayBuffer(base64);
  if (!data.byteLength) return null;
  const type = mime || "image/png";
  return { data, ext: extensionForMime(type), mime: type };
}

/** Ask the page to re-scroll a virtualized message and read pixels while the node is connected. */
async function materializeMedia(webview: MediaWebview, id: string): Promise<MediaBinary | null> {
  const raw = await webview.executeJavaScript(
    `window.__ctMaterializeMedia ? window.__ctMaterializeMedia(${JSON.stringify(id)}) : null`,
    true,
  );
  const result = asFetchResult(raw);
  if (!result?.ok || !result.base64) return null;
  return binaryFromBase64(result.base64, result.mime);
}

async function fetchMedia(webview: MediaWebview, media: CollectedMedia): Promise<MediaBinary | null> {
  if (!media.src) return null;
  const raw = await webview.executeJavaScript(
    `window.__ctFetchImage ? window.__ctFetchImage(${JSON.stringify(media.src)}) : null`,
    true,
  );
  const result = asFetchResult(raw);
  if (!result?.ok || !result.base64) return null;
  const mime = result.mime || "image/png";
  const data = base64ToArrayBuffer(result.base64);
  if (!data.byteLength) return null;
  return { data, ext: extensionForMime(mime), mime };
}

async function captureMedia(webview: MediaWebview, id: string): Promise<MediaBinary | null> {
  const raw = await webview.executeJavaScript(
    `window.__ctFocusMedia ? window.__ctFocusMedia(${JSON.stringify(id)}) : null`,
    true,
  );
  const rect = asRect(raw);
  if (!rect) return null;
  try {
    const image = await webview.capturePage(rect);
    if (!image || image.isEmpty()) return null;
    const png = image.toPNG();
    const data = toArrayBuffer(png);
    if (!data.byteLength) return null;
    return { data, ext: "png", mime: "image/png" };
  } finally {
    await restoreCapture(webview);
  }
}

/** Un-hide the overlays the page script hid for the screenshot. */
async function restoreCapture(webview: MediaWebview): Promise<void> {
  try {
    await webview.executeJavaScript(`window.__ctRestoreCapture ? window.__ctRestoreCapture() : null`, true);
  } catch {
    // Webview may be gone.
  }
}

function asFetchResult(value: unknown): FetchImageResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as FetchImageResult;
  return {
    ok: Boolean(record.ok),
    mime: typeof record.mime === "string" ? record.mime : undefined,
    base64: typeof record.base64 === "string" ? record.base64 : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
  };
}

function asRect(value: unknown): CaptureRect | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<CaptureRect>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every((part) => Number.isFinite(part))) return null;
  if (width < 8 || height < 8) return null;
  return {
    x: Math.max(0, Math.floor(x)),
    y: Math.max(0, Math.floor(y)),
    width: Math.floor(width),
    height: Math.floor(height),
  };
}

function extensionForMime(mime: string): string {
  const normalized = mime.toLowerCase().split(";")[0].trim();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "jpg";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/gif") return "gif";
  if (normalized === "image/svg+xml") return "svg";
  return "png";
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function arrayBufferToDataUrl(data: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(data);
  const chunk = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk))));
  }
  return `data:${mime};base64,${btoa(parts.join(""))}`;
}

interface ScanRect extends CaptureRect {
  id: string;
}

/**
 * Scroll the conversation one step at a time and screenshot media that the page
 * cannot read (cross-origin images, map iframes) while those nodes are on screen.
 */
export async function collectChatWithCaptures(
  webview: MediaWebview,
  script: string,
  debugCitations: boolean,
): Promise<unknown> {
  await webview.executeJavaScript(
    `window.__ctSaving = true; window.__ctDebugCitations = ${debugCitations ? "true" : "false"};`,
    true,
  );
  try {
    await webview.executeJavaScript(script, true);
    const stepped = await webview.executeJavaScript(`typeof window.__ctBeginSave === "function"`, true);
    if (stepped !== true) {
      return webview.executeJavaScript(
        "window.__ctSave ? window.__ctSave() : (window.__ctExport ? window.__ctExport() : null)",
        true,
      );
    }
    await webview.executeJavaScript(`window.__ctBeginSave()`, true);
    for (let i = 0; i < 80; i++) {
      const step = asScanStep(await webview.executeJavaScript(`window.__ctSaveStep()`, true));
      await storeCapturedRects(webview, step.rects);
      if (step.done) break;
    }
    return webview.executeJavaScript(`window.__ctFinishSave()`, true);
  } finally {
    try {
      await webview.executeJavaScript(`window.__ctSaving = false;`, true);
    } catch {
      // Webview can close before the flag reset.
    }
  }
}

async function storeCapturedRects(webview: MediaWebview, rects: ScanRect[]): Promise<void> {
  try {
    await storeRects(webview, rects);
  } finally {
    await restoreCapture(webview);
  }
}

async function storeRects(webview: MediaWebview, rects: ScanRect[]): Promise<void> {
  for (const rect of rects) {
    try {
      const image = await webview.capturePage({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      if (!image || image.isEmpty()) continue;
      const data = toArrayBuffer(image.toPNG());
      if (!data.byteLength) continue;
      const base64 = bytesToBase64(data);
      await webview.executeJavaScript(
        `window.__ctStoreMediaPng && window.__ctStoreMediaPng(${JSON.stringify(rect.id)}, ${JSON.stringify(base64)})`,
        true,
      );
    } catch (error) {
      console.error("ChatTaker: live capture failed", rect.id, error);
    }
  }
}

function asScanStep(value: unknown): { done: boolean; rects: ScanRect[] } {
  if (!value || typeof value !== "object") return { done: true, rects: [] };
  const record = value as { done?: unknown; rects?: unknown };
  const rects: ScanRect[] = [];
  if (Array.isArray(record.rects)) {
    for (const item of record.rects) {
      const rect = asRect(item);
      if (!rect || !item || typeof item !== "object") continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || !id) continue;
      rects.push({ id, ...rect });
    }
  }
  return { done: Boolean(record.done), rects };
}

function bytesToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  const chunk = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunk) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk))));
  }
  return btoa(parts.join(""));
}

function toArrayBuffer(value: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
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
