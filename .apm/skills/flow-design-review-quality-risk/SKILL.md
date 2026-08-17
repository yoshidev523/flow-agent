---
name: flow-design-review-quality-risk
description: Flowのreview hubからの明示委譲、または利用者による`$flow-design-review-quality-risk`（Claudeでは`/flow-design-review-quality-risk`）の明示呼び出し時だけ、Design成果物を品質条件と直接リスクの観点で評価し、固有のreview sourceを保存する。通常のレビュー依頼から暗黙に起動しない。
---

# Flow Design Review Quality Risk

## 責務

- reviewer ID: `quality-risk`
- 入力: `review_cycle_id`、`design.md`のpath、revision、SHA-256、出力path
- 出力: `spec/{yyyymmdd_feature}/reviews/design/quality-risk.md`
- 担当: 非機能条件、失敗時挙動、データ保護、互換性、運用上の直接リスク
- 担当外: 要件・利用者価値の再決定、実装方法、状態遷移

対象は読み取り専用とし、指定された出力ファイルだけを書く。

このreviewの目的はriskをゼロにすることではない。採用した判断に伴うtrade-off、
残存risk、成立前提、受容判断が追跡でき、未解決の利用者判断が残っていないことを
評価する。riskの存在や、別案の方が安全であることだけを変更要求の理由にしない。

## 出力契約

`review-source-v1`を使用し、front matterへ`phase: design`、`review_cycle_id`、
`source_id: quality-risk`、`source_kind: ai`、対象path、revision、SHA-256、
statusを記録する。
statusは`passed | changes_required | blocked | unable`とする。

- `passed`: 未解決の必須判断や記載不足がない。明示的に受容された残存riskがあってもよい。
- `changes_required`: 採用済み判断を変えず、既存scope内の具体的な記載修正で解消できる。
- `blocked`: riskを伴う選択、risk受容、security、privacy、法務、継続costについて
  利用者判断または採用済み回答の変更が必要。
- `unable`: 入力不備、対象不在、digest不一致などで評価不能。

最初に`確認事項`の採用済み回答、推奨理由、前提を担当観点から検証し、その後に
現在のscopeの成立性を確認する。各findingにはID、
`classification: gate | scope_candidate`、関係する確認事項の`decision_refs`を含める。
`gate`には対象、問題、根拠、要求変更、完了条件を、`scope_candidate`には提案、根拠、
今回含める影響、推奨処理を含める。

- `gate`: 採用済み判断または前提の誤り、未決定のtrade-off、必要な品質条件や
  失敗時挙動の欠落、未記録または未受容の残存risk、合意済みの必須制約との矛盾。
  statusは`gate`だけから決定する。
- `scope_candidate`: 現在のDesignの成立には不要な品質水準、将来対策、運用改善。
  statusへ影響させず、要求変更や自動修正の対象にしない。

判定では、採用した選択肢、その直接的な不利益、残存risk、成立前提、受容判断、
必須制約との関係を確認する。Designや確認可能な情報から裏づけられない発生確率、
影響度、条件、数値を作らない。

- riskが存在するだけ、または別案の方が安全というだけでは`gate`にしない。
- trade-offと残存riskが記録され、採用判断が明確で、必須制約と矛盾しなければ
  `passed`にできる。
- 採用判断を維持したまま、品質条件、失敗時挙動、残存risk、受け入れ条件の記載を
  補えばよい場合は`changes_required`とする。
- 選択肢ごとに異なるriskがあり、どれを受容するか未決定なら`blocked`とする。
- より高い品質水準や追加対策が現在のscopeの成立に不要なら`scope_candidate`とする。
- 重大なsecurity、privacy、安全性、データ損失、互換性破壊も、存在だけで
  `blocked`にしない。必須制約との矛盾または未解決の受容判断との因果関係を示す。

既存の別選択肢を推奨できるが、利用者の回答を変更しない。既存選択肢がすべて不適切なら
`changes_required`とし、満たすべき条件を`gate`として記録してwriterへ選択肢の再作成を
要求する。reviewer自身が新しい選択肢や回答を確定しない。

利用者による採用済み回答の変更が必要なfindingは`blocked`とする。
`blocked`の各findingには、review hubが利用者向け文面を作れるよう、判断材料として
質問、今決める理由、2〜3個の選択肢と各影響、推奨と理由、短い回答形式を加える。
各要素は簡潔にし、Designや確認可能なriskから根拠づけられない条件や数値を追加しない。
必ず選択肢の1つを推奨し、根拠と仮定を明記する。
