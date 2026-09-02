---
name: flow
description: 利用者が`$flow`（Claudeでは`/flow`）を明示した場合だけ、spec配下の永続成果物を介してDesign、Review、Plan、Implementを接続する状態遷移ハブ。通常の設計・レビュー・計画・実装依頼から暗黙に起動しない。
disable-model-invocation: true
user-invocable: true
---

# Flow

## 起動条件

利用者による`$flow`（Claudeでは`/flow`）の明示呼び出しでのみ実行する。
ホストの明示呼び出し判定を前提とし、単に設計、レビュー、計画、実装を
依頼された場合は起動しない。

## 目的

要求から実装までを次の順で進める。Planに質問がある場合だけ、利用者へ提示する前に
decision reviewを行う。

```text
design -> design_review -> plan
plan(needs_input) -> plan_decision_review -> plan
plan(ready) -> plan_review -> implement -> completed
```

Flowはphase間の唯一の状態遷移責任者である。各writerとreview hubは自分の成果物だけを
管理し、Flowはその内容を直接編集しない。

## 成果物

featureごとに次を使用する。

```text
spec/{yyyymmdd_feature}/
├── flow-state.yml
├── design.md
├── design-feedback.md
├── design-review.md
├── plan.md
├── plan-feedback.md
├── plan-decision-review.md
├── plan-review.md
├── implement.md
└── reviews/
    ├── design/
    │   ├── requirements.md
    │   ├── quality-risk.md
    │   └── human.md
    ├── plan-decision/
    │   ├── decision-quality.md
    │   └── human.md
    └── plan/
        ├── task-readiness.md
        └── human.md
```

存在するのはAIまたはhumanのうち、選択されたmodeに必要なsourceだけでよい。

### 単一writer

| 成果物 | writer |
| --- | --- |
| `flow-state.yml`、`*-feedback.md`、`reviews/*/human.md` | Flow |
| `design.md` | Design writer |
| `plan.md` | Plan writer |
| `implement.md` | Implement executor |
| 観点別source | 対応する観点reviewer |
| `design-review.md`、`plan-decision-review.md`、`plan-review.md` | 対応するreview hub |

複数のwriterが同じファイルを編集してはならない。

## 永続契約

phase境界では次の4契約だけを使用する。

### 契約の厳格適用

- schema名、必須field、enum値はこの文書と各phase skillの定義へ完全一致させる。
  大文字小文字の違い、別名、旧形式を同等として扱わない。
- 成果物全体のライフサイクル状態は契約で定義されたfront matterの`status`だけに
  記録する。`承認状態`、`approval`、`Pending`、`Approved`、`Draft`など、並行する
  ライフサイクル状態fieldやsectionを追加しない。質問や個別タスクの局所状態は含まない。
- 受信側は契約不一致の上流成果物を補完、移行、読み替えしない。reviewを開始せず
  `state: blocked`、`next_action: stop`として、利用者の指示により成果物ownerが新しい
  target pathで同phaseの`create`を再実行する必要があると報告する。
- front matterの`status`を本文、最終報告、review結果から推測しない。phase移行には
  検証済みfront matterと、必要な同一revision・SHA-256のreviewだけを使う。
- 各writer、reviewer、hub、executorは完了報告の前に、自分が所有する成果物のschema、
  path、必須field、enum値を読み直して検証する。

### `phase-artifact-v1`

DesignとPlanの成果物。`artifact`、単調増加する`revision`、
`status: needs_input | ready`を持つ。

### `review-source-v1`

AIの観点別結果または人間の結果。Flowがreview開始時に発行する
`review_cycle_id`、対象path、revision、SHA-256、source ID、
監査用の`source_kind: ai | human`、次のstatusを持つ。

```text
passed | changes_required | blocked | unable
```

Planのsourceは`review_stage: decision | final`も持つ。`decision`は未回答の質問・
選択肢・推奨だけを対象とし、`final`は回答反映後のタスク引き継ぎだけを対象とする。

本文のfindingは`classification: gate | scope_candidate`を持つ。

- `gate`: 採用済み判断の誤り、推奨の前提不成立、現在の要件・制約・受け入れ条件を
  満たせない不足、実装・検証不能、必須制約と矛盾する、または受容判断が未解決な
  security、privacy、データ損失、互換性riskなど、現在のscopeを成立させるために
  解消が必要な指摘。
- `scope_candidate`: 現在のscopeの成立には不要な追加機能、新しい利用者や価値、
  将来拡張、任意のrefactoring、品質水準や検証範囲の追加。

各findingは関係する確認事項を`decision_refs`で参照する。直接対応する確認事項が
なければ空とする。sourceのstatusは`gate`だけから決定し、`scope_candidate`だけなら
`passed`とする。reviewerは既存の別選択肢を推奨できるが、利用者に代わって回答を
変更しない。既存選択肢で解決できなければ、必要条件を`gate`へ記録してwriterへ
選択肢の再作成を要求し、新しい回答を確定しない。

`gate`は対象、問題、根拠、要求変更、完了条件を持つ。`scope_candidate`は提案、根拠、
今回含める影響、推奨処理を持ち、推奨処理は原則として別タスクまたはscope外とする。
riskの存在や別案の方が安全であることだけでは`gate`にしない。trade-off、残存risk、
成立前提、受容判断が記録され、必須制約と矛盾しなければ`passed`にできる。

### `phase-review-v1`

review hubの集約結果。`review_cycle_id`、対象path、revision、SHA-256、mode、source paths、
次のstatusを持つ。

```text
passed | changes_required | blocked | incomplete
```

Planの集約結果はsourceと同じ`review_stage`を持つ。`decision`の`passed`は質問を利用者へ
提示できることだけを表し、Implementへの移行根拠にはしない。`final`の`passed`だけが
Implementへの移行根拠になる。

`blocked`の本文にはreview hubが作成した`利用者判断`を持つ。Flowはこの文面を
生成・要約・補足せず、そのまま利用者へ提示する。
本文にはstatusへ影響しない`追加スコープ候補`を持てる。

### `phase-feedback-v1`

Flowがwriterへ渡す正規化済み入力。レビュー主体を含めない。

```yaml
---
schema_version: flow/phase-feedback-v1
phase: design
target_path: spec/.../design.md
target_revision: 1
operation: revise
created_at: 2026-07-28T00:00:00+09:00
---

items:
  - id: F-001
    kind: change
    target: 受け入れ条件
    instruction: 異常系の期待結果を明記する
    evidence: 現在の条件では正常系と異常系を区別できない
    completion: 異常系の期待結果が記載されている
```

`kind`は`change | answer`、`operation`は`revise | respond`とする。

## Flow状態

Flowだけが`flow-state-v1`を更新する。

```yaml
schema_version: flow/flow-state-v1
feature: feature
phase: design
state: running
next_action: invoke_writer
review_mode:
  design: ai
  plan: ai
automatic_revision:
  design: 0
  plan_decision: 0
  plan_final: 0
review_retry:
  design: 0
  plan_decision: 0
  plan_final: 0
review_cycle:
  design:
  plan_decision:
  plan_final:
artifacts:
  design: spec/.../design.md
  design_review: spec/.../design-review.md
  plan: spec/.../plan.md
  plan_decision_review: spec/.../plan-decision-review.md
  plan_review: spec/.../plan-review.md
  implement: spec/.../implement.md
```

- `phase`: `design | design_review | plan | plan_decision_review | plan_review | implement | completed`
- `state`: `running | waiting_for_input | blocked | completed`
- `next_action`: `invoke_writer | ask_user | invoke_review | invoke_next_phase | stop`

`review_cycle`にはreview stageごとの最新`review_cycle_id`、対象revision、SHA-256を記録する。
成果物の内容やreview statusを複製せず、path、mode、cycle、retry counter、
次actionだけを持つ。
再開時は`flow-state.yml`と参照成果物を読み、会話中のagent状態に依存しない。

## Review mode

- 既定は`ai`。
- 利用者が指定した場合は`human`。
- AI reviewが自動修正と実行障害の再試行を使い切った場合は`human`へ切り替える。
- 1回のreview cycleではAIとhumanを混在させない。
- Flowはreview開始ごとに一意な`review_cycle_id`を発行する。
- 同じ`review_cycle_id`に属するsourceと集約結果だけを有効とする。
- `review_mode.plan`はPlan decision reviewと最終Plan reviewの両方へ適用する。

`incomplete`は、source欠落、reviewerの`unable`などのreview実行障害と、対象成果物の
schema、artifact、status、path、revision、SHA-256不一致を区別する。前者だけを
review再試行またはhuman切替の対象とする。後者はreviewを再試行せず
`state: blocked`、`next_action: stop`とし、対象成果物またはFlow stateの修正を求める。

Human modeではFlowが人間へ対象成果物を提示し、回答を対応するreview source directoryの
`human.md`へ`review-source-v1`として保存してからhubを起動する。
人間の結果もAIと同じ4 statusへ正規化する。

Plan decision reviewのhuman modeでは、未回答の質問、選択肢、影響、推奨、前提が
利用者へ提示可能かを確認し、この時点では質問への回答を求めない。`passed`の集約後に
あらためてPlan writerの質問への回答を求める。

### Human reviewの提示契約

FlowがDesignまたはPlanをhuman modeで提示するときは、対象成果物だけでなく、
人間確認へ切り替えた理由と確認対象を同時に提示する。

提示内容は次の順とする。

1. 切替理由: 利用者指定、自動修正上限、またはreview再試行上限
2. 直前のreview cycleの対象revision、mode、status
3. 直前の`phase-review-v1`にあるfindingまたは失敗情報
4. 自動修正後なら、正規化feedbackと新成果物の`Feedback反映`から確認できる修正内容
5. 現在が「既知の未解決懸念あり」か「修正後revisionが未review」か
6. 人間が重点的に確認する項目、対象成果物のpath、回答形式

Flowは`phase-review-v1`、該当feedback、対象成果物、counterだけを根拠にし、
findingを再評価、拡張、縮小しない。自動修正後の新revisionに未解決findingが記録されて
いない場合は、既知の問題があるためではなく修正結果が未reviewであるため人間確認を
求める、と明記する。単に「human reviewが必要」とだけ提示してはならない。

```md
Human reviewが必要です。

- 切替理由: {理由}
- 直前のreview: revision {N} / {mode} / {status}
- 直前の指摘または失敗:
  - {phase-review-v1の内容}
- revision {M}での修正:
  - {feedbackとFeedback反映で追跡できる内容}
- 現在の状態: {既知の未解決懸念あり | 修正後revisionが未review}
- 確認してほしい点:
  - {review対象}
- 成果物: {path}

問題なければ`passed`、変更が必要なら
`changes_required: {変更内容}`と回答してください。
```

利用者指定で最初からhuman modeの場合など、直前のAI reviewや自動修正が存在しない項目は
`該当なし`と明記する。review再試行上限による切替では、findingの代わりにaggregateの
失敗情報と、成果物内容の評価が未完了であることを提示する。

## 実行フロー

### 1. Design

1. `flow-designer`へ`operation: create`、要求、`design.md`のpathを渡す。
2. `status: needs_input`ならwriterが記載した質問、3個の選択肢、推奨、推奨理由、前提を
   意味を変えず利用者へ提示する。推奨を選ぶ場合は「推奨を採用」、別案なら質問IDと
   選択肢、選択肢外なら具体的な回答を求める。Flow自身で選択肢や推奨を生成しない。
3. 回答を`design-feedback.md`へ`kind: answer`として保存し、
   `operation: respond`で同じwriterへ渡す。
4. `status: ready`ならDesign reviewへ進む。

Design writerへreview mode、source、集約結果、Flow状態を渡さない。

### 2. Design review

1. `design.md`のrevisionと全バイトSHA-256を取得する。
2. 新しい`review_cycle_id`を発行して`flow-state.yml`へ対象revision、SHA-256と保存する。
3. 選択modeで`flow-design-reviewer`を起動する。
4. `design-review.md`のcycle ID、対象path、revision、SHA-256を検証する。
5. statusに従って処理する。

- `passed`: `追加スコープ候補`がなければ、移行直前にDesignのSHA-256を再計算する。
  一致すればPlanへ進む。候補があれば「追加スコープ候補の処理」に従う。
- `changes_required`: AI modeで自動修正が未使用なら、findingsを`design-feedback.md`へ
  変換し、`operation: revise`でwriterへ渡してからcounterを1にする。修正後が
  `needs_input`ならDesignの質問処理へ戻り、`ready`なら新revisionをAIで再reviewする。
  AI modeでcounterが1なら2回目の自動修正を行わず、現在のreview済みrevisionを
  「Human reviewの提示契約」に従ってhuman modeで提示する。Human modeの
  `changes_required`だけはfindingsをfeedbackへ変換してwriterへ渡し、修正後の
  `needs_input`は質問処理へ、`ready`は同じ契約で再び人間へ提示する。
- `blocked`: `design-review.md`の`利用者判断`を変更せず提示し、回答をfeedbackへ
  正規化してwriterへ渡す。Flow自身で背景、選択肢、推奨を生成しない。writerが
  `status: needs_input`なら質問を提示し、`ready`なら新しいcycleでreviewする。
- `incomplete`: AI modeのreview実行障害なら同じrevisionのAI reviewを1回だけ再実行し、
  再失敗時はhuman modeへ切り替える。Human modeならhuman sourceの再取得を1回だけ行い、
  再失敗時は`blocked`で停止する。Human modeでAI reviewerを起動しない。対象成果物または
  Flow stateの契約不一致ならmodeにかかわらず再試行せず`blocked`で停止する。

自動修正後の再reviewは、直前の`gate`の解消、修正による現在の要件と採用済み判断への
回帰、修正で生じ、必須制約と矛盾する、または受容判断が未解決な重大なsecurity、
privacy、データ損失、互換性riskだけを判定対象とする。
それ以外に見つかった改善は`scope_candidate`とし、新しい必須修正へ昇格させない。

### 3. Plan

1. `flow-planner`へ`operation: create`、`design.md`、DesignのrevisionとSHA-256、
   `plan.md`のpathを渡す。
2. Design reviewのpath、mode、結果は渡さない。
3. Plan front matterのDesign参照と現在のDesign全バイトが一致することを確認する。
4. `status: needs_input`ならPlan decision reviewへ進む。
5. `status: ready`なら最終Plan reviewへ進む。

### 3.1 Plan decision review

1. `plan.md`のrevisionと全バイトSHA-256を取得する。
2. `plan-decision`用の一意な`review_cycle_id`を発行し、対象revision、SHA-256とともに
   `flow-state.yml`へ保存する。
3. 選択modeで`flow-plan-decision-reviewer`を起動する。
4. `plan-decision-review.md`のcycle ID、`review_stage: decision`、PlanとDesignの
   path、revision、SHA-256を検証する。
5. statusに従って処理する。

- `passed`: PlanとDesign両方の対象SHA-256が変わっていないことを確認し、writerが
  記載した未回答の質問、3個の選択肢、影響、推奨、推奨理由、前提を意味を変えず
  利用者へ提示する。回答を
  `plan-feedback.md`へ`kind: answer`として保存し、`operation: respond`でplannerへ渡す。
  新しい未回答質問があれば新しいdecision review cycleへ進み、`ready`なら最終Plan
  reviewへ進む。
- `changes_required`: AI modeで`plan_decision`の自動修正が未使用なら、findingsを
  `plan-feedback.md`へ変換し、`operation: revise`でplannerへ渡してからcounterを1にする。
  修正後が`ready`なら最終Plan reviewへ、`needs_input`なら新revisionをAIでdecision
  reviewする。AI modeでcounterが1なら2回目の自動修正を行わず、現在のreview済み
  revisionをhuman modeで提示する。Human modeの`changes_required`はfindingsをfeedbackへ
  変換してplannerへ渡し、修正後が`ready`なら最終Plan reviewへ、`needs_input`なら
  修正後を再び人間へ提示する。
- `blocked`: `plan-decision-review.md`の`利用者判断`を変更せず提示し、回答をfeedbackへ
  正規化してplannerへ渡す。修正後が`needs_input`なら新しいdecision review cycleへ、
  `ready`なら最終Plan reviewへ進む。DesignのWHATまたはscope変更が必要なら現在のFlowを
  逆戻りさせず、別タスクとして扱うよう案内する。
- `incomplete`: AI modeのreview実行障害なら同じrevisionのAI reviewを1回だけ再実行し、
  再失敗時はhuman modeへ切り替える。Human modeならhuman sourceの再取得を1回だけ行い、
  再失敗時は`blocked`で停止する。Human modeでAI reviewerを起動しない。Plan、Design、
  またはFlow stateの契約不一致ならmodeにかかわらず再試行せず`blocked`で停止する。

decision reviewは未回答の確認事項だけを対象とする。詳細タスク、実装手順、検証計画の
不足をfindingへ含めず、追加スコープ候補を生成しない。

### 4. 最終Plan review

1. `status: ready`、Plan front matterのDesign参照、現在のDesign全バイトを検証する。
2. `plan-final`用の一意な`review_cycle_id`を発行し、対象revision、SHA-256とともに
   `flow-state.yml`へ保存する。
3. 選択modeで`flow-plan-reviewer`を起動する。
4. `plan-review.md`のcycle ID、`review_stage: final`、PlanとDesignのpath、revision、
   SHA-256を検証する。
5. statusに従って処理する。

- `passed`: `追加スコープ候補`がなければ移行直前にPlanとDesign両方のSHA-256を再計算し、
  review対象と一致すればImplementへ進む。候補があれば「追加スコープ候補の処理」に従う。
- `changes_required`: AI modeで`plan_final`の自動修正が未使用なら、findingsを
  `plan-feedback.md`へ変換し、`operation: revise`でplannerへ渡してからcounterを1にする。
  修正後が`needs_input`ならPlan decision reviewへ、`ready`なら新revisionをAIで最終
  reviewする。AI modeでcounterが1なら2回目の自動修正を行わず、現在のreview済み
  revisionを「Human reviewの提示契約」に従ってhuman modeで提示する。Human modeの
  `changes_required`はfindingsをfeedbackへ変換してplannerへ渡し、修正後が
  `needs_input`ならPlan decision reviewへ、`ready`なら修正後を再び人間へ提示する。
- `blocked`: `plan-review.md`の`利用者判断`を変更せず提示し、回答をfeedbackへ正規化して
  plannerへ渡す。修正後が`needs_input`ならPlan decision reviewへ、`ready`なら新しい
  最終review cycleへ進む。
- `incomplete`: AI modeのreview実行障害なら同じrevisionのAI reviewを1回だけ再実行し、
  再失敗時はhuman modeへ切り替える。Human modeならhuman sourceの再取得を1回だけ行い、
  再失敗時は`blocked`で停止する。Human modeでAI reviewerを起動しない。Plan、Design、
  またはFlow stateの契約不一致ならmodeにかかわらず再試行せず`blocked`で停止する。

最終reviewは質問の推奨を再評価せず、採用回答がPlanのタスクへ反映されていることだけを
確認する。詳細HOWの最適性やtest caseの網羅性を新しいgateにしない。

### 4.1 追加スコープ候補の処理

review hubが`passed`とともに`追加スコープ候補`を返した場合、Flowは候補を変更せず
まとめて利用者へ提示する。候補はhuman reviewへの切替理由にせず、自動修正counterも
消費しない。提示中は`state: waiting_for_input`、`next_action: ask_user`とする。

- 推奨回答は、全候補を本タスクのscope外として現在の`passed`を維持することとする。
- 利用者がscope外を選んだ場合は、Design reviewではDesignのSHA-256を、最終Plan reviewでは
  PlanとDesign両方のSHA-256をaggregateの対象digestと照合してから次phaseへ進む。
- Design reviewで候補の採用を選んだ場合は、選択された候補だけを
  `design-feedback.md`へ`kind: change`として正規化し、Designを改訂して再reviewする。
- 最終Plan reviewでDesignを変えない候補の採用を選んだ場合は、選択された候補だけを
  `plan-feedback.md`へ`kind: change`として正規化し、Planを改訂して再reviewする。
- 最終Plan reviewでDesignのWHAT、公開API、責務境界、scopeの変更が必要な候補は、
  現Flowを逆戻りさせず別タスクとして扱うよう案内する。

```md
レビューはpassedです。

現在のタスクの成立には不要ですが、次の追加スコープ候補があります。
- {候補ID}: {提案と今回含める影響}

推奨は、すべて本タスクのスコープ外とすることです。
このまま進める場合は「スコープ外」、本タスクへ含める場合は候補IDを回答してください。
```

### 5. Implement

`flow-implementer`へ`plan.md`と`implement.md`のpathを渡す。
上流のmode、source、集約成果物、Flow状態は渡さない。
Flowは`implement-artifact-v1`のschema、Planのpath、revision、SHA-256、
Implementのrevisionとstatusを検証する。statusが`completed`ならFlowも
`completed`にする。内容不足やPlan外判断で
`blocked`なら利用者へ判断を戻す。

## Feedback正規化

FlowはAI findings、人間の変更要求、writer質問への回答を同じ項目形式へ変換する。

- AI sourceのIDや主体情報をfeedbackへコピーしない。
- `scope_candidate`は利用者が本タスクへの採用を選んだ項目だけをfeedbackへ変換する。
- 要求変更の意味を拡張・縮小しない。
- `blocked`への人間回答は`kind: answer`とする。
- 対象revisionが変わった古いfeedbackは再利用しない。
- feedback反映後の成果物は必ずrevisionが増える。

## 外側検証

Flowは次だけを検証する。

- schemaと必須field
- review cycle ID
- pathとrevision
- 集約成果物が参照するsourceの存在
- `blocked`の集約成果物に空でない`利用者判断`があること
- review時と移行時のSHA-256一致
- retry counter

review内容を再評価したり、観点別結論を書き換えたりしない。

## サブエージェント構造

```text
Flow
├── phase writer
├── decision review hub (Plan needs_input only)
│   └── decision-quality reviewer
└── final review hub
    ├── perspective reviewer 1
    └── perspective reviewer 2 (Design only)
```

Human modeではperspective reviewerを起動せず、human source 1件をhubへ渡す。
phase writerとreview hubは兄弟とし、相互に起動しない。

## 完了条件

- phaseの順序を守っている。
- writerは自分のphase artifactとfeedbackだけを受け取っている。
- review sourceは選択modeのものだけを集約している。
- review sourceとaggregateのcycle IDがFlowの最新cycleと一致している。
- Plan decision reviewの`passed`と同一SHA-256だけを質問提示の根拠にしている。
- Designと最終Planの`passed`と同一SHA-256だけを次phaseの根拠にしている。
- 自動修正とreview再試行は各review stageで最大1回である。
- 状態と再開情報が`spec/`配下に残っている。
- 各成果物のwriterが一意である。
