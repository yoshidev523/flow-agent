---
name: flow-plan
description: Designまたは要求と正規化済みfeedbackからPlan成果物を作成・修正する独立writer。
---

# Flow Plan

## 目的

入力されたDesignまたは要求を実行可能なHOWへ展開し、
`spec/{yyyymmdd_feature}/plan.md`へ保存する。
このskillは成果物の作成と修正だけを担当し、入力が渡された経路や後続工程を扱わない。

## 入力

入力操作は次の3種類だけとする。

| operation | 用途 | 必須入力 |
| --- | --- | --- |
| `create` | 初版作成 | `design.md`または要求、`target_path` |
| `revise` | 変更要求の反映 | `target_path`、`feedback_path` |
| `respond` | 回答の反映 | `target_path`、`feedback_path` |

`create`でDesignが指定された場合は、その内容をPlanの入力要件として扱う。
外部の状態や別成果物を入力要件の採否判断に使用しない。

`feedback_path`は`phase-feedback-v1`でなければならない。対象pathとrevisionが現在の
`plan.md`に一致しない場合は編集せず、入力不整合として報告する。
出所メタデータは判断材料にせず、変更指示、回答、根拠、完了条件だけを読む。

## 出力

- 出力先: `spec/{yyyymmdd_feature}/plan.md`
- schema: `phase-artifact-v1`
- artifact: `plan`
- status: `needs_input | ready`

```yaml
---
schema_version: flow/phase-artifact-v1
artifact: plan
revision: 1
status: needs_input
updated_at: 2026-07-28T00:00:00+09:00
inputs:
  - path: spec/20260728_feature/design.md
    revision: 1
    sha256: "{64 lowercase hex}"
---
```

`revision`は内容を更新するたびに1増やす。初版は1とする。

## 状態

- `needs_input`: 実装方針に影響するHOWの回答が不足している。
- `ready`: 実装者が追加判断なしで着手できる。

状態はwriterとしての完成度だけを表す。`ready`は後続工程の開始可否を表さない。

## ワークフロー

1. `AGENTS.md`、入力Designまたは要求、関連コード、テスト、設定を読む。
2. 対象ファイル、責務、公開名、input/output、エラー挙動、接続点、順序、検証方法を
   必要な範囲で決める。
3. 重要事項を`Confirmed / Docs-derived / Assumption / Open`に分類する。
4. 既存規約と入力から一意に決まらず、実装品質や保守性へ影響するHOWだけを質問し、
   `needs_input`にする。
5. `revise`と`respond`ではfeedbackの全項目を`applied / unresolved`で記録する。
6. Openな重要判断がなく、実装引き継ぎチェックがすべて`OK`または理由付き
   `該当なし`なら`ready`にする。
7. 対象ファイル以外は編集しない。

## plan.md構成

```md
---
schema_version: flow/phase-artifact-v1
artifact: plan
revision: 1
status: needs_input
updated_at: {timestamp}
inputs:
  - path: {design path}
    revision: {revision}
    sha256: {sha256}
---

# 実装計画: {feature}

## 目的
## 要件サマリ
## 実装スコープ
## 既存コンテキスト
## 確認事項
## 実行サマリ
## 変更ファイル
## タスク分解
## 詳細手順
## テスト・検証計画
## リスクと停止条件
## 実装引き継ぎチェック
## Feedback反映
```

各タスクには対象ファイル、依存、手順、完了条件、検証方法を含める。
共有APIや複数ファイル変更では、責務、入出力、互換性、エラー挙動、接続箇所も明記する。

## 完了条件

- `plan.md`だけを作成または更新している。
- 入力Designのpath、revision、SHA-256がfront matterに記録されている。
- front matterが`phase-artifact-v1`に適合している。
- statusが`needs_input`または`ready`である。
- `ready`ではOpenな重要判断がなく、実装引き継ぎチェックが完了している。
- `revise / respond`では全feedback項目の処理結果が追跡できる。
- 最終報告に成果物path、revision、status、未解決事項を含める。
