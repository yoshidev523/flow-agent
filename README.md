# flow-agent 4.2.0

Codex / Claude Codeで仕様駆動開発を進めるためのエージェントパッケージです。
Design、Review、Plan、Implementを順に実行し、判断と成果物を`flow-spec/`配下に保存します。

## インストール

APMを利用できるプロジェクトで実行します。

```sh
apm install yoshidev523/flow-agent --target claude,codex
```

## 使い方

Flowは明示的に呼び出した場合だけ起動します。

```text
# Codex
$flow 認証機能を追加して

# Claude Code
/flow 認証機能を追加して
```

実行内容は`flow-spec/YYYYMMDD_feature-name/`へ保存します。
`artifacts/`のDesign・Plan・Implementは常に最新で、本文の変更履歴に内容と理由を残します。
レビューは`reviews/*/cycle-0001/`、feedbackは`feedback/*/feedback-0001.md`へ保存します。
Flowの現在地は`flow-state.yml`、フェーズ移行・問題・フィードバック・決定・検証結果の要点は`audit.md`に残します。
復旧用の詳細イベントは`.flow/journal.md`へ分離し、CLIが簡潔な監査履歴を生成します。
旧schemaの成果物は自動移行しません。旧形式の監査だけは`audit-migrate`で原本を保持して移行できます。
既存の`spec/`にあるタスクは元のpathで再開します。

Flow起動時に対象projectの`.gitattributes`を確認し、なければ作成します。
既存の内容を保持し、`flow-spec/** linguist-generated=true`が未設定なら追記します。
成果物はGit管理しながら、GitHubのPRでは差分を既定で折りたたみます。

再計画の変更を既存成果物へ反映するときは
[flow-artifact-sync](.apm/skills/flow-artifact-sync/SKILL.md)が既存成果物の本文・入力参照を更新し、
同期の開始は内部journalへ、結果の要点は監査履歴へ残します。他スキルやFlow stateなしで、どのフェーズからでも使えます。
CLI・契約・templateを同梱し、更新した実装記録は再検証待ちにします。
同期はFlow stateを変更しません。Flowは人間の承認を得て再計画を開始し、同期後の参照を登録して再レビューします。
完了後も新しい課題・変更要求・決定の訂正を監査へ残します。説明だけの対話や通常操作は記録しません。節目の成果と判断はGitチェックポイントへ保存し、
復帰用branchを作成できます。現在のbranchや作業fileを巻き戻しません。

## 共通CLI

Node.js 22以上だけで実行できます。Zod・YAML処理を含む単一のJavaScriptを同梱しているため、
利用側のnpm install・ビルド・Pythonは不要です。チェックポイント操作にはGitと既存のGit repositoryが必要です。
配置後の`flow-skill-dir`は通常`.agents/skills/flow`または`.claude/skills/flow`です。

```sh
node {flow-skill-dir}/scripts/flowctl.js --root flow-spec/YYYYMMDD_feature-name resume-check
```

CLIは成果物検証、revisionと変更履歴を伴う保存、review集約判定、状態遷移、
排他的な内部journal追記と監査履歴生成、再開時検査を担当します。内容の生成と評価は各agentが担当します。
詳細は[契約](.apm/skills/flow/references/contracts.md)と[操作](.apm/skills/flow/references/cli.md)を参照してください。

## 開発

```sh
npm ci
apm run build-flow
apm run check-flow-dist
apm run test-flow
apm run verify-flow
apm run verify-flow-deployment
```

TypeScriptの正本は`src/`、Zod契約は`src/contracts/`、build処理は`scripts/build.mjs`です。
開発側でのみnpm依存を導入し、配布用CLIを再生成します。
配布用CLIはES Modules・CommonJSのどちらのprojectでも実行できます。
macOS上のローカルfile systemで検証しています。排他制御の詳細はCLI文書を参照してください。
