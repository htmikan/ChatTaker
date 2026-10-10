/** Gemini site module: page script + Markdown pipeline. Do not import from ../chatgpt. */
import collectScript from "./page.txt";
import {
  buildNote,
  collectSources,
  expandMathInHtml,
  htmlToMarkdown,
  prepareMessages,
  replaceSourceLinksInHtml,
} from "./markdown";
import type { SiteModule } from "../types";

export const geminiSite: SiteModule = {
  collectScript,
  buildNote,
  htmlToMarkdown,
  prepareMessages,
  collectSources,
  replaceSourceLinksInHtml,
  expandMathInHtml,
};
