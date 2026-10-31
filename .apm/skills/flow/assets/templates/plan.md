---
schema_version: flow/phase-artifact-v2
artifact: plan
revision: 1
status: needs_input
producer: flow-plan
invocation_id: inv-001
operation: create
updated_at: '2026-10-10T00:00:00+09:00'
inputs:
- path: artifacts/design.md
  revision: 1
  sha256: '0000000000000000000000000000000000000000000000000000000000000000'
questions:
- id: Q-001
  question: 保存方針を選ぶ
  required: true
  status: open
  options:
  - id: A
    text: 即時保存
    impact: 毎回保存
  - id: B
    text: 手動保存
    impact: 操作が必要
  recommendation: A
  reason: 要求に一致
  assumptions: []
  answer: null
feedback_results: []
tasks: []
verification_plan: []
handoff_checks: []
---
# 成果物

## 目的
実施内容。

## 要件サマリ
実施内容。

## 実装スコープ
実施内容。

## 既存コンテキスト
実施内容。

## 確認事項
実施内容。

## 実行サマリ
実施内容。

## 変更ファイル
実施内容。

## タスク分解
実施内容。

## 詳細手順

重要判断はD-001等のID、採用内容、根拠（指定／方針／公式／実測／仮定）、前提、影響、再検討条件を記す。
実施内容。

## テスト・検証計画
実施内容。

## リスクと停止条件
実施内容。

## 実装引き継ぎチェック
実施内容。

## Feedback反映
実施内容。

## プロジェクト知識

project_knowledgeと対応する出典・適用範囲・確認結果・根拠・例外を記す。

## 知識の更新候補

候補がある場合に根拠とともに記す。未採用の候補は必須ルールやgateにしない。

## 変更履歴
