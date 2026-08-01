---
name: flow-design-review
description: DesignのAIまたは人間review sourceを集約し、design-review.mdへ保存するローカルハブ。
---

# Flow Design Review

## 目的

指定された`design.md`を、1サイクルにつきAIまたは人間の一方のsourceで評価し、
集約結果を`spec/{yyyymmdd_feature}/design-review.md`へ保存する。
このskillはsource収集と集約だけを担当し、Design修正、ユーザー対話、状態遷移を行わない。

## 入力

- `review_cycle_id`
- `target_path`
- `target_revision`
- `target_sha256`
- `mode: ai | human`
- `review_path`

`review_cycle_id`はFlowがreview開始ごとに発行する一意な値とする。
開始時に対象全バイトのSHA-256を計算し、入力と一致しなければ
`status: incomplete`の成果物を作成する。

## Source収集

### AI mode

次の3 agentを並列起動する。

- `flow-design-requirements-reviewer`
- `flow-design-user-value-reviewer`
- `flow-design-quality-risk-reviewer`

各agentへ同じ`review_cycle_id`を渡し、固有の`review-source-v1`を次へ保存する。

- `reviews/design/requirements.md`
- `reviews/design/user-value.md`
- `reviews/design/quality-risk.md`

### Human mode

Flowが同じ`review_cycle_id`で保存した`reviews/design/human.md`を読む。このファイルも
`review-source-v1`を使い、`source_kind: human`とする。
このhubは人間への質問や回答の解釈を行わない。

1サイクル内でAIと人間のsourceを混在させない。`mode`と異なるsourceは集約対象外とする。

## 集約

sourceのcycle ID、対象path、revision、SHA-256が入力と一致することを確認する。
固定pathに残る別cycleのsourceは存在していても欠落扱いにする。

- 1件でも`unable`、欠落、契約不一致がある: `incomplete`
- 1件でも`blocked`: `blocked`
- 1件でも`changes_required`: `changes_required`
- 必要sourceがすべて`passed`: `passed`

Human modeではhuman source 1件を同じ規則で写像する。
集約直前にも対象SHA-256を再計算し、変化していれば`incomplete`とする。

### 利用者判断の集約

statusが`blocked`なら、hubがsourceの判断材料を重複排除し、本文の
`## 利用者判断`へ利用者にそのまま提示できる完成文を作る。

- 人間の判断が必要なfindingだけを含め、自動修正可能なfindingは含めない。
- 独立した判断は優先度順に最大3件とする。
- 各判断は質問、背景、2〜3個の選択肢と影響、推奨と理由、回答形式を持つ。
- 背景、各選択肢の影響、推奨理由はそれぞれ1文で簡潔に書く。
- sourceの意味を変えず、根拠のない条件や数値を追加しない。
- 必ず選択肢の1つを推奨し、sourceに基づく理由と仮定を1文で示す。
- finding全文や内部の集約過程を利用者向け文面へ転載しない。

```md
## 利用者判断

### D-001
- 質問: {決めること}
- 背景: {今決める理由}
- 選択肢:
  - A: {選択肢} — {主な影響}
  - B: {選択肢} — {主な影響}
- 推奨: {AまたはB} — {理由と仮定}
- 回答: {短い回答形式}
```

## 出力

出力は`phase-review-v1`とする。

```yaml
---
schema_version: flow/phase-review-v1
phase: design
review_cycle_id: design-r1-20260728T000000
target_path: spec/.../design.md
target_revision: 1
target_sha256: "{64 lowercase hex}"
mode: ai
status: passed
source_paths:
  - spec/.../reviews/design/requirements.md
completed_at: 2026-07-28T00:00:00+09:00
---
```

本文にはsource別status、finding、集約理由、失敗情報を記載する。
`blocked`では加えて上記形式の`利用者判断`を記載する。
過去の結果を混ぜず、常に現在の対象revisionに対する最新集約へ置き換える。

## 完了条件

- `design-review.md`だけを集約成果物として編集している。
- sourceはそれぞれ固有のwriterが作成している。
- modeに必要な全sourceを検証している。
- statusが`passed | changes_required | blocked | incomplete`のいずれかである。
- `blocked`では空でない`利用者判断`があり、そのまま提示できる。
- cycle ID、対象path、revision、SHA-256が追跡できる。
