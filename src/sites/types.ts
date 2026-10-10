/**
 * Contract every per-site module (src/sites/<site>/index.ts) must satisfy.
 * The host (view.ts / pdf.ts) only talks to a site through this shape.
 */
import type { CollectedMessage, CollectedSource } from "../collect";
import type { ChatSite } from "../filename";
import type { MediaExtras } from "../media";

export interface NoteInput {
  site?: ChatSite;
  conversationId: string;
  source: string;
  messages: CollectedMessage[];
  savedAt?: Date;
  mediaPaths?: Map<string, string>;
  mediaExtras?: Map<string, MediaExtras>;
  sources?: CollectedSource[];
}

export interface SiteModule {
  /** Raw JS source injected into the site's webview (the page script). */
  collectScript: string;
  /** Build the final Markdown note, or null when there is nothing to save. */
  buildNote(this: void, input: NoteInput): string | null;
  /** Sanitized HTML → Markdown (Turndown pipeline). */
  htmlToMarkdown(this: void, html: string): string;
  /** Drop chrome-only messages and merge duplicates. */
  prepareMessages(this: void, messages: CollectedMessage[]): CollectedMessage[];
  /** Merge page-collected sources with URLs discovered in message HTML. */
  collectSources(this: void, base: CollectedSource[], messages: CollectedMessage[]): CollectedSource[];
  /** Replace source links with footnote markers for printable HTML. */
  replaceSourceLinksInHtml(this: void, html: string, sources: CollectedSource[]): string;
  /** Expand data-ct-math spans for printable HTML. */
  expandMathInHtml(this: void, html: string): string;
}
