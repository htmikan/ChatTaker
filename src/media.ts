import type { App } from "obsidian";
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
}

export interface MediaExtras {
  htmlPath?: string;
  sourceUrl?: string;
}

export interface MediaSaveResult {
  paths: Map<string, string>;
  extras: Map<string, MediaExtras>;
  saved: number;
  failed: number;
}

export interface MediaDataResult {
  dataUrls: Map<string, string>;
  saved: number;
  failed: number;
}

export async function saveCollectedMedia(
  app: App,
  webview: MediaWebview,
  chat: CollectedChat,
  attachmentFolder: string,
  noteBasename: string,
): Promise<MediaSaveResult> {
  const paths = new Map<string, string>();
  const extras = new Map<string, MediaExtras>();
  let saved = 0;
  let failed = 0;
  let index = 0;

  for (const message of chat.items) {
    for (const media of message.media ?? []) {
      if (paths.has(media.id)) continue;
      index += 1;
      try {
        const binary = await loadMediaBinary(webview, media);
        if (!binary) {
          failed += 1;
          continue;
        }
        await ensureFolder(app, attachmentFolder);
        const filename = `${noteBasename}_${String(index).padStart(2, "0")}.${binary.ext}`;
        const path = uniquePath(app, attachmentFolder, filename);
        await app.vault.createBinary(path, binary.data);
        paths.set(media.id, path);
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

  return { paths, extras, saved, failed };
}

export async function loadCollectedMediaData(
  webview: MediaWebview,
  chat: CollectedChat,
): Promise<MediaDataResult> {
  const dataUrls = new Map<string, string>();
  let saved = 0;
  let failed = 0;

  for (const message of chat.items) {
    for (const media of message.media ?? []) {
      if (dataUrls.has(media.id)) continue;
      try {
        const binary = await loadMediaBinary(webview, media);
        if (!binary) {
          failed += 1;
          continue;
        }
        dataUrls.set(media.id, arrayBufferToDataUrl(binary.data, binary.mime));
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
    console.info("[ChatTaker] map HTML skipped (insufficient info), PNG only", media.id);
    return Object.keys(extras).length ? extras : null;
  }
  try {
    const html = buildMapHtml(media);
    if (!html) {
      console.info("[ChatTaker] map HTML skipped (build failed), PNG only", media.id);
      return Object.keys(extras).length ? extras : null;
    }
    const htmlName = pngPath.replace(/\.png$/i, ".html").split("/").pop()!;
    const htmlPath = uniquePath(app, attachmentFolder, htmlName);
    const data = new TextEncoder().encode(html).buffer;
    await app.vault.createBinary(htmlPath, data);
    extras.htmlPath = htmlPath;
    console.info("[ChatTaker] map HTML saved", htmlPath);
    return extras;
  } catch (error) {
    console.info("[ChatTaker] map HTML failed, PNG only", media.id, error);
    return Object.keys(extras).length ? extras : null;
  }
}

async function loadMediaBinary(webview: MediaWebview, media: CollectedMedia): Promise<MediaBinary | null> {
  if (media.kind === "capture" || media.kind === "map") return captureMedia(webview, media.id);
  return fetchMedia(webview, media);
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
  const image = await webview.capturePage(rect);
  if (!image || image.isEmpty()) return null;
  const png = image.toPNG();
  const data = toArrayBuffer(png);
  if (!data.byteLength) return null;
  return { data, ext: "png", mime: "image/png" };
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
