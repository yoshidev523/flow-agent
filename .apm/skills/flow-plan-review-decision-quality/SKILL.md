---
name: flow-plan-review-decision-quality
description: Flowのreview hubからの明示委譲、または利用者による`$flow-plan-review-decision-quality`（Claudeでは`/flow-plan-review-decision-quality`）の明示呼び出し時だけ、Planが利用者へ提示する質問・選択肢・影響・推奨・前提の成立性を評価し、固有のreview sourceを保存する。通常のレビュー依頼から暗黙に起動しない。
---

# Flow Plan Review Decision Quality

## 責務

- reviewer ID: `decision-quality`
- 入力: `review_cycle_id`、`plan.md`と`design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/plan-decision/decision-quality.md`
- 担当: 未回答の質問、選択肢、主な影響、推奨、推奨理由、前提
- 担当外: 回答済み判断、詳細タスク、実装手順、検証網羅性、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。Planが
`phase-artifact-v1`、`artifact: plan`、`status: needs_input`であること、Designが
`phase-artifact-v1`、`artifact: design`、`status: ready`であること、両成果物のdigest、
未回答の確認事項を検証し、不一致なら`unable`とする。旧schemaや本文の状態表現を
読み替えず、対象成果物を修復しない。

## 評価規則

各未回答の確認事項について次を評価する。

- 利用者が決める必要のあるHOWであり、writerまたは実装者の局所判断ではない。
- Designと現在のscope内で、3個の選択肢が採用可能かつ実質的に異なる。
- 各選択肢の主な影響が比較可能で、根拠なく有利または不利に表現されていない。
- 推奨がDesign、既存規約、確認可能な実装条件に基づき、前提が明記されている。
- 根拠のない効果、発生確率、cost、条件、数値を追加していない。

推奨が唯一または最適であることは要求しない。別案も成立することやreviewerの好みだけを
findingにしない。質問と無関係なPlan本文の不足や改善もfindingにしない。

## 出力契約

`review-source-v1`を使用し、front matterへ`phase: plan`、
`review_stage: decision`、cycle ID、`source_id: decision-quality`、
`source_kind: ai`、PlanとDesignのpath、revision、SHA-256、statusを記録する。

- `passed`: 利用者へ提示できる。
- `changes_required`: Designとscopeを変えず質問、選択肢、影響、推奨、前提を修正できる。
- `blocked`: Designまたはscopeの再決定なしでは成立する質問を作れない。
- `unable`: 入力不備、対象不在、status不一致、digest不一致で評価不能。

statusは上記4値だけを使用する。別名や並行する状態fieldを出力せず、完了報告前に
保存したsourceのschema、必須field、statusを読み直して検証する。

各findingにはID、`classification: gate | scope_candidate`、対象質問の
`decision_refs`を含める。`gate`には対象、問題、根拠、要求変更、完了条件を記録する。
このreviewでは質問提示に不要な改善を`scope_candidate`として新たに提案しない。

既存の別選択肢を推奨できるが、利用者の回答を確定しない。選択肢がすべて不適切なら
必要条件を`gate`へ記録し、writerへ選択肢の再作成を要求する。reviewer自身が新しい
選択肢を完成させない。

`blocked`のfindingにはhubが利用者向け文面を作れるよう、質問、今決める理由、
2〜3個の選択肢と各影響、推奨と理由、短い回答形式を加える。Designや確認可能な
実装条件から根拠づけられない選択肢を追加しない。
