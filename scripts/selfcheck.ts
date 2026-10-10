/**
 * Offline regression checks run by `npm run check` (via scripts/selfcheck.mjs).
 * - runs the shared suite (scripts/suite.ts) once per site module
 * - checks each site's page script contract and site-specific markers
 * - compares Markdown / print output with scripts/golden/golden.json
 * - enforces that the two site folders do not import each other
 * Not shipped inside the Obsidian plugin bundle.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPrintHtml } from "../src/pdf";
import { buildNote, getSiteModule } from "../src/sites";
import { chatgptSite } from "../src/sites/chatgpt";
import { formatSourcesMarkdown as chatgptFormatSources } from "../src/sites/chatgpt/markdown";
import { enhancePlaceLinks as chatgptPlaces, mapsSearchUrl as chatgptMapsUrl } from "../src/sites/chatgpt/places";
import { geminiSite } from "../src/sites/gemini";
import { formatSourcesMarkdown as geminiFormatSources } from "../src/sites/gemini/markdown";
import { enhancePlaceLinks as geminiPlaces, mapsSearchUrl as geminiMapsUrl } from "../src/sites/gemini/places";
import { setLanguage } from "../src/i18n";
import { GOLDEN_CASES, runGoldenCase } from "./golden-cases";
import { runSuite } from "./suite";

// --- shared suite, once per site module -------------------------------------------------------
runSuite({
  ...chatgptSite,
  formatSourcesMarkdown: chatgptFormatSources,
  enhancePlaceLinks: chatgptPlaces,
  mapsSearchUrl: chatgptMapsUrl,
});
runSuite({
  ...geminiSite,
  formatSourcesMarkdown: geminiFormatSources,
  enhancePlaceLinks: geminiPlaces,
  mapsSearchUrl: geminiMapsUrl,
});

// --- page script contract (host <-> page; identical names for both sites) ---------------------
const PAGE_CONTRACT = [
  "__ctSave",
  "__ctExport",
  "__ctReset",
  "__ctBeginSave",
  "__ctSaveStep",
  "__ctFinishSave",
  "__ctStoreMediaPng",
  "__ctMaterializeMedia",
  "__ctFocusMedia",
  "__ctFetchImage",
];
const PAGE_COMMON = [
  "FAKE_DOMAIN_EXTS",
  "isCodeLikeNode",
  "isUrlCardReference",
  "data-ct-keep-link",
  "mapsSearchUrl",
  "isPlaceCardRoot",
  "#:~:",
  "parseAssistantSourcesPayload",
  "data-assistant-sources-payload",
  "からの引用",
];
/** Markers that must exist only in one site's page script. */
const PAGE_ONLY: Record<"chatgpt" | "gemini", string[]> = {
  chatgpt: ["installChatGPT", "warmCitationPopovers", "expandChatgptCitationPills", "data-d-component", "popoverHref", "isPaidAdUrl", "clearOverlaysFor", "overlayBlockers", "__ctRestoreCapture", "citationChipHtml", "normalizePopoverLinks", "popover-inline"],
  gemini: ["installGemini", "decodeJslogUrls", "jslogUrlsDeep", "BardVeMetadataKey", "USER-QUERY", "model-response"],
};
for (const [name, other, script] of [
  ["chatgpt", "gemini", chatgptSite.collectScript],
  ["gemini", "chatgpt", geminiSite.collectScript],
] as const) {
  new Function(script);
  for (const key of PAGE_CONTRACT) assert.ok(script.includes(`window.${key} =`), `${name} page script lacks window.${key}`);
  for (const key of PAGE_COMMON) assert.ok(script.includes(key), `${name} page script lacks ${key}`);
  for (const key of PAGE_ONLY[name]) assert.ok(script.includes(key), `${name} page script lacks ${key}`);
  for (const key of PAGE_ONLY[other]) assert.equal(script.includes(key), false, `${name} page script still contains ${other}-only ${key}`);
}
assert.match(chatgptSite.collectScript, /\ninstallChatGPT\(\);|\n {2}installChatGPT\(\);/);
assert.match(geminiSite.collectScript, /\n {2}installGemini\(\);/);
assert.equal(chatgptSite.collectScript.includes("gemini.google') >= 0) installGemini"), false);
assert.equal(geminiSite.collectScript.includes("gemini.google') >= 0) installGemini"), false);

// --- site routing -----------------------------------------------------------------------------
assert.equal(getSiteModule("chatgpt"), chatgptSite);
assert.equal(getSiteModule("gemini"), geminiSite);

// --- golden output ----------------------------------------------------------------------------
setLanguage("en");
const golden = JSON.parse(fs.readFileSync(path.resolve("scripts", "golden", "golden.json"), "utf8")) as Record<
  string,
  { note: string | null; print: string | null }
>;
for (const item of GOLDEN_CASES) {
  const expected = golden[item.name];
  assert.ok(expected, `golden missing for ${item.name}`);
  const actual = runGoldenCase(item, { buildNote, buildPrintHtml });
  assert.equal(actual.note, expected.note, `golden note mismatch: ${item.name}`);
  assert.equal(actual.print, expected.print, `golden print mismatch: ${item.name}`);
}
assert.equal(Object.keys(golden).length, GOLDEN_CASES.length, "golden.json has stale cases");

// --- ChatGPT sponsored ads are omitted; a chat with no ad is unchanged (golden above) ---------
const adAnswer =
  '<img data-ct-media="shot" alt="">' +
  "<p>本文です</p>" +
  '<img data-ct-media="adpic" alt="">' +
  '<a href="https://www.fintokei.com/jp/?utm_medium=paid&amp;utm_source=chatgpt">Fintokei a.s. デモ環境でトレードスキルを評価 仮想資金で学ぶ</a>' +
  "<p>広告</p>" +
  "<h2>この広告について</h2>" +
  "<p>この広告を非表示にする</p>" +
  "<p>この広告を報告する</p>" +
  "<h3>スポンサー：</h3>" +
  '<ul><li><img data-ct-media="logo" alt="">Fintokei a.s.</li></ul>' +
  "<h3>この広告が表示されている理由</h3>" +
  "<p>この広告は、広告配信に使用される限定的なデータに基づいて表示されています。</p>" +
  "<h3>広告主と共有される情報</h3>" +
  "<p>統計のみ</p>" +
  "<h3>データは非公開のままになります</h3>" +
  "<p>チャットと個人情報のいずれも広告主と共有されていません。</p>" +
  "<h2>この広告を報告する</h2>" +
  '<a href="https://developer.webull.com/apis/docs/AI-friendly-Resources/mcp/">Webull</a>';
const adNote = buildNote({
  site: "chatgpt",
  conversationId: "ad",
  source: "https://chatgpt.com/c/ad",
  savedAt: new Date(2026, 9, 10, 9, 0, 0),
  sources: [
    {
      url: "https://www.fintokei.com/jp/?utm_source=chatgpt&utm_medium=paid&utm_campaign=x",
      title: "Fintokei a.s. デモ環境でトレードスキルを評価 本文",
    },
    { url: "https://developer.webull.com/apis/docs/AI-friendly-Resources/mcp/", title: "Webull" },
  ],
  messages: [
    { role: "user", html: "<p>質問です</p>" },
    {
      role: "assistant",
      html: adAnswer,
      media: [
        { id: "ad1", kind: "image" },
        { id: "shot", kind: "image" },
        { id: "logo", kind: "image" },
      ],
    },
    {
      role: "assistant",
      html: adAnswer.replace("Fintokei a.s.", "Speakeasy Development, Inc."),
      media: [
        { id: "ad1", kind: "image" },
        { id: "shot", kind: "image" },
        { id: "logo", kind: "image" },
      ],
    },
  ],
  mediaPaths: new Map([
    ["ad1", "Chats/attachments/ad1.png"],
    ["shot", "Chats/attachments/shot.png"],
    ["logo", "Chats/attachments/logo.png"],
  ]),
});
assert.ok(adNote);
// "ad1" is listed in media but has no placeholder in the HTML (page already dropped the ad picture)
for (const phrase of ["この広告について", "スポンサー", "Fintokei", "Speakeasy", "utm_medium=paid", "ad1.png", "logo.png", "adpic", "広告"]) {
  assert.equal(adNote.includes(phrase), false, `ad note still contains ${phrase}`);
}
assert.ok(adNote.includes("shot.png"));
assert.ok(adNote.includes("本文です"));
assert.ok(adNote.includes("Webull"));
assert.equal(adNote.split("本文です").length - 1, 1);

// oppref/olref ads whose "この広告について" heading was already removed by the page script
const leftoverAd =
  "<p>年初から10月8日までの株価変動は、CVXは約+3.8%、MRKは約+2.3%でした。S&amp;P Dow Jones Indices+1</p>" +
  '<a href="https://sb.emmastyle.tokyo/ab/x?utm_creative=G07&amp;oppref=abc&amp;olref=def">Acoco. Co., Ltd. ちなみにプロは株価だけでは判断しません</a>' +
  "<p>広告</p>" +
  "<h2>この広告を報告する</h2>" +
  '<img data-ct-media="adlogo" alt="">' +
  '<a href="https://www.dogsofthedow.com/dogday.htm">Dogs of the Dow 2026</a>';
const leftoverNote = buildNote({
  site: "chatgpt",
  conversationId: "ad2",
  source: "https://chatgpt.com/c/ad2",
  sources: [{ url: "https://www.nikkei.com/promotion/?n_cid=X&oppref=zzz&olref=yyy", title: "日経ヴェリタス" }],
  messages: [
    { role: "user", html: "<p>質問です</p>" },
    { role: "assistant", html: leftoverAd, media: [{ id: "adlogo", kind: "image" }] },
  ],
  mediaPaths: new Map([["adlogo", "Chats/attachments/adlogo.png"]]),
});
assert.ok(leftoverNote);
for (const phrase of ["Acoco", "広告", "日経", "oppref", "adlogo"]) {
  assert.equal(leftoverNote.includes(phrase), false, `leftover ad note still contains ${phrase}`);
}
assert.ok(leftoverNote.includes("CVXは約+3.8%、MRKは約+2.3%"), "percentages must not become footnotes");

// Same host with different paths stays as separate footnotes. A domain chip uses the one full URL.
const pathNote = buildNote({
  site: "chatgpt",
  conversationId: "paths",
  source: "https://chatgpt.com/c/paths",
  sources: [{ url: "https://dividendhistory.net/dogs-of-the-dow", title: "Dogs of the Dow" }],
  messages: [
    {
      role: "assistant",
      html:
        '<p>一覧は<span data-ct-cite-name="dividendhistory.net"></span>。</p>' +
        '<p><a href="https://dividendhistory.net/dogs-of-the-dow">Dogs of the Dow</a>' +
        '<a href="https://dividendhistory.net/yield">Yield</a></p>',
    },
  ],
});
assert.ok(pathNote);
assert.ok(pathNote.includes("https://dividendhistory.net/dogs-of-the-dow"));
assert.ok(pathNote.includes("https://dividendhistory.net/yield"));
assert.equal(/\(\s*https:\/\/dividendhistory\.net\/?\s*\)/.test(pathNote), false);
const onePath = buildNote({
  site: "chatgpt",
  conversationId: "one-path",
  source: "https://chatgpt.com/c/one-path",
  sources: [{ url: "https://dividendhistory.net/dogs-of-the-dow", title: "Dogs of the Dow" }],
  messages: [{ role: "assistant", html: '<p>出典<span data-ct-cite-name="dividendhistory.net"></span></p>' }],
});
assert.ok(onePath && onePath.includes("https://dividendhistory.net/dogs-of-the-dow"));
assert.equal(onePath != null && /\(\s*https:\/\/dividendhistory\.net\/?\s*\)/.test(onePath), false);
assert.ok(leftoverNote.includes("Dogs of the Dow 2026"));
assert.equal(/S&(?:amp;)?\[\^/.test(leftoverNote), false, "S&P chip must not split");

// Popover text shows long URLs as "https://github.com/org/doc..."; the truncated prefix must not become
// its own footnote, whether it arrives in page sources or as an anchor in the message HTML.
const truncatedNote = buildNote({
  site: "chatgpt",
  conversationId: "trunc",
  source: "https://chatgpt.com/c/trunc",
  sources: [
    { url: "https://github.com/docker-mailserver/doc", title: "https://github.com/docker-mailserver/doc" },
    { url: "https://github.com/docker-mailserver/docker-mailserver", title: "https://github.com/docker-mailserver/docker-mailserver" },
    { url: "https://docker-mailserver.github.io/docker-mailserver/latest/", title: "Docker Mailserver" },
  ],
  messages: [
    {
      role: "assistant",
      html:
        "<h2>1. docker-mailserver" +
        '<a href="https://docker-mailserver.github.io/docker-mailserver/latest/">Docker Mailserver</a>' +
        '<a href="https://docker-mailserver.github.io/dock">https://docker-mailserver.github.io/dock</a></h2>' +
        "<p>ソースコード：" +
        '<a href="https://github.com/docker-mailserver/doc">https://github.com/docker-mailserver/doc</a>' +
        '<a href="https://github.com/docker-mailserver/docker-mailserver">GitHub</a></p>' +
        "<p>詳細は<a href=\"https://docker-mailserver.github.io/docker-mailserver/latest/config/advanced/mail-fetchmail/\">Fetchmail</a>を参照。</p>",
    },
  ],
});
assert.ok(truncatedNote);
assert.match(truncatedNote, /## 1\\?\. docker-mailserver\[\^\d+\]/);
assert.equal(/https:\/\/github\.com\/docker-mailserver\/doc\)/.test(truncatedNote), false, "truncated github url leaked");
assert.equal(/https:\/\/docker-mailserver\.github\.io\/dock\)/.test(truncatedNote), false, "truncated docs url leaked");
assert.ok(truncatedNote.includes("https://github.com/docker-mailserver/docker-mailserver)"));
assert.ok(truncatedNote.includes("https://docker-mailserver.github.io/docker-mailserver/latest/)"));
assert.ok(truncatedNote.includes("https://docker-mailserver.github.io/docker-mailserver/latest/config/advanced/mail-fetchmail/)"));
assert.equal((truncatedNote.match(/^\[\^\d+\]:/gm) || []).length, 3, "expected exactly three references");

// Virtualized remounts of the same answer differ by a few citation words and must collapse.
const shared =
  "<p>コードを直接編集しながら、複数ファイルにまたがる修正を組み合わせ、テストと確認を繰り返してアプリを育てます。</p>".repeat(8);
const firstAnswer =
  "<p>結論から言うと、バイブコーディングで何を作りたいかによって最適なツールは変わりますが、迷ったら Cursor か ChatGPT Codex から始めるのがおすすめです。</p>" +
  shared +
  "<p>おすすめを診断する</p>" +
  '<a href="https://antigravity.google/">公式サイト</a>';
const firstRemount = firstAnswer.replace("おすすめを診断する", "診断する").replace('<a href="https://antigravity.google/">公式サイト</a>', "<p>公式サイト</p>");
const secondAnswer =
  "<p>あなたへの結論：Google Antigravityを第一候補にします。プログラミング未経験で、スマホアプリを作り、AIに開発を自律的に進めてほしいなら、まずAntigravityを試すのがよいと考えます。</p>" +
  "<p>iPhone向けかAndroid向けかで公開までの手順は変わり、実機確認とストア申請が別途必要です。試作品から始めて、画面と保存だけに絞ります。</p>".repeat(6) +
  "<p>条件に合わせて開発方法を決める</p>";
const repeatNote = buildNote({
  site: "chatgpt",
  conversationId: "repeat",
  source: "https://chatgpt.com/c/repeat",
  messages: [
    { role: "user", html: "<p>バイブコーディングに適しているのはどれですか</p>" },
    { role: "assistant", html: firstAnswer, media: [{ id: "m1", kind: "image", src: "https://images.example/a.png" }] },
    { role: "user", html: "<p>スマホアプリをAIに自律的に作らせたいです</p>" },
    { role: "assistant", html: secondAnswer, media: [{ id: "m2", kind: "image", src: "https://images.example/b.png" }] },
    { role: "assistant", html: firstRemount, media: [{ id: "m1", kind: "image", src: "https://images.example/a.png" }] },
    { role: "assistant", html: secondAnswer.replace("第一候補", "有力候補"), media: [{ id: "m4", kind: "image", src: "https://images.example/b.png" }] },
  ],
  mediaPaths: new Map([
    ["m1", "Chats/attachments/a.png"],
    ["m2", "Chats/attachments/b.png"],
  ]),
});
assert.ok(repeatNote);
assert.equal(repeatNote.split("結論から言うと").length - 1, 1);
assert.equal(repeatNote.split("条件に合わせて開発方法を決める").length - 1, 1);
assert.equal(repeatNote.split("バイブコーディングに適しているのはどれですか").length - 1, 1);
assert.ok(repeatNote.includes("a.png"));
assert.ok(repeatNote.includes("b.png"));

// --- site folders must stay independent -------------------------------------------------------
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|txt)$/.test(entry.name)) out.push(full);
  }
  return out;
}
for (const [site, other] of [
  ["chatgpt", "gemini"],
  ["gemini", "chatgpt"],
] as const) {
  for (const file of sourceFiles(path.resolve("src", "sites", site))) {
    const text = fs.readFileSync(file, "utf8");
    assert.equal(
      new RegExp(`from\\s+["'][^"']*sites/${other}|from\\s+["']\\.\\./${other}["'/]`).test(text),
      false,
      `${path.relative(".", file)} imports the ${other} site`,
    );
  }
}

console.log("selfcheck ok");
