# Repository Guidelines

## プロジェクト構成

このリポジトリは、仕様駆動開発用のエージェントパッケージです。Flow の正本は `.apm/skills/` と `.apm/agents/` に置き、APM が Codex と Claude 向けの配置・コンパイルを担います。`design-reviewer` の Codex 定義は `.codex/agents/`、共通・外部由来のスキルは `.agents/skills/` に置きます。パッケージ設定は `apm.yml`、依存関係の固定情報は `apm.lock.yaml` で管理します。機能ごとの成果物は `spec/YYYYMMDD_feature/` に `design.md`、`plan.md`、`implement.md` として作成します。

## 開発・検証コマンド

`verify-flow` は Flow 正本の構造だけを検証します。変更前後に設定を確認してください。

```sh
git status --short       # 作業ツリーを確認
sed -n '1,200p' apm.yml # パッケージ設定を確認
apm list                 # 定義済み script を確認
apm run verify-flow      # Flow 正本を構造検証
```

APM の操作や検証コマンドを追加した場合は、`apm.yml` の `scripts` とこの文書を同時に更新します。

Codex と Claude の配置は、リポジトリを汚さない一時ディレクトリで確認します。

```sh
flow_source_dir="$(pwd)"
flow_verify_root="$(mktemp -d)"
flow_fixture_dir="$flow_verify_root/fixture"
flow_consumer_dir="$flow_verify_root/consumer"

(
  cd "$flow_verify_root"
  apm init fixture --yes --target claude,codex
  apm init consumer --yes --target claude,codex
  cp -R "$flow_source_dir/.apm" "$flow_fixture_dir/.apm"
)
(
  cd "$flow_consumer_dir"
  apm install "$flow_fixture_dir" --target claude,codex
  apm compile --target claude,codex
)

for skill_name in flow flow-design flow-plan flow-implement; do
  test -f "$flow_consumer_dir/.agents/skills/$skill_name/SKILL.md"
  test -f "$flow_consumer_dir/.claude/skills/$skill_name/SKILL.md"
done
for agent_name in flow-designer flow-planner flow-implementer; do
  test -f "$flow_consumer_dir/.codex/agents/$agent_name.toml"
  test -f "$flow_consumer_dir/.claude/agents/$agent_name.md"
done
! rg -q 'model_reasoning_effort|nickname_candidates' "$flow_consumer_dir/.codex/agents"
```

APM は自己パッケージ install を循環依存として扱うため、独立 consumer から同じ `.apm/` 正本だけを持つ fixture を導入する。この経路で Codex agent の TOML 変換と Claude agent の Markdown 配置を確認する。失敗時は調査のため一時ディレクトリを残します。成功後の削除は利用者が明示的に行います。今回の対象は Flow の 4 skill と 3 agent だけであり、`design-reviewer`、`.agents/skills/` の Flow 外資産、配布・公開は対象外です。

## 記述スタイルと命名

Markdown は見出し階層を崩さず、短い日本語で書きます。`SKILL.md` では YAML front matter の `name` と `description` を先頭に置きます。スキル・エージェント名は既存どおり小文字の kebab-case（例: `flow-implementer`）を使用します。仕様ディレクトリは `20260725_feature-name` のように日付＋小文字 kebab-case とします。

## ワークフロー成果物

`design -> plan -> implement` の順序を守ります。各段階は前段のユーザー承認後に開始し、承認前は `承認状態: Pending` を維持します。根拠のない推測を決定事項にせず、未確定事項は質問として残してください。既存の変更を無断で戻さず、実装後は `implement.md` に変更内容と検証結果を記録します。

## コミットとプルリクエスト

履歴には `first commit` のみで、確立済みのコミット規約はありません。命令形で対象を明確にした短い件名を使います（例: `Add flow planning guidance`）。PR には目的、変更ファイル、実施した検証または未実施理由を記載し、関連 Issue があればリンクします。ドキュメント変更ではスクリーンショットは通常不要です。
