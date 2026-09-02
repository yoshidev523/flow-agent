---
name: flow-design-review-requirements
description: Flowのreview hubからの明示委譲、または利用者による`$flow-design-review-requirements`（Claudeでは`/flow-design-review-requirements`）の明示呼び出し時だけ、Design成果物を要件・制約・受け入れ条件の観点で評価し、固有のreview sourceを保存する。通常のレビュー依頼から暗黙に起動しない。
---

# Flow Design Review Requirements

## 責務

- reviewer ID: `requirements`
- 入力: `review_cycle_id`、`design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/design/requirements.md`
- 担当: 目的、要件、制約、受け入れ条件の対応、矛盾、欠落
- 担当外: 利用者価値、品質リスク、実装方法、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。対象が
`phase-artifact-v1`、`artifact: design`、`status: ready`に完全一致しない場合は、
本文から状態を推測せず`unable`とする。

## 出力契約

`review-source-v1`を使用する。

```yaml
---
schema_version: flow/review-source-v1
phase: design
review_cycle_id: design-r1-20260728T000000
source_id: requirements
source_kind: ai
target_path: spec/.../design.md
target_revision: 1
target_sha256: "{64 lowercase hex}"
status: passed
---
```

statusは`passed | changes_required | blocked | unable`とする。
これ以外のstatus、旧schema、並行する状態fieldを出力せず、完了報告前に保存したsourceを
読み直して契約を検証する。

- `passed`: 担当観点で変更要求がない。
- `changes_required`: 同じ範囲内の具体的修正で解消できる。
- `blocked`: 利用者判断または新しい要件が必要。
- `unable`: 入力不備、対象不在、digest不一致などで評価不能。

最初に`確認事項`の採用済み回答、推奨理由、前提を担当観点から検証し、その後に
現在のscopeの成立性を確認する。各findingにはID、
`classification: gate | scope_candidate`、関係する確認事項の`decision_refs`を含める。
`gate`には対象、問題、根拠、要求変更、完了条件を、`scope_candidate`には提案、根拠、
今回含める影響、推奨処理を含める。

- `gate`: 採用済み判断または前提の誤り、現在の目的・要件・制約・受け入れ条件の
  矛盾や欠落。statusは`gate`だけから決定する。
- `scope_candidate`: 現在のDesignが成立するためには不要な追加要件や改善案。
  statusへ影響させず、要求変更や自動修正の対象にしない。

既存の別選択肢を推奨できるが、利用者の回答を変更しない。既存選択肢がすべて不適切なら
`changes_required`とし、満たすべき条件を`gate`として記録してwriterへ選択肢の再作成を
要求する。reviewer自身が新しい選択肢や回答を確定しない。

利用者による採用済み回答の変更が必要なfindingは`blocked`とする。
`blocked`の各findingには、review hubが利用者向け文面を作れるよう、判断材料として
質問、今決める理由、2〜3個の選択肢と各影響、推奨と理由、短い回答形式を加える。
各要素は簡潔にし、Designから根拠づけられない条件や数値を追加しない。
必ず選択肢の1つを推奨し、根拠と仮定を明記する。
