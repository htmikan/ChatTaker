import collectScript from "./collect-page.txt";

export { collectScript };

export type CollectedMediaKind = "image" | "capture" | "map";

export interface MapState {
  lat?: number;
  lng?: number;
  zoom?: number;
  query?: string;
}

export interface CollectedMedia {
  id: string;
  kind: CollectedMediaKind;
  src?: string;
  sourceUrl?: string;
  mapState?: MapState;
}

export interface CollectedSource {
  title: string;
  url: string;
}

export interface CitationDebugRecord {
  tag: string;
  className: string;
  ariaLabel: string;
  attrs: {
    href?: string;
    dataHref?: string;
    dataUrl?: string;
    hasJslog: boolean;
    jslogPreview?: string;
  };
  resolvedHref: string;
  jslogUrls: string[];
  noiseFiltered: string[];
  output: string;
  outcome: "anchor" | "cite-name" | "jslog-multi" | "inner-anchor" | "empty" | string;
  outerHtml?: string;
}

export interface CitationDebugDump {
  meta: {
    site: string;
    url: string;
    savedAt: string;
    format: string;
  };
  summary: Record<string, number>;
  sources: CollectedSource[];
  citations: CitationDebugRecord[];
  messages: Array<{
    index: number;
    role: string;
    linkHtml: string;
    anchorCount: number;
    citeNameCount: number;
  }>;
  footnotes: {
    markerCount: number;
    definitionCount: number;
    definitions: string[];
  };
}

export interface CollectedMessage {
  role: string;
  html: string;
  media?: CollectedMedia[];
}

export interface CollectedChat {
  session: number;
  url: string;
  title: string;
  streaming: boolean;
  scanning: boolean;
  items: CollectedMessage[];
  sources?: CollectedSource[];
  debug?: {
    citations?: CitationDebugRecord[];
    summary?: Record<string, number>;
  };
}

export function asCollectedChat(value: unknown): CollectedChat | null {
  const parsed = typeof value === "string" ? parseJson(value) : value;
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Partial<CollectedChat>;
  const session = typeof record.session === "number" ? record.session : Number(record.session);
  if (!Number.isFinite(session) || typeof record.url !== "string" || !Array.isArray(record.items)) return null;
  const items: CollectedMessage[] = [];
  for (const item of record.items) {
    if (!item || typeof item !== "object") return null;
    const message = item as Partial<CollectedMessage>;
    if (typeof message.role !== "string" || typeof message.html !== "string") return null;
    items.push({
      role: message.role,
      html: message.html,
      media: asMediaList(message.media),
    });
  }
  return {
    session,
    url: record.url,
    title: typeof record.title === "string" ? record.title : "ChatGPT",
    streaming: Boolean(record.streaming),
    scanning: Boolean(record.scanning),
    items,
    sources: asSourceList(record.sources),
    debug: asDebugPayload(record.debug),
  };
}

function asMediaList(value: unknown): CollectedMedia[] {
  if (!Array.isArray(value)) return [];
  const media: CollectedMedia[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<CollectedMedia>;
    if (typeof record.id !== "string" || !record.id) continue;
    const kind =
      record.kind === "capture" ? "capture" : record.kind === "image" ? "image" : record.kind === "map" ? "map" : null;
    if (!kind) continue;
    media.push({
      id: record.id,
      kind,
      src: typeof record.src === "string" ? record.src : undefined,
      sourceUrl:
        typeof record.sourceUrl === "string" && record.sourceUrl.trim() ? record.sourceUrl.trim() : undefined,
      mapState: asMapState(record.mapState),
    });
  }
  return media;
}

function asMapState(value: unknown): MapState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as MapState;
  const state: MapState = {};
  if (typeof record.lat === "number" && Number.isFinite(record.lat)) state.lat = record.lat;
  if (typeof record.lng === "number" && Number.isFinite(record.lng)) state.lng = record.lng;
  if (typeof record.zoom === "number" && Number.isFinite(record.zoom)) state.zoom = record.zoom;
  if (typeof record.query === "string" && record.query.trim()) state.query = record.query.trim();
  return Object.keys(state).length ? state : undefined;
}

function asSourceList(value: unknown): CollectedSource[] {
  if (!Array.isArray(value)) return [];
  const sources: CollectedSource[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Partial<CollectedSource>;
    if (typeof record.url !== "string" || !/^https?:\/\//i.test(record.url)) continue;
    if (seen.has(record.url)) continue;
    seen.add(record.url);
    sources.push({
      url: record.url,
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : record.url,
    });
  }
  return sources;
}

function asDebugPayload(value: unknown): CollectedChat["debug"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as { citations?: unknown; summary?: unknown };
  const citations: CitationDebugRecord[] = [];
  if (Array.isArray(record.citations)) {
    for (const item of record.citations) {
      if (!item || typeof item !== "object") continue;
      const c = item as Partial<CitationDebugRecord>;
      citations.push({
        tag: typeof c.tag === "string" ? c.tag : "",
        className: typeof c.className === "string" ? c.className : "",
        ariaLabel: typeof c.ariaLabel === "string" ? c.ariaLabel : "",
        attrs:
          c.attrs && typeof c.attrs === "object"
            ? {
                href: typeof c.attrs.href === "string" ? c.attrs.href : undefined,
                dataHref: typeof c.attrs.dataHref === "string" ? c.attrs.dataHref : undefined,
                dataUrl: typeof c.attrs.dataUrl === "string" ? c.attrs.dataUrl : undefined,
                hasJslog: Boolean(c.attrs.hasJslog),
                jslogPreview: typeof c.attrs.jslogPreview === "string" ? c.attrs.jslogPreview : undefined,
              }
            : { hasJslog: false },
        resolvedHref: typeof c.resolvedHref === "string" ? c.resolvedHref : "",
        jslogUrls: Array.isArray(c.jslogUrls) ? c.jslogUrls.filter((u): u is string => typeof u === "string") : [],
        noiseFiltered: Array.isArray(c.noiseFiltered)
          ? c.noiseFiltered.filter((u): u is string => typeof u === "string")
          : [],
        output: typeof c.output === "string" ? c.output : "",
        outcome: typeof c.outcome === "string" ? c.outcome : "empty",
        outerHtml: typeof c.outerHtml === "string" ? c.outerHtml : undefined,
      });
    }
  }
  const summary: Record<string, number> = {};
  if (record.summary && typeof record.summary === "object") {
    for (const [key, num] of Object.entries(record.summary as Record<string, unknown>)) {
      if (typeof num === "number" && Number.isFinite(num)) summary[key] = num;
    }
  }
  return { citations, summary };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
