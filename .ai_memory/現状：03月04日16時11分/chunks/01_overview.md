# 01 概要

## 分かったこと（詳細）
- 対象ツールは `new-logger/ai-chat-export.family-ja.v6.js` と oneliner。
- 目的は、個人/家族利用向けに抽出漏れを減らし、UIを読みやすくすること。

## 技術要素
- ブックマークレット
- DOM抽出（サイト別Adapter）
- スクロール収束判定
- Markdown/JSON出力

## 決定事項
- 抽出完全性を最優先。
- 主対象は ChatGPT + Google AI Studio（Chat） + Grok維持。

## 未解決点
- 実サイトでの最終回帰確認。

## 検証方法
- 各サイトで1回実行。
- 保存前確認の件数と末尾5件を目視。

## 関連ファイル/URL
- /home/tn/projects/tools/ai_logger/new-logger/ai-chat-export.family-ja.v6.js
- /home/tn/projects/tools/ai_logger/new-logger/README.family-ja.v6.md
