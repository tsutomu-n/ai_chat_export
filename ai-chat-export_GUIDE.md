# Bookmarklet技術解説（Senior SE向け）

## 1. 目的とスコープ
この文書は `ai-chat-export.js` の設計・実装・運用を、保守担当のシニアエンジニアが短時間で把握し、改修判断できる粒度でまとめたもの。

対象スコープ:
- ブックマークレット本体のアーキテクチャ
- サイト別抽出器の実装方針
- 長文スレッド収集アルゴリズム（スクロール制御）
- 品質判定ロジック（PASS/WARN/FAIL）
- サイト別デフォルト設定、永続化、運用フロー
- ワンライナー生成手順

非スコープ:
- ブラウザ拡張版（`extension/`）の詳細
- 一般ユーザー向け簡易説明

---

## 2. ファイル構成

主要ファイル:
- `ai-chat-export.js`
  - 読みやすいソース版（編集対象）
- `ai-chat-export.oneliner.js`
  - ブックマークURL直接貼り付け用ワンライナー（生成物）
- `generate_oneline_bookmarklet.sh`
  - ワンライナー再生成スクリプト

運用原則:
- 変更は常に `ai-chat-export.js` に対して実施
- `ai-chat-export.oneliner.js` は手編集しない

---

## 3. 実行モデル
`ai-chat-export.js` は以下の形式で起動する。

```javascript
javascript:(async () => { ... })();
```

特徴:
- IIFE によりグローバル汚染を最小化
- 非同期処理をトップレベルで自然に扱える
- 実行文脈は「現在開いている対象サイトのDOM」

ライフサイクル:
1. 設定ダイアログ表示
2. 対象ホストに対応する抽出器を解決
3. スクロール収集（上方向ロード + 下方向走査）
4. メッセージ整形（Markdown front matter + 本文）
5. 品質サマリ提示
6. クリップボードコピー or ファイルダウンロード

---

## 4. 全体アーキテクチャ（モジュール分割）
実装は6モジュールで構成される。

1. `MODULE 1: CONFIG & THEME`
2. `MODULE 2: UTILITIES`
3. `MODULE 3: MARKDOWN PARSER`
4. `MODULE 4: PLATFORM EXTRACTORS`
5. `MODULE 5: INCREMENTAL HARVESTER`
6. `MODULE 6: UI & STATE MANAGEMENT`

モジュール分割意図:
- UI、抽出、収集、品質判定を責務分離
- 抽出器のDOM追従を局所化
- 長文対策の調整点（`scrollMax`, `scrollDelay`）をUIから直接制御

---

## 5. MODULE 1: CONFIG & THEME
定数:
- `APP_ID = "polymath-omni-exporter-v3"`
- カラー・フォントを `THEME` で一元管理

役割:
- 見た目定義の集中管理
- localStorage key namespace の基点定義

---

## 6. MODULE 2: UTILITIES
### 6.1 `Utils.el()`
DOM生成ヘルパー。属性の取り扱いを厳密に分岐。

実装ポイント:
- `style` は `style.cssText`
- `text` は `textContent`
- `on*` は event listener へバインド
- boolean属性は DOM property を優先設定
- `value/checked/selected` は property に直接代入

意図:
- `selected=false` でも属性が残る問題を回避
- フォーム状態を属性ではなく IDL property 側で安定制御

### 6.2 `Utils.sleep()`
待機制御。スクロール後のDOM安定待ちで使用。

### 6.3 `Utils.toast()`
右下トースト表示。フェーズ進行の視認性向上。

---

## 7. MODULE 3: MarkdownParser
### 7.1 基本戦略
DOMを再帰走査し、タグ別ルールでMarkdown文字列化。

主要ルール:
- `pre` は fenced code block 化
- `code` は inline code 化
- `a` は `[text](href)` 化
- `img` は `[Image: alt]` 化
- `h1-h6`, `li`, `ul/ol`, `strong/em` を簡易マップ

### 7.2 Shadow DOM対応
- ノードが `shadowRoot` を持つ場合は shadow 側へ潜る
- AI系UIのWebComponent構成に対応

### 7.3 クリーニング
`clean()` で改行の圧縮、リンク崩れの最低限補正を実施。

制約:
- 完全なHTML->Markdown変換器ではない
- テーブル、複雑ネスト、埋め込みWidgetは簡易表現に留まる

---

## 8. MODULE 4: Platform Extractors
## 8.1 ホスト判定
`ExtractorFactory.getHostContext()` でホストごとの抽出器を選択。

判定関数:
- `isAIStudioHost(host)`
- `isChatGPTHost(host)`
- `isGrokHost(host, path)`（`x.com` の `/i/grok` 経路を含む）

### 8.2 ノード署名 `nodeSignature(el)`
同一文面の別ターンを区別するためのシグネチャ生成。

優先順:
1. 安定ID属性（`data-message-id` など）
2. 取れない場合はDOM階層パス（tag + sibling index）を深さ8まで構成

用途:
- ハーベスタの重複除去キー生成に利用

### 8.3 サイト別抽出器
#### AI Studio
- `ms-chat-turn` を列挙
- `.chat-turn-container` から role 推定
- `.turn-content` から本文抽出

#### ChatGPT/OpenAI
- 第一候補: `[data-message-author-role]`
- フォールバック: `conversation-turn` 系 `data-testid`
- roleは属性優先、なければ局所推定

#### Grok
- 第一候補: `div.message-bubble`
- フォールバック: hash系class探索 + `div[dir="ltr"]`
- role推定は class特徴 + 内容特徴（code/list/header）併用

#### Claude / Gemini / DeepSeek
- それぞれ既知セレクタに特化
- DeepSeek は reasoningブロックを除去

---

## 9. MODULE 5: Incremental Harvester
本体の品質を決める中核モジュール。

## 9.1 目的
- 仮想化された長文チャットで過去履歴を可能な限り収集
- 過剰走査を抑えつつ、収束判定を可視化

### 9.2 スクロール対象選定 `findScrollContainer()`
候補をスコアリングして最有力を採用。

スコア要素:
- `scrollableRange`
- 画面可視面積
- メッセージシグナル数（対象セレクタのヒット数）
- ルートスクローラへのブースト

フォールバック:
- 候補なしでも `rootScroller` を返すため型不整合なし

### 9.3 ハーベスト2フェーズ
フェーズ1: 上方向ロード
- `step = max(120, viewport * 0.8)`
- 上に刻んで移動しながら capture
- 進捗なし・増分なしが連続したら停止
- 最上部固定の追加ロード待機ループあり

フェーズ2: 下方向走査
- 上端から下へ同ステップで走査
- 末端で新規増分が止まったら停止

最終フェーズ:
- final pass で追加新規が出るか確認

### 9.4 重複除去キー
現在のキー:
- `sig + role + content`
- `sig` 取得不可時は `role + content + idx` フォールバック

意図:
- 同じ文面が別ターンに再登場しても識別しやすくする
- 同一ターンの再検出を抑制

### 9.5 品質判定 `buildQuality()`
算出:
- `topConverged`
- `bottomConverged`
- `finalPassStable`
- 上記3チェックの失敗数で `PASS/WARN/FAIL`

スコア:
- 収束チェック達成率を 0-100 にマップ

---

## 10. MODULE 6: UI & State Management
## 10.1 サイトIDとデフォルト
`siteId`:
- `grok`
- `chatgpt`
- `aistudio`
- `generic`

現行デフォルト:
- Grok: `scrollMax=110`, `scrollDelay=450`
- ChatGPT/OpenAI: `106`, `500`
- AI Studio: `96`, `550`
- Generic: `105`, `500`

### 10.2 設定の永続化
保存キー:
- `polymath-omni-exporter-v3_prefs_<siteId>`

意味:
- サイトごとに設定が独立
- Grok調整値がChatGPTへ波及しない

### 10.3 再現性トラッキング
保存キー:
- `polymath-omni-exporter-v3_run_history`

内容:
- `origin + pathname` 単位で前回件数を保持
- 現在値との差分・差分率を計算
- `stable`: `diff <= 1` または `diffRate <= 1%`

### 10.4 結果ダイアログのメトリクス
表示項目:
- `Status: PASS/WARN/FAIL`
- `Convergence score`
- `Captured messages`
- `Top stable`
- `Bottom stable`
- `Final pass stable`
- `Consistency vs prev`

---

## 11. パフォーマンスと120秒制約
ハーベスト上限時間の概算:

`Tmax ≈ delay * (2*scrollMax + max(6, floor(scrollMax/4))) + finalPassDelay`

`finalPassDelay` は `80..300ms` にクランプ。

現行デフォルトの概算:
- Grok: `450*(220+27)+225 ≈ 111.4秒`
- ChatGPT: `500*(212+26)+250 ≈ 119.3秒`
- AI Studio: `550*(192+24)+275 ≈ 119.1秒`

設計意図:
- 120秒以内を守りながら、完全性優先で上限を使い切る設定

---

## 12. 実装上の重要不変条件（Invariant）
変更時に壊してはいけない前提。

1. スクロール対象は常に `Element` で扱えること
2. 抽出器は `[{ role, content, sig? }]` を返すこと
3. 収束判定は `Top/Bottom/Final` の3系統を維持すること
4. 設定キーはサイト分離されていること
5. ワンライナーは必ず `javascript:` で始まること

---

## 13. 代表的な改修ポイント
### 13.1 新規サイト追加
1. `is<Site>Host()` を追加
2. `extract<Site>()` を追加
3. `getHostContext()` に分岐追加
4. `getSiteDefaults()` にデフォルト追加

### 13.2 抽出品質の改善
1. 既存DOMで安定ID属性を優先利用
2. `nodeSignature()` の優先属性をサイト事情に合わせて拡張
3. role推定を「構造優先、交互推定は最終手段」に維持

### 13.3 収束ロジック調整
調整レバー:
- `scrollMax`
- `scrollDelay`
- `step` 計算式
- settle loop の閾値

---

## 14. 既知制約
1. `sig` が不安定なDOMでは、重複判定の精度が低下し得る
2. 完全な真値（ground truth）なしに「100%完全」を断定はできない
3. Markdown変換は簡易実装のため、複雑要素は情報落ちする場合がある

---

## 15. 運用手順（実務）
### 15.1 日常運用
1. 対象チャットページでブックマークレットを実行
2. サイト別デフォルト値を起点に必要なら調整
3. 結果ダイアログで `Status` と `Consistency` を確認
4. `Copy` か `Download` を選択

### 15.2 改修後の生成
必ず以下でワンライナー再生成。

```bash
generate_oneline_bookmarklet.sh
```

---

## 16. メンテナンスチェックリスト
改修時は最低限以下を確認。

1. `ai-chat-export.js` にのみ手を入れたか
2. サイト別設定が他サイトへ波及しないか
3. `Status` 表示が `PASS/WARN/FAIL` のルール通りか
4. `Consistency vs prev` が初回N/A、2回目以降差分表示になるか
5. ワンライナー再生成済みか

---

## 17. 変更履歴（現行状態の要約）
直近反映済みの設計変更:
1. 長文向けスクロール収束ロジック強化
2. サイト別デフォルト（120秒制約対応）
3. サイト別設定永続化
4. `duplicate rate` 廃止、収束チェック中心の品質表示へ移行
5. 同一文面別ターン欠落対策として `nodeSignature` 導入

---

## 18. 補足: 主要データ構造
### 抽出メッセージ
```ts
type Message = {
  role: 'User' | 'Model';
  content: string;
  sig?: string;     // node signature
  _order?: number;  // harvest内部付与
}
```

### 品質サマリ
```ts
type Quality = {
  status: 'PASS' | 'WARN' | 'FAIL';
  score: number;
  totalMessages: number;
  topReached: boolean;
  bottomReached: boolean;
  topStableHits: number;
  bottomStableHits: number;
  finalNewMessages: number;
  topConverged: boolean;
  bottomConverged: boolean;
  finalPassStable: boolean;
}
```

---

## 19. 結論
`ai-chat-export.js` は、個人開発前提で以下を両立する設計になっている。

1. 対象サイト差分に追従しやすい抽出器分離
2. 長文セッション向けの収束型ハーベスト
3. サイト別設定での運用効率
4. PASS/WARN/FAIL による実行品質判断

保守時は「抽出器」と「収束条件」を分離して扱うことが、回帰を最小化する最短ルート。
