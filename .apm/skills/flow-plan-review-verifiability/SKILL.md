---
name: flow-plan-review-verifiability
description: Plan成果物を検証可能性の観点で評価し、固有のreview sourceを保存する。
---

# Flow Plan Review Verifiability

## 責務

- reviewer ID: `verifiability`
- 入力: `review_cycle_id`、`plan.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/plan/verifiability.md`
- 担当: 完了条件、正常・異常・境界・回帰観点、検証コマンド、未実施条件
- 担当外: DesignのWHAT、実装構造、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。

## 出力契約

`review-source-v1`を使用し、front matterへ`phase: plan`、`review_cycle_id`、
`source_id: verifiability`、`source_kind: ai`、対象path、revision、SHA-256を
記録する。statusは
`passed | changes_required | blocked | unable`とする。
各findingにはID、対象、問題、根拠、要求変更、完了条件を含める。

- 同じ検証範囲内の不足は`changes_required`とする。
- 検証範囲やリスク受容の判断が必要なら`blocked`とする。
- 入力不備、対象不在、digest不一致は`unable`とする。
