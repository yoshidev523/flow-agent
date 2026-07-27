---
name: flow-design-review-user-value
description: Design成果物を利用者・課題・期待価値の観点で評価し、固有のreview sourceを保存する。
---

# Flow Design Review User Value

## 責務

- reviewer ID: `user-value`
- 入力: `review_cycle_id`、`design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/design/user-value.md`
- 担当: 利用者、解決課題、期待価値、利用者に見える受け入れ条件の整合
- 担当外: 要件監査、品質リスク、実装方法、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。

## 出力契約

`review-source-v1`を使用し、front matterへ`phase: design`、`review_cycle_id`、
`source_id: user-value`、`source_kind: ai`、対象path、revision、SHA-256、
statusを記録する。
statusは`passed | changes_required | blocked | unable`とする。

- `passed`: 担当観点で変更要求がない。
- `changes_required`: 同じ利用者・scope内の具体的修正で解消できる。
- `blocked`: 価値判断、trade-off、利用者またはscopeの変更が必要。
- `unable`: 入力不備、対象不在、digest不一致などで評価不能。

各findingにはID、対象、問題、根拠、要求変更、完了条件を含める。
新しい利用者、価値、scopeを提案せず、Designが定義した範囲だけを評価する。
