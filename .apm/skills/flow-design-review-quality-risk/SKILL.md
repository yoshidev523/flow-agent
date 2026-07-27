---
name: flow-design-review-quality-risk
description: Design成果物を品質条件と直接リスクの観点で評価し、固有のreview sourceを保存する。
---

# Flow Design Review Quality Risk

## 責務

- reviewer ID: `quality-risk`
- 入力: `review_cycle_id`、`design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/design/quality-risk.md`
- 担当: 非機能条件、失敗時挙動、データ保護、互換性、運用上の直接リスク
- 担当外: 要件・利用者価値の再決定、実装方法、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。

## 出力契約

`review-source-v1`を使用し、front matterへ`phase: design`、`review_cycle_id`、
`source_id: quality-risk`、`source_kind: ai`、対象path、revision、SHA-256、
statusを記録する。
statusは`passed | changes_required | blocked | unable`とする。

- `passed`: 担当観点で変更要求がない。
- `changes_required`: 既存scope内の具体的修正で解消できる。
- `blocked`: リスク受容、security、privacy、法務、継続costの判断が必要。
- `unable`: 入力不備、対象不在、digest不一致などで評価不能。

各findingにはID、対象、問題、根拠、要求変更、完了条件を含める。
重大な安全性、データ損失、互換性破壊は`blocked`とし、因果関係を明記する。
