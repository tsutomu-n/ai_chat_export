# AI Chat Export Bookmarklet

AIチャットの会話ログをMarkdownとしてエクスポートするブックマークレットです。  
長いセッションでも、上方向ロード + 下方向収集で取りこぼしを減らす設計になっています。

## 30秒で使う（最短手順）
1. `ai-chat-export.oneliner.js` を開いて中身をコピー
2. ブラウザの新規ブックマークを作成し、URL欄へ貼り付けて保存
3. チャットページ（例: `grok.com` / `chatgpt.com`）でそのブックマークをクリックし、`Start Extraction`

## 特徴
- 複数プラットフォーム対応のチャット抽出
- Markdown出力（標準Markdown / Obsidian Callout）
- 長文向けスクロール収集（`Scroll Max` / `Delay` 調整可能）
- 実行結果の品質表示（`PASS / WARN / FAIL`）
- サイト別設定の保存（GrokとChatGPTで設定が干渉しない）

## 対応サイト
- `aistudio.google.com` / `*.aistudio.google.com` / `hostname` に `aistudio` を含むドメイン
- `grok` を含むドメイン
- `x.com/i/grok` / `twitter.com/i/grok`（および各サブドメイン）
- `chatgpt.com` / `*.chatgpt.com` / `chat.openai.com`
- `hostname` に `claude` を含むドメイン
- `hostname` に `gemini` を含むドメイン
- `hostname` に `deepseek` を含むドメイン

## クイックスタート
## 1) ブックマークレットを登録
1. ブラウザで新しいブックマークを作成
2. URL欄に `ai-chat-export.oneliner.js` の中身をそのまま貼り付け
3. 名前を付けて保存

## 2) チャットページで実行
1. 対象サイトの会話ページを開く
2. 登録したブックマークレットをクリック
3. 設定ダイアログで必要に応じて値を調整
4. 結果ダイアログで `Copy to Clipboard` または `Download .md`

## 実行オプション
- `Format`
  - `Obsidian (Callouts)` / `Standard Markdown`
- `Scroll Max`
  - スクロール試行の上限回数
  - 取りこぼしがある場合は上げる
- `Delay (ms)`
  - スクロールごとの待機時間
  - ページが重い場合は上げる

## 品質表示の見方
結果ダイアログでは以下を表示します。

- `Status: PASS / WARN / FAIL`
- `Convergence score`
- `Top stable`
- `Bottom stable`
- `Final pass stable`
- `Consistency vs prev`

目安:
- `PASS`: 収束判定が良好
- `WARN`: 一部判定が未達（取りこぼしの可能性あり）
- `FAIL`: 複数判定が未達（設定見直し推奨）

## ファイル構成
- `ai-chat-export.js`
  - 編集対象の可読ソース
- `ai-chat-export.oneliner.js`
  - ブックマークレット実行用ワンライナー（生成物）
- `generate_oneline_bookmarklet.sh`
  - ワンライナー再生成スクリプト
- `ai-chat-export_FUNCTION_DEFINITION.md`
  - 機能定義書（SSOT）
- `ai-chat-export_GUIDE.md`
  - 技術ガイド（補助資料）

## 開発フロー
## 1) ソースを編集
`ai-chat-export.js` を編集

## 2) ワンライナー再生成
```bash
./generate_oneline_bookmarklet.sh
```

## 3) 動作確認
対象チャットページでブックマークレットを再実行し、件数と品質表示を確認

## 必要環境
- `bash`
- `node` / `npm`
- `npx`（`terser` 実行に使用）

## ライセンス
MIT（`LICENSE` 参照）
