---
name: flow
description: 利用者が`$flow`（Claudeでは`/flow`）を明示した場合だけ、spec配下の永続成果物を介してDesign、Review、Plan、Implementを接続する状態遷移ハブ。通常の設計・レビュー・計画・実装依頼から暗黙に起動しない。
disable-model-invocation: true
user-invocable: true
---

# Flow 4.0.0

## 起動と責務

利用者の`$flow`（Claudeでは`/flow`）の明示呼び出しでだけ起動する。
Flowは利用者対話、feedback正規化、review mode、retry、stale検証、phase移行を所有する。
writer・review hub・executorは自分の契約だけを扱い、Flowが成果物本文を編集しない。

## 正本とruntime

最初に[contracts.md](references/contracts.md)と[cli.md](references/cli.md)を読む。
成果物・監査の入力形式は[contracts.md](references/contracts.md)とtemplateを参照する。
機械検証の正本はrepositoryのZod定義で、CLIへ同梱する。
[templates](assets/templates/)を使い、旧形式を推測移行しない。
`node {このskillのdirectory}/scripts/flowctl.js --root {feature_dir}`を使う。
Node.js 22以上が必要。依存はCLIへ同梱済みで、利用側のnpm install・ビルドは不要。

feature directoryは`spec/YYYYMMDD_feature-name/`。initで要求、state、auditを作る。
artifactsは固定pathで更新し、変更履歴を残す。reviewはcycle-0001、feedbackは
feedback-0001.mdの発行単位で保存する。pathはfeature directory基準。

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
2. start_invocationでwriterを予約し、指定操作と自分の入出力だけを渡して起動する。
   Design/Plan writerへreviewやstateを渡さない。publish結果をfinish_invocationで登録する。
3. Design needs_inputはwriterの質問をそのまま提示する。interaction.presentedを記録しwait。
   人間回答の原文をinteraction.received、対応をfeedback.createdとして監査へ残す。
   正規化feedbackをpublishのfeedback/{phase}/nextで保存し、answer後にrespondを起動する。
4. Design readyはstart_review design。AI hubは2観点を直接起動し、human modeはFlowがsourceを作る。
   hubのpublish結果を登録し、passedならadvanceでPlanへ進む。
5. PlanはDesign参照を保持する。needs_inputはstart_review plan_decision、readyはplan_final。
   decision passedだけを根拠に未回答質問を提示し、回答後はrespondでPlanへ戻る。
6. final passedでadvanceしexecutorへPlanだけを渡す。completedを検証してadvanceで全体完了。

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

## Human modeと追加scope

Human modeへ切り替える場合は[human-review.md](references/human-review.md)を読む。
直前の評価、切替理由、修正内容、未解決なのか修正後未評価なのかを提示する。
Plan decisionのhuman reviewは質問への回答を求めず、質問が提示可能かだけを評価する。

scope_candidateはreview status・counter・human切替へ影響しない。
passedに候補があればまとめて提示し、除外を推奨する。excludeで現在のpassedを維持し、
adoptした項目だけをfeedbackへ正規化して改訂・再reviewする。
PlanでDesignのWHAT・公開契約・scope変更が必要なら現在のFlowを逆戻りさせず別タスクとして案内する。

## 監査と所有

AIの操作・判断、利用者への提示と原文回答、feedbackへの対応をaudit-appendで逐一記録する。
判断は結論、適用規則、根拠、前提を記録し、内部思考過程を記録しない。
state更新、成果物保存、監査への追記は共通CLIだけを使う。監査保存障害では次操作へ進まない。
新しい中継request/result成果物を設けず、既存artifactの参照で接続する。

```text
Flow
├── phase writer
├── decision review hub -> decision-quality reviewer
└── final review hub -> perspective reviewers
```

Human modeでは観点reviewerを起動しない。子agent起動不能はhubがincomplete/executionを返す。
Flowは外側の契約だけを検証し、review内容を再評価・書換えしない。
