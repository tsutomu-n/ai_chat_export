# Bookmarklet機能定義書

## 1. 文書目的
`ai-chat-export.js` の現行実装について、機能を漏れなく定義する。  
本書は「仕様確認」「改修判断」「回帰確認」の基準として使う。

## 2. 対象
- 実装本体: `ai-chat-export.js`
- 生成物: `ai-chat-export.oneliner.js`
- 生成スクリプト: `generate_oneline_bookmarklet.sh`

## 3. システム概要
このブックマークレットは、AIチャットサイト上で実行される単一JavaScriptアプリである。  
主処理は以下。

1. 設定ダイアログを表示する
2. 対象ホストに応じた抽出器を選択する
3. 上方向・下方向スクロールで会話履歴を収集する
4. Markdownを生成する
5. 品質メトリクスと整合性メトリクスを表示する
6. クリップボードへコピー、または `.md` ダウンロードする

## 4. 実行エントリ
実行形式:

```javascript
javascript:(async () => { ... })();
```

起動点:
- `new App().run();`

## 5. 前提条件
- ブラウザで対象チャットページが開かれていること
- 実行文脈がブックマークレット実行可能であること
- コピー機能はユーザー操作由来イベント内で動くこと

## 6. 対応プラットフォーム
判定関数は `ExtractorFactory.getHostContext()` に集約。

- AI Studio:
  - `aistudio.google.com`
  - `*.aistudio.google.com`
  - `hostname` が `aistudio` を含む
- Grok:
  - `hostname` が `grok` を含む
  - または `x.com`/`twitter.com` 系で `pathname` が `/i/grok` で始まる
- ChatGPT/OpenAI:
  - `chatgpt.com`
  - `*.chatgpt.com`
  - `chat.openai.com`
- Claude:
  - `hostname` が `claude` を含む
- Gemini:
  - `hostname` が `gemini` を含む
- DeepSeek:
  - `hostname` が `deepseek` を含む

未対応ホスト:
- `Error("Unsupported platform: <host>")` を投げる

## 7. モジュール定義
コードは6モジュール構成。

1. `CONFIG & THEME`
2. `UTILITIES`
3. `MARKDOWN PARSER`
4. `PLATFORM EXTRACTORS`
5. `INCREMENTAL HARVESTER`
6. `UI & STATE MANAGEMENT`

---

## 8. 定数・設定値
### 8.1 グローバル定数
- `APP_ID = "polymath-omni-exporter-v3"`
- `THEME`:
  - `bg`, `surface`, `fg`, `border`, `accent`, `accentHover`, `success`, `error`, `font`

### 8.2 サイト別デフォルト（`App.getSiteDefaults()`）
- `grok`: `{ fmt: "obs", scrollMax: 110, scrollDelay: 450 }`
- `chatgpt`: `{ fmt: "obs", scrollMax: 106, scrollDelay: 500 }`
- `aistudio`: `{ fmt: "obs", scrollMax: 96, scrollDelay: 550 }`
- `generic`: `{ fmt: "obs", scrollMax: 105, scrollDelay: 500 }`

### 8.3 入力制約（UI）
- `scrollMax`: 20〜500（整数）
- `scrollDelay`: 100〜4000（整数, step 50）
- `fmt`: `obs` または `std`

---

## 9. 関数仕様（全関数）
## 9.1 `Utils`
### `Utils.el(tag, attrs = {}, children = [])`
入力:
- `tag`: HTMLタグ名
- `attrs`: 属性定義
- `children`: 子ノード配列

処理:
- `style` は `style.cssText` に設定
- `text` は `textContent` に設定
- `on*` はイベントリスナー登録
- boolean値は DOM property と属性（true時のみ）を設定
- `value/checked/selected` は property に設定
- その他は `setAttribute`

出力:
- 生成済み `HTMLElement`

副作用:
- なし

### `Utils.sleep(ms)`
入力:
- `ms` ミリ秒
出力:
- `Promise<void>`

### `Utils.toast(message, type = "info")`
入力:
- `message`
- `type`: `info|success|error`

処理:
- 右下固定トースト表示
- 3秒後フェードアウトして削除

副作用:
- `document.body` へDOM追加・削除

---

## 9.2 `MarkdownParser`
### `MarkdownParser.parse(node)`
入力:
- 任意DOMノード

処理:
- nullなら空文字
- `shadowRoot` を優先再帰
- 非表示要素（`display:none` / `visibility:hidden`）は除外
- テキストノードは `NBSP` を通常スペース化
- タグごとのMarkdown変換

タグ変換規則:
- `pre`: fenced code block（言語推定: `language-*`）
- `code`: inline code
- `a`: `[text](href)`
- `img`: `[Image: alt]`
- `h1...h6`: 見出し
- `li`: `-` リスト項目
- `ul/ol`: 子要素展開
- `strong/b`, `em/i`: 強調
- `p/div/article/section`: 前後改行付与
- `br`: 改行
- その他: 子要素連結

出力:
- Markdown文字列（未クリーン）

### `MarkdownParser.clean(markdown)`
処理:
- 3連続以上改行を2連続へ圧縮
- `]\n(` を `](` へ補正
- trim

### `MarkdownParser.extract(node)`
処理:
- `parse()` + `clean()`
出力:
- 最終Markdown文字列

---

## 9.3 `ExtractorFactory`
### `getHostContext()`
入力:
- 現在ページ `location.hostname/pathname`
出力:
- 抽出関数（`extractAIStudio` など）
失敗:
- 未対応時に例外

### `isAIStudioHost(host)`
出力:
- boolean

### `isChatGPTHost(host)`
出力:
- boolean

### `isGrokHost(host, path)`
出力:
- boolean

### `getDeep(root, selector, acc = [])`
処理:
- Shadow DOM含む深掘りセレクタ探索
出力:
- 該当要素配列

### `nodeSignature(el)`
目的:
- 同文面別ターン識別用シグネチャ生成

優先順:
1. 属性ID（`data-message-id`, `data-turn-id`, `data-testid`, `id`, `data-node-id`）
2. DOMパス（tag + 同tag sibling index）を深さ8まで

出力:
- 署名文字列（取得不可なら空）

### `extractAIStudio()`
抽出対象:
- `ms-chat-turn`
role判定:
- `.chat-turn-container.user` なら User、それ以外 Model
本文:
- `.turn-content` 優先
- 空または `more_vert` の場合は text fallback

出力:
- `[{ role, content, sig }]`

### `extractChatGPT()`
第一経路:
- `[data-message-author-role]` を直接抽出
フォールバック:
- `conversation-turn` 系 `data-testid`
- roleは属性探索優先、最終手段で交互推定

出力:
- `[{ role, content, sig }]`

### `extractClaude()`
対象:
- User: `.font-user-message`, `[data-testid="user-message"]`
- Model: `.font-claude-response`
順序:
- `compareDocumentPosition` で文書順ソート

出力:
- `[{ role, content, sig }]`

### `extractDeepSeek()`
対象:
- `.ds-chat-message` 優先、なければ `.ds-message`
追加処理:
- `.ds-markdown--reasoning` を除去
role:
- class判定 + フォールバック交互推定

出力:
- `[{ role, content, sig }]`

### `extractGemini()`
対象:
- `user-query-content, message-content`（deep探索）
role:
- タグ名に `user` を含むか

出力:
- `[{ role, content, sig }]`

### `extractGrok()`
対象:
- `div.message-bubble`
- fallback: hash系class要素 + `div[dir="ltr"]`
フィルタ:
- 文字数 10〜50000
role:
- class特徴 + コンテンツ特徴 + フォールバック交互推定

出力:
- `[{ role, content, sig }]`

---

## 9.4 `ScrollEngine`
### `buildQuality(messages, stats)`
入力:
- 収集済みメッセージ
- 収集統計 `stats`

判定項目:
- `topConverged`: 上端到達かつ安定ヒット数>=2
- `bottomConverged`: 下端到達かつ安定ヒット数>=2
- `finalPassStable`: 最終追加メッセージ数が0

判定:
- 失敗0件: `PASS`
- 失敗1件: `WARN`
- 失敗2件以上: `FAIL`

スコア:
- 3チェックの達成率を0〜100へ変換

出力:
- `quality` オブジェクト

### `getDocumentScroller()`
出力:
- `document.scrollingElement || document.documentElement || document.body`

### `getMessageSignalCount(el)`
目的:
- スクロール対象候補のメッセージ密度指標
対象セレクタ:
- `[data-message-author-role]`
- `[data-testid^="conversation-turn-"]`
- `ms-chat-turn`
- `div.message-bubble`
- `.ds-chat-message`
- `.ds-message`
- `.font-claude-response`

### `findScrollContainer()`
目的:
- 実際に会話を持つスクロールコンテナ選定

処理:
1. ルートスクローラを候補追加
2. 全要素を走査し、`overflowY` が `auto|scroll|overlay` の要素を候補化
3. 候補ごとにスコア算出
   - `scrollableRange`
   - 可視面積
   - メッセージシグナル数
   - ルートブースト
4. 最高スコア要素を返す
5. 候補ゼロならルートスクローラ返却

### `harvest(maxScrolls, delayMs, extractorFn)`
入力:
- `maxScrolls`
- `delayMs`
- 抽出関数

処理:
1. スクロール対象特定
2. `capture()` 定義
   - 抽出器実行
   - `sig + role + content` で重複排除
   - `sig` 不在時は `role + content + idx` でフォールバック
3. Phase1 上方向ロード
4. 上端固定追加ロード（settle）
5. Phase2 下方向走査
6. 最終追加パス
7. `_order` で安定ソート
8. `quality` 生成

出力:
- `{ messages, quality }`

---

## 9.5 `App`
### `constructor()`
処理:
- `siteId`, `siteDefaults`, `config` 初期化

### `getSiteId()`
出力:
- `grok|chatgpt|aistudio|generic`

### `getSiteDefaults()`
出力:
- サイト別デフォルト設定

### `getPrefStorageKey()`
出力:
- `polymath-omni-exporter-v3_prefs_<siteId>`

### `clampNumber(value, fallback, min, max)`
入力:
- 数値候補
出力:
- 範囲内整数またはfallback

### `loadPref()`
処理:
- サイト別キーから設定読み込み
- `fmt` 正規化（`std` 以外は `obs`）
- `scrollMax/scrollDelay` 範囲クランプ

### `savePref()`
処理:
- サイト別キーへ設定保存

### `trackRunConsistency(messageCount)`
目的:
- 同一URL実行の件数差分追跡

キー:
- `polymath-omni-exporter-v3_run_history`
- サブキー: `origin + pathname`

判定:
- `stable = (diff <= 1) or (diffRate <= 0.01)`

出力:
- 初回: `null`
- 2回目以降: 差分情報オブジェクト

### `createOverlay()`
処理:
- 画面全体オーバーレイ要素生成

### `showConfigDialog()`
UI項目:
- Format
- Scroll Max
- Delay (ms)

挙動:
- Start で値をクランプして保存
- Close で中断

出力:
- `Promise<boolean>`（処理継続可否）

### `showResultDialog(title, output, messageCount, quality, consistency)`
表示内容:
- 抽出件数
- `Status: PASS/WARN/FAIL`
- `Convergence score`
- `Top stable` / `Bottom stable` / `Final pass stable`
- `Consistency vs prev`

操作:
- `Copy to Clipboard`
  - 失敗時は自動でダウンロードへフォールバック
- `Download .md`

出力:
- ダイアログ完了 `Promise<void>`

### `formatOutput(messages)`
処理:
- `title/url/date` front matter生成
- 本文生成
  - `obs`: callout形式
  - `std`: `### User|Model` セクション形式

title補正:
- ファイル名不正文字を `_` へ置換
- 最大50文字
- AI Studioは `h1.mode-title/h1.actions` 優先

出力:
- `{ title, output }`

### `downloadFile(title, content)`
処理:
- Markdown Blob生成
- `title_timestamp.md` でダウンロード
- ObjectURLを1秒後解放

### `run()`
主制御:
1. 設定ダイアログ
2. 抽出器選択
3. `harvest`
4. 件数0ならエラートースト
5. Markdown生成
6. 再現性計算
7. 結果ダイアログ
8. 例外時はエラートースト

---

## 10. データ構造
### 10.1 Message
```ts
type Message = {
  role: "User" | "Model";
  content: string;
  sig?: string;
  _order?: number;
};
```

### 10.2 Quality
```ts
type Quality = {
  status: "PASS" | "WARN" | "FAIL";
  score: number;            // 0..100
  totalMessages: number;
  topReached: boolean;
  bottomReached: boolean;
  topStableHits: number;
  bottomStableHits: number;
  finalNewMessages: number;
  topConverged: boolean;
  bottomConverged: boolean;
  finalPassStable: boolean;
};
```

### 10.3 Consistency
```ts
type Consistency = {
  previousCount: number;
  diff: number;
  diffRate: number;
  stable: boolean;
} | null;
```

---

## 11. 永続化仕様
### 11.1 サイト別設定
- key: `polymath-omni-exporter-v3_prefs_<siteId>`
- value:
  - `fmt`
  - `scrollMax`
  - `scrollDelay`

### 11.2 実行履歴
- key: `polymath-omni-exporter-v3_run_history`
- value:
  - `<origin+pathname>`: `{ count, at }`

---

## 12. 出力仕様
ファイル形式:
- MIME: `text/markdown;charset=utf-8`
- 拡張子: `.md`

front matter:
```yaml
---
title: <sanitized-title>
url: <page-url>
date: <ISO8601>
---
```

本文:
- `obs`: callout block
- `std`: role見出し + 本文

---

## 13. 失敗時挙動
### 13.1 未対応サイト
- `ExtractorFactory.getHostContext()` で例外
- `run()` の catch に入りトースト表示

### 13.2 抽出0件
- `Extraction failed. DOM structure may be unsupported.` を表示

### 13.3 クリップボード失敗
- 自動で `downloadFile()` へフォールバック

### 13.4 localStorage読み書き失敗
- try/catchで握り、fallback動作継続

---

## 14. 計算量・負荷観点
`findScrollContainer()` は全DOM走査 + `getComputedStyle` を行うため、巨大DOMでは初期コストが高い。  
`harvest()` は `maxScrolls` と `delayMs` に比例して上限時間が増える。

概算上限:
- `~ delayMs * (2*maxScrolls + settleMax)` + final wait
- ただし、停止条件成立で早期終了する

---

## 15. ワンライナー生成仕様
スクリプト:
- `generate_oneline_bookmarklet.sh`

手順:
1. `terser` で圧縮
2. `javascript:` プレフィックス付与保証
3. `ai-chat-export.oneliner.js` 出力

---

## 16. 受け入れ基準（機能観点）
1. 対応サイトで実行できること
2. 設定ダイアログが表示されること
3. `scrollMax/scrollDelay` が反映されること
4. 抽出件数が0でない場合、結果ダイアログが出ること
5. 品質表示に `Status` と4チェック系が出ること
6. Copy失敗時にDownloadへフォールバックすること
7. サイト別設定が独立して保存されること
8. ワンライナー生成後、ブックマークレットとして実行できること

---

## 17. 改修時の注意点（必須）
1. 抽出器は必ず `role/content/sig` 形式を返すこと
2. `findScrollContainer()` は `Element` を返す契約を維持すること
3. 品質判定は `PASS/WARN/FAIL` のルールを維持すること
4. 設定保存キーのサイト分離を崩さないこと
5. ソース編集後は必ずワンライナーを再生成すること

---

## 18. 既知の仕様的制約
1. DOM構造が大きく変わると抽出精度は低下し得る
2. 完全性評価は収束指標ベースであり、真値件数の絶対保証ではない
3. Markdown変換は簡易ルールのため、複雑リッチ要素は情報縮退する場合がある

---

## 19. 要約
`ai-chat-export.js` は、サイト別抽出・収束型スクロール収集・品質可視化・サイト別設定保存を備えた単一実行スクリプトである。  
現行仕様の目的は「120秒級の実行上限を意識しつつ、長文セッションの取りこぼしを最小化」することにある。

