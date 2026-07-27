---
name: flow-implement
description: plan.mdの内容を実装・検証し、implement.mdへ進捗と結果を記録する独立executor。
---

# Flow Implement

## 目的

指定された`plan.md`を実装し、検証結果を
`spec/{yyyymmdd_feature}/implement.md`へ記録する。
このskillは与えられたPlanの内容と完全性だけを扱い、Planが渡された経路や上流状態を
検査しない。

## 入力

- `plan_path`
- `target_path`: `spec/{yyyymmdd_feature}/implement.md`
- 実行対象タスク。省略時は未完了の全タスク。

開始前にPlanのschema、`status: ready`、対象ファイル、手順、完了条件、検証方法、
実装引き継ぎチェックを確認する。不足や矛盾がある場合は実装せず、
`implement.md`へブロック理由を記録する。

## 出力

- 実装変更: Planで指定されたファイル。
- 進捗記録: `spec/{yyyymmdd_feature}/implement.md`。
- schema: `implement-artifact-v1`

`implement.md`は次の状態を使う。

- `in_progress`
- `blocked`
- `completed`

## ワークフロー

1. `git status --short`、`AGENTS.md`、Plan、関連コードを確認する。
2. `implement.md`を作成または読み、未完了タスクを特定する。
3. Planの依存順に実装し、各タスクの状態と変更ファイルを記録する。
4. Plan外の公開API、責務、入出力、エラー挙動、範囲変更が必要なら停止する。
5. 指定された検証を実行し、コマンド、結果、未実施理由を記録する。
6. 全タスクと必要な検証が完了したら`completed`にする。

内部変数名、import順、軽微な整形、明白なtypo、既存規約への小さな合わせ込みは、
Planの意味を変えない範囲で実装裁量とする。

## implement.md構成

```md
---
schema_version: flow/implement-artifact-v1
artifact: implement
revision: 1
status: in_progress
plan_path: spec/{yyyymmdd_feature}/plan.md
plan_revision: 1
plan_sha256: "{64 lowercase hex}"
updated_at: {timestamp}
---

# 実装記録: {feature}

## メタデータ
- 日付:
- 計画:

## タスク進捗
## 変更サマリ
## 変更履歴
## 検証ログ
## 補足・計画との差分
## 未完了事項
```

初版の`revision`は1とし、進捗、状態、検証結果を更新するたびに1増やす。
Planのpath、revision、SHA-256が現在のPlanと一致しない場合は実装を開始・再開しない。

## 完了条件

- Planの対象タスクが完了している。
- Plan外の判断を無断で実装していない。
- 変更ファイルと検証結果が`implement.md`に記録されている。
- front matterが`implement-artifact-v1`に適合し、statusが
  `in_progress | blocked | completed`のいずれかである。
- 必要な検証が成功、または未実施理由が記録されている。
- 作業後の`git status --short`を確認している。
- コミット、push、PR作成は明示依頼がある場合だけ行う。
