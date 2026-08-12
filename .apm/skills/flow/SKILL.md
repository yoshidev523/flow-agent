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

要求から実装までを次の順で進める。

```text
design -> design_review -> plan -> plan_review -> implement -> completed
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
├── plan-review.md
├── implement.md
└── reviews/
    ├── design/
    │   ├── requirements.md
    │   ├── user-value.md
    │   ├── quality-risk.md
    │   └── human.md
    └── plan/
        ├── structure-integration.md
        ├── executability.md
        ├── verifiability.md
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
| `design-review.md`、`plan-review.md` | 対応するreview hub |

複数のwriterが同じファイルを編集してはならない。

## 永続契約

phase境界では次の4契約だけを使用する。

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

本文のfindingは`classification: gate | scope_candidate`を持つ。

- `gate`: 採用済み判断の誤り、推奨の前提不成立、現在の要件・制約・受け入れ条件を
  満たせない不足、実装・検証不能、重大なsecurity、privacy、データ損失、互換性破壊など、
  現在のscopeを成立させるために解消が必要な指摘。
- `scope_candidate`: 現在のscopeの成立には不要な追加機能、新しい利用者や価値、
  将来拡張、任意のrefactoring、品質水準や検証範囲の追加。

各findingは関係する確認事項を`decision_refs`で参照する。直接対応する確認事項が
なければ空とする。sourceのstatusは`gate`だけから決定し、`scope_candidate`だけなら
`passed`とする。reviewerは既存の別選択肢を推奨できるが、利用者に代わって回答を
変更しない。既存選択肢で解決できなければ、必要条件を`gate`へ記録してwriterへ
選択肢の再作成を要求し、新しい回答を確定しない。

`gate`は対象、問題、根拠、要求変更、完了条件を持つ。`scope_candidate`は提案、根拠、
今回含める影響、推奨処理を持ち、推奨処理は原則として別タスクまたはscope外とする。

### `phase-review-v1`

review hubの集約結果。`review_cycle_id`、対象path、revision、SHA-256、mode、source paths、
次のstatusを持つ。

```text
passed | changes_required | blocked | incomplete
```

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
  plan: 0
review_retry:
  design: 0
  plan: 0
review_cycle:
  design:
  plan:
artifacts:
  design: spec/.../design.md
  design_review: spec/.../design-review.md
  plan: spec/.../plan.md
  plan_review: spec/.../plan-review.md
  implement: spec/.../implement.md
```

- `phase`: `design | design_review | plan | plan_review | implement | completed`
- `state`: `running | waiting_for_input | blocked | completed`
- `next_action`: `invoke_writer | ask_user | invoke_review | invoke_next_phase | stop`

`review_cycle`にはphaseごとの最新`review_cycle_id`、対象revision、SHA-256を記録する。
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

Human modeではFlowが人間へ対象成果物を提示し、回答を
`reviews/{phase}/human.md`へ`review-source-v1`として保存してからhubを起動する。
人間の結果もAIと同じ4 statusへ正規化する。

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
- `changes_required`: findingsを`design-feedback.md`へ変換し、必ず
  `operation: revise`でwriterへ渡す。AI modeかつ自動修正が未使用ならcounterを1にして
  新revisionをAIで再reviewする。AIの自動修正を使用済みなら、修正後の新revisionを
  「Human reviewの提示契約」に従ってhuman modeで提示する。Human modeなら修正後の
  新revisionを同じ契約で再び人間へ提示する。writerが選択肢を再作成して
  `status: needs_input`を返した場合はreviewせず、Designの質問処理へ戻る。
- `blocked`: `design-review.md`の`利用者判断`を変更せず提示し、回答をfeedbackへ
  正規化してwriterへ渡す。Flow自身で背景、選択肢、推奨を生成しない。writerが
  `status: needs_input`なら質問を提示し、`ready`なら新しいcycleでreviewする。
- `incomplete`: 同じrevisionのAI reviewを1回だけ再実行する。
  再失敗時はhuman modeへ切り替える。

自動修正後の再reviewは、直前の`gate`の解消、修正による現在の要件と採用済み判断への
回帰、修正で生じた重大なsecurity、privacy、データ損失、互換性破壊だけを判定対象とする。
それ以外に見つかった改善は`scope_candidate`とし、新しい必須修正へ昇格させない。

### 3. Plan

1. `flow-planner`へ`operation: create`、`design.md`、DesignのrevisionとSHA-256、
   `plan.md`のpathを渡す。
2. Design reviewのpath、mode、結果は渡さない。
3. `status: needs_input`ならDesignと同じ回答処理を`plan-feedback.md`で行う。
4. `status: ready`ならPlan reviewへ進む。

### 4. Plan review

Design reviewと同じ規則と「Human reviewの提示契約」をPlanへ適用する。
review hubへPlanが参照するDesignのpath、
revision、SHA-256も渡す。Plan front matterのDesign参照と現在のDesign全バイトが
一致しない場合はreviewを開始せず、Plan writerへ差し戻す。
`passed`のPlanだけがImplementへ進める。
移行直前にPlanのSHA-256と`plan-review.md`の対象SHA-256が一致することを確認する。
`blocked`では`plan-review.md`の`利用者判断`をDesign reviewと同じ規則で提示する。

### 4.1 追加スコープ候補の処理

review hubが`passed`とともに`追加スコープ候補`を返した場合、Flowは候補を変更せず
まとめて利用者へ提示する。候補はhuman reviewへの切替理由にせず、自動修正counterも
消費しない。提示中は`state: waiting_for_input`、`next_action: ask_user`とする。

- 推奨回答は、全候補を本タスクのscope外として現在の`passed`を維持することとする。
- 利用者がscope外を選んだ場合は、対象SHA-256を確認して次phaseへ進む。
- Design reviewで候補の採用を選んだ場合は、選択された候補だけを
  `design-feedback.md`へ`kind: change`として正規化し、Designを改訂して再reviewする。
- Plan reviewでDesignを変えない候補の採用を選んだ場合は、選択された候補だけを
  `plan-feedback.md`へ`kind: change`として正規化し、Planを改訂して再reviewする。
- Plan reviewでDesignのWHAT、公開API、責務境界、scopeの変更が必要な候補は、
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
└── phase review hub
    ├── perspective reviewer 1
    ├── perspective reviewer 2
    └── perspective reviewer 3
```

Human modeではperspective reviewerを起動せず、human source 1件をhubへ渡す。
phase writerとreview hubは兄弟とし、相互に起動しない。

## 完了条件

- phaseの順序を守っている。
- writerは自分のphase artifactとfeedbackだけを受け取っている。
- review sourceは選択modeのものだけを集約している。
- review sourceとaggregateのcycle IDがFlowの最新cycleと一致している。
- AIまたはhumanの`passed`と同一SHA-256を次phaseの根拠にしている。
- 自動修正とreview再試行は各phaseで最大1回である。
- 状態と再開情報が`spec/`配下に残っている。
- 各成果物のwriterが一意である。
