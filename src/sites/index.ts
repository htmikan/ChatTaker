/**
 * Site registry: the only place that knows both site modules.
 * ChatGPT and Gemini each own their page script and Markdown pipeline under src/sites/<site>/.
 */
import type { ChatSite } from "../filename";
import { chatgptSite } from "./chatgpt";
import { geminiSite } from "./gemini";
import type { NoteInput, SiteModule } from "./types";

export type { NoteInput, SiteModule };

/** Resolve the module that handles a chat site. */
export function getSiteModule(site: ChatSite): SiteModule {
  return site === "gemini" ? geminiSite : chatgptSite;
}

/** Build a note with the module that matches `input.site`. */
export function buildNote(input: NoteInput): string | null {
  return getSiteModule(input.site ?? "chatgpt").buildNote(input);
}
