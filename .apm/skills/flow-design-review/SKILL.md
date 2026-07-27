---
name: flow-design-review
description: Design の推奨案を3観点 reviewerへ委譲し、decision単位の妥当性をdesign-review.mdへ集約するローカルハブ。
---

# Flow Design Review

## 目的

Designが提示した推奨案を仮採用した場合に、指定済みの要件、利用者価値、
品質・リスク条件を満たすか3つの独立reviewerへ委譲する。
成果物全体の監査や新しい論点の探索は行わない。このskillはreview内の委譲、
結果集約、review artifactだけを管理し、候補修正、ユーザー対話、
Plan開始、Flowの状態遷移は扱わない。

## 入力

汎用 `ProposalReviewRequest` を受け取る。

- `request_id`
- `review_series_id`
- `proposal_attempt`: 1〜3
- `phase: Design`
- `target_path`
- `target_sha256`
- `decision_items`
  - `decision_id`
  - 質問と選択肢
  - 推奨選択肢と理由
  - 仮採用による変更点
  - 検証する要件、制約、受け入れ条件
- `scope` / `out_of_scope`
- attempt 2以降は前回結果と変更した推奨内容
- `review_path`
- 再試行なら成功済みの同一SHA-256結果と失敗reviewer

attempt範囲、必須項目、decision IDの一意性を検査する。対象SHA-256は小文字64桁hex
とし、開始直前に対象全バイトを `sha256sum`、`shasum -a 256`、
`openssl dgst -sha256` の順で計算する。不一致は `Incomplete` とする。

## 子reviewer

次の3 agentを直接起動する。

- `flow-design-requirements-reviewer` + `$flow-design-review-requirements`
- `flow-design-user-value-reviewer` + `$flow-design-review-user-value`
- `flow-design-quality-risk-reviewer` + `$flow-design-review-quality-risk`

各子へ担当観点に必要な同一decision itemsを持つ一意な
`PerspectiveReviewRequest`を渡す。子reviewerは相互を認識せず、ファイルを編集しない。
3件は並列実行してよい。

再試行要求では、同一target SHA-256かつrequest/series/attempt/decision IDが一致する
`Complete`の結果だけを再利用し、失敗reviewerだけを新しいrequest IDで1回起動する。
再利用条件が崩れた場合は部分結果を破棄する。子起動不能、結果消失、契約不一致は
該当reviewerを失敗として返し、呼び出し階層を迂回しない。

## 集約

3件すべてが `Complete` でなければ `completion: Incomplete` とし、
`outcome`を設定しない。成功した部分結果と失敗reviewer/理由は記録するが、
部分結果から判定しない。

すべて `Complete` の場合だけ、decisionごとに集約する。

- 全適用観点が `Validated` または理由つき `NotApplicable`:
  decisionは `Validated`
- 1件以上 `Rejected` かつ `Indeterminate`、観点矛盾、guardrailなし:
  decisionは `RevisionRequired`
- `Indeterminate`、観点間の両立不能、選択肢内に妥当案なし、
  `GuardrailEscalation`のいずれか:
  decisionは `EscalationRequired`

全decisionが `Validated` の場合だけ全体 `outcome: Validated` とする。
1件以上 `EscalationRequired` なら全体も同値、それ以外で
`RevisionRequired`があれば全体も同値とする。
`OutOfReviewScope`はreview artifactへ記録するが集約判定へ使わない。

attempt 2以降は同じdecision IDについて、前回からの継続、解消、新規を分類する。
新規 `Rejected` は推奨変更が直接生んだ問題、または指定基準に対する重大な
初回見落としだけ許し、遅延検出理由を必須にする。それ以外は
`OutOfReviewScope`とする。orchestratorは子結果の結論や根拠を書き換えない。

## 記録と出力

このskillを使う `flow-design-reviewer` だけが `design-review.md` を追記する。
追記直前にSHA-256を再計算し、開始時から変化していれば `Incomplete` とする。
各attemptへrequest/series ID、対象path/SHA-256、decision items、3結果、
集約、差分、guardrail、out-of-review-scope、失敗情報を記録し、過去を編集しない。

汎用 `ProposalReviewResult` として、request/series ID、attempt、対象path/SHA-256、
`completion: Complete / Incomplete`、Complete時の
`outcome: Validated / RevisionRequired / EscalationRequired`、
decision別結果、差分、guardrail、out-of-review-scope、失敗reviewer/理由を返す。
候補修正、再試行、ユーザー提示、フェーズ移行を決定しない。
