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

for skill_name in \
  flow flow-design flow-plan flow-implement \
  flow-design-review flow-design-review-requirements \
  flow-design-review-user-value flow-design-review-quality-risk \
  flow-plan-review flow-plan-review-structure-integration \
  flow-plan-review-executability flow-plan-review-verifiability
do
  test -f "$flow_consumer_dir/.agents/skills/$skill_name/SKILL.md"
  test -f "$flow_consumer_dir/.claude/skills/$skill_name/SKILL.md"
done
for agent_name in \
  flow-designer flow-planner flow-implementer \
  flow-design-reviewer flow-design-requirements-reviewer \
  flow-design-user-value-reviewer flow-design-quality-risk-reviewer \
  flow-plan-reviewer flow-plan-structure-integration-reviewer \
  flow-plan-executability-reviewer flow-plan-verifiability-reviewer
do
  test -f "$flow_consumer_dir/.codex/agents/$agent_name.toml"
  test -f "$flow_consumer_dir/.claude/agents/$agent_name.md"
done
! rg -q 'model_reasoning_effort|nickname_candidates' "$flow_consumer_dir/.codex/agents"
for agent_name in \
  flow-design-reviewer flow-design-requirements-reviewer \
  flow-design-user-value-reviewer flow-design-quality-risk-reviewer \
  flow-plan-reviewer flow-plan-structure-integration-reviewer \
  flow-plan-executability-reviewer flow-plan-verifiability-reviewer
do
  rg -q 'name = ' "$flow_consumer_dir/.codex/agents/$agent_name.toml"
  rg -q 'description = ' "$flow_consumer_dir/.codex/agents/$agent_name.toml"
  rg -q 'developer_instructions = ' "$flow_consumer_dir/.codex/agents/$agent_name.toml"
  rg -q '^---$' "$flow_consumer_dir/.claude/agents/$agent_name.md"
done
```

APM は自己パッケージ install を循環依存として扱うため、独立 consumer から同じ `.apm/` 正本だけを持つ fixture を導入する。この経路で Codex agent の TOML 変換と Claude agent の Markdown 配置を確認する。失敗時は調査のため一時ディレクトリを残します。成功後の削除は利用者が明示的に行います。今回の対象は Flow の 12 skill と 11 agent だけであり、`design-reviewer`、`.agents/skills/` の Flow 外資産、配布・公開は対象外です。

## フェーズ独立とハブ責務

Flow 系の最優先原則は、各 phase と各 reviewer を独立した部品として保つことです。

- `flow-design`、`flow-plan`、`flow-implement` は、自身の入力、成果物、質問、
  完了条件だけを扱います。Flowの評価用候補モードでは、Design / Plan writerが
  推奨案と `ProposalReviewRequest` を作り、中継された結果を同一decision内で
  反映しますが、reviewerを直接起動せず、他phaseやFlow内部状態を参照しません。
- Design / Plan reviewer orchestratorは各review phaseのローカルハブです。
  自フェーズの3観点 reviewerの選択・起動、結果集約、review artifactだけを
  管理し、writer、他phase、ユーザー対話、次phaseを扱ってはいけません。
- 各観点 reviewer は、汎用 `PerspectiveReviewRequest` を受け、
  指定されたdecisionだけを評価して `PerspectiveReviewResult` を返す
  読み取り専用部品です。成果物全体の監査や新しい論点の探索を行わず、
  呼び出し元、他 reviewer、
  集約結果、ユーザー対話、次 phase を認識してはいけません。
- `$flow` は全体ハブとして phase 間の接続、writerとreviewer orchestrator間の
  request/result中継、SHA-256の外側照合、ユーザーへの提示、失敗分の再試行、
  条件付き自動採用、フェーズ移行許可を管理します。
- 物理的な呼び出し階層は、Flow配下でphase writerとreviewer orchestratorを
  兄弟agentとし、review側は
  `flow -> phase reviewer orchestrator -> 3 perspective reviewers` とします。
  phase writerからreviewerを起動せず、
  Flowから観点 reviewerを直接起動してはいけません。
- leaf skill / agent の最終報告はハブへの入力です。Flow 実行中は、
  leaf が提示した次アクションをそのままユーザーへ転送せず、
  `$flow` が全体状態から次アクションを決めます。
- leaf skill / agent の単独利用は維持します。単独実行時は reviewer の存在や
  Flow 内部状態に依存せず、その部品自身の通常フローで完結させます。
- 新しい横断機能を追加するときは、leaf に他部品の名前や状態遷移を追加する前に、
  ハブの入出力変換で実現できないかを先に検討します。

APMはagentの配置と変換を担うだけで、runtimeのネスト機能を有効化しません。
Codexではmulti-agentを利用し、Claudeで直接ネストする場合は実行環境側で
`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=2` が必要です。
子agentを起動できない環境では、Flowが観点 reviewerを代理起動せず、
フェーズ reviewer orchestratorが `completion: Incomplete` を返します。

## 記述スタイルと命名

Markdown は見出し階層を崩さず、短い日本語で書きます。`SKILL.md` では YAML front matter の `name` と `description` を先頭に置きます。スキル・エージェント名は既存どおり小文字の kebab-case（例: `flow-implementer`）を使用します。仕様ディレクトリは `20260725_feature-name` のように日付＋小文字 kebab-case とします。

agent定義はfront matterの後を「あなたは〜です。」で始め、役割を中心に記述します。
原則として「主な責務」と「行動ルール」を箇条書きで示し、入力スキーマ、
SHA-256計算、判定アルゴリズム、委譲手順、成果物フォーマットなどのHOWは
対応する `SKILL.md` に記載します。agent定義へskillの手順を重複させず、
agentは「何を担当するか」、skillは「どう実行するか」を正本とします。

## ワークフロー成果物

`design -> plan -> implement` の順序を守ります。Design / Plan はユーザーの
明示承認、または同じSHA-256の推奨案検証がComplete/Validatedとなり、
`$flow` が条件付き自動採用基準を確認して発行したフェーズ移行許可により
次段階へ進みます。reviewerは推奨案と指定済み評価基準だけを検証し、
`OutOfReviewScope`はゲートや再reviewの理由にしません。
未承認成果物を次phaseへ渡す場合、Flowは同一SHA-256と
`evidence: Review-validated`を持つ汎用`PhaseEntryAuthorization`へ変換し、
次phaseはこれを入力根拠として検証します。
`承認状態: Approved` はユーザー承認だけを
表し、review 通過と混同しません。根拠のない推測を決定事項にせず、
EscalationRequired、attempt 3の未収束、再試行後のIncompleteは
`$flow` がユーザー判断へ戻してください。
phase agent や観点 reviewer に状態遷移を判断させてはいけません。
既存の変更を無断で戻さず、
実装後は `implement.md` に変更内容と検証結果を記録します。

## コミットとプルリクエスト

履歴には `first commit` のみで、確立済みのコミット規約はありません。命令形で対象を明確にした短い件名を使います（例: `Add flow planning guidance`）。PR には目的、変更ファイル、実施した検証または未実施理由を記載し、関連 Issue があればリンクします。ドキュメント変更ではスクリーンショットは通常不要です。
