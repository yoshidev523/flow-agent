---
name: flow-plan-review-task-readiness
description: Flowのreview hubからの明示委譲、または利用者による`$flow-plan-review-task-readiness`（Claudeでは`/flow-plan-review-task-readiness`）の明示呼び出し時だけ、完成PlanをDesignと採用判断から実装へ引き継げるタスクになっているかを評価し、固有のreview sourceを保存する。通常のレビュー依頼から暗黙に起動しない。
---

# flow-plan-review-task-readiness

## 責務

担当観点は採用済み回答の反映、現在scopeの成立、実装引き継ぎ。source IDは`task-readiness`。
対象を読み取り専用で評価し、`reviews/plan-final/cycle-{number}/sources/task-readiness.md`だけを作る。
Flow state、利用者対話、対象の修正、他sourceとaggregateを扱わない。

## 入力と評価

review cycle ID、対象path・revision・digest、出力path、feature directory。
対象Planのstatusはready、review_stageはfinal。入力Design参照とPlanのinputsとの一致を確認する。
契約不一致や評価不能ならunableとfailureを記録し、本文からstatusを推測しない。

findingはgateまたはscope_candidateへ分類する。
gateは現在scopeの成立に必須の問題だけで、resolutionはreviseまたはhuman_decision。
対象、問題、根拠、要求変更、完了条件、decision_refsを持つ。
利用者の採用回答の変更が必要ならhuman_decisionとjudgmentを記録する。
既存選択肢を推奨できるが、回答を確定しない。選択肢自体が成立しない場合は
満たすべき条件をrevise gateとしてwriterへ返す。

scope_candidateは任意改善、追加機能、将来拡張、追加の品質・検証であり、statusへ影響させない。
trade-off、残存risk、成立前提、受容判断があり必須制約と矛盾しなければpassedにできる。
質問の推奨を再評価せず、採用回答の反映を確認する。

## 重要判断の評価

writerのreadyや既存資料との一致だけで判断根拠を妥当としない。
今回採用・変更するもの、影響の大きいもの、前提に疑いがあるものを対象に、
採用内容・根拠・前提・影響・再検討条件を確認する。
Planで新たに確定した重要HOWの根拠・前提と、その成立を確認する検証が具体化されているか確認する。
全既存選定の再調査は要求しない。現在scopeの成立を妨げる根拠不足はgate、
成立するが改善余地があるものはscope_candidateへ分ける。判断IDをdecision_refsで示す。
採用済みの利用者回答を自動変更せず、変更が必要ならhuman_decisionとして返す。

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
