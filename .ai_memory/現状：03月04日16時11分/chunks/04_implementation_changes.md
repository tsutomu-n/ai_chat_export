# 04 実装変更

## 分かったこと（詳細）
- AI Studio対応を新規追加し、Factoryに組み込み済み。
- 自動展開の誤クリック回避のためキーワード判定を強化済み。
- expandMaxClicks は全体予算化済み。
- final収束確認は2パス化済み。

## 技術要素
- Adapter pattern
- ScrollEngine quality scoring
- keyword filtering
- terser再生成運用

## 決定事項
- 可読版を編集し、onelinerは毎回再生成。

## 未解決点
- AI Studio DOM変化時の将来保守。

## 検証方法
- ChatGPT/AI Studio/Grokで抽出件数比較。

## 関連ファイル/URL
- /home/tn/projects/tools/ai_logger/new-logger/ai-chat-export.family-ja.v6.js
- /home/tn/projects/tools/ai_logger/new-logger/ai-chat-export.family-ja.v6.oneliner.js
