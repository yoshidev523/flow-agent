---
name: flow-plan-review
description: Plan の3観点 reviewerを統括し、結果をplan-review.mdへ集約するローカルハブ。
---

# Flow Plan Review

## 目的

Plan の構造・統合、実行可能性、検証可能性を3つの独立 reviewerへ委譲し、
同一対象に対する結果を集約する。このskillはPlan review内だけを管理する
ローカルハブであり、Plan作成、ユーザー対話、Implement開始は扱わない。

## 入力

汎用 `PhaseReviewRequest` を受け取る。

- `request_id`
- `target_path`
- `target_sha256`
- `review_path`
- `review_round`
- 必要なら承認済みdesignのpath

対象SHA-256は小文字64桁hexとする。開始直前に対象全バイトを
`sha256sum`、`shasum -a 256`、`openssl dgst -sha256` の順で計算し、
入力値と一致しなければ `Unable` とする。

## 子reviewer

次の3 agentを直接起動する。

- `flow-plan-structure-integration-reviewer` + `$flow-plan-review-structure-integration`
- `flow-plan-executability-reviewer` + `$flow-plan-review-executability`
- `flow-plan-verifiability-reviewer` + `$flow-plan-review-verifiability`

各子には一意な `ReviewRequest` を渡す。子reviewerは相互を認識せず、
ファイルを編集しない。3件は相互依存がないため並列実行してよい。

子agentの起動機構がない、深さ・同時実行・session上限に達した、
起動後に結果を取得できない場合は、重複起動せず該当結果を `Unable` とする。
親へ子agentの代理起動を要求しない。

## 集約と単一writer

このskillを使う `flow-plan-reviewer` だけが `plan-review.md` を更新する。
structure-integration、executability、verifiabilityが過不足なく存在し、
同一SHA-256に対して全件 `OK` の場合だけ集約 `OK`、ゲート `Passed` とする。
1件以上 `Unable` なら集約 `Unable`、それ以外で `NG` があれば集約 `NG` とし、
ゲートを `Blocked` にする。

追記直前にSHA-256を再計算し、開始時から変化していれば
`target-changed-during-review` の `Unable` とする。
各ラウンドにはrequest ID、対象path/SHA-256、3つの `ReviewResult`、
集約判定、ゲート、判断点、推奨対応を追記する。過去ラウンドは編集しない。

同じSHA-256の最新 `Passed` は再利用し、同じSHA-256の最新 `Blocked` は
新しいrequestなしに再実行しない。過去SHA-256の結果はstaleとする。

## 出力

汎用 `PhaseReviewResult` として、request ID、対象path/SHA-256、
3つの個別結果、集約判定、`Passed / Blocked`、判断点、推奨対応を返す。
呼び出し元、ユーザー、次フェーズの動作は決定しない。
