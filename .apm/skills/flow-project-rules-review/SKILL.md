---
name: flow-project-rules-review
description: Flowのreview hubからの委譲、または利用者の明示呼び出しで、DesignまたはPlanのproject固有ルールへの適合を独立評価し、確認済み項目も含む固有sourceを保存する。通常のレビュー依頼から暗黙に起動しない。
---

# Flow Project Rules Review

## 責務と入力

source IDはproject-rules。入力はfeature directory、projectと対象範囲、review cycle ID、
対象path・revision・digest、Planの場合はDesign参照、指定source出力path。
自分のsourceだけを保存し、対象・ルール文書・他source・aggregate・Flow stateを編集しない。
利用者対話やphase移行、知識更新の採否を扱わない。

## 評価

[flow-project-knowledge](../flow-project-knowledge/SKILL.md)の把握手順で、実際に適用される
AGENTS.mdと参照文書を確認する。writerの列挙したルールだけを確認範囲としない。
writerと同じ正本を使うが、適合判定は独立して行う。対象と文書の参照を評価前・保存前に照合する。
文書運用とアクセス不能時の扱いは[共通手順](../flow/references/project-knowledge.md)に従う。

- Design: 要件・制約・受け入れ条件への反映を確認する。
- Plan decision: 未回答質問・選択肢・影響・推奨・前提だけを確認する。詳細タスクの不足を指摘しない。
- Plan final: 採用判断・HOW・タスク・検証への反映を確認する。採用回答を勝手に変更しない。

今回適用する基準ごとに、適合／不適合／対象外／確認不能と、その根拠・該当箇所を記録する。
明示された必須ルールの違反が現在scopeの成立を妨げる場合はgateとし、修正ならrevise、
利用者判断が必要ならhuman_decisionとjudgmentを付ける。推奨や仮説だけでgateを作らない。
対象外・例外受容は理由と根拠を示す。確認不能を適合へ読み替えない。
必須ルールの評価に必要な文書が取得不能など評価を完了できない場合はunable/execution、
対象の契約不一致はunable/contractとする。未確定の必須判断にはhuman_decision gateを使う。
必須項目のnon_compliant/unverifiableは対応gateまたはfailureを必須とする。
任意改善はscope_candidateへ分ける。decisionでは候補を作らず、後続工程で扱う旨だけ本文へ残す。

## 出力と保存

review-source-v2、source_kind ai、project_knowledgeを必ず記録する。
評価不能の場合も確認済み範囲・未確認箇所を可能な限り記録し、completenessはpartialとする。
独自ルールがない場合は探索根拠をdiscoveryに記録し、documents/checksを空にできる。
statusはfailureがあればunable、human_decision gateがあればblocked、revise gateがあれば
changes_required、gateがなければpassed。推奨・知識更新候補をstatusへ影響させない。
本文の「プロジェクト知識」に出典と項目別確認結果を記載する。新しく分かった暗黙知は
「知識の更新候補」に根拠とともに記録するだけで、恒久ルールとして採用しない。

最初に[契約](../flow/references/contracts.md)と[CLI](../flow/references/cli.md)を読む。
[template](../flow/assets/templates/project-rules-source.md)をdraftへ複製し、指定cycleの
reviews/{design,plan-decision,plan-final}/cycle-{number}/sources/project-rules.mdへ一度publishする。
CLIはnode ../flow/scripts/flowctl.js --root {feature_dir}。validate後にpath・status・確認概要を返す。
監査は共通CLIを使い、自動保存イベントと通常読取を重複記録しない。
