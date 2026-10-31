---
schema_version: flow/phase-artifact-v2
artifact: plan
revision: 1
status: ready
producer: flow-plan
invocation_id: project-knowledge-plan
operation: create
updated_at: "2026-10-31T07:47:12+00:00"
inputs: []
questions: []
feedback_results: []
tasks:
  - id: T-001
    files:
      - .apm/skills/flow-project-knowledge/
      - .apm/skills/flow-project-rules-review/
      - .apm/agents/flow-project-rules-reviewer.agent.md
    dependencies: []
    completion: 知識の把握・適用材料・提案・採用済み更新と専用reviewerを追加
    verification: スキル記述・配布を確認
    verification_ids:
      - V-002
      - V-004
  - id: T-002
    files:
      - src/
      - .apm/skills/flow/references/
      - .apm/skills/flow/assets/templates/
    dependencies:
      - T-001
    completion: 既存契約へ適用記録を追加し集約とローカル文書の鮮度を検証
    verification: 契約・参照・集約・phase移行のテスト
    verification_ids:
      - V-001
      - V-003
  - id: T-003
    files:
      - .apm/skills/
      - .apm/agents/
      - AGENTS.md
      - tests/
    dependencies:
      - T-002
    completion: 各工程・全review stage・通知・非同期feedback・提案タイミングを接続
    verification: 全体テストとCodex/Claude配置検証
    verification_ids:
      - V-001
      - V-002
      - V-004
verification_plan:
  - id: V-001
    command: apm run test-flow
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
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
  - id: files
    status: ok
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
  - id: responsibilities
    status: ok
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
  - id: interfaces
    status: ok
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
  - id: errors
    status: ok
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
  - id: dependencies
    status: ok
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
  - id: completion
    status: ok
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
  - id: verification
    status: ok
    reason: 採用済みチャット計画と本成果物のタスク・検証に記載
project_knowledge:
  discovery: 対象repositoryのAGENTS.mdと.apm/skills/flow/referencesの既存契約・CLI・再計画手順を確認。外部文書運用をローカルMarkdownに限定しないという利用者の指定を採用。
  completeness: complete
  documents:
    - id: DOC-001
      location: /Users/yoshikihonda/.codex/worktrees/9ec7/flow-agent/AGENTS.md
      scope: repository全体
      status: available
      sha256: af45404a13b7b2ee21bc3cf96558b1986fce31b5b6a0ba1edd8e03c9ceabb56a
      version: null
      reason: 本変更に適用する責務境界と配置・検証ルール
  checks:
    - id: RULE-001
      document_ids:
        - DOC-001
      rule: writer・review・状態遷移の責務を分離する
      requirement: required
      applicability: 新しい知識スキル・reviewerとFlowの接続
      status: compliant
      evidence: 知識スキルは把握・提案・採用済み正本文書更新、reviewerはsource、Flowは対話・遷移を所有。新規中継契約なし。
      finding_ids: []
    - id: RULE-002
      document_ids:
        - DOC-001
      rule: TypeScript/Zodを正本とし契約・同梱物・配置検証を更新する
      requirement: required
      applicability: 追加fieldとreview source
      status: compliant
      evidence: src・Markdown契約・templates・配布bundleを更新し、94テストと独立consumerの配置検証に成功。
      finding_ids: []
---
# プロジェクト知識の適用と育成

## 目的

プロジェクト独自の習慣・ルール・暗黙知をDesign・Plan・Implement・reviewで参照し、人間feedbackから育てる。

## 要件サマリ

汎用reviewと別のルール適合review、Markdownとチャットの確認結果、非同期feedbackへの影響判断、既存の人間承認付き再計画、判断確定後と完了時の知識更新提案。

## 実装スコープ

承認されたチャット計画を直接要求として使う。Flowは起動せず、単独成果物形式で変更・検証の記録を保存する。独立した実装review phaseは追加しない。

## 既存コンテキスト

正本は.apm/skills・.apm/agents・src。詳細文書の正本・保存先はprojectの運用に従い、別repository・外部serviceも許容する。

## 確認事項

利用者の計画承認済み。追加の必須判断なし。

## 実行サマリ

T-001からT-003へ順に実施し、既存検証コマンドで確認する。

## 変更ファイル

各task.filesとGit差分を参照。配布bundleと同期skill同梱物を再生成する。

## タスク分解

T-001: 知識の把握・適用材料・提案・採用済み更新と専用reviewerを追加

T-002: 既存契約へ適用記録を追加し集約とローカル文書の鮮度を検証

T-003: 各工程・全review stage・通知・非同期feedback・提案タイミングを接続

## 詳細手順

知識スキルとreviewerを追加する。任意のproject_knowledge fieldとsource必須化を実装し、集約・鮮度確認へ接続する。各ownerの適用・候補記録、Flowの通知・提案・再計画接続を更新する。

## テスト・検証計画

apm run test-flow

apm run verify-flow

apm run check-flow-dist

apm run verify-flow-deployment

## リスクと停止条件

外部serviceの現在版取得は対応connectorの責務。CLIだけで意味判断・探索の十分性を保証しない。必須資料の確認不能を合格へ変換しない。推奨や今回限りの判断を恒久ルールへ自動昇格させない。

## 実装引き継ぎチェック

対象・責務・既存契約・失敗挙動・検証を確認。状態遷移とretry上限は既存手順を維持。

## Feedback反映

参照先をローカルMarkdownに限定しない。Flowがタイミングを判断し、知識スキルが具体案を作り、Flowが提示する。

## プロジェクト知識

AGENTS.mdの責務分離、正本管理、既存契約・CLI利用と配布検証に従った。詳細はfront matter。

## 変更履歴

### revision 1

- 日時: 2026-10-31T07:47:12+00:00
- 操作: create
- 変更内容: 合意した変更計画と実装・検証結果を記録
- 背景・理由: 利用者が本チャットの計画を承認して実装を依頼
- 変更箇所: 目的、要件サマリ、実装スコープ、既存コンテキスト、確認事項、実行サマリ、変更ファイル、タスク分解、詳細手順、テスト・検証計画、リスクと停止条件、実装引き継ぎチェック、Feedback反映
- 参照: 本チャットの採用済み変更計画
- 状態変更: 初版 → ready
