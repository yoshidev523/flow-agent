---
name: flow-design
description: 要求と正規化済みfeedbackからDesign成果物を作成・修正する独立writer。
---

# Flow Design

## 目的

要求をWHATへ整理し、`spec/{yyyymmdd_feature}/design.md`へ保存する。
このskillは成果物の作成と修正だけを担当し、呼び出し前後の工程や移行条件を扱わない。

## 入力

入力操作は次の3種類だけとする。

| operation | 用途 | 必須入力 |
| --- | --- | --- |
| `create` | 初版作成 | 要求本文または要求ファイル、`target_path` |
| `revise` | 変更要求の反映 | `target_path`、`feedback_path` |
| `respond` | 回答の反映 | `target_path`、`feedback_path` |

`feedback_path`は`phase-feedback-v1`でなければならない。対象pathとrevisionが現在の
`design.md`に一致しない場合は編集せず、入力不整合として報告する。

このskillは入力に含まれる出所メタデータを判断材料にしない。変更指示、回答、
根拠、完了条件だけを読む。

## 出力

- 出力先: `spec/{yyyymmdd_feature}/design.md`
- schema: `phase-artifact-v1`
- artifact: `design`
- status: `needs_input | ready`

```yaml
---
schema_version: flow/phase-artifact-v1
artifact: design
revision: 1
status: needs_input
updated_at: 2026-07-28T00:00:00+09:00
---
```

`revision`は内容を更新するたびに1増やす。初版は1とする。

## 状態

- `needs_input`: WHATを確定するための回答が不足している。
- `ready`: 目的、範囲、要件、制約、受け入れ条件が矛盾なく記載されている。

状態はwriterとしての完成度だけを表す。`ready`は外部の確認結果や後続工程の開始可否を
表さない。

## ワークフロー

1. `AGENTS.md`、要求、既存成果物、関連コードや文書を読む。
2. 目的、利用者、対象範囲、対象外、要件、制約、受け入れ条件を抽出する。
3. 重要事項を`Confirmed / Docs-derived / Assumption / Open`に分類する。
4. `Open`または確定根拠のない重要判断があれば、WHATに限定した質問を記載して
   `needs_input`にする。
5. `revise`と`respond`ではfeedbackの全項目を`applied / unresolved`で記録する。
6. 未解決項目がなく、Designとして必要な内容が揃えば`ready`にする。
7. 対象ファイル以外は編集しない。

質問は実装方法、ファイル構成、API名、関数名、実装順序、検証コマンドを扱わない。
それらが見つかった場合は「Planへの引き継ぎ」として記録する。

## design.md構成

```md
---
schema_version: flow/phase-artifact-v1
artifact: design
revision: 1
status: needs_input
updated_at: {timestamp}
---

# 設計: {feature}

## 目的
## 背景
## 利用者
## スコープ
### 対象範囲
### 対象外
## 要件
## 制約
## 決定事項
## 確認事項
## 受け入れ条件
## Planへの引き継ぎ
## Feedback反映
```

`確認事項`にはID、質問、根拠分類、回答、状態を記録する。
`Feedback反映`にはfeedback ID、処理結果、反映箇所を記録する。

## 完了条件

- `design.md`だけを作成または更新している。
- front matterが`phase-artifact-v1`に適合している。
- statusが`needs_input`または`ready`である。
- `ready`ではOpenな重要判断が残っていない。
- `revise / respond`では全feedback項目の処理結果が追跡できる。
- 最終報告に成果物path、revision、status、未解決事項を含める。
