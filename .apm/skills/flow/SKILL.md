---
name: flow
description: 利用者が`$flow`（Claudeでは`/flow`）を明示した場合だけ、flow-spec配下の永続成果物を介してDesign、Review、Plan、Implementを接続する状態遷移ハブ。通常の設計・レビュー・計画・実装依頼から暗黙に起動しない。
disable-model-invocation: true
user-invocable: true
---

# Flow 4.4.0

## 起動と責務

利用者の`$flow`（Claudeでは`/flow`）の明示呼び出しでだけ起動する。
Flowは利用者対話、feedback正規化、review mode、retry、stale検証、phase移行を所有する。
writer・review hub・executorは自分の契約だけを扱い、Flowが成果物本文を編集しない。
明示的な成果物同期だけは独立したflow-artifact-syncを更新ownerとする。

## 正本とruntime

最初に[contracts.md](references/contracts.md)と[cli.md](references/cli.md)を読む。
成果物・監査の入力形式は[contracts.md](references/contracts.md)とtemplateを参照する。
機械検証の正本はrepositoryのZod定義で、CLIへ同梱する。
[templates](assets/templates/)を使い、旧形式を推測移行しない。
`node {このskillのdirectory}/scripts/flowctl.js --root {feature_dir}`を使う。
Node.js 22以上が必要。依存はCLIへ同梱済みで、利用側のnpm install・ビルドは不要。

新規feature directoryは`flow-spec/YYYYMMDD_feature-name/`。initで要求、state、auditを作る。
既存タスクを再開するときは指定されたdirectoryを使い、旧`spec/`から自動移動しない。
artifactsは固定pathで更新し、変更履歴を残す。reviewはcycle-0001、feedbackは
feedback-0001.mdの発行単位で保存する。pathはfeature directory基準。

## 起動時のGit設定

新規・再開とも、init / resume-checkの前に対象project直下の`.gitattributes`を確認する。
存在しなければ作成し、次の設定を保存する。

```gitattributes
flow-spec/** linguist-generated=true
```

既存fileは内容・改行を保持し、この設定がなければ末尾へ追記する。
同じ設定、または`flow-spec/** linguist-generated`が既にあれば重複追加しない。
改行なしで終わるfileへ追記するときは改行を挟む。
対象projectの設定だけを更新し、skillの配置directoryへは作らない。
設定の確認・補完はFlowが行い、CLIのinit / resume-checkへ副作用を追加しない。

成果物はGit管理し、GitHubのPRでは差分を既定で折りたたむ。必要なときは展開して確認できる。
`.gitignore`へ`flow-spec/`を追加しない。設定の変更があれば、init / resume-check成功後に
既存のactionイベントで監査へ記録する。

## ワークフロー

```text
design -> design_review -> plan
plan(needs_input) -> plan_decision_review -> 回答 -> plan
plan(ready) -> plan_review -> implement -> completed
```

Flowのみがtransitionでflow-state.ymlを更新する。next_actionは保存せず、検証済み状態から導く。
各stageの自動修正とAI実行retryは1回、human source再取得も1回。cycleやrevision更新でリセットしない。
review_mode.planはdecision/finalへ共通適用する。1 cycleでAIとhumanを混在させない。

## 実行

1. 新規はinit、再開はresume-check。未完了invocationは実態確認前に再実行しない。
2. pending_operationがnullで現在成果物がある場合はwriterを再起動せず、statusに応じた質問・reviewへ進む。
   作成・修正が必要な場合だけstart_invocationでwriterを予約し、指定操作、自分の入出力、対象project・対象範囲だけを渡して起動する。
   Design/Plan writerへreviewやstateを渡さない。publish結果をfinish_invocationで登録する。
3. Design needs_inputはwriterの質問をそのまま提示する。interaction.presentedを記録しwait。
   人間回答の原文をinteraction.received、対応をfeedback.createdとして監査へ残す。
   正規化feedbackをpublishのfeedback/{phase}/nextで保存し、answer後にrespondを起動する。
4. Design readyはstart_review design。AI hubはproject-rulesを含む3観点を直接起動し、human modeはFlowがsourceを作る。
   hubのpublish結果を登録し、passedならcheckpoint-create後にadvanceでPlanへ進む。
5. PlanはDesign参照を保持する。needs_inputはstart_review plan_decision、readyはplan_final。
   decision passedをcheckpointへ保存してから未回答質問を提示し、回答採用時もcheckpointへ保存する。
   回答後はrespondでPlanへ戻る。
6. final passedをcheckpointへ保存してからadvanceしexecutorへPlanと対象project・対象範囲を渡す。
   completedを検証してadvanceで全体完了とし、完了stateをcheckpointへ保存する。

## Review結果への対応

- passed: 同一cycle・revision・digestを検証して進む。decisionは質問提示だけを許可する。
- changes_required: findingsを意味を変えずfeedbackへ正規化する。AIの自動修正が未使用なら
  reviseでcounterを消費してwriterを起動する。使用済みならset_modeでhumanへ切り替える。
  humanの変更要求は同じ正規化を行い修正後を再評価する。
- blocked: hubが作った判断文を変更せず提示する。回答をanswer feedbackへ正規化してwriterへ渡す。
- incomplete/execution: retryを1回使い、新cycleで再評価する。AIの再失敗はhumanへ切替、
  humanの再失敗はblockで停止する。
- incomplete/contract、旧schema、参照不一致: blockで停止し、読み替え・自動修復しない。

自動修正後のreviewは既知gateの解消、現在要件への回帰、必須制約に反する新たな重大riskを確認する。
周辺改善を新gateへ昇格させない。

## プロジェクト知識と非同期feedback

[プロジェクト知識の共通手順](references/project-knowledge.md)を読む。
各工程は適用範囲のAGENTS.mdとprojectの正本文書を使い、writer/executorは自分の成果物へ
適用結果を保存する。Flowは対象project・対象範囲を明示し、成果物本文やreviewの結論を編集しない。
AI reviewでは全stageのhubがproject-rules reviewerも起動する。Human modeでは起動せず、
人間に同じルール確認を依頼してhuman sourceへ正規化する。

review登録後・phase移行前に、主要ルールの確認結果、例外、未確認事項、Markdownへのlinkを
チャットへ表示する。passedの通知だけでは回答待ちにしない。Implement結果も同じ形式で知らせる。
phase移行前はローカル文書のCLI検証に加え、外部正本の現在版を対応connectorで照合する。
変更や必須資料の確認不能があれば旧reviewを使わず、共通手順の再評価・停止・再計画を使う。

新しい人間feedbackは現在成果物への影響を確認する。説明補足、現在工程の修正、Designまたは
Planへの再計画、将来の文書更新候補を区別する。過去の通知への返信も現在のrevisionと照合する。
進行中の操作を安全な区切りで保存してから切り替え、上流変更は人間承認付き再計画へ接続する。
戻り先・修正範囲の明示承認が既にあれば再利用し、単なる感想を承認へ変換しない。

feedbackによる修正・判断が固まったとき、再利用できる知識があれば
[flow-project-knowledge](../flow-project-knowledge/SKILL.md)へ更新提案を依頼する。
工程完了・全体完了時も成果物の未提示候補を確認し、候補がある場合だけまとめて表示する。
正本への具体的な差分と採用範囲をチャットへ示し、提案・採否の要点を既存actionイベントで記録する。
文書更新の採否待ちだけで通常進行を止めない。今回の修正への同意を恒久ルールの採用と扱わない。
恒久化が承認済みなら知識スキルがprojectの文書運用に従って更新し、現在タスクへの影響を返す。
必要な再計画・再reviewを行い、旧reviewや完了証拠を新しい正本への適合証拠にしない。

## Human modeと追加scope

Human modeへ切り替える場合は[human-review.md](references/human-review.md)を読む。
直前の評価、切替理由、修正内容、未解決なのか修正後未評価なのかを提示する。
Plan decisionのhuman reviewは質問への回答を求めず、質問が提示可能かだけを評価する。

scope_candidateはreview status・counter・human切替へ影響しない。
passedに候補があればまとめて提示し、除外を推奨する。excludeで現在のpassedを維持し、
adoptした項目だけをfeedbackへ正規化して改訂・再reviewする。
Plan/Implementで上流の変更が必要なら作業を停止し、下記の人間承認付き再計画を使う。

## 再計画と成果物同期

採用済み変更を既存の中間成果物へ反映するときは
[flow-artifact-sync](../flow-artifact-sync/SKILL.md)へ対象directory・採用済み変更・根拠・範囲を渡す。
同期skill自身が既存成果物を更新・検証・監査し、Flow stateを変更しない。
同期後の旧state・review参照は再利用せず、返却された最新参照と無効な参照を確認する。
同期の前にrequest_replan / begin_replan、同期後にfinish_replanを使う。
独立した同期だけを先に実行した場合は旧stateを通常再開せず、保存したcheckpointと変更根拠を確認する。
成果物の保存イベントと同期全体のactionイベントを区別し、同じ保存事実を重複記録しない。

## 人間承認付き再計画

実装中の矛盾・前提の誤り・scope変更など、通常修正や許可済みretryでは解決できない場合は
作業を保存して停止する。進行中invocationは実態を確認してfinish/failし、勝手に打ち切らない。
対象、矛盾の証拠、影響、戻り先Design/Plan、修正範囲、2〜3選択肢と推奨を人間へ提示する。

1. checkpoint-createで変更前のstate・成果物・監査・必要な実装fileを保存する。
2. interaction.presented（kind replan、対象は戻り先成果物）を保存し、request_replanで回答待ちにする。
   scopeには許可を求める具体的な修正範囲を記す。completedからも開始できる。
3. interaction.receivedへ原文回答を記録する。承認はbegin_replan、拒否はcancel_replan。
   approval:approveは人間が提示された戻り先・範囲を承認した場合だけ指定する。
   変更付きの回答なら一度cancelし、新しい範囲を提示する。回答を勝手に承認へ写像しない。
4. 承認された範囲を独立同期skillへ渡す。旧完了証拠を無効化し、最新成果物参照を受け取る。
5. finish_replanで最新参照を登録する。Designへ戻る場合はDesign reviewから、Planへ戻る場合は
   questionsに応じたdecision/final reviewから再開する。needs_inputの人間回答も通常手順を使う。
   retry上限・cycle番号をリセットせず、旧review・feedbackを新承認に流用しない。

replanning中は通常の実装・review・resumeを開始しない。中断時はresume-checkのattentionと
保存済み成果物を確認して残りの同期を行う。状態や監査を過去へ巻き戻さない。

## Gitチェックポイント

review通過、利用者判断の採用、実装完了、再計画直前にcheckpoint-createを行う。
採用判断のevent ID、成果物参照、保存する実装fileを明示し、一意なcheckpoint IDを使う。
feature directory全体は自動で含まれる。pathsへ指定する実装fileは今回scopeだけにする。
非Git環境やGit権限・署名・保存障害で作成できなければ成功として進めず人間へ状況を返す。

checkpointは専用commitとlocal tagへ保存され、現在のbranch・index・作業fileを変更しない。
復帰はcheckpoint-restoreで別branchを作成する。checkout・reset・push・再開を自動実行しない。
Gitの保存結果とFlowの再計画は別に扱い、過去snapshotのcompletedを現在の承認へ流用しない。

## 応答終了前の保存commit

Flowは各応答を終える前に、対象タスクの成果物と監査を現在のbranchへ通常commitする。
質問・承認の回答待ち、blockedによる停止、全体完了、completed後の関連対話にも適用する。
checkpoint-createの専用commit / local tagとは別に実行する。

1. その応答で生じた問題・重要な判断・フィードバック・検証結果の要点を共通CLIで保存し、必要なstate・成果物の保存を終える。
   writerなどが更新中なら完了を待ち、保存commitと同時に対象fileを更新させない。
2. git statusと差分を確認し、対象feature directoryの`audit.md`、`.flow/journal.md`、`flow-state.yml`、
   artifacts、inputs、reviews、feedbackの未保存差分をまとめる。
   Flowが起動時に作成・補完した`.gitattributes`も対象に含める。
   lockなどの一時file、機密、別タスク・利用者の無関係な変更、実装途中のcodeは含めない。
3. 対象pathを明示してstageし、今回の保存対象だけをcommitする。
   既存の無関係なstaged変更は保持し、commitへ混入させない。混在fileの変更を安全に分離できなければ停止する。
   ignore対象は強制追加せず、Git未初期化・権限・署名・hookなどの障害と同様に保存失敗として扱う。
   対象差分がなければ空commitを作らない。件名は`[flow] {保存内容を表す短い命令形}`とする。
4. commit後に対象差分が残っていないことを確認し、応答で保存commit SHAを報告する。
   commitできなければ、未保存の対象と理由を報告し、保存済みとして扱わない。
   保存失敗だけを理由にphaseや成果物のstatusを変更しない。

この保存commitと、そのための差分確認・stage・結果確認は監査への追記対象から除外し、
Git履歴を証跡とする。成功・失敗を記録するためにaudit.mdや他の成果物を再更新しない。
重要な実装結果やpush・PR作成の結果は記録する。checkpoint内部処理はjournalだけへ残す。
pushやtagの作成はこの手順に含めず、pushは利用者の明示依頼がある場合だけ行う。

## 監査と所有

監査の対象・形式・記録経路は[共通の記録方針](references/contracts.md#監査の記録方針)に従う。
Flowは利用者の判断依頼と回答、feedbackとの対応を記録する。
completed後に成果物変更が必要なら人間承認付き再計画へ進む。
補記は根拠と補記であることを明示し、元日時を推測せず、occurred_atには実測日時を使う。
state更新、成果物保存、監査への追記は共通CLIだけを使う。監査保存障害では次操作へ進まない。
新しい中継request/result成果物を設けず、既存artifactの参照で接続する。

```text
Flow
├── phase writer
├── decision review hub -> decision-quality / project-rules reviewers
└── final review hub -> perspective reviewers
```

Human modeでは観点reviewerを起動しない。子agent起動不能はhubがincomplete/executionを返す。
Flowは外側の契約だけを検証し、review内容を再評価・書換えしない。
