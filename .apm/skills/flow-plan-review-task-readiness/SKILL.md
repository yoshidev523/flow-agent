---
name: flow-plan-review-task-readiness
description: 完成PlanをDesignと採用判断から実装へ引き継げるタスクになっているかの観点で評価し、固有のreview sourceを保存する。
---

# Flow Plan Review Task Readiness

## 責務

- reviewer ID: `task-readiness`
- 入力: `review_cycle_id`、`plan.md`と`design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/plan/task-readiness.md`
- 担当: Designと採用回答の反映、タスク責務、重大な依存と順序、完了条件、検証経路
- 担当外: 詳細HOWの最適性、内部名、軽微な構造調整、test網羅性、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。PlanとDesignのdigest、
Planの`status: ready`を検証し、不一致なら`unable`とする。

## 評価規則

次の実装引き継ぎ条件だけを評価する。

- Designの現在の要件と採用済み回答がタスクへ反映されている。
- 変更対象と責務が特定され、共有境界ではinput/output、接続点、互換性が追跡できる。
- 着手や完了を左右する依存と順序が記載されている。
- 各タスクに観測可能な完了条件がある。
- 受け入れ条件を確認する検証経路があり、未実施なら理由がある。
- 実装者に公開契約、scope、責務境界などの重大な追加判断を残していない。

内部関数や変数の名前、細かなalgorithm、command option、個別test case、より良い実装案は
評価しない。実装者が同じPlanと既存規約の範囲で決められる事項を`gate`にしない。

## 出力契約

`review-source-v1`を使用し、front matterへ`phase: plan`、
`review_stage: final`、cycle ID、`source_id: task-readiness`、`source_kind: ai`、
PlanとDesignのpath、revision、SHA-256、statusを記録する。

- `passed`: 実装者が重大な追加判断なしで着手し、完了を判定できる。
- `changes_required`: 採用済み判断を変えず、既存scope内の具体的修正で引き継げる。
- `blocked`: Design、公開契約、scope、外部権限、採用済み回答の変更が必要。
- `unable`: 入力不備、対象不在、status不一致、digest不一致で評価不能。

各findingにはID、`classification: gate | scope_candidate`、関係する確認事項の
`decision_refs`を含める。`gate`には対象、問題、根拠、要求変更、完了条件を、
`scope_candidate`には現在の引き継ぎには不要な提案、根拠、今回含める影響、推奨処理を
記録する。statusは`gate`だけから決定する。

採用済み回答の良し悪しを再評価せず、Planへの反映だけを確認する。利用者の回答変更が
必要なら`blocked`とし、reviewer自身が回答を変更しない。

`blocked`のfindingにはhubが利用者向け文面を作れるよう、質問、今決める理由、
2〜3個の選択肢と各影響、推奨と理由、短い回答形式を加える。PlanとDesignから
根拠づけられない方針を追加しない。
