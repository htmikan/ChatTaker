/** Gemini / ChatGPT の UI ラベルを本文から除く */

export function stripResponseLabelsHtml(html: string): string {
  return dedupeAdjacentParagraphs(
    html.replace(/<(p|h[1-6]|div|span|header)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (all, tag: string, _attrs: string, inner: string) => {
      const text = plainTextFromHtml(inner);
      if (isUiLabel(text)) return "";
      const cleaned = collapseDuplicatedPhrase(text.replace(/(?:あなたのプロンプト|Your prompt)\s*[:：]\s*/gi, "").trim());
      if (!cleaned) return "";
      if (cleaned !== text) return `<${tag}>${escapeHtmlText(cleaned)}</${tag}>`;
      return all;
    }),
  );
}

export function stripPromptFromMarkdown(markdown: string): string {
  const lines = markdown.split(/\r?\n/).flatMap((line) => {
    const cleaned = collapseDuplicatedPhrase(
      line.replace(/(?:あなたのプロンプト|Your prompt)\s*[:：]\s*/gi, "").replace(/^(?:\s*(?:あなたのプロンプト|Your prompt))\s*$/i, ""),
    );
    if (/^(?:\s*>)?\s*(?:あなたのプロンプト|Your prompt)\s*[:：]?\s*$/i.test(cleaned)) return [];
    return [cleaned];
  });
  return dedupeAdjacentParagraphs(lines.join("\n")).trim();
}

function isUiLabel(text: string): boolean {
  return /^(chatgpt|gemini)\s*(の回答|の返答)$/i.test(text) || /^(あなたのプロンプト|your prompt)\s*[:：]?$/i.test(text);
}

function collapseDuplicatedPhrase(text: string): string {
  const value = text.replace(/\s+/g, " ").trim();
  const spaced = /^(.+?)(?:[\s\u3000]+)(?:[:：]\s*)?\1$/.exec(value);
  if (spaced) return spaced[1].trim();
  return text.trim();
}

function dedupeAdjacentParagraphs(html: string): string {
  const parts = html.match(/<p\b[^>]*>[\s\S]*?<\/p>|<[^>]+>|[^<]+/gi) || [];
  const out: string[] = [];
  let prevText = "";
  for (const part of parts) {
    const text = part.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    if (/^<p\b/i.test(part) && text && text === prevText) continue;
    if (!part.startsWith("<") && text && text === prevText) continue;
    if (text) prevText = text;
    out.push(part);
  }
  return out.join("").trim();
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

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
