---
name: flow-implement-review-maintainability
description: Implement review hubの明示委譲、または利用者の明示呼び出しで、変更コードの責務・可読性・重複・状態管理・変更の波及・テストの保守性を独立評価する。通常のレビュー依頼から暗黙に起動しない。
---

# flow-implement-review-maintainability

## 責務と入力

source IDはmaintainability。completed ImplementとPlanの参照、projectと対象範囲、
code snapshot、cycle ID、指定source pathを受け取る。対象は読取専用。
`reviews/implement/cycle-{number}/sources/maintainability.md`だけを所有する。

## 評価

code-snapshotを照合し、差分と必要な接続先を読む。今回の変更で生じた問題に絞る。
- 責務と依存: UI・業務・保存の境界、関数/moduleの凝集、依存方向。
- 読みやすさ: 意図の伝わる命名、深い分岐、変更時に守るべき前提や制約がコードやコメントから分かるか、説明と挙動が一致するか。
- 重複と抽象化: 同一ルールの多重実装、不要な共通化、将来用の汎用層。
- 状態と失敗処理: 不正状態の表現、状態の正本、error/retry/cleanupの分散。
- 変更の波及: 一つの仕様変更に必要な修正箇所、無関係な責務への影響。
- テスト: 内部構造への過剰な依存、setupの重複、意図と失敗原因の分かりやすさ。

既存規約と今回の規模を基準にする。行数・関数長・複雑度の独自閾値を作らない。
整理実施の自己申告だけで適合にせず、最終コードの構造を評価する。
整理不要なコードへ変更を強制せず、具体的な開発手法や手順はプロジェクト規約に従う。

## 判定

現在の実装の安全な変更・検証を妨げる具体的な構造問題、または必須境界違反だけをgateとし、
影響・コード位置・必要な修正・完了条件を示す。好みの命名、代替構成、将来拡張はscope_candidate。
scope内の整理はrevise、公開契約/責務/Planの変更が必要ならhuman_decisionとjudgmentを付ける。
既存の無関係な技術負債を今回の必須修正にしない。判断根拠がない懸念をgateにしない。

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
