/**
 * Turn Gemini / ChatGPT place cards into Google Maps search links
 * (https://www.google.com/maps/search/?api=1&query=...).
 * Used as a Markdown post-process when the DOM had no real href.
 */

/** Build a Google Maps URLs API search link from a place name. */
export function mapsSearchUrl(query: string): string {
  const q = query.trim();
  if (!q) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** True when the URL is already a Maps search API link (should stay as a body link). */
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

/** Bold linked place name plus optional rating / category line. */
function placeLinkMarkdown(name: string, rating?: string, meta?: string): string {
  const url = mapsSearchUrl(name);
  const bits = [rating, meta].map((s) => String(s || "").replace(/\s+/g, " ").trim()).filter(Boolean);
  const metaLine = bits.join(" · ");
  return metaLine ? `**[${name}](${url})**\n\n${metaLine}` : `**[${name}](${url})**`;
}

/**
 * Detect place-card text patterns and convert store names to Maps links.
 * Handles Gemini ("stars rating" / side-panel chrome) and ChatGPT ("★ rating•category").
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

  // Gemini inline mention before the side-panel hint string
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

  // ChatGPT: pin rating glued before a bold name (map legend noise)
  result = result.replace(/★\s*\d(?:\.\d)?\s*(?=\*\*[^*\n]+\*\*\s*★)/g, "");

  // ChatGPT: **Name**★ 3.5•category (may be concatenated under the map image)
  result = result.replace(
    /\*\*([^*[\]\n]{2,80}?)\*\*\s*★\s*(\d(?:\.\d)?)\s*[·•]\s*([^\n★*]{0,80})/g,
    (all, rawName: string, rating: string, category: string) => {
      const name = String(rawName || "").trim();
      if (!name || /https?:\/\//i.test(name) || /\]\(https?:/i.test(name)) return all;
      remember(name);
      return `\n\n${placeLinkMarkdown(name, rating, category)}\n\n`;
    },
  );

  // ChatGPT: plain Name★ 3.5•category at line start
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
