/**
 * Offline regression checks run by `npm run check` (via scripts/selfcheck.mjs).
 * Covers filename helpers, footnotes, place links, maps, i18n, and sample notes.
 * Not shipped inside the Obsidian plugin bundle.
 */
import assert from "node:assert/strict";
import { asCollectedChat, collectScript } from "../src/collect";
import { buildCitationDebugDump } from "../src/debug";
import { conversationId, formatDatePattern, filenameTemplateFor, normalizeFolder, renderFilename, siteFilenameTemplate, withUniqueSuffix } from "../src/filename";
import { asUiLanguage, languageOptions, loadI18nYaml, setLanguage, t } from "../src/i18n";
import { buildMapHtml, canBuildMapHtml } from "../src/map";
import { buildNote, formatSavedAt, formatSourcesMarkdown, formatObsidianMath, htmlToMarkdown } from "../src/markdown";
import { buildPrintHtml } from "../src/pdf";
import { enhancePlaceLinks, mapsSearchUrl } from "../src/places";
import { PLUGIN_ICON_ID, PLUGIN_ICON_SVG } from "../src/icon";

assert.equal(PLUGIN_ICON_ID, "chattaker");
assert.match(PLUGIN_ICON_SVG, /currentColor/);
assert.match(PLUGIN_ICON_SVG, /scale\(/);
assert.match(PLUGIN_ICON_SVG, /translate\(/);
assert.equal(PLUGIN_ICON_SVG.includes("<svg"), false);
assert.equal(PLUGIN_ICON_SVG.includes("#000"), false);

const date = new Date(2026, 9, 2, 15, 8, 44);
assert.equal(formatDatePattern(date, "YYMMDD_HHmmss"), "261002_150844");
assert.equal(renderFilename("ChatGPT_{{date:YYMMDD_HHmmss}}", date), "ChatGPT_261002_150844");
assert.equal(renderFilename("ChatGPT_{{date:YYMMDD_HHmmss}}.md", date), "ChatGPT_261002_150844");
assert.equal(normalizeFolder("..\\\\Chats/./Foo"), "Chats/Foo");
assert.equal(withUniqueSuffix("A", (name) => name === "A"), "A_2");
assert.equal(withUniqueSuffix("A", (name) => name === "A" || name === "A_2"), "A_3");
assert.equal(conversationId("https://chatgpt.com/c/abc-123"), "abc-123");
assert.equal(conversationId("https://chatgpt.com/uc/6abf55c5-1af8-83ea-9efb-a4361ac99cb0"), "6abf55c5-1af8-83ea-9efb-a4361ac99cb0");
assert.equal(conversationId("https://chatgpt.com/"), "");
assert.equal(conversationId("https://gemini.google.com/app"), "");
assert.equal(conversationId("https://gemini.google.com/app/abc123"), "abc123");
assert.equal(conversationId("https://gemini.google.com/u/1/app/abc123"), "abc123");

new Function(collectScript);
assert.match(collectScript, /decodeJslogUrls/);
assert.match(collectScript, /BardVeMetadataKey/);
assert.match(collectScript, /#:~:/);
assert.match(collectScript, /からの引用/);
assert.match(collectScript, /parseAssistantSourcesPayload/);
assert.match(collectScript, /data-assistant-sources-payload/);

const chatgptPayloadNote = buildNote({
  site: "chatgpt",
  conversationId: "payload1",
  source: "https://chatgpt.com/c/payload1",
  messages: [
    {
      role: "assistant",
      html:
        '<p>国会会議録でも使われています。' +
        '<a href="https://kokkai.ndl.go.jp/simple/detail?minId=106513830X01119710507">国会会議録検索システム</a>' +
        '<a href="https://kokkai.ndl.go.jp/simple/detail?minId=other">国会会議録検索システム</a></p>',
    },
  ],
});
assert.ok(chatgptPayloadNote);
assert.match(chatgptPayloadNote, /使われています。\[\^1\]\[\^2\]/);
assert.match(chatgptPayloadNote, /kokkai\.ndl\.go\.jp/);
assert.equal(chatgptPayloadNote.includes("utm_source"), false);

{
  // Gemini jslog(base64) から URL を取り出し、ハイライト fragment を落とす
  const payload = Buffer.from("xhttps://macaro-ni.jp/59456?page=2#:~:text=abc y", "utf8").toString("base64");
  const match = /BardVeMetadataKey:([A-Za-z0-9+/_=-]+)/.exec(`BardVeMetadataKey:${payload}`);
  assert.ok(match);
  const text = Buffer.from(match![1], "base64").toString("utf8");
  const raw = /https?:\/\/[^\s]+/i.exec(text)?.[0] || "";
  const cleaned = raw.replace(/#:~:.*$/, "");
  assert.equal(cleaned, "https://macaro-ni.jp/59456?page=2");
}

{
  const note = buildNote({
    site: "chatgpt",
    conversationId: "dbg",
    source: "https://chatgpt.com/c/dbg",
    messages: [{ role: "assistant", html: '<p>引用 <a href="https://news.example/a">News</a></p>' }],
    sources: [{ title: "News", url: "https://news.example/a" }],
  });
  assert.ok(note);
  const dump = buildCitationDebugDump({
    site: "chatgpt",
    format: "markdown",
    savedAt: date,
    data: {
      session: 1,
      url: "https://chatgpt.com/c/dbg",
      title: "dbg",
      streaming: false,
      scanning: false,
      items: [{ role: "assistant", html: '<p>引用 <a href="https://news.example/a">News</a></p>' }],
      sources: [{ title: "News", url: "https://news.example/a" }],
      debug: {
        citations: [
          {
            tag: "BUTTON",
            className: "citation",
            ariaLabel: "Citation from News",
            attrs: { hasJslog: false, href: "https://news.example/a" },
            resolvedHref: "https://news.example/a",
            jslogUrls: [],
            noiseFiltered: [],
            output: '<a href="https://news.example/a">News</a>',
            outcome: "anchor",
          },
        ],
        summary: { pageCitations: 1 },
      },
    },
    noteMarkdown: note,
  });
  assert.equal(dump.meta.site, "chatgpt");
  assert.equal(dump.summary.sources, 1);
  assert.equal(dump.citations.length, 1);
  assert.equal(dump.citations[0].outcome, "anchor");
  assert.ok(dump.footnotes.definitionCount >= 1);
}

const parsedDebug = asCollectedChat({
  session: 1,
  url: "https://chatgpt.com/c/x",
  title: "x",
  streaming: false,
  scanning: false,
  items: [{ role: "assistant", html: "<p>a</p>" }],
  debug: { citations: [{ tag: "A", className: "", ariaLabel: "", attrs: { hasJslog: false }, resolvedHref: "", jslogUrls: [], noiseFiltered: [], output: "", outcome: "empty" }], summary: { pageCitations: 1 } },
});
assert.ok(parsedDebug);
assert.equal(parsedDebug.debug?.citations?.length, 1);

const geminiTextFragment = buildNote({
  site: "gemini",
  conversationId: "frag1",
  source: "https://gemini.google.com/app/frag1",
  messages: [
    {
      role: "assistant",
      html: '<p>出典<a href="https://macaro-ni.jp/59456?page=2#:~:text=abc">マカロニ</a></p>',
    },
  ],
});
assert.ok(geminiTextFragment);
assert.match(geminiTextFragment, /\[\^1\]/);
assert.match(geminiTextFragment, /https:\/\/macaro-ni\.jp\/59456\?page=2\)/);
assert.equal(geminiTextFragment.includes("#:~:"), false);

const user = htmlToMarkdown("<p>こんにちは <strong>太字</strong></p>");
assert.match(user, /こんにちは/);
assert.match(user, /\*\*太字\*\*/);

const bulletList = htmlToMarkdown("<ul><li><p>いち</p></li><li><p>に</p></li></ul>");
assert.equal(bulletList, "-   いち\n-   に");
const orderedList = htmlToMarkdown("<ol><li><p>いち</p></li><li><p>に</p></li></ol>");
assert.equal(orderedList, "1.  いち\n2.  に");
const nestedList = htmlToMarkdown("<ul><li><p>親</p><ul><li><p>子</p></li></ul></li><li><p>次</p></li></ul>");
assert.equal(nestedList, "-   親\n    -   子\n-   次");
const multiParagraphItem = htmlToMarkdown("<ul><li><p>a</p><p>b</p></li><li><p>c</p></li></ul>");
assert.equal(multiParagraphItem, "-   a\n    \n    b\n-   c");

assert.equal(renderFilename(siteFilenameTemplate("gemini"), date), "Gemini_261002_150844");
assert.equal(filenameTemplateFor("chatgpt", "ChatGPT_{{date:YYMMDD_HHmmss}}"), "ChatGPT_{{date:YYMMDD_HHmmss}}");
assert.equal(filenameTemplateFor("gemini", "ChatGPT_{{date:YYMMDD_HHmmss}}"), "Gemini_{{date:YYMMDD_HHmmss}}");
assert.equal(filenameTemplateFor("gemini", "Note_{{date:YYYYMMDD}}"), "Note_{{date:YYYYMMDD}}");
assert.equal(renderFilename(filenameTemplateFor("gemini", "ChatGPT_{{date:YYMMDD_HHmmss}}"), date), "Gemini_261002_150844");

const labeledGemini = buildNote({
  site: "gemini",
  conversationId: "label1",
  source: "https://gemini.google.com/app/label1",
  messages: [{ role: "assistant", html: "<p>Gemini の回答</p><p>本文だけ残る</p>" }],
});
assert.ok(labeledGemini);
assert.match(labeledGemini, /本文だけ残る/);
assert.equal(labeledGemini.includes("Gemini の回答"), false);

const geminiPrompt = buildNote({
  site: "gemini",
  conversationId: "prompt1",
  source: "https://gemini.google.com/app/prompt1",
  messages: [
    {
      role: "user",
      html: "<p>あなたのプロンプト：質問</p><p>質問</p>",
    },
  ],
});
assert.ok(geminiPrompt);
assert.match(geminiPrompt, /> \[!question\]\n> 質問\n?$/m);
assert.equal(geminiPrompt.includes("あなたのプロンプト"), false);
assert.equal((geminiPrompt.match(/質問/g) || []).length, 1);

const geminiPromptOne = buildNote({
  site: "gemini",
  conversationId: "prompt2",
  source: "https://gemini.google.com/app/prompt2",
  messages: [{ role: "user", html: "<p>あなたのプロンプト：質問　質問</p>" }],
});
assert.ok(geminiPromptOne);
assert.equal(geminiPromptOne.includes("あなたのプロンプト"), false);
assert.equal((geminiPromptOne.match(/質問/g) || []).length, 1);

const geminiUrlFootnote = buildNote({
  site: "gemini",
  conversationId: "url1",
  source: "https://gemini.google.com/app/url1",
  messages: [
    {
      role: "assistant",
      html: '<p>根拠は <a href="https://example.com/rule72">example.com</a> です。</p>',
    },
  ],
});
assert.ok(geminiUrlFootnote);
assert.match(geminiUrlFootnote, /根拠は \[\^1\] です。/);
assert.match(geminiUrlFootnote, /\[\^1\]: \[example\.com\]\(https:\/\/example\.com\/rule72\)/);
assert.equal(formatSavedAt(date), "2026-10-02T15:08:44");

const note = buildNote({
  conversationId: "abc",
  source: "https://chatgpt.com/c/abc",
  messages: [
    { role: "user", html: "<p>質問です</p>" },
    {
      role: "assistant",
      html: '<p>回答です</p><pre class="language-ts"><code class="language-ts">const a = 1;</code></pre><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>B</td></tr></tbody></table>',
    },
  ],
});
assert.ok(note);
assert.match(note, /chatgpt-id: "abc"/);
assert.equal(note.includes("\nsource:"), false);
assert.match(note, /> \[!question\]\n> 質問です/);
assert.match(note, /回答です/);
assert.equal(note.includes("## あなた"), false);
assert.equal(note.includes("## ChatGPT"), false);
assert.match(note, /```ts\nconst a = 1;\n```/);
assert.match(note, /\| A \|/);
assert.match(note, /\| B \|/);
assert.equal(buildNote({ conversationId: "", source: "https://chatgpt.com/", messages: [] }), null);

const geminiNote = buildNote({
  site: "gemini",
  conversationId: "abc123",
  source: "https://gemini.google.com/app/abc123",
  messages: [
    { role: "user", html: "<p>こんにちは</p>" },
    { role: "assistant", html: "<p>Gemini</p>" },
    { role: "assistant", html: "<p>軽量なエディターなら Geany です。</p>" },
  ],
});
assert.ok(geminiNote);
assert.match(geminiNote, /gemini-id: "abc123"/);
assert.equal(geminiNote.includes("datetime:"), false);

const stamped = buildNote({
  site: "gemini",
  conversationId: "abc123",
  source: "https://gemini.google.com/app/abc123",
  savedAt: date,
  messages: [{ role: "user", html: "<p>こんにちは</p>" }],
});
assert.ok(stamped);
assert.match(stamped, /datetime: 2026-10-02T15:08:44/);
assert.match(geminiNote, /> \[!question\]\n> こんにちは/);
assert.match(geminiNote, /軽量なエディターなら Geany です。/);
assert.equal(geminiNote.includes("chatgpt-id"), false);
assert.equal(geminiNote.includes("## Gemini"), false);
assert.equal(geminiNote.includes("## あなた"), false);

const collapsed = buildNote({
  conversationId: "6abf55c5-1af8-83ea-9efb-a4361ac99cb0",
  source: "https://chatgpt.com/uc/6abf55c5-1af8-83ea-9efb-a4361ac99cb0",
  messages: [
    { role: "user", html: "<p>軽量な構文ハイライト付きのテキストエディターを教えてください。</p>" },
    { role: "assistant", html: "<p>ChatGPT:</p>" },
    { role: "assistant", html: "<p>ウェブを検索中</p>" },
    { role: "assistant", html: "<p>1. ウェブを検索中</p><p>ウェブを検索しています</p>" },
    { role: "assistant", html: "<p>軽量さを重視するなら <strong>Notepad3</strong> です。</p>" },
    { role: "assistant", html: "<p>軽量さを重視するなら <strong>Notepad3</strong> です。Geany もあります。</p>" },
  ],
});
assert.ok(collapsed);
assert.match(collapsed, /> \[!question\]\n> 軽量な構文ハイライト付きのテキストエディターを教えてください。/);
assert.equal(collapsed.includes("## ChatGPT"), false);
assert.match(collapsed, /Notepad3/);
assert.match(collapsed, /Geany/);
assert.equal(collapsed.includes("ウェブを検索中"), false);

const withImage = buildNote({
  conversationId: "img",
  source: "https://chatgpt.com/c/img",
  messages: [
    { role: "user", html: "<p>地図を見せて</p>", media: [] },
    {
      role: "assistant",
      html: '<p>前です</p><img data-ct-media="m1" alt=""><p>後です</p><img data-ct-media="m2" alt="capture">',
      media: [
        { id: "m1", kind: "image", src: "https://example.com/a.png" },
        { id: "m2", kind: "capture" },
      ],
    },
  ],
  mediaPaths: new Map([
    ["m1", "Chats/attachments/ChatGPT_261002_150844_01.png"],
    ["m2", "Chats/attachments/ChatGPT_261002_150844_02.png"],
  ]),
});
assert.ok(withImage);
assert.match(withImage, /前です[\s\S]*!\[\[Chats\/attachments\/ChatGPT_261002_150844_01\.png\]\][\s\S]*後です[\s\S]*!\[\[Chats\/attachments\/ChatGPT_261002_150844_02\.png\]\]/);
assert.equal(withImage.includes("data-ct-media"), false);
assert.equal(withImage.includes("%%CGM_MEDIA"), false);

const orphanImage = buildNote({
  conversationId: "img-orphan",
  source: "https://chatgpt.com/c/img-orphan",
  messages: [
    {
      role: "assistant",
      html: "<p>本文だけ</p>",
      media: [{ id: "m-orphan", kind: "capture" }],
    },
  ],
  mediaPaths: new Map([["m-orphan", "Chats/attachments/orphan.png"]]),
});
assert.ok(orphanImage);
assert.match(orphanImage, /^---[\s\S]*---\n\n!\[\[Chats\/attachments\/orphan\.png\]\]\n\n本文だけ/);

const imageOnly = buildNote({
  conversationId: "img2",
  source: "https://chatgpt.com/c/img2",
  messages: [{ role: "assistant", html: '<img data-ct-media="m9" alt="">', media: [{ id: "m9", kind: "image", src: "https://example.com/b.png" }] }],
  mediaPaths: new Map([["m9", "Chats/attachments/only.png"]]),
});
assert.ok(imageOnly);
assert.match(imageOnly, /!\[\[Chats\/attachments\/only\.png\]\]/);

const printHtml = buildPrintHtml({
  site: "chatgpt",
  source: "https://chatgpt.com/c/abc",
  title: "テスト",
  savedAt: date,
  messages: [
    { role: "user", html: "<p>質問です</p>", media: [] },
    {
      role: "assistant",
      html: '<p>回答です</p><img data-ct-media="m1" alt="">',
      media: [{ id: "m1", kind: "image", src: "https://example.com/a.png" }],
    },
  ],
  mediaDataUrls: new Map([["m1", "data:image/png;base64,AAAA"]]),
});
assert.ok(printHtml);
assert.match(printHtml, /質問です/);
assert.match(printHtml, /回答です/);
assert.match(printHtml, /data:image\/png;base64,AAAA/);
assert.equal(printHtml.includes("data-ct-media"), false);
assert.match(printHtml, /Source: https:\/\/chatgpt\.com\/c\/abc/);

const linked = htmlToMarkdown('<p>参考: <a href="https://example.com/page">Example Site</a></p>');
assert.match(linked, /\[Example Site\]\(https:\/\/example\.com\/page\)/);

const relativeLinked = htmlToMarkdown('<p><a href="https://example.org/a">相対相当</a></p>');
assert.match(relativeLinked, /\[相対相当\]\(https:\/\/example\.org\/a\)/);

const inlineMath = htmlToMarkdown(
  '<p>複利の目安は <span data-ct-math="inline">n \\approx \\frac{72}{r}</span> です。</p>',
);
assert.equal(inlineMath, "複利の目安は $n \\approx \\frac{72}{r}$ です。");
const displayMath = htmlToMarkdown(
  '<p>式:</p><span data-ct-math="display">n \\approx \\frac{72}{r}</span>',
);
assert.match(displayMath, /\$\$\nn \\approx \\frac\{72\}\{r\}\n\$\$/);
assert.equal(formatObsidianMath("\\(x^2\\)"), "$x^2$");
assert.equal(formatObsidianMath("\\[a+b\\]", true), "\n\n$$\na+b\n$$\n\n");

const withSources = buildNote({
  conversationId: "src",
  source: "https://chatgpt.com/c/src",
  messages: [
    { role: "user", html: "<p>調べて</p>" },
    {
      role: "assistant",
      html: '<p>これです <a href="https://news.example/article">楽楽天市場+1</a> と <a href="https://docs.example/guide">Docs</a></p>',
    },
  ],
  sources: [
    { title: "News", url: "https://news.example/article" },
    { title: "Docs", url: "https://docs.example/guide" },
  ],
});
assert.ok(withSources);
assert.match(withSources, /これです \[\^1\] と \[\^2\]/);
assert.equal(withSources.includes("楽楽天市場"), false);
assert.equal(withSources.includes("[News](https://news.example/article)"), true);
assert.match(withSources, /## References\n\n\[\^1\]: \[News\]\(https:\/\/news\.example\/article\)\n\[\^2\]: \[Docs\]\(https:\/\/docs\.example\/guide\)/);
assert.equal(formatSourcesMarkdown([]), "");
setLanguage("ja");
assert.match(
  formatSourcesMarkdown([
    { title: "News", url: "https://news.example/article" },
    { title: "Docs", url: "https://docs.example/guide" },
  ]),
  /## 参照\n\n\[\^1\]: \[News\]\(https:\/\/news\.example\/article\)\n\[\^2\]: \[Docs\]\(https:\/\/docs\.example\/guide\)/,
);
setLanguage("en");
loadI18nYaml("view.save:\n  en: Override save\n  ja: 上書き保存\n");
assert.equal(t("view.save"), "Override save");
setLanguage("ja");
assert.equal(t("view.save"), "上書き保存");
assert.equal(t("refs.heading"), "## 参照");
setLanguage("en");
loadI18nYaml(`languages:
  fr: Français
view.save:
  fr: Enregistrer le chat
refs.heading:
  fr: "## Références"
`);
assert.equal(asUiLanguage("fr"), "fr");
assert.equal(asUiLanguage("de"), "en");
assert.equal(languageOptions().some((option) => option.id === "fr" && option.label === "Français"), true);
setLanguage("fr");
assert.equal(t("view.save"), "Enregistrer le chat");
assert.equal(t("refs.heading"), "## Références");
assert.equal(t("view.newChat"), "New chat");
setLanguage("en");
loadI18nYaml("");
assert.equal(t("view.save"), "Save chat");
assert.equal(asUiLanguage("fr"), "en");

// CODE 内の cl.exe 等を脚注化しない（ドメイン誤認の防止）
const noFakeExeFootnote = buildNote({
  site: "chatgpt",
  conversationId: "exe1",
  source: "https://chatgpt.com/c/exe1",
  messages: [
    {
      role: "assistant",
      html: '<p>可能です。<code>cl.exe</code> でビルドできます。</p><p>また <code>cmd.exe</code> でも使えます。</p>',
    },
  ],
});
assert.ok(noFakeExeFootnote);
assert.match(noFakeExeFootnote, /`cl\.exe`/);
assert.match(noFakeExeFootnote, /`cmd\.exe`/);
assert.equal(noFakeExeFootnote.includes("## References"), false);
assert.equal(noFakeExeFootnote.includes("https://cl.exe"), false);
assert.equal(noFakeExeFootnote.includes("[^1]"), false);

const noFakeCiteNameExe = buildNote({
  site: "gemini",
  conversationId: "exe2",
  source: "https://gemini.google.com/app/exe2",
  messages: [
    {
      role: "assistant",
      html: '<p>これは<span data-ct-cite-name="cl.exe"></span>です。</p>',
    },
  ],
});
assert.ok(noFakeCiteNameExe);
assert.match(noFakeCiteNameExe, /これは\s*cl\.exe\s*です。/);
assert.equal(noFakeCiteNameExe.includes("https://cl.exe"), false);
assert.equal(noFakeCiteNameExe.includes("[^1]"), false);

assert.match(collectScript, /FAKE_DOMAIN_EXTS/);
assert.match(collectScript, /isCodeLikeNode/);
assert.match(collectScript, /isUrlCardReference/);
assert.match(collectScript, /data-ct-keep-link/);
assert.match(collectScript, /mapsSearchUrl/);
assert.match(collectScript, /isPlaceCardRoot/);
assert.equal(
  mapsSearchUrl("横浜元町 香炉庵 新横浜店"),
  "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("横浜元町 香炉庵 新横浜店"),
);

const geminiPlaces = enhancePlaceLinks(
  [
    "横浜元町 香炉庵 新横浜店3.7 stars rating3.7 📍 デザート ショップ Open · Closes 9:00 PM",
    "",
    "横浜元町の人気和菓子店横浜元町 香炉庵 新横浜店クリックするとサイドパネルが開き、詳細が表示されます（キュービックプラザ新横浜 2F）では、上品です。",
    "",
    "崎陽軒 キュービックプラザ新横浜店3.8 stars rating3.8 · ¥1,000-¥2,000 📍 食料品店 Open · Closes 9:30 PM",
  ].join("\n"),
);
assert.match(
  geminiPlaces,
  /\*\*\[横浜元町 香炉庵 新横浜店\]\(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
);
assert.match(geminiPlaces, /3\.7 · 📍 デザート/);
assert.equal(geminiPlaces.includes("クリックするとサイドパネル"), false);
assert.match(
  geminiPlaces,
  /\*\*\[崎陽軒 キュービックプラザ新横浜店\]\(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
);

const geminiPlaceNote = buildNote({
  site: "gemini",
  conversationId: "place1",
  source: "https://gemini.google.com/app/place1",
  messages: [
    {
      role: "assistant",
      html:
        "<p>おすすめです。</p>" +
        "<p>横浜元町 香炉庵 新横浜店3.7 stars rating3.7 📍 デザート ショップ Open · Closes 9:00 PM</p>" +
        "<p>横浜元町の人気和菓子店横浜元町 香炉庵 新横浜店クリックするとサイドパネルが開き、詳細が表示されます（2F）では上品です。</p>",
    },
  ],
});
assert.ok(geminiPlaceNote);
assert.match(geminiPlaceNote, /maps\/search\/\?api=1&query=/);
assert.match(geminiPlaceNote, /横浜元町%20香炉庵%20新横浜店|横浜元町 香炉庵 新横浜店/);
assert.equal(geminiPlaceNote.includes("クリックするとサイドパネル"), false);
assert.equal(geminiPlaceNote.includes("[^1]"), false);

const chatgptPlaces = enhancePlaceLinks(
  [
    "**西松屋 コーナンセンター南店**★ 3.5•子供服店",
    "",
    "**Gapストア 港北東急S.C.店**★ 3.6•衣料品店",
    "",
    "**トイザらス・ベビーザらス 港北ニュータウン店**★ 3.5•子供服店地図データは現在利用不可です",
    "",
    "★3.5**西松屋 コーナンセンター南店**★ 3.5 · 子供服店★3.6**Gapストア 港北東急S.C.店**★ 3.6 · 衣料品店",
  ].join("\n"),
);
assert.match(
  chatgptPlaces,
  /\*\*\[西松屋 コーナンセンター南店\]\(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
);
assert.match(
  chatgptPlaces,
  /\*\*\[Gapストア 港北東急S\.C\.店\]\(https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/,
);
assert.match(chatgptPlaces, /3\.5 · 子供服店/);
assert.equal(chatgptPlaces.includes("地図データは現在利用不可です"), false);
assert.equal(chatgptPlaces.includes("★3.5**"), false);
assert.equal(/子供服店\*\*\[Gap/.test(chatgptPlaces), false);

const chatgptPlaceNote = buildNote({
  site: "chatgpt",
  conversationId: "place-cg",
  source: "https://chatgpt.com/c/place-cg",
  messages: [
    {
      role: "assistant",
      html:
        "<p><strong>西松屋 コーナンセンター南店</strong>★ 3.5•子供服店</p>" +
        "<p><strong>Gapストア 港北東急S.C.店</strong>★ 3.6•衣料品店</p>",
    },
  ],
});
assert.ok(chatgptPlaceNote);
assert.match(chatgptPlaceNote, /maps\/search\/\?api=1&query=/);
assert.match(chatgptPlaceNote, /\*\*\[西松屋 コーナンセンター南店\]\(/);
assert.equal(chatgptPlaceNote.includes("[^1]"), false);

// ホームページを1行で出すリンクは脚注化せず本文に残す
const homepageLine = buildNote({
  site: "chatgpt",
  conversationId: "home1",
  source: "https://chatgpt.com/c/home1",
  messages: [
    {
      role: "assistant",
      html:
        "<h2>第一候補：Docker Mailserver</h2>" +
        '<p><a data-ct-keep-link="1" href="https://docker-mailserver.github.io/docker-mailserver/latest/">docker-mailserver.github.io</a></p>' +
        "<p>Docker Mailserver は有力です。<a href=\"https://docker-mailserver.github.io/docker-mailserver/latest/config/advanced/mail-fetchmail/\">Docker Mailserver</a></p>",
    },
  ],
});
assert.ok(homepageLine);
assert.match(homepageLine, /\[docker-mailserver\.github\.io\]\(https:\/\/docker-mailserver\.github\.io\/docker-mailserver\/latest\/\)/);
assert.match(homepageLine, /有力です。\[\^1\]/);
assert.match(homepageLine, /## References/);
assert.equal(/^\[\^1\]\s*$/m.test(homepageLine), false);

const homepageStandaloneBlock = buildNote({
  site: "chatgpt",
  conversationId: "home2",
  source: "https://chatgpt.com/c/home2",
  messages: [
    {
      role: "assistant",
      html:
        "<h2>第二候補：Mailu</h2>" +
        '<p><a href="https://mailu.io/">mailu.io</a></p>' +
        "<p>Mailuも候補です。</p>",
    },
  ],
});
assert.ok(homepageStandaloneBlock);
assert.match(homepageStandaloneBlock, /\[mailu\.io\]\(https:\/\/mailu\.io\/\)/);
assert.equal(homepageStandaloneBlock.includes("[^1]"), false);

const geminiCite = buildNote({
  site: "gemini",
  conversationId: "g1",
  source: "https://gemini.google.com/app/g1",
  messages: [
    {
      role: "assistant",
      html: '<p>複利の目安は72の法則です<span data-ct-cite-name="example.com"></span>。</p><sources-carousel>壊れた検索結果カード</sources-carousel>',
    },
  ],
  sources: [{ title: "Example", url: "https://example.com/rule72" }],
});
assert.ok(geminiCite);
assert.match(geminiCite, /複利の目安は72の法則です\[\^1\]。/);
assert.equal(geminiCite.includes("壊れた検索結果"), false);
assert.match(geminiCite, /\[\^1\]: \[Example\]\(https:\/\/example\.com\/rule72\)/);

const geminiBareUrl = buildNote({
  site: "gemini",
  conversationId: "bare-url",
  source: "https://gemini.google.com/app/bare-url",
  messages: [{ role: "assistant", html: "<p>根拠は https://example.com/rule72 です。</p>" }],
});
assert.ok(geminiBareUrl);
assert.match(geminiBareUrl, /根拠は \[\^1\] です。/);
assert.match(geminiBareUrl, /\[\^1\]: \[https:\/\/example\.com\/rule72\]\(https:\/\/example\.com\/rule72\)/);

const geminiCiteUrl = buildNote({
  site: "gemini",
  conversationId: "cite-url",
  source: "https://gemini.google.com/app/cite-url",
  messages: [
    {
      role: "assistant",
      html: '<p>根拠<span data-ct-cite-name="https://example.com/x"></span>です。</p>',
    },
  ],
});
assert.ok(geminiCiteUrl);
assert.match(geminiCiteUrl, /根拠\[\^1\]です。/);
assert.match(geminiCiteUrl, /https:\/\/example\.com\/x/);

const chatgptBareChip = buildNote({
  site: "chatgpt",
  conversationId: "chip1",
  source: "https://chatgpt.com/c/chip1",
  messages: [
    {
      role: "assistant",
      html: "<p>デモ取引が使えます。WWebull+1</p><p>さらに連携もあります。WWebull+1</p>",
    },
  ],
  sources: [
    { title: "Webull", url: "https://www.webull.co.jp/blog/322" },
    { title: "WikiFX", url: "https://www.wikifx.com/ja/newsdetail/202609305734560218.html" },
  ],
});
assert.ok(chatgptBareChip);
assert.match(chatgptBareChip, /デモ取引が使えます。\[\^1\]/);
assert.equal(chatgptBareChip.includes("WWebull"), false);
assert.equal(chatgptBareChip.includes("Webull+1"), false);
assert.match(chatgptBareChip, /https:\/\/www\.webull\.co\.jp\/blog\/322/);
// 収集側で cite-name 化した想定の HTML でも脚注化できること
const chatgptCiteName = buildNote({
  site: "chatgpt",
  conversationId: "chip2",
  source: "https://chatgpt.com/c/chip2",
  messages: [
    {
      role: "assistant",
      html: '<p>デモ取引が使えます。<span data-ct-cite-name="Webull"></span></p><p>さらに連携もあります。<span data-ct-cite-name="WWebull"></span></p>',
    },
  ],
  sources: [
    { title: "Webull", url: "https://www.webull.co.jp/blog/322" },
    { title: "WikiFX", url: "https://www.wikifx.com/ja/newsdetail/202609305734560218.html" },
  ],
});
assert.ok(chatgptCiteName);
assert.match(chatgptCiteName, /デモ取引が使えます。\[\^1\]/);
assert.equal(chatgptCiteName.includes("WWebull"), false);
assert.equal(chatgptCiteName.includes("Webull+1"), false);
assert.match(chatgptCiteName, /https:\/\/www\.webull\.co\.jp\/blog\/322/);

const geminiCarouselUrl = buildNote({
  site: "gemini",
  conversationId: "carousel-url",
  source: "https://gemini.google.com/app/carousel-url",
  messages: [
    {
      role: "assistant",
      html: '<p>調査結果です。</p><sources-carousel-inline>カード<a href="https://news.example/a">News</a></sources-carousel-inline>',
    },
  ],
});
assert.ok(geminiCarouselUrl);
assert.equal(geminiCarouselUrl.includes("カード"), false);
assert.match(geminiCarouselUrl, /調査結果です。/);
assert.match(geminiCarouselUrl, /\[\^1\]/);
assert.match(geminiCarouselUrl, /https:\/\/news\.example\/a/);

const geminiNoiseHref = buildNote({
  site: "gemini",
  conversationId: "noise-href",
  source: "https://gemini.google.com/app/noise-href",
  messages: [
    {
      role: "assistant",
      html: '<p>見る <a href="https://gemini.google.com/app/abc123">https://docs.example/guide</a></p>',
    },
  ],
});
assert.ok(geminiNoiseHref);
assert.match(geminiNoiseHref, /見る \[\^1\]/);
assert.match(geminiNoiseHref, /https:\/\/docs\.example\/guide/);
assert.equal(geminiNoiseHref.includes("gemini.google.com/app/abc123"), false);

const chatgptChromeNoise = buildNote({
  conversationId: "chrome-noise",
  source: "https://chatgpt.com/uc/6ac381d3-f614-83ea-8bf9-337780f727b2",
  messages: [
    {
      role: "assistant",
      html: '<p>公式ドキュメントに案内があります<span data-ct-cite-name="TTasmota"></span>。</p>',
    },
  ],
  sources: [
    { title: "画像", url: "https://chatgpt.com/images" },
    { title: "プラグイン", url: "https://chatgpt.com/plugins" },
    { title: "ヘルプ", url: "https://help.openai.com/ja-jp/collections/3742473-chatgpt" },
    { title: "利用規約", url: "https://openai.com/terms" },
    { title: "Google で続行", url: "https://chatgpt.com/auth/login_with?connection=google-oauth2" },
    { title: "Tasmota Docs", url: "https://tasmota.github.io/docs/" },
  ],
});
assert.ok(chatgptChromeNoise);
assert.match(chatgptChromeNoise, /公式ドキュメントに案内があります\[\^1\]。/);
assert.match(chatgptChromeNoise, /\[\^1\]: \[Tasmota Docs\]\(https:\/\/tasmota\.github\.io\/docs\/\)/);
assert.equal(chatgptChromeNoise.includes("chatgpt.com/images"), false);
assert.equal(chatgptChromeNoise.includes("chatgpt.com/plugins"), false);
assert.equal(chatgptChromeNoise.includes("help.openai.com"), false);
assert.equal(chatgptChromeNoise.includes("openai.com/terms"), false);
assert.equal(chatgptChromeNoise.includes("auth/login"), false);

const printWithSources = buildPrintHtml({
  site: "chatgpt",
  source: "https://chatgpt.com/c/src",
  messages: [
    {
      role: "assistant",
      html: '<p>引用 <a href="https://news.example/article">楽天市場+1</a></p>',
    },
  ],
  sources: [{ title: "News", url: "https://news.example/article" }],
});
assert.ok(printWithSources);
assert.match(printWithSources, /引用 \[\^1\]/);
assert.equal(printWithSources.includes("楽天市場"), false);
assert.match(printWithSources, /<section class="refs">/);
assert.match(printWithSources, /\[\^1\]:/);
assert.match(printWithSources, /href="https:\/\/news\.example\/article"/);

const mapMedia = {
  id: "m-map",
  kind: "map" as const,
  sourceUrl: "https://www.google.com/maps/@35.6812,139.7671,15z",
  mapState: { lat: 35.6812, lng: 139.7671, zoom: 15 },
};
assert.equal(canBuildMapHtml(mapMedia), true);
const mapHtml = buildMapHtml(mapMedia);
assert.ok(mapHtml);
assert.match(mapHtml, /Reconstructed map/);
assert.match(mapHtml, /openstreetmap\.org\/export\/embed\.html/);
assert.match(mapHtml, /Open original map/);
assert.equal(canBuildMapHtml({ id: "m-empty", kind: "map" }), false);
assert.equal(buildMapHtml({ id: "m-empty", kind: "map" }), null);

const parsedMap = asCollectedChat({
  session: 1,
  url: "https://chatgpt.com/c/map",
  title: "map",
  streaming: false,
  scanning: false,
  items: [
    {
      role: "assistant",
      html: '<img data-ct-media="m-map" alt="map">',
      media: [mapMedia],
    },
  ],
});
assert.ok(parsedMap);
assert.equal(parsedMap.items[0].media?.[0].kind, "map");
assert.equal(parsedMap.items[0].media?.[0].mapState?.lat, 35.6812);

const withMap = buildNote({
  conversationId: "map",
  source: "https://chatgpt.com/c/map",
  messages: [
    {
      role: "assistant",
      html: '<p>ここです</p><img data-ct-media="m-map" alt="map">',
      media: [mapMedia],
    },
  ],
  mediaPaths: new Map([["m-map", "Chats/attachments/map_01.png"]]),
  mediaExtras: new Map([
    [
      "m-map",
      {
        htmlPath: "Chats/attachments/map_01.html",
        sourceUrl: "https://www.google.com/maps/@35.6812,139.7671,15z",
      },
    ],
  ]),
});
assert.ok(withMap);
assert.match(withMap, /!\[\[Chats\/attachments\/map_01\.png\]\]/);
assert.match(withMap, /\[Reconstructed map\]\(Chats\/attachments\/map_01\.html\)/);
assert.match(withMap, /\[Open original map\]\(https:\/\/www\.google\.com\/maps\/@35\.6812,139\.7671,15z\)/);

const mapPngOnly = buildNote({
  conversationId: "map2",
  source: "https://chatgpt.com/c/map2",
  messages: [
    {
      role: "assistant",
      html: '<img data-ct-media="m-map2" alt="map">',
      media: [{ id: "m-map2", kind: "map" }],
    },
  ],
  mediaPaths: new Map([["m-map2", "Chats/attachments/map_02.png"]]),
});
assert.ok(mapPngOnly);
assert.match(mapPngOnly, /!\[\[Chats\/attachments\/map_02\.png\]\]/);
assert.equal(mapPngOnly.includes("Reconstructed map"), false);
assert.equal(mapPngOnly.includes(".html"), false);

const printMap = buildPrintHtml({
  site: "chatgpt",
  source: "https://chatgpt.com/c/map",
  messages: [
    {
      role: "assistant",
      html: '<img data-ct-media="m-map" alt="map">',
      media: [mapMedia],
    },
  ],
  mediaDataUrls: new Map([["m-map", "data:image/png;base64,BBBB"]]),
});
assert.ok(printMap);
assert.match(printMap, /data:image\/png;base64,BBBB/);
assert.equal(printMap.includes(".html"), false);
assert.equal(printMap.includes("openstreetmap"), false);

console.log("selfcheck ok");
