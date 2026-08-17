---
name: flow-plan-decision-review
description: Flowからの明示委譲、または利用者による`$flow-plan-decision-review`（Claudeでは`/flow-plan-decision-review`）の明示呼び出し時だけ、Planが利用者へ提示する質問・選択肢・推奨のreview sourceを集約し、plan-decision-review.mdへ保存するローカルハブ。通常のレビュー依頼から暗黙に起動しない。
---

# Flow Plan Decision Review

## 目的

`status: needs_input`の`plan.md`にある未回答の質問・選択肢・推奨だけを、利用者へ
提示する前に評価し、`spec/{yyyymmdd_feature}/plan-decision-review.md`へ保存する。
詳細計画の完全性、Plan修正、利用者対話、状態遷移は扱わない。

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

開始時にPlanとDesignの全バイトSHA-256、Planの`status: needs_input`、未回答の
確認事項が1件以上あることを確認する。不一致なら`status: incomplete`とする。

## Source収集

### AI mode

`flow-plan-decision-quality-reviewer`を起動し、同じ`review_cycle_id`の
`review-source-v1`を`reviews/plan-decision/decision-quality.md`へ保存させる。

### Human mode

Flowが同じ`review_cycle_id`で保存した`reviews/plan-decision/human.md`を読む。
このsourceは`review_stage: decision`、`source_kind: human`とする。1 cycle内でAIとhumanを
混在させない。

## 集約

sourceのcycle ID、review stage、PlanとDesignのpath、revision、SHA-256が入力と
一致することを確認する。findingは`classification: gate | scope_candidate`を持ち、
source statusは`gate`だけから決定されていなければならない。

- `unable`、欠落、契約不一致: `incomplete`
- `blocked`: `blocked`
- `changes_required`: `changes_required`
- `passed`: `passed`

集約直前にもPlanとDesignのSHA-256を再計算し、変化していれば`incomplete`とする。
詳細タスクの不足や質問と無関係な改善は集約しない。

`blocked`では、sourceの判断材料から利用者へそのまま提示できる`## 利用者判断`を作る。
質問、背景、2〜3個の選択肢と影響、推奨と理由、短い回答形式を持たせる。reviewerが
既存選択肢にない回答を確定したり、根拠のない条件を追加したりしない。

## 出力

```yaml
---
schema_version: flow/phase-review-v1
phase: plan
review_stage: decision
review_cycle_id: plan-decision-r1-20260728T000000
target_path: spec/.../plan.md
target_revision: 1
target_sha256: "{64 lowercase hex}"
design_path: spec/.../design.md
design_revision: 1
design_sha256: "{64 lowercase hex}"
mode: ai
status: passed
source_paths:
  - spec/.../reviews/plan-decision/decision-quality.md
completed_at: 2026-07-28T00:00:00+09:00
---
```

本文にはsource status、`gate` finding、集約理由、失敗情報を記載する。過去の結果を
混ぜず、現在の対象revisionに対する最新集約へ置き換える。

## 完了条件

- `plan-decision-review.md`だけを集約成果物として編集している。
- modeに必要なsourceを検証している。
- statusが`passed | changes_required | blocked | incomplete`である。
- `blocked`では空でない`利用者判断`があり、そのまま提示できる。
- cycle ID、review stage、PlanとDesignのpath、revision、SHA-256が追跡できる。
