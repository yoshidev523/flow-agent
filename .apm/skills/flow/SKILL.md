---
name: flow
description: spec配下の永続成果物を介してDesign、Review、Plan、Implementを接続する状態遷移ハブ。
---

# Flow

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

### `phase-review-v1`

review hubの集約結果。`review_cycle_id`、対象path、revision、SHA-256、mode、source paths、
次のstatusを持つ。

```text
passed | changes_required | blocked | incomplete
```

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

## 実行フロー

### 1. Design

1. `flow-designer`へ`operation: create`、要求、`design.md`のpathを渡す。
2. `status: needs_input`なら質問を利用者へ提示する。
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

- `passed`: 移行直前にDesignのSHA-256を再計算する。一致すればPlanへ進む。
- `changes_required`: findingsを`design-feedback.md`へ変換し、必ず
  `operation: revise`でwriterへ渡す。AI modeかつ自動修正が未使用ならcounterを1にして
  新revisionをAIで再reviewする。AIの自動修正を使用済みなら、修正後の新revisionを
  human modeで提示する。Human modeなら修正後の新revisionを再び人間へ提示する。
- `blocked`: 人間へ判断を求め、回答をfeedbackへ正規化してwriterへ渡す。
- `incomplete`: 同じrevisionのAI reviewを1回だけ再実行する。
  再失敗時はhuman modeへ切り替える。

### 3. Plan

1. `flow-planner`へ`operation: create`、`design.md`、DesignのrevisionとSHA-256、
   `plan.md`のpathを渡す。
2. Design reviewのpath、mode、結果は渡さない。
3. `status: needs_input`ならDesignと同じ回答処理を`plan-feedback.md`で行う。
4. `status: ready`ならPlan reviewへ進む。

### 4. Plan review

Design reviewと同じ規則をPlanへ適用する。review hubへPlanが参照するDesignのpath、
revision、SHA-256も渡す。Plan front matterのDesign参照と現在のDesign全バイトが
一致しない場合はreviewを開始せず、Plan writerへ差し戻す。
`passed`のPlanだけがImplementへ進める。
移行直前にPlanのSHA-256と`plan-review.md`の対象SHA-256が一致することを確認する。

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
