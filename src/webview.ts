/**
 * Helpers for Electron <webview> tags inside Obsidian.
 * createEl's typings only allow standard HTML tags, so we call it through a
 * narrow wrapper that accepts "webview".
 */

type WebviewCreateOptions = {
  cls?: string;
  attr?: Record<string, string | number | boolean | null | undefined>;
};

/**
 * Create an Electron <webview> with Obsidian's createEl helper
 * (satisfies prefer-create-el; tag is not in HTMLElementTagNameMap).
 */
export function createWebviewEl(parent: HTMLElement, options: WebviewCreateOptions = {}): HTMLElement {
  const createEl = parent.createEl.bind(parent) as (
    tag: string,
    o?: WebviewCreateOptions,
  ) => HTMLElement;
  return createEl("webview", options);
}
