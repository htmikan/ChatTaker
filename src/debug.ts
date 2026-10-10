/**
 * Optional citation-debug sidecar (*.debug.json) written next to a saved note
 * when Settings → Citation debug is enabled.
 */
import type { Vault } from "obsidian";
import type { CollectedChat, CitationDebugDump, CitationDebugRecord } from "./collect";
import type { ChatSite } from "./filename";
import type { SaveFormat } from "./settings";

export type { CitationDebugDump };

/** Aggregate page-script citation records with footnote stats from the note. */
export function buildCitationDebugDump(input: {
  site: ChatSite;
  format: SaveFormat;
  savedAt: Date;
  data: CollectedChat;
  noteMarkdown?: string | null;
}): CitationDebugDump {
  const pageDebug = input.data.debug;
  const citations: CitationDebugRecord[] = Array.isArray(pageDebug?.citations) ? pageDebug.citations : [];
  const sources = input.data.sources ?? [];
  const messages = input.data.items
    .filter((item) => item.role !== "user")
    .map((item, index) => ({
      index,
      role: item.role,
      linkHtml: extractLinkFragments(item.html),
      anchorCount: countMatches(item.html, /<a\b/gi),
      citeNameCount: countMatches(item.html, /data-ct-cite-name=/gi),
    }));

  const note = input.noteMarkdown || "";
  const footnoteMarkers = countMatches(note, /\[\^\d+\]/g);
  const footnoteDefs = countMatches(note, /\[\^\d+\]:/g);

  return {
    meta: {
      site: input.site,
      url: input.data.url,
      savedAt: input.savedAt.toISOString(),
      format: input.format,
    },
    summary: {
      sources: sources.length,
      citations: citations.length,
      anchorsInHtml: messages.reduce((sum, m) => sum + m.anchorCount, 0),
      citeNamesInHtml: messages.reduce((sum, m) => sum + m.citeNameCount, 0),
      footnoteMarkers,
      footnoteDefs,
      ...(pageDebug?.summary || {}),
    },
    sources,
    citations,
    messages,
    media: input.data.items.flatMap((item) =>
      (item.media ?? []).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        src: entry.src ? entry.src.slice(0, 180) : undefined,
        hasBytes: Boolean(entry.base64),
        ordinal: entry.ordinal,
      })),
    ),
    footnotes: {
      markerCount: footnoteMarkers,
      definitionCount: footnoteDefs,
      definitions: extractFootnoteDefs(note),
    },
  };
}

/** Create or overwrite folder/basename.debug.json in the vault. */
export async function writeCitationDebugDump(
  vault: Vault,
  folder: string,
  basename: string,
  dump: CitationDebugDump,
): Promise<string> {
  const path = `${folder}/${basename}.debug.json`;
  const body = `${JSON.stringify(dump, null, 2)}\n`;
  const existing = vault.getAbstractFileByPath(path);
  if (existing) await vault.modify(existing as never, body);
  else await vault.create(path, body);
  return path;
}

function extractLinkFragments(html: string): string {
  const parts: string[] = [];
  html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, (all) => {
    if (parts.length < 30) parts.push(clip(all, 400));
    return all;
  });
  html.replace(/<span\b[^>]*data-ct-cite-name=(["'])[\s\S]*?\1[^>]*>[\s\S]*?<\/span>/gi, (all) => {
    if (parts.length < 30) parts.push(clip(all, 400));
    return all;
  });
  html.replace(/<span\b[^>]*data-ct-fn=(["'])\d+\1[^>]*>[\s\S]*?<\/span>/gi, (all) => {
    if (parts.length < 30) parts.push(clip(all, 200));
    return all;
  });
  return parts.join("\n");
}

function extractFootnoteDefs(markdown: string): string[] {
  const lines: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\[\^\d+\]:/.test(line) && lines.length < 50) lines.push(clip(line, 300));
  }
  return lines;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) || []).length;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
