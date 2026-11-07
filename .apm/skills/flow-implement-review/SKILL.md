---
name: flow-implement-review
description: Flowからの明示委譲、または利用者の明示呼び出しで、実装コードのcorrectness・maintainability・project-rulesのAIまたは人間sourceを集約するレビューhub。通常のレビュー依頼から暗黙に起動しない。
---

# flow-implement-review

## 責務と入力

指定cycleの`reviews/implement/cycle-{number}/review.md`だけを所有するhub。
入力はfeature directory、projectと範囲、cycle ID、mode、completed Implementのpath/revision/digest、出力path。
対象Implementが持つready Plan参照、codeのrepository/base_commit/head_commit/tree_sha256を確認する。
Design参照はnull。Flow state、利用者対話、コード修正、phase移行を扱わない。

## Source収集と集約

開始時と集約直前に対象参照とcode-snapshotを照合する。コードが変わったら評価を流用しない。
AI modeではflow-implement-correctness-reviewer、flow-implement-maintainability-reviewer、
flow-project-rules-reviewerを直接並列起動し、同一cycle・target・codeの固有sourceを作らせる。
project・範囲・Plan参照とコードsnapshotを全reviewerへ同じ内容で渡す。
子agentを起動できない場合、自分で観点評価を代行せずincomplete/executionを返す。
Human modeでは呼出側が保存したsources/human.mdだけを使い、AI reviewerを起動しない。

review-check（stage implement）へ必要な全source pathを渡し、欠落pathも省略しない。
返却されたstatus/sources/source_paths/findings/failure/judgments/project_knowledge/codeを変更せず使う。
本文では指摘を整理できるが、観点の結論、finding、重要度を都合よく削除・変更しない。
project-rulesの正本鮮度は[共通手順](../flow/references/project-knowledge.md)でも照合する。

## 出力

phase-review-v2、phase/review_stageはimplement、designはnull、revisionは1。
statusはpassed/changes_required/blocked/incomplete。failureのcontract/executionを区別する。
最終報告はpath、cycle、status、コードsnapshot、未確認事項と重要な指摘を含める。
修正や追加scope採用、上流変更は呼出側へ返し、hubから実装担当を起動しない。

## 保存

実行前に[契約](../flow/references/contracts.md)と[CLI](../flow/references/cli.md)のImplement reviewを読む。
既存のreview-source-v2 / phase-review-v2を使い、codeは対象Implementのsnapshotをそのまま保持する。
[template](../flow/assets/templates/implement-review.md)を使い、source ID・cycle・対象を指定値へ置き換える。
CLIは`node ../flow/scripts/flowctl.js --root {feature_dir}`。draftからpublishしvalidate --referencesで確認する。
監査は共通CLIを使い、通常読取や保存の自動イベントを重複記録しない。
