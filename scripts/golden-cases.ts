/**
 * Golden inputs for the Markdown / print pipeline.
 * The expected outputs live in scripts/golden/golden.json and were captured from the
 * pre-split build, so any site-specific refactor must keep them byte-identical.
 */
import type { CollectedMessage, CollectedSource } from "../src/collect";
import type { ChatSite } from "../src/filename";

export interface GoldenCase {
  name: string;
  site: ChatSite;
  messages: CollectedMessage[];
  sources?: CollectedSource[];
  mediaPaths?: Record<string, string>;
  mediaExtras?: Record<string, { htmlPath?: string; sourceUrl?: string }>;
}

export interface GoldenBuilders {
  buildNote: (input: {
    site: ChatSite;
    conversationId: string;
    source: string;
    messages: CollectedMessage[];
    savedAt?: Date;
    mediaPaths?: Map<string, string>;
    mediaExtras?: Map<string, { htmlPath?: string; sourceUrl?: string }>;
    sources?: CollectedSource[];
  }) => string | null;
  buildPrintHtml: (input: {
    site: ChatSite;
    source: string;
    title?: string;
    messages: CollectedMessage[];
    mediaDataUrls?: Map<string, string>;
    savedAt?: Date;
    sources?: CollectedSource[];
  }) => string | null;
}

export const GOLDEN_SAVED_AT = new Date(2026, 9, 10, 9, 0, 0);

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: "chatgpt-table-buttons-cite",
    site: "chatgpt",
    messages: [
      { role: "user", html: "<p>新横浜からひたちなか海浜公園への行き方は？</p>" },
      {
        role: "assistant",
        html:
          "<h2>所要時間の目安</h2>" +
          "<table><thead><tr><th><p>項目</p></th><th><div>目安</div></th></tr></thead>" +
          "<tbody><tr><td><div><p>片道の所要時間</p></div></td><td><p>約2時間30分</p></td></tr>" +
          "<tr><td><p>費用</p></td><td><div><p>約<strong>4,000円</strong></p></div></td></tr></tbody></table>" +
          "<p>朝早く（6時ごろ）</p><p>朝（7時ごろ）</p><p>昼（10時ごろ）</p>" +
          '<p>公式に案内があります<a href="https://www.hitachikaihin.jp/access/train-bus.html">電車・バスでのアクセス</a>' +
          '<span data-ct-cite-name="国営ひたち海浜公園"></span>。</p>' +
          '<p>詳しくは<a href="https://www.ibako.co.jp/highway/">茨城交通 高速バス案内</a>を確認してください。</p>',
      },
    ],
  },
  {
    name: "chatgpt-media-places-math-code",
    site: "chatgpt",
    messages: [
      { role: "user", html: "<p>あなたのプロンプト: 近くの店と式とコードを教えて</p>" },
      {
        role: "assistant",
        html:
          '<p>前文です</p><img data-ct-media="m1" alt=""><p>後文です</p><img data-ct-media="m2" alt="map">' +
          '<p><strong><a data-ct-keep-link="1" href="https://www.google.com/maps/search/?api=1&amp;query=%E8%A5%BF%E6%9D%BE%E5%B1%8B">西松屋</a></strong><br>3.5 · 子供服店</p>' +
          '<p>式は <span data-ct-math="inline">E=mc^2</span> です。</p>' +
          '<pre class="language-ts"><code class="language-ts">const a = 1;\nconsole.log(a);</code></pre>' +
          "<ul><li><p>一つ目</p></li><li><p>二つ目</p><ul><li>入れ子</li></ul></li></ul>",
        media: [
          { id: "m1", kind: "image", src: "https://example.com/a.png" },
          { id: "m2", kind: "map", sourceUrl: "https://www.google.com/maps/@35.0,139.0,12z" },
        ],
      },
    ],
    mediaPaths: { m1: "Chats/attachments/g_01.png", m2: "Chats/attachments/g_02.png" },
    mediaExtras: { m2: { htmlPath: "Chats/attachments/g_02.html", sourceUrl: "https://www.google.com/maps/@35.0,139.0,12z" } },
  },
  {
    name: "chatgpt-bare-cite-chips-sources",
    site: "chatgpt",
    messages: [
      { role: "user", html: "<p>Webull のデモ口座は？</p>" },
      {
        role: "assistant",
        html:
          "<p>デモ取引が使えます。WWebull+1</p><p>さらに連携もあります。<span data-ct-cite-name=\"Tasmota\"></span></p>" +
          '<p>参考: <a href="https://tasmota.github.io/docs/">Tasmota docs</a></p>' +
          "<p>https://example.com/plain-url を参照。</p>",
      },
    ],
    sources: [
      { url: "https://www.webull.co.jp/", title: "Webull" },
      { url: "https://tasmota.github.io/docs/", title: "Tasmota" },
    ],
  },
  {
    name: "gemini-places-sources",
    site: "gemini",
    messages: [
      { role: "user", html: "<p>あなたのプロンプト</p><p>新宿の蕎麦屋は？</p>" },
      {
        role: "assistant",
        html:
          "<p>おすすめです。</p><p>藪そば3.7 stars rating3.7 📍 Open · Closes 9 PM</p>" +
          "<p>藪そばクリックするとサイドパネルが開き、詳細が表示されます</p>" +
          '<p>根拠は<a href="https://example.com/x#:~:text=foo">公式ページ</a>です。<span data-ct-cite-name="example.com"></span></p>' +
          '<a href="https://example.com/y">別の出典</a>',
      },
    ],
  },
  {
    name: "gemini-media",
    site: "gemini",
    messages: [
      { role: "user", html: "<p>画像を見せて</p>" },
      {
        role: "assistant",
        html: '<p>こちらです</p><img data-ct-media="m1" alt=""><p>以上です</p>',
        media: [{ id: "m1", kind: "image", src: "https://example.com/g.png" }],
      },
    ],
    mediaPaths: { m1: "Chats/attachments/h_01.png" },
  },
];

/** Render a case through the supplied builders (pure; no I/O). */
export function runGoldenCase(
  item: GoldenCase,
  builders: GoldenBuilders,
): { note: string | null; print: string | null } {
  const note = builders.buildNote({
    site: item.site,
    conversationId: `golden-${item.name}`,
    source: `https://example.com/golden/${item.name}`,
    messages: item.messages.map((m) => ({ ...m })),
    savedAt: GOLDEN_SAVED_AT,
    mediaPaths: new Map(Object.entries(item.mediaPaths ?? {})),
    mediaExtras: new Map(Object.entries(item.mediaExtras ?? {})),
    sources: item.sources ? item.sources.map((s) => ({ ...s })) : undefined,
  });
  const dataUrls = new Map<string, string>();
  for (const id of Object.keys(item.mediaPaths ?? {})) dataUrls.set(id, "data:image/png;base64,AAAA");
  const print = builders.buildPrintHtml({
    site: item.site,
    source: `https://example.com/golden/${item.name}`,
    title: `golden ${item.name}`,
    messages: item.messages.map((m) => ({ ...m })),
    mediaDataUrls: dataUrls,
    savedAt: GOLDEN_SAVED_AT,
    sources: item.sources ? item.sources.map((s) => ({ ...s })) : undefined,
  });
  return { note, print };
}
