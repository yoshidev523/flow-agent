---
name: flow-plan-review
description: Flowからの明示委譲、または利用者による`$flow-plan-review`（Claudeでは`/flow-plan-review`）の明示呼び出し時だけ、完成Planのtask-readinessに対するAIまたは人間review sourceを集約し、指定cycleのreview.mdへ保存するローカルハブ。通常のレビュー依頼から暗黙に起動しない。
---

# flow-plan-review

## 責務

指定対象のsourceを収集し、`reviews/plan-final/cycle-{number}/review.md`を作るhub。
採用済み回答がタスクへ反映され、実装へ引き継げることを評価する。詳細HOWの最適性やtest case網羅性を新gateにしない。
writer修正、利用者対話、Flow state、phase移行を扱わない。

## 入力

feature directory、review cycle ID、mode、対象path・revision・digest、出力path。
Plan reviewでは入力Designの参照も必須。
対象planのstatusは`ready`。対象とDesign参照を開始時・集約直前に確認する。

## Source収集と集約

AI modeでは`flow-plan-task-readiness-reviewer`を直接起動し、同一cycleの固有sourceを作らせる。
指定した1観点だけを起動する。子agentを起動できなければincomplete/executionとして記録する。
Human modeではFlowが作ったsources/human.mdだけを読む。AI reviewerを起動しない。

review-checkへ必要な全source pathを渡す。欠落sourceのpathも省略しない。
CLIが検証したstatus・sources・source_paths・findings・failure・judgmentsを変更せずaggregateへ使う。
sourceの意味を変えず本文を整理する。同じ指摘の説明はまとめられるが、機械的なfindingを削除しない。
blockedではjudgmentsを利用者へそのまま提示できる本文へ整える。
判断は質問、背景、2〜3選択肢、影響、推奨と理由、回答形式を持つ。
利用者に代わって回答を変更せず、根拠のない条件や数値を追加しない。

## 出力

phase-review-v2、statusは`passed | changes_required | blocked | incomplete`。
cycleごとに新規保存し、過去結果を上書きしない。sourceとaggregateは同じ対象とmodeを保持する。
契約不一致はincomplete/contract、source欠落や実行不能はincomplete/execution。
scope_candidateはstatus判定から除外し、自動修正やhuman切替を要求しない。
最終報告にaggregate path、cycle ID、status、失敗情報を含める。

## 共通契約と機械処理

実行前に隣接するFlow skillの`../flow/references/contracts.md`と
`../flow/references/cli.md`の該当契約・commandを読む。
入出力形式は`../flow/references/contracts.md`とtemplateを参照する。
機械検証はCLI内のZod定義に従い、旧schemaを読み替えない。
`../flow/assets/templates/`の対応templateを使う。
CLIは`node ../flow/scripts/flowctl.js --root {feature_dir}`。
Node.js 22以上が必要。依存はCLIへ同梱済みで、利用側のnpm install・ビルドは不要。

各成果物はdraftを作り、`publish`で保存して`validate`で確認する。
固定artifactのrevision、変更履歴、保存、digestはCLIに任せ、直接上書きしない。
監査は`audit-append`で、問題・課題、重要な決定、feedbackへの対応、タスク単位の検証結果だけを記録する。
通常の読取・検索・command開始・TDDの各Red/Green・説明だけの応答は記録しない。
保存・呼出し・review結果の自動記録を重複追加せず、詳細は成果物へ残してpathを参照する。
`action.completed`は重要な結果をまとめる場合だけ使い、通常操作の`action.started`は不要。
`audit.md`と`.flow/journal.md`を直接編集しない。単独利用でもFlow stateを必要とせず同じCLIを使える。
契約不一致は補完せず報告し、監査の保存障害時は次の操作へ進まない。
