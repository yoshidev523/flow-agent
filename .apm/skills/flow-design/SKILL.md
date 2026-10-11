---
name: flow-design
description: Flowからの明示委譲、または利用者による`$flow-design`（Claudeでは`/flow-design`）の明示呼び出し時だけ、要求と正規化済みfeedbackからDesign成果物を作成・修正する独立writer。通常の設計依頼から暗黙に起動しない。
---

# Flow Design

## 責務

要求をWHATへ整理し、固定path `artifacts/design.md`を更新する独立writer。
利用者対話、review、Flow state、次phaseの開始条件は扱わない。

## 入力

- `create`: 要求本文または要求file、feature directory、target path。
- `revise / respond`: 現在のDesignと正規化feedbackのpath。
- 監査用のrun ID、invocation ID。これは内容の判断材料にしない。

feedbackは`phase-feedback-v2`、phaseはdesign、対象path・revision・digestが現在の
Designと一致する必要がある。reviseはchange、respondはanswerだけを受理する。
feedbackの出所やreview主体を評価しない。

## 出力と状態

`phase-artifact-v2`、artifactはdesign、statusは`needs_input | ready`。
needs_inputはWHATの確定に必要な回答が残ること、readyは目的・範囲・要件・制約・
受け入れ条件が揃うことを表す。readyは外部評価の通過を意味しない。

## 手順

1. AGENTS.md、要求、関連コードと文書を読む。
2. 目的、利用者、対象範囲・対象外、要件、制約、受け入れ条件を整理する。
3. 根拠をConfirmed / Docs-derived / Assumption / Openに区別する。
4. 重要判断が未解決なら確認事項を作る。質問、2〜3個の採用可能な選択肢と影響、
   推奨、理由、前提を記録する。回答を自動確定しない。
5. 実装方法、API名、file構成、検証commandはPlanへの引き継ぎへ記録する。
6. revise/respondは全feedback項目をapplied/unresolvedで追跡する。
7. 回答後も質問・選択肢・推奨・前提・回答を残す。選択肢外の回答を勝手に写像しない。
8. 必須未回答質問があればneeds_input、すべて解消し完成条件を満たせばready。
9. 変更内容、背景・理由、変更箇所、feedback参照を指定してpublishする。

questionsとfeedback_resultsの機械的な正本はfront matter。
本文の確認事項・Feedback反映はこれを説明し、独立した状態を持たせない。
自分のDesign以外を編集せず、最終報告にはpath・revision・status・未解決事項を含める。

## 重要判断の根拠

採用・変更する重要判断に安定した判断IDを付け、既存本文へ採用内容、根拠、前提、影響、
再検討条件を記す。利用者の指定、既存方針、公式情報、実測、仮定を区別する。
既存方針は根拠の一つとして扱い、必須制約か見直し可能な選定かを明示する。
影響の大きい判断、情報の鮮度が重要な判断、実測と前提に差がある判断を優先する。
最低成立条件を推奨条件として扱わず、弱い根拠の重要判断を質問なしだけで確定しない。
通常の可逆な判断まで一律に利用者へ質問したり、全既存選定を毎回再調査したりしない。

## 共通契約と機械処理

実行前に隣接するFlow skillの`../flow/references/contracts.md`と
`../flow/references/cli.md`の該当契約・commandを読む。
入出力形式は`../flow/references/contracts.md`とtemplateを参照する。
機械検証はCLI内のZod定義に従い、旧schemaを読み替えない。
`../flow/assets/templates/`の対応templateを使う。
CLIは`node ../flow/scripts/flowctl.js --root {feature_dir}`。
Node.js 22以上が必要。依存はCLIへ同梱済みで、利用側のnpm install・ビルドは不要。

各成果物はdraftを作り、`publish`で保存して`validate`で確認する。
固定artifactのrevision、変更履歴、保存、digestはCLIに任せ、直接上書きしない。
監査は`audit-append`で操作の開始・結果・自動判断を逐一記録する。
`audit.md`を直接編集しない。単独利用でもFlow stateを必要とせず同じCLIを使える。
契約不一致は補完せず報告し、監査の保存障害時は次の操作へ進まない。
