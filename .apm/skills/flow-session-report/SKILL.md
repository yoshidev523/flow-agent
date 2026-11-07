---
name: flow-session-report
description: Flowからの明示委譲で、完了済みの成果物・監査・レビュー済み差分から、変更と判断を説明する静的HTMLを作成する。
---

# Flowセッションレポート

## 入力と対象

Flowから対象repository、feature directory、完了チェックポイントのcommit SHA、
現在のImplement review cycleとコードsnapshot（base/head）を受け取る。
チェックポイントにある `flow-state.yml` の `phase` と `state` が `completed` であることを確認する。
`artifacts.implement` と `reviews.implement` が指すファイルを同じcommitから読み、
レビュー対象・cycle・コードsnapshotが依頼内容および `completed` のImplementと一致し、
レビュー結果が `passed` であることを確認する。
対象や参照が確認できなければ、既存HTMLを上書きせず理由を返す。

完了チェックポイントの要求、Design・Plan・Implement、該当review、採用済みfeedback、
`audit.md` を読む。実際の変更は渡されたbaseからheadまでのGit差分で確認する。
過去の判断を参照するときは採用後の訂正や再計画を照合し、最終版と混同しない。
差分から確認できる振る舞いと、記録で裏付けられる採用理由を区別する。
記録のない判断は「理由の記録なし」とし、実際に比較した案だけを載せる。

## 内容と出力

[HTMLテンプレート](assets/session-report.html)を使い、次を日本語でまとめる。

- 利用者や保守担当者に何ができるようになったか。
- 処理、データ、責務の変化が分かる前後比較。複数の変更は目的ごとにまとめる。
- 主要な判断の背景、採用理由、記録のある代替案とその得失。削除・置換では元の振る舞いや責務の行き先と影響。
- 必須検証の結果、最終レビューの結果、残る制約や未確認事項。
- 対象の実装commit、review cycle、完了チェックポイント。各説明から成果物の節、判断ID、監査event ID、
  または対象commit上のファイル・行をたどれるようにする。

監査や会話を全文転載せず、判断に必要な情報だけを抽出する。認証情報、機密、個人情報を転記しない。
資料由来の文字列はHTMLとして解釈されないようにエスケープする。リンクは確認済みの相対参照かHTTPSに限定する。
図はHTML/CSSで作り、スタイルも同梱する。外部アセットやJavaScriptを必要としない。

完成したUTF-8 HTMLを同じdirectory内の一時ファイルに書いて内容と参照を確認し、
`artifacts/session-report.html` へ置き換える。対象feature配下の実ファイルであることを確認する。
失敗時は一時ファイルを片付け、以前の完全なHTMLを保持する。Flowへ出力pathと対象の識別情報、
または失敗理由を返す。状態・監査・既存の成果物・コードは編集せず、Git保存はFlowへ任せる。
