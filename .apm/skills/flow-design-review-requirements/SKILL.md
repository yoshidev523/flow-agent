---
name: flow-design-review-requirements
description: Flowのreview hubからの明示委譲、または利用者による`$flow-design-review-requirements`（Claudeでは`/flow-design-review-requirements`）の明示呼び出し時だけ、Design成果物を要件・制約・受け入れ条件の観点で評価し、固有のreview sourceを保存する。通常のレビュー依頼から暗黙に起動しない。
---

# flow-design-review-requirements

## 責務

担当観点は目的・要件・制約・受け入れ条件の対応、矛盾、欠落。source IDは`requirements`。
対象を読み取り専用で評価し、`reviews/design/cycle-{number}/sources/requirements.md`だけを作る。
Flow state、利用者対話、対象の修正、他sourceとaggregateを扱わない。

## 入力と評価

review cycle ID、対象path・revision・digest、出力path、feature directory。
対象Designのstatusはready、review_stageはdesign、design参照はnull。
契約不一致や評価不能ならunableとfailureを記録し、本文からstatusを推測しない。

findingはgateまたはscope_candidateへ分類する。
gateは現在scopeの成立に必須の問題だけで、resolutionはreviseまたはhuman_decision。
対象、問題、根拠、要求変更、完了条件、decision_refsを持つ。
利用者の採用回答の変更が必要ならhuman_decisionとjudgmentを記録する。
既存選択肢を推奨できるが、回答を確定しない。選択肢自体が成立しない場合は
満たすべき条件をrevise gateとしてwriterへ返す。

scope_candidateは任意改善、追加機能、将来拡張、追加の品質・検証であり、statusへ影響させない。
trade-off、残存risk、成立前提、受容判断があり必須制約と矛盾しなければpassedにできる。

## 重要判断の評価

writerのreadyや既存資料との一致だけで判断根拠を妥当としない。
今回採用・変更するもの、影響の大きいもの、前提に疑いがあるものを対象に、
採用内容・根拠・前提・影響・再検討条件を確認する。
既存方針が必須制約か、変更可能な選定かを区別し、要求との対応を確認する。
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
監査は`audit-append`で、問題・課題、重要な決定、feedbackへの対応、タスク単位の検証結果だけを記録する。
通常の読取・検索・command開始・TDDの各Red/Green・説明だけの応答は記録しない。
保存・呼出し・review結果の自動記録を重複追加せず、詳細は成果物へ残してpathを参照する。
`action.completed`は重要な結果をまとめる場合だけ使い、通常操作の`action.started`は不要。
`audit.md`と`.flow/journal.md`を直接編集しない。単独利用でもFlow stateを必要とせず同じCLIを使える。
契約不一致は補完せず報告し、監査の保存障害時は次の操作へ進まない。
