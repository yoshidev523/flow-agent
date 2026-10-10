# flow-agent 4.0.0

Codex / Claude Codeで仕様駆動開発を進めるためのエージェントパッケージです。
Design、Review、Plan、Implementを順に実行し、判断と成果物を`spec/`配下に保存します。

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

実行内容は`spec/YYYYMMDD_feature-name/`へ保存します。
`artifacts/`のDesign・Plan・Implementは常に最新で、本文の変更履歴に内容と理由を残します。
レビューは`reviews/*/cycle-0001/`、feedbackは`feedback/*/feedback-0001.md`へ保存します。
Flowの現在地は`flow-state.yml`、操作・判断・利用者対話の履歴は追記型の`audit.md`に残します。
旧schemaの成果物は自動移行しません。

## 共通CLI

Node.js 22以上だけで実行できます。Zod・YAML処理を含む単一のJavaScriptを同梱しているため、
利用側のnpm install・ビルド・Pythonは不要です。
配置後の`flow-skill-dir`は通常`.agents/skills/flow`または`.claude/skills/flow`です。

```sh
node {flow-skill-dir}/scripts/flowctl.js --root spec/YYYYMMDD_feature-name resume-check
```

CLIは成果物検証、revisionと変更履歴を伴う保存、review集約判定、状態遷移、
排他的監査追記、再開時検査を担当します。内容の生成と評価は各agentが担当します。
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
