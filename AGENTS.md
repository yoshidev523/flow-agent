# Repository Guidelines

## プロジェクト構成

このリポジトリは仕様駆動開発用のエージェントパッケージです。Flowの正本は
`.apm/skills/`と`.apm/agents/`に置き、APMがCodexとClaude向けの配置・変換を担います。
`design-reviewer`のCodex定義は`.codex/agents/`、共通・外部由来のスキルは
`.agents/skills/`に置きます。パッケージ設定は`apm.yml`、依存関係の固定情報は
`apm.lock.yaml`で管理します。

機能ごとの実行成果物は`spec/YYYYMMDD_feature/`に保存します。主要成果物は
`flow-state.yml`、`design.md`、`design-review.md`、`plan.md`、
`plan-review.md`、`implement.md`です。feedbackと観点別sourceも同じfeature配下に置きます。

## 開発・検証コマンド

```sh
git status --short
sed -n '1,200p' apm.yml
apm list
apm run verify-flow
```

APMの操作や検証commandを追加した場合は、`apm.yml`の`scripts`とこの文書を同時に
更新します。

CodexとClaudeの配置は、リポジトリを汚さない一時directoryで確認します。

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
```

APMは自己package installを循環依存として扱うため、独立consumerから、
同じ`.apm/`正本だけを持つfixtureを導入します。失敗時は調査用に一時directoryを残し、
成功後の削除も利用者が明示した場合だけ行います。

## Flowの責務境界

最優先原則は、phase writer、review、状態遷移を分離することです。

- Design/Plan writerは`create / revise / respond`だけを扱い、自分の入力成果物、
  正規化済みfeedback、自分の出力成果物だけを認識します。
- Design/Plan writerのstatusは`needs_input / ready`だけです。これはwriterとしての
  完成度を表し、外部評価や次phase開始可否を表しません。
- Flowだけが利用者対話、review mode、feedback正規化、retry、stale確認、
  phase移行を管理します。
- AIと人間のreviewは同じsource契約へ正規化し、1 cycle内では一方だけを使います。
- phase review hubは自phaseのsource収集とaggregate artifactだけを管理します。
- 各観点reviewerは担当観点を独立評価し、固有のsource fileだけを書きます。
- Implement executorは渡されたPlanの内容と完全性だけを扱い、上流状態を認識しません。
- leafの単独利用はFlow内部状態に依存せず、自身の入出力契約だけで完結させます。

物理階層は次とします。

```text
Flow
├── phase writer
└── phase review hub
    ├── perspective reviewer 1
    ├── perspective reviewer 2
    └── perspective reviewer 3
```

Human modeではperspective reviewerを起動せず、human source 1件をhubが集約します。
子agentを起動できない環境ではhubが`incomplete`を返し、Flowが規定のretryまたは
human modeへの切替を行います。

## 永続契約と成果物所有

phase境界の契約は次の4種類に限定します。

- `phase-artifact-v1`: `design.md`と`plan.md`
- `review-source-v1`: 観点別または人間の評価結果
- `phase-review-v1`: hubの集約結果
- `phase-feedback-v1`: Flowがwriterへ渡す変更または回答

Flow内部状態は`flow-state-v1`として`flow-state.yml`へ保存します。
新しい中継用request/result契約を追加する前に、既存artifactのpathとstatusで
接続できないかを検討してください。

各fileのwriterは一意にします。

- Flow: `flow-state.yml`、feedback、human source
- phase writer: 自分のphase artifact
- perspective reviewer: 自分のsource
- review hub: 自分のaggregate artifact
- executor: `implement.md`

Flowはreview開始ごとに一意な`review_cycle_id`を発行し、state、全source、aggregateで
一致を必須にします。review対象のSHA-256はaggregate作成時とphase移行時に
同一digestであることを確認します。古いcycleまたはrevisionのsource、aggregate、
feedbackは再利用しません。

Planは入力Designのpath、revision、SHA-256を保持し、Plan review開始前に現在のDesignと
一致することを確認します。Implementの進捗は`implement-artifact-v1`のfront matterへ
revisionと`in_progress / blocked / completed`を記録します。

## 状態遷移

`design -> design_review -> plan -> plan_review -> implement -> completed`の順を守ります。
AIまたは人間のいずれか、選択されたmodeの`passed`だけを次phaseの根拠にします。

AI reviewの変更要求に対する自動修正は各phaseで1回まで、実行障害の再試行も1回まで
です。使い切った場合はhuman modeへ切り替えます。利用者判断が必要な`blocked`は
Flowが質問し、回答をfeedbackへ正規化します。

## 記述スタイルと命名

Markdownは見出し階層を崩さず、短い日本語で書きます。`SKILL.md`ではYAML front
matterの`name`と`description`を先頭に置きます。skill・agent名は小文字の
kebab-case、仕様directoryは`20260728_feature-name`のように日付＋kebab-caseを使います。

agent定義はfront matter後を「あなたは〜です。」で始め、「主な責務」と「行動ルール」
を記載します。schema、digest、判定algorithm、委譲手順、成果物formatなどのHOWは
対応する`SKILL.md`に置き、agentへ重複させません。

## 実装と変更管理

既存の変更を無断で戻しません。実装はPlanの対象範囲に限定し、Plan外の公開API、
責務、入出力、error挙動、検証範囲の変更が必要なら停止します。実装進捗と検証結果は
`implement.md`へ記録します。

履歴には確立済みのcommit規約がないため、命令形で対象を明確にした短い件名を使います。
PRには目的、変更file、検証結果または未実施理由を記載し、関連Issueがあればlinkします。
