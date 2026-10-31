---
name: flow-artifact-sync
description: 利用者またはFlowからの明示呼び出しで、採用済み変更を既存のDesign・Plan・Implementへ整合させて反映する独立スキル。どのフェーズからでも、Flow stateや他スキルなしで利用できる。通常のファイル同期には使わない。
---

# Flow Artifact Sync

## 責務と入力

このskill自身が、採用済み変更の影響確認、既存成果物の更新、参照検証、同期監査を行う。
Design/Plan writerやexecutorへ委譲せず、他スキルを読む・起動する必要はない。
入力は対象directory、変更内容・根拠、許可された修正範囲。成果物参照はdirectoryから取得する。
どのフェーズでも、実装完了後でも使える。Flow state、review通過、feedbackの事前作成を要求しない。
監査用run ID・同期IDは指定値を使い、指定がなければ重複しないIDを生成して報告する。

最初に同梱の[契約](references/contracts.md)と[CLI操作](references/cli.md)の保存・検証・監査部分を読む。
CLIは`node {このskillのdirectory}/scripts/flowctl.js --root {対象directory}`。
Node.js 22以上だけが必要。CLI、契約、templateはこのskillに同梱済み。
他スキル、Flow state、npm install、buildは利用時に不要。

## 影響確認

1. `action.started`を記録する。変更内容・根拠・修正範囲をdetailへ保存する。
2. 既存の要求と成果物を読み、path・revision・SHA-256と入力参照を取得する。
   未完了保存があればCLIの復旧手順に従う。進行中の別操作を自動で再実行しない。
3. Designの要件・制約・採用判断から、Planのtasks・完了条件・verification_plan・
   handoff_checks、Implementの進捗・検証証拠へ影響を追う。変更不要な対象も理由を示す。
4. 未合意の重要判断、scope拡大、矛盾は呼出側へ返し、その判断に依存する更新を止める。

参照digestだけの付け替えや本文の一括置換で同期済みとしない。
未作成の成果物は作らず、既存成果物だけを対象にする。欠落した必須入力は報告する。
Flow stateが存在する場合は、並行操作の有無を確認するためにだけ参照できる。
phaseやcompletedを同期の禁止条件にしない。active invocationがあれば変更前に停止する。

## プロジェクト知識

同梱の[共通手順](references/project-knowledge.md)から正本・適用記録・鮮度確認の部分を読む。
適用範囲のAGENTS.mdと参照文書をprojectの文書運用に沿って確認し、同期対象の知識適用と
project_knowledgeを再照合する。別repository・外部serviceも対象とし、代替正本を作らない。
他skillを起動せず、このskill自身が更新ownerとして適用結果と未確認事項を反映する。
知識の恒久化や文書更新を同期範囲へ勝手に追加しない。候補は本文へ残して呼出側へ返す。

## 反映

同期中はこのskillを複数成果物の更新ownerとする。producerは`flow-artifact-sync`。
既存成果物の本文はdraftで編集し、保存は同梱CLIの`publish`を使う。
expected_revision・expected_sha256で他の変更を検出し、revisionと変更履歴を保持する。
原文、元の判断、変更前後の参照を監査と変更履歴で辿れるようにする。

- Design/Planの変更は、このskill自身が現在の対象参照を指定した`phase-feedback-v2`を作り、
  `publish`する。変更原文が記録済みなら元event IDを参照し、未記録の入力だけ
  `interaction.received`（prompt_event_id:null）へ一度記録する。
  `feedback.created`で元eventとitem IDを結び、原文を再転記しない。他スキルへの委譲は行わない。
- 合意済み変更は`revise`とchange feedbackを使い、feedback_resultsへ反映結果を記録する。
  回答の反映が必要なら`respond`とanswer feedbackを使う。採用済み回答を勝手に変えない。
- 上流から順に反映する。Planは本文の要件・タスク・完了条件・検証を再照合し、
  inputsへ最新Design参照と今回feedbackを記録する。未回答の重要判断はneeds_inputとする。
- Implementの更新が必要な場合は、最新Plan参照と影響・再検証事項を記録する。
  statusはblocked、blockerは再実装・再検証の必要事項、commitはnullとする。
  tasksはpending、verificationsはnot_runへ戻し、旧完了・passedは履歴として保持する。
  同期はコードの実装やtestを実行せず、新しい完了証拠を作らない。

影響のない成果物は更新せずrevisionも増やさない。
review source・aggregate・過去feedbackは上書きせず、変更後の承認へ流用しない。

## 検証と呼出側への返却

更新した成果物を`validate {artifact_path} --references`で検証する。
変更要件からタスク・完了条件・検証への反映、質問・feedbackの未解決項目も確認する。
過去のreview等は構造検証だけを行い、古いdigestを最新値へ書換えない。

同期はFlow stateの更新・フェーズ移行・レビュー承認・実装再開を行わない。
Flow stateがある場合、同期後に旧revisionを参照したstateやreviewはstaleになる。
呼出側へ更新後の参照と無効になった参照を返し、通常の再開にそのまま流用しないよう明示する。
Flowからの再計画では、呼出側が人間承認を記録して同期を開始し、返却参照をfinish_replanで登録する。
このskillはその状態遷移を実行せず、単独利用でも同じ入力と出力を使う。

最終報告は同期ID、結果（反映完了／変更不要／部分反映／停止）、更新前後の参照、
未解決項目、無効なreview・検証・state参照、必要な再実装・再検証を含める。
新しい中継request/result成果物は作らない。

## 監査と中断

同期全体は`audit-append`で既存の`action.started / action.completed`へ記録する。
actorは常に`flow-artifact-sync`、actionは`artifact-sync:{同期ID}`。
終了eventのcaused_byへ開始eventと更新eventを指定し、resultへ実際の結果、
evidenceへ変更前後の参照・根拠event IDを入れる。変更不要・停止・部分反映も記録する。
同期の開始eventは中断検出用の内部記録で、`audit.md`には結果だけを示す。
通常の読取・検索・各file保存の開始/終了は追加しない。`publish`の自動記録を重複させない。
詳細は成果物を参照し、新しい問題・重要判断・部分反映・停止は要点を残す。新しいevent型は不要。

監査保存障害では次操作へ進まない。複数fileの同期は一括transactionではないため、
中断時は保存済み範囲を照合し、部分反映を報告する。成功や外部操作の完了を推測しない。
再送は同じrequest ID・event_keyと同じ内容を使い、別の操作には新しいIDを使う。
