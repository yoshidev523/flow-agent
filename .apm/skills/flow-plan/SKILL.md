---
name: flow-plan
description: Flowからの明示委譲、または利用者による`$flow-plan`（Claudeでは`/flow-plan`）の明示呼び出し時だけ、Designまたは要求と正規化済みfeedbackからPlan成果物を作成・修正する独立writer。通常の計画依頼から暗黙に起動しない。
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
| `create` | 初版または質問案の作成 | `design.md`または要求、`target_path` |
| `revise` | review変更要求の反映 | `target_path`、`feedback_path` |
| `respond` | 利用者回答の反映と詳細化 | `target_path`、`feedback_path` |

`create`でDesignが指定された場合は、その内容をPlanの入力要件として扱う。
外部の状態や別成果物を入力要件の採否判断に使用しない。

`feedback_path`は`phase-feedback-v1`で、`phase: plan`、対象pathとrevisionが現在の
`plan.md`、front matterの`operation`が呼出operationに一致しなければならない。
`revise`は`kind: change`、`respond`は`kind: answer`のitemだけを受理する。1件でも
一致しない場合は編集せず、入力不整合として報告する。
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

### 出力契約の厳格適用

- `status`はfront matterの1箇所だけに置き、値は`needs_input | ready`のいずれかにする。
- `承認状態`、`approval`、`Pending`、`Approved`、`Draft`など、成果物全体について別の
  ライフサイクル状態fieldやsectionをfront matterまたは本文へ追加しない。review待ちを
  Plan自身の状態として表現しない。確認事項ごとの`状態: open | resolved`は含まない。
- `create`では既存templateや過去成果物に旧形式があっても踏襲しない。
- `revise / respond`で既存成果物のschemaまたはstatusが契約外なら編集せず、
  入力不整合として報告する。旧形式を現在の値へ推測変換しない。
- 最終報告のstatusは、保存後に読み直したfront matterのstatusと完全一致させる。

## 状態

- `needs_input`: 利用者が決める必要のあるHOWの回答が不足している。
- `ready`: 実装者が追加判断なしで着手できる。

状態はwriterとしての完成度だけを表す。`ready`は後続工程の開始可否を表さない。

## ワークフロー

1. `AGENTS.md`、入力Designまたは要求、関連コード、テスト、設定を読む。
2. 重要事項を`Confirmed / Docs-derived / Assumption / Open`に分類する。
3. 公開契約、責務境界、互換性、外部依存・権限・継続cost、不可逆な挙動、
   利用者が受容するtrade-offのうち、利用者が決める必要のあるHOWだけを質問する。
4. 各質問には現在のDesignとscope内で採用可能かつ実質的に異なる選択肢を3個、
   主な影響、推奨を1個、推奨理由と前提を含める。確認可能な根拠のない影響や条件を
   作らない。
5. `create`で未回答の質問があれば、決定済み部分だけを記載して`needs_input`にする。
   未決事項に依存する詳細手順やタスクを確定しない。質問がなければ詳細計画を完成する。
6. `revise`ではdecision reviewまたは最終reviewの全feedback項目を
   `applied / unresolved`で記録する。質問を修正した結果、回答が必要なら
   `needs_input`を維持する。
7. `respond`では回答を確認事項へ記録し、採用判断に基づいて対象ファイル、責務、
   input/output、エラー挙動、接続点、順序、完了条件、検証方法を詳細化する。
8. Openな重要判断がなく、実装引き継ぎチェックがすべて`OK`または理由付き
   `該当なし`なら`ready`にする。
9. 保存後にfront matterと禁止された並行ライフサイクル状態がないことを自己検証する。
10. 対象ファイル以外は編集しない。

内部関数名、内部変数名、import順、軽微な構造調整、個別test caseなど、Designと
公開契約を変えずwriterまたは実装者が既存規約から決められる事項は質問しない。

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

`確認事項`にはID、質問、根拠分類、3個の選択肢と各影響、推奨、推奨理由、前提、
回答、状態を記録する。回答後も選択肢と推奨を残し、reviewerが採用済み判断を
追跡できるようにする。

```md
### Q-001
- 質問: {決めること}
- 根拠分類: {Confirmed | Docs-derived | Assumption | Open}
- 選択肢:
  - A: {選択肢} — {主な影響}
  - B: {選択肢} — {主な影響}
  - C: {選択肢} — {主な影響}
- 推奨: {A | B | C}
- 推奨理由: {現在のDesign、規約、実装条件に基づく理由}
- 前提: {推奨が成立する前提}
- 回答: {未回答 | 回答内容}
- 状態: {open | resolved}
```

選択肢外の回答を受け取った場合は、その意味を勝手に既存選択肢へ写像しない。
実装方針として明確なら回答として記録し、不明確、Design変更、scope変更を伴うなら
質問を更新して`needs_input`を維持する。

`needs_input`の成果物は質問・選択肢・推奨のreview対象であり、詳細計画としての
完全性を表さない。回答後も質問、選択肢、推奨、前提を残し、最終reviewerが採用判断の
反映を追跡できるようにする。

## 完了条件

- `plan.md`だけを作成または更新している。
- 入力Designのpath、revision、SHA-256がfront matterに記録されている。
- front matterが`phase-artifact-v1`に適合している。
- statusが`needs_input`または`ready`である。
- statusと並行する成果物全体の承認・進捗状態を追加していない。
- `ready`ではOpenな重要判断がなく、実装引き継ぎチェックが完了している。
- `revise / respond`では全feedback項目の処理結果が追跡できる。
- 最終報告に成果物path、revision、status、未解決事項を含める。
