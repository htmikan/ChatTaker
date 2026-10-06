# ChatTaker — developer notes

公開向けの説明は [README.md](../README.md) を参照してください。以下はビルド・配置・詳細な制限です。

デスクトップ版 Obsidian の中で [ChatGPT](https://chatgpt.com/) と [Gemini](https://gemini.google.com/) を開き、「会話を保存」で vault に保存します。Windows / macOS / Linux で同じ TypeScript プラグインが動きます。モバイル版 Obsidian には対応しません。

C++ や WebView2 は使いません。Obsidian に同梱された Electron の `<webview>` が、各 OS でブラウザの役割をします。既定では非ログインで開きます。ログインした場合の状態は vault ではなく、Obsidian のユーザーデータ（partition `persist:chattaker-chatgpt` / `persist:chattaker-gemini`）に残ります。

## 設定

プラグインの設定画面で指定します。

- **保存フォルダ**: vault からの相対パス。初期値は `Chats`。無いときは保存時に作ります。
- **ファイル名**: ChatGPT 保存時のテンプレート。初期値は `ChatGPT_{{date:YYMMDD_HHmmss}}`。拡張子は形式に応じて `.md` / `.pdf` が付きます。日付の書式には `YY` `YYYY` `MM` `DD` `HH` `mm` `ss` を使えます。同じ名前があるときは `_2`、`_3` と番号を足します。Gemini は常に `Gemini_{{date:YYMMDD_HHmmss}}` です。

## 動作

- ツールバーで ChatGPT と Gemini を切り替えられます。表示はそのサイトだけです。
- **会話を保存** を押すと、**Markdown** か **PDF** を選べます。自動保存はしません。前回選んだ形式を覚えます。
- **Markdown**: その時点の会話を新しいノートにします。ユーザー入力は Question コールアウト（`> [!question]`）です。画像もできる範囲で埋め込みます。参照リンクは取れる範囲で `[名前](URL)` と末尾の「参照」一覧に残します。
- **PDF**: Markdown と同じく会話全文を収集し、印刷用 HTML にしてから `printToPDF` で PDF 化します（画面の切り取りではありません）。設定フォルダへ `.pdf` を保存します。
- ファイル名は押した日時で、`ChatGPT_YYMMDD_HHmmss.md` / `.pdf` または Gemini 版です。
- **新規チャット** を押すと、表示中のサイトの先頭に戻します。以前のノートは消しません。

### 参照リンク

- 本文中のリンクは、可能な場合 `[表示名](https://...)` として保存します。
- 引用 pill や出典一覧（Sources など）から取れた URL は、ノート末尾の `## 参照` にもまとめます。
- 相対パスは絶対 URL に直します。`javascript:` などは除外します。

### 画像（Markdown 保存時）

- **静的画像**（`<img>`）: webview 内で取得し、`保存フォルダ/attachments/` に保存してノートへ埋め込みます。
- **canvas など**: 要素を画面中央にスクロールしてから `capturePage` で撮影し、同じ `attachments/` に PNG として保存します。
- **地図**: 可能な範囲で iframe URL などから座標・元 URL を取り、PNG（見た目）に加えて再構成 HTML を保存します。Obsidian では PNG 埋め込みが主表示で、HTML / 元 URL はリンクです（`![[*.html]]` ではインタラクティブ地図になりません）。座標が足りないときは従来どおり PNG のみです。再構成 HTML は元サービスそのものの完全保存ではありません。
- 画像は会話内の取得位置に埋め込みます。位置が分からないものだけ先頭に置きます。
- Windows / macOS / Linux で同じ API だけを使います。
- 取得に失敗した画像はスキップし、テキストの保存は続行します。

ノート例:

```markdown
---
chatgpt-id: "会話ID"
datetime: 2026-10-03T21:00:00
---

> [!question]
> 入力したプロンプト

応答の本文...

[Example Site](https://example.com/page)

![[Chats/attachments/ChatGPT_261003_210000_01.png]]

[再構成地図](Chats/attachments/ChatGPT_261003_210000_01.html) · [元の地図を開く](https://www.google.com/maps/@35.6812,139.7671,15z)

## 参照

- [Example Site](https://example.com/page)
```

## ビルド

```powershell
cd D:\BTSync\Cursor\ChatTaker_PlugIn
npm install
npm run build
```

`npm run check` は型検査、ビルド、ファイル名と Markdown 変換の確認をまとめて実行します。

## Obsidian への配置

ビルド後、次の 3 ファイルを vault の `.obsidian/plugins/chattaker/` に置きます。

- `main.js`
- `manifest.json`
- `styles.css`

Obsidian を再起動し、設定のコミュニティプラグインで「ChatTaker」を有効にします。左のリボン、またはコマンド「ChatTaker を開く」でビューを開きます。

## 制限

このプラグインは ChatGPT や Gemini の API を使いません。表示中のページから発言を集めています。ChatGPT や Gemini の画面構成が変わると、取得できないことがあります。

画像まわりの限界（Markdown）:

- 期限付き URL や未表示の遅延読み込み画像は取れないことがあります
- スクリーンショットは、保存時に画面上へスクロールして見える範囲のみです
- 地図の再構成 HTML は取得できた座標／URL があるときだけです。クロスオリジン iframe の中身は読めません
- 再構成 HTML の OSM 表示は閲覧時にネットワークが必要です（CDN ライブラリは使いません）
- 動画やアニメ GIF の全フレーム、フルページ縦つなぎキャプチャは対象外です

参照リンクの限界:

- DOM や出典 flyout に URL が出ていない場合は、名前だけになることがあります
- 出典ボタン／flyout の UI 変更で取得できないことがあります
- 追跡用リダイレクト URL はそのまま保存します（展開しません）

PDF の限界:

- サイト画面そのものの見た目ではなく、収集した会話を整形した印刷レイアウトです
- 地図も PDF では PNG のみです（HTML は埋め込みません）
- 取得できなかった画像は PDF にも入りません（Markdown 保存時と同じ制限）
- Obsidian 内での編集・横断検索は Markdown より弱いです
- Electron の `printToPDF` が稀に失敗することがあります（再試行で直る場合あり）

テキストではコード、見出し、強調、リスト、引用、表、リンクを Markdown にします。
