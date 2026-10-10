---
name: flow-plan-review-decision-quality
description: Flowのreview hubからの明示委譲、または利用者による`$flow-plan-review-decision-quality`（Claudeでは`/flow-plan-review-decision-quality`）の明示呼び出し時だけ、Planが利用者へ提示する質問・選択肢・影響・推奨・前提の成立性を評価し、固有のreview sourceを保存する。通常のレビュー依頼から暗黙に起動しない。
---

# flow-plan-review-decision-quality

## 責務

担当観点は未回答質問、選択肢、影響、推奨、成立前提。source IDは`decision-quality`。
対象を読み取り専用で評価し、`reviews/plan-decision/cycle-{number}/sources/decision-quality.md`だけを作る。
Flow state、利用者対話、対象の修正、他sourceとaggregateを扱わない。

## 入力と評価

review cycle ID、対象path・revision・digest、出力path、feature directory。
対象Planのstatusはneeds_input、review_stageはdecision。入力Design参照とPlanのinputsとの一致を確認する。
契約不一致や評価不能ならunableとfailureを記録し、本文からstatusを推測しない。

findingは質問・選択肢・影響・推奨・前提の成立に必須なgateだけとする。
gateは現在scopeの成立に必須の問題だけで、resolutionはreviseまたはhuman_decision。
対象、問題、根拠、要求変更、完了条件、decision_refsを持つ。
人間の判断が必要ならhuman_decisionとjudgmentを記録する。質問への回答を代行しない。
既存選択肢を推奨できるが、回答を確定しない。選択肢自体が成立しない場合は
満たすべき条件をrevise gateとしてwriterへ返す。

trade-off、残存risk、成立前提、受容判断があり必須制約と矛盾しなければpassedにできる。
decision reviewでは質問と無関係な指摘やscope_candidateを作らない。

## 出力

review-source-v2、source_kind ai、statusは`passed | changes_required | blocked | unable`。
statusはgateだけから決め、human_decisionがあればblocked、reviseがあればchanges_required、
gateがなければpassed。failureがあればunable。
judgmentは質問、背景、2〜3選択肢と影響、推奨、理由、回答形式を含む。
指定cycleのsourceを一度publishし、validate後にpath・statusを報告する。

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
