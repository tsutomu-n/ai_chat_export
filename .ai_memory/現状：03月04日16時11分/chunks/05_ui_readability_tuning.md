# 05 UI可読性調整

## 分かったこと（詳細）
- ダーク固定前提で、文字色と背景明度差を拡大。
- フォントウェイト/行間を引き上げ。
- 最終要求で「14px未満禁止」を反映済み。

## 技術要素
- theme token更新
- UI要素のfont-size/line-height/weight調整
- 選択状態の視認性強化

## 決定事項
- 最低14pxをベースラインに固定。

## 未解決点
- 実機で14pxが十分か。

## 検証方法
- Windows+Chromeで設定画面を目視確認。

## 関連ファイル/URL
- /home/tn/projects/tools/ai_logger/new-logger/ai-chat-export.family-ja.v6.js
