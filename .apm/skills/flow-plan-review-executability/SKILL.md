---
name: flow-plan-review-executability
description: Plan成果物を実行可能性の観点で評価し、固有のreview sourceを保存する。
---

# Flow Plan Review Executability

## 責務

- reviewer ID: `executability`
- 入力: `review_cycle_id`、`plan.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/plan/executability.md`
- 担当: 手順、順序、依存、利用ツール、エラー処理、完了条件
- 担当外: 構造選択、検証網羅性、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。

## 出力契約

`review-source-v1`を使用し、front matterへ`phase: plan`、`review_cycle_id`、
`source_id: executability`、`source_kind: ai`、対象path、revision、SHA-256を
記録する。statusは
`passed | changes_required | blocked | unable`とする。
各findingにはID、対象、問題、根拠、要求変更、完了条件を含める。

- 実装者が同じ方針内で解消できる不足は`changes_required`とする。
- 新しい方針、外部権限、利用者判断が必要なら`blocked`とする。
- 入力不備、対象不在、digest不一致は`unable`とする。
