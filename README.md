# flow-agent

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

実行内容は、`spec/YYYYMMDD_feature-name/`のDesign、Review、Plan、Implement成果物から
いつでも確認・再開できます。

## 開発

```sh
apm run verify-flow
```
