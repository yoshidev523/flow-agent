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
最初に`確認事項`の採用済み回答、推奨理由、前提を担当観点から検証し、その後に
現在のscopeの成立性を確認する。各findingにはID、
`classification: gate | scope_candidate`、関係する確認事項の`decision_refs`を含める。
`gate`には対象、問題、根拠、要求変更、完了条件を、`scope_candidate`には提案、根拠、
今回含める影響、推奨処理を含める。

- `gate`: 採用済み判断または前提の誤り、Designとの不整合、現在のPlanを成立させる
  責務、入出力、接続点、依存、互換性の不足。statusは`gate`だけから決定する。
- `scope_candidate`: 現在のPlanの成立には不要な構造変更、公開API追加、将来拡張、
  refactoring。statusへ影響させず、変更要求や自動修正の対象にしない。

- `changes_required`は既存Designとscope内の修正で解消できる場合に使う。
- DesignのWHAT、公開API、責務境界の再決定が必要なら`blocked`とする。
- 入力不備、対象不在、digest不一致は`unable`とする。

既存の別選択肢を推奨できるが、利用者の回答を変更しない。既存選択肢がすべて不適切なら
`changes_required`とし、満たすべき条件を`gate`として記録してwriterへ選択肢の再作成を
要求する。reviewer自身が新しい選択肢や回答を確定しない。利用者による採用済み回答の
変更が必要なら`blocked`とする。

`blocked`の各findingには、review hubが利用者向け文面を作れるよう、判断材料として
質問、今決める理由、2〜3個の選択肢と各影響、推奨と理由、短い回答形式を加える。
各要素は簡潔にし、PlanとDesignから根拠づけられない方針を追加しない。
必ず選択肢の1つを推奨し、根拠と仮定を明記する。
