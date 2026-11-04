---
schema_version: flow/phase-artifact-v2
artifact: plan
revision: 1
status: ready
producer: flow-plan
invocation_id: implement-review-scope
operation: create
updated_at: "2026-11-04T14:13:08+00:00"
inputs: []
questions: []
feedback_results: []
tasks:
  - id: T-001
    files:
      - src/contracts/index.ts
      - src/code-review.ts
      - src/validation/guards.ts
      - .apm/skills/flow/references/contracts.md
    dependencies: []
    completion: Implement reviewとコードsnapshot・feedbackの契約と検証が成立する
    verification: コードの鮮度とowner契約のテストが通る
    verification_ids:
      - V-001
  - id: T-002
    files:
      - .apm/agents/flow-implement-reviewer.agent.md
      - .apm/skills/flow-implement-review/SKILL.md
      - .apm/skills/flow-implement-review-correctness/SKILL.md
      - .apm/skills/flow-implement-review-maintainability/SKILL.md
      - .apm/skills/flow-project-rules-review/SKILL.md
    dependencies:
      - T-001
    completion: hub・2観点・共通rulesの責務と入出力を定義し配置できる
    verification: APMとskill validator、Codex/Claude配置確認が通る
    verification_ids:
      - V-002
      - V-004
  - id: T-003
    files:
      - src/transitions.ts
      - src/persistence/store.ts
      - src/replanning.ts
      - src/cli.ts
      - .apm/skills/flow/SKILL.md
      - .apm/skills/flow-implement/SKILL.md
    dependencies:
      - T-001
      - T-002
    completion: 直接完了禁止・修正再評価・human切替・再計画が接続される
    verification: 状態遷移・再計画・復旧の回帰テストが通る
    verification_ids:
      - V-001
  - id: T-004
    files:
      - tests/flowctl.test.mjs
      - tests/verify_deployment.sh
      - AGENTS.md
      - README.md
      - .apm/skills/flow/scripts/flowctl.js
      - .apm/skills/flow-artifact-sync/scripts/flowctl.js
    dependencies:
      - T-003
    completion: 配布物・文書を同期し結果と未実施を記録する
    verification: 全テスト、配布一致、配置確認とdiff確認が通る
    verification_ids:
      - V-001
      - V-002
      - V-003
      - V-004
verification_plan:
  - id: V-001
    command: npm test
    required: true
  - id: V-002
    command: apm run verify-flow
    required: true
  - id: V-003
    command: apm run check-flow-dist
    required: true
  - id: V-004
    command: apm run verify-flow-deployment
    required: true
handoff_checks:
  - id: scope
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
  - id: files
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
  - id: responsibilities
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
  - id: interfaces
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
  - id: errors
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
  - id: dependencies
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
  - id: completion
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
  - id: verification
    status: ok
    reason: 採用済み依頼と今回の契約・検証範囲を記載
project_knowledge:
  discovery: 適用範囲のAGENTS.md、既存review hub/観点skill、Zod契約・遷移・CLIと配布検証を確認した。外部projectへの変更なし。
  completeness: complete
  documents:
    - id: DOC-001
      location: /Users/yoshikihonda/.codex/worktrees/e9a0/flow-agent/AGENTS.md
      scope: agent/skill・契約・配布と検証
      status: available
      sha256: baa394d5bf39a3f30aa067e826a5bf522be13cc92658fad0d0f9cd36953319f8
      version: null
      reason: 正本配置、owner分離、既存契約利用、CLI保存と監査、配布検証を適用
  checks:
    - id: PK-001
      document_ids:
        - DOC-001
      rule: 正本は.apm/src、writer・review・状態遷移のownerを分け、機械契約とMarkdown・templateを同時更新する
      requirement: required
      applicability: Implement reviewの追加
      status: compliant
      evidence: .apmのhub/2観点agent・skill、共通project-rules拡張、src契約/guard/transitionと対応文書・template・配置検証を更新
      finding_ids: []
---
# Implementレビュー追加

## 目的
利用者が指定したImplement review hubと観点別reviewerを作り、Flow完了前へ接続する。通常チャットの依頼範囲の記録であり、Flow本体・reviewerによる評価や承認を実行した記録ではない。

## 要件サマリ
今回の変更範囲に従う。

## 実装スコープ
correctness/maintainability/project-rulesの3観点、既存v2 source/aggregate/feedbackの拡張、Gitコードsnapshot、修正再評価・retry/human・再計画。旧stateの暗黙移行、外部project変更、commit/push/PRは含めない。

## 既存コンテキスト
今回の変更範囲に従う。

## 確認事項
今回の変更範囲に従う。

## 実行サマリ
今回の変更範囲に従う。

## 変更ファイル
今回の変更範囲に従う。

## タスク分解
今回の変更範囲に従う。

## 詳細手順
責務はagent、HOWはskill、機械処理はsrcとする。Implement completedはexecutorの作業完了とし、FlowはImplement review passed後だけcompletedへ進む。修正は正規化feedbackへ限定しPlan外変更は人間承認付き再計画へ返す。snapshotは開始baseと実装headを固定し、未commitコード・コード変更を拒否する。

## テスト・検証計画
V-001〜004を実行する。失敗・未実施は成功へ読み替えない。新skillはskill-creator付属quick_validate.pyでも検証する。

## リスクと停止条件
今回の変更範囲に従う。

## 実装引き継ぎチェック
今回の変更範囲に従う。

## Feedback反映
今回の変更範囲に従う。

## 変更履歴

### revision 1

- 日時: 2026-11-04T14:13:08+00:00
- 操作: create
- 変更内容: Implement reviewの追加内容と検証状況を記録
- 背景・理由: 利用者のhub/観点別構成とFlow完了前接続の指定に対応
- 変更箇所: 目的、実装スコープ、詳細手順、テスト・検証計画
- 参照: AGENTS.md
- 状態変更: 初版 → ready
