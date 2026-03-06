# 03 調査と参照

## 分かったこと（詳細）
- Clipboardは secure context と user activation 条件の影響を受ける。
- scrollTop/scrollHeight比較は閾値方式が安定。
- localStorageはQuotaExceededError考慮が必要。
- blob URLは revoke が必要。

## 技術要素
- Web API仕様
- MDN/WHATWG/W3C一次情報
- Context7照合

## 決定事項
- 収束判定とUIコピー導線は現行方式を維持しつつ堅牢化。

## 未解決点
- ブラウザバージョン差異による細部挙動。

## 検証方法
- 実ブラウザでコピー失敗時フォールバック確認。

## 関連ファイル/URL
- https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
- https://developer.mozilla.org/en-US/docs/Glossary/Transient_activation
- https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollHeight
- https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- https://w3c.github.io/clipboard-apis/
- https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation
- https://ai.google.dev/aistudio/
