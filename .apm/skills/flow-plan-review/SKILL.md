---
name: flow-plan-review
description: PlanのAIまたは人間review sourceを集約し、plan-review.mdへ保存するローカルハブ。
---

# Flow Plan Review

## 目的

指定された`plan.md`を、1サイクルにつきAIまたは人間の一方のsourceで評価し、
集約結果を`spec/{yyyymmdd_feature}/plan-review.md`へ保存する。
このskillはsource収集と集約だけを担当し、Plan修正、ユーザー対話、状態遷移を行わない。

## 入力

- `review_cycle_id`
- `target_path`
- `target_revision`
- `target_sha256`
- `mode: ai | human`
- `review_path`
- `design_path`
- `design_revision`
- `design_sha256`

`review_cycle_id`はFlowがreview開始ごとに発行する一意な値とする。
開始時にPlanとDesignの全バイトSHA-256を計算し、入力と一致しなければ
`status: incomplete`の成果物を作成する。

## Source収集

### AI mode

次の3 agentを並列起動する。

- `flow-plan-structure-integration-reviewer`
- `flow-plan-executability-reviewer`
- `flow-plan-verifiability-reviewer`

各agentへ同じ`review_cycle_id`を渡し、固有の`review-source-v1`を次へ保存する。
structure-integration reviewerへはDesignのpath、revision、SHA-256も渡す。

- `reviews/plan/structure-integration.md`
- `reviews/plan/executability.md`
- `reviews/plan/verifiability.md`

### Human mode

Flowが同じ`review_cycle_id`で保存した`reviews/plan/human.md`を読む。このファイルも
`review-source-v1`を使い、`source_kind: human`とする。
このhubは人間への質問や回答の解釈を行わない。

1サイクル内でAIと人間のsourceを混在させない。`mode`と異なるsourceは集約対象外とする。

## 集約

sourceのcycle ID、対象path、revision、SHA-256が入力と一致することを確認する。
structure-integration sourceはDesignのpath、revision、SHA-256も一致を必須とする。
固定pathに残る別cycleのsourceは存在していても欠落扱いにする。

- 1件でも`unable`、欠落、契約不一致がある: `incomplete`
- 1件でも`blocked`: `blocked`
- 1件でも`changes_required`: `changes_required`
- 必要sourceがすべて`passed`: `passed`

Human modeではhuman source 1件を同じ規則で写像する。
集約直前にも対象SHA-256を再計算し、変化していれば`incomplete`とする。

## 出力

出力は`phase-review-v1`とする。

```yaml
---
schema_version: flow/phase-review-v1
phase: plan
review_cycle_id: plan-r1-20260728T000000
target_path: spec/.../plan.md
target_revision: 1
target_sha256: "{64 lowercase hex}"
design_path: spec/.../design.md
design_revision: 1
design_sha256: "{64 lowercase hex}"
mode: ai
status: passed
source_paths:
  - spec/.../reviews/plan/structure-integration.md
completed_at: 2026-07-28T00:00:00+09:00
---
```

本文にはsource別status、finding、集約理由、失敗情報を記載する。
過去の結果を混ぜず、常に現在の対象revisionに対する最新集約へ置き換える。

## 完了条件

- `plan-review.md`だけを集約成果物として編集している。
- sourceはそれぞれ固有のwriterが作成している。
- modeに必要な全sourceを検証している。
- statusが`passed | changes_required | blocked | incomplete`のいずれかである。
- cycle ID、PlanとDesignのpath、revision、SHA-256が追跡できる。
