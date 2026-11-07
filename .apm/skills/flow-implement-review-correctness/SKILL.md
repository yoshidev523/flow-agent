---
name: flow-implement-review-correctness
description: Implement review hubの明示委譲、または利用者の明示呼び出しで、実コードのPlan適合・正常/境界/失敗時動作・検証証拠を独立評価する。通常のレビュー依頼から暗黙に起動しない。
---

# flow-implement-review-correctness

## 責務と入力

source IDはcorrectness。completed Implementの参照、Plan参照、projectと対象範囲、
code snapshot、cycle ID、指定source pathを受け取る。対象は読取専用。
`reviews/implement/cycle-{number}/sources/correctness.md`だけを所有する。

## 評価

code-snapshotを照合し、base_commitからhead_commitの差分と接続先の現コードを読む。
Implementの自己申告やテスト成功だけを正しさの証拠にせず、Planの完了条件と実装を照合する。
- 正常・境界・異常系の実際の経路、公開契約・互換性・error挙動を確認する。
- 状態整合性、原子性、競合、再試行、リソース解放は今回の変更に関係する箇所を確認する。
- テストが想定不具合を検出できるか、mockで検証対象を消していないかを確認する。
- command・結果・実行対象の対応と必須検証の充足を確認し、未実施を成功としない。
必要な追加確認は安全な読取・隔離検証に限る。共有作業treeの編集、実データ操作、外部変更をしない。
実行環境や証拠が不足し評価を完了できなければunable/executionとする。

## 判定

現在scopeの成立に必須の不具合・Plan不履行を具体的なコード位置と発生条件でgateにする。
Plan内で修正できる場合はrevise、上流判断変更が必要ならhuman_decisionとjudgmentを付ける。
追加機能や任意の追加検証はscope_candidate。過剰な網羅性を完了条件に追加しない。

## 出力

review-source-v2、phase/review_stageはimplement、designはnull、source_kindはai。
Implementは質問を持たないためdecision_refsは常に `[]` とする。
本文の判断IDを参照するときは根拠欄（evidence）に記載する。
failureがあればunable、
human_decision gateがあればblocked、revise gateがあればchanges_required、gateなしはpassed。
契約不一致はunable/contract。評価開始時と保存直前のsnapshot・対象参照が一致することを確認する。
他source・aggregate・実コード・Plan・Flow stateを編集しない。修正・利用者対話は呼出側へ返す。

## 保存

実行前に[契約](../flow/references/contracts.md)と[CLI](../flow/references/cli.md)のImplement reviewを読む。
既存のreview-source-v2 / phase-review-v2を使い、codeは対象Implementのsnapshotをそのまま保持する。
[template](../flow/assets/templates/implement-review-source.md)を使い、source ID・cycle・対象を指定値へ置き換える。
CLIは`node ../flow/scripts/flowctl.js --root {feature_dir}`。draftからpublishしvalidate --referencesで確認する。
監査は共通CLIを使い、通常読取や保存の自動イベントを重複記録しない。
