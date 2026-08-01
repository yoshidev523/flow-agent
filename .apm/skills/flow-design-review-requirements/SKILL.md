---
name: flow-design-review-requirements
description: Design成果物を要件・制約・受け入れ条件の観点で評価し、固有のreview sourceを保存する。
---

# Flow Design Review Requirements

## 責務

- reviewer ID: `requirements`
- 入力: `review_cycle_id`、`design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/design/requirements.md`
- 担当: 目的、要件、制約、受け入れ条件の対応、矛盾、欠落
- 担当外: 利用者価値、品質リスク、実装方法、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。

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

- `passed`: 担当観点で変更要求がない。
- `changes_required`: 同じ範囲内の具体的修正で解消できる。
- `blocked`: 利用者判断または新しい要件が必要。
- `unable`: 入力不備、対象不在、digest不一致などで評価不能。

各findingにはID、対象、問題、根拠、要求変更、完了条件を含める。
一般的な改善案を追加せず、Designに記載された目的・要件・制約・受け入れ条件に
直接関係する事項だけを扱う。

`blocked`の各findingには、review hubが利用者向け文面を作れるよう、判断材料として
質問、今決める理由、2〜3個の選択肢と各影響、推奨と理由、短い回答形式を加える。
各要素は簡潔にし、Designから根拠づけられない条件や数値を追加しない。
必ず選択肢の1つを推奨し、根拠と仮定を明記する。
