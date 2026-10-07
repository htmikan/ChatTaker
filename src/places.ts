/** Google Maps URLs API（検索）— 店舗名からマップを開く */
export function mapsSearchUrl(query: string): string {
  const q = query.trim();
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function isMapsSearchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      /google\./i.test(parsed.hostname) &&
      /^\/maps\/search\/?$/i.test(parsed.pathname) &&
      parsed.searchParams.get("api") === "1" &&
      Boolean(parsed.searchParams.get("query"))
    );
  } catch {
    return false;
  }
}

function placeLinkMarkdown(name: string, rating?: string, meta?: string): string {
  const url = mapsSearchUrl(name);
  const bits = [rating, meta].map((s) => String(s || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const metaLine = bits.join(" · ");
  return metaLine ? `**[${name}](${url})**\n\n${metaLine}` : `**[${name}](${url})**`;
}

/**
 * Gemini / ChatGPT の店舗カードを検出し、店名を Maps 検索リンクにする。
 * DOM で取りこぼしたプレーンテキスト向けの後処理。
 */
export function enhancePlaceLinks(markdown: string): string {
  if (!markdown) return markdown;
  const names: string[] = [];
  const remember = (name: string) => {
    if (name && !names.includes(name)) names.push(name);
  };

  let result = markdown
    .replace(/地図データは現在利用不可です/g, "")
    .replace(/Map data (?:is )?currently unavailable\.?/gi, "");

  // Gemini: Name3.7 stars rating3.7 📍 …
  result = result.replace(
    /(^|\n)([^\n[\]*]{2,80}?)(\d(?:\.\d)?)\s*stars?\s*rating\3?\b([^\n]*)/gi,
    (all, lead: string, rawName: string, rating: string, rest: string) => {
      const name = String(rawName || "").trim();
      if (!name || name.length < 2 || /https?:\/\//i.test(name)) return all;
      remember(name);
      const meta = String(rest || "")
        .replace(/^\s*[·•|]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
      return `${lead}${placeLinkMarkdown(name, rating, meta)}`;
    },
  );

  result = result.replace(
    /([^\n[\]]{2,80}?)クリックするとサイドパネルが開き、詳細が表示されます/g,
    (_all, prefix: string) => {
      const before = String(prefix || "").trim();
      let matched = "";
      for (const name of names) {
        if (before.endsWith(name) && name.length > matched.length) matched = name;
      }
      if (!matched) return before;
      const head = before.slice(0, before.length - matched.length);
      return `${head}**[${matched}](${mapsSearchUrl(matched)})**`;
    },
  );

  // ChatGPT: 地図ピン由来の先頭評価 ★3.5**店名**…
  result = result.replace(/★\s*\d(?:\.\d)?\s*(?=\*\*[^*\n]+\*\*\s*★)/g, "");

  // ChatGPT: **店名**★ 3.5•カテゴリ / **店名**★ 3.5 · カテゴリ（地図下で連結される場合あり）
  result = result.replace(
    /\*\*([^*[\]\n]{2,80}?)\*\*\s*★\s*(\d(?:\.\d)?)\s*[·•]\s*([^\n★*]{0,80})/g,
    (all, rawName: string, rating: string, category: string) => {
      const name = String(rawName || "").trim();
      if (!name || /https?:\/\//i.test(name) || /\]\(https?:/i.test(name)) return all;
      remember(name);
      return `\n\n${placeLinkMarkdown(name, rating, category)}\n\n`;
    },
  );

  // ChatGPT: 太字なし 店名★ 3.5•カテゴリ（行頭）
  result = result.replace(
    /(^|\n)([^\n[\]*]{2,80}?)\s*★\s*(\d(?:\.\d)?)\s*[·•]\s*([^\n★]{0,80})/g,
    (all, lead: string, rawName: string, rating: string, category: string) => {
      const name = String(rawName || "").trim();
      if (!name || name.length < 2 || /https?:\/\//i.test(name) || /\]\(/.test(name)) return all;
      remember(name);
      return `${lead}${placeLinkMarkdown(name, rating, category)}`;
    },
  );

  result = result
    .replace(/クリックするとサイドパネルが開き、詳細が表示されます/g, "")
    .replace(/Opens? (?:in )?a side panel[^.。\n]*/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");

  return result.trim();
}
