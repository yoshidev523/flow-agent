---
name: flow-plan-review-structure-integration
description: Plan成果物を構造・責務・統合の観点で評価し、固有のreview sourceを保存する。
---

# Flow Plan Review Structure Integration

## 責務

- reviewer ID: `structure-integration`
- 入力: `review_cycle_id`、`plan.md`のpath、revision、SHA-256、
  `design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/plan/structure-integration.md`
- 担当: Designとの対応、変更責務、input/output、接続点、依存、互換性
- 担当外: 実行可能性、検証可能性、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。

## 出力契約

PlanとDesignのSHA-256を評価開始時に再計算し、不一致なら`unable`とする。
`review-source-v1`を使用し、front matterへ`phase: plan`、`review_cycle_id`、
`source_id: structure-integration`、`source_kind: ai`、対象path、revision、
SHA-256、Designのpath、revision、SHA-256を記録する。statusは
`passed | changes_required | blocked | unable`とする。
各findingにはID、対象、問題、根拠、要求変更、完了条件を含める。

- `changes_required`は既存Designとscope内の修正で解消できる場合に使う。
- DesignのWHAT、公開API、責務境界の再決定が必要なら`blocked`とする。
- 入力不備、対象不在、digest不一致は`unable`とする。

`blocked`の各findingには、review hubが利用者向け文面を作れるよう、判断材料として
質問、今決める理由、2〜3個の選択肢と各影響、推奨と理由、短い回答形式を加える。
各要素は簡潔にし、PlanとDesignから根拠づけられない方針を追加しない。
必ず選択肢の1つを推奨し、根拠と仮定を明記する。
