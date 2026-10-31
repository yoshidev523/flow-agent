# Repository Guidelines

## プロジェクト構成

このリポジトリは仕様駆動開発用のエージェントパッケージです。Flowの正本は
`.apm/skills/`と`.apm/agents/`に置き、APMがCodexとClaude向けの配置・変換を担います。
`design-reviewer`のCodex定義は`.codex/agents/`、共通・外部由来のスキルは
`.agents/skills/`に置きます。パッケージ設定は`apm.yml`、依存関係の固定情報は
`apm.lock.yaml`で管理します。

機能ごとの実行成果物は`flow-spec/YYYYMMDD_feature/`へ保存します。
Flow 4.3.0では`flow-state.yml`、事実履歴の`audit.md`、復旧用の`.flow/journal.md`、固定pathの
`artifacts/design.md`、`artifacts/plan.md`、`artifacts/implement.md`を使います。
固定成果物はrevisionと変更履歴を更新し、revision別fileは作りません。
レビューは`reviews/{design,plan-decision,plan-final}/cycle-0001/`へsourceとreview.md、
feedbackは`feedback/{design,plan}/feedback-0001.md`へ保存します。
配布用CLI、Markdown契約、テンプレートは`.apm/skills/flow/`に同梱します。
TypeScriptとZod定義の正本はrepositoryの`src/`に置きます。
独立同期skillには同じCLI・契約・templateを同梱し、build/check-flow-distで正本との一致を確認します。

## 開発・検証コマンド

```sh
git status --short
sed -n '1,200p' apm.yml
apm list
apm run verify-flow
apm run build-flow
apm run check-flow-dist
apm run test-flow
apm run verify-flow-deployment
```

通常の実行にはNode.js 22以上だけを必要とします。チェックポイント操作にはGitも必要です。利用側のnpm install・ビルドは不要です。
`verify-flow-deployment`は下記の配置検証を自動化し、CLI・Markdown契約・templateの同梱も確認します。

```sh
node .apm/skills/flow/scripts/flowctl.js --root flow-spec/YYYYMMDD_feature validate artifacts/design.md
```

開発時は`npm ci`で依存を導入します。TypeScriptは`src/`、Zod契約は`src/contracts/`が正本です。
`apm run build-flow`で型チェックと単一JavaScriptの生成を行います。
`apm run check-flow-dist`で配布物と正本の一致を確認します。

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
  flow flow-artifact-sync flow-design flow-plan flow-implement \
  flow-design-review flow-design-review-requirements \
  flow-design-review-quality-risk \
  flow-plan-decision-review flow-plan-review-decision-quality \
  flow-plan-review flow-plan-review-task-readiness
do
  test -f "$flow_consumer_dir/.agents/skills/$skill_name/SKILL.md"
  test -f "$flow_consumer_dir/.agents/skills/$skill_name/agents/openai.yaml"
  rg -q 'allow_implicit_invocation: false' \
    "$flow_consumer_dir/.agents/skills/$skill_name/agents/openai.yaml"
  test -f "$flow_consumer_dir/.claude/skills/$skill_name/SKILL.md"
done
for agent_name in \
  flow-designer flow-planner flow-implementer \
  flow-design-reviewer flow-design-requirements-reviewer \
  flow-design-quality-risk-reviewer \
  flow-plan-decision-reviewer flow-plan-decision-quality-reviewer \
  flow-plan-reviewer flow-plan-task-readiness-reviewer
do
  test -f "$flow_consumer_dir/.codex/agents/$agent_name.toml"
  test -f "$flow_consumer_dir/.claude/agents/$agent_name.md"
done
test ! -e "$flow_consumer_dir/.agents/skills/flow-design-review-user-value"
test ! -e "$flow_consumer_dir/.claude/skills/flow-design-review-user-value"
test ! -e "$flow_consumer_dir/.codex/agents/flow-design-user-value-reviewer.toml"
test ! -e "$flow_consumer_dir/.claude/agents/flow-design-user-value-reviewer.md"
for removed_skill in \
  flow-plan-review-structure-integration \
  flow-plan-review-executability flow-plan-review-verifiability
do
  test ! -e "$flow_consumer_dir/.agents/skills/$removed_skill"
  test ! -e "$flow_consumer_dir/.claude/skills/$removed_skill"
done
for removed_agent in \
  flow-plan-structure-integration-reviewer \
  flow-plan-executability-reviewer flow-plan-verifiability-reviewer
do
  test ! -e "$flow_consumer_dir/.codex/agents/$removed_agent.toml"
  test ! -e "$flow_consumer_dir/.claude/agents/$removed_agent.md"
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
- 再計画に伴う成果物同期は独立した`flow-artifact-sync`が複数成果物の更新ownerとして実行します。
  同期全体は既存のactionイベントで監査し、保存の自動イベントを重複記録しません。
  どのphaseでも利用でき、他スキルやFlow stateを必要としません。同期はstateを変更せず、
  更新後の旧state・reviewは再利用しません。実装記録の更新は完了証拠を無効にします。
  Flowは人間承認付きreplanningから同期後の参照を登録し、必要な再reviewを実行します。
- AIと人間のreviewは同じsource契約へ正規化し、1 cycle内では一方だけを使います。
- phase review hubは自phaseのsource収集とaggregate artifactだけを管理します。
- 各観点reviewerは担当観点を独立評価し、固有のsource fileだけを書きます。
- Plan decision reviewは利用者へ提示する前の質問、選択肢、影響、推奨、前提だけを
  評価します。最終reviewは採用済み判断の反映と現在のscopeの成立性を評価します。
  成立に必須な指摘だけをgateとし、周辺改善は追加scope候補へ分離します。
- 追加scope候補はreview status、自動修正、human review切替へ影響させません。
- reviewerは既存の別選択肢を推奨できますが、利用者の回答変更や選択肢外の回答確定は
  行いません。
- Implement executorは渡されたPlanの内容と完全性だけを扱い、上流状態を認識しません。
- leafの単独利用はFlow内部状態に依存せず、自身の入出力契約だけで完結させます。

物理階層は次とします。

```text
Flow
├── phase writer
├── decision review hub (Plan needs_input only)
│   └── decision-quality reviewer
└── final review hub
    ├── perspective reviewer 1
    └── perspective reviewer 2 (Design only)
```

Human modeではperspective reviewerを起動せず、human source 1件をhubが集約します。
子agentを起動できない環境ではhubが`incomplete`を返し、Flowが規定のretryまたは
human modeへの切替を行います。

## 永続契約と成果物所有

phase境界の契約は次の4種類に限定します。

- `phase-artifact-v2`: `design.md`と`plan.md`
- `review-source-v2`: 観点別または人間の評価結果
- `phase-review-v2`: hubの集約結果
- `phase-feedback-v2`: Flowがwriterへ渡す変更または回答

`review-source-v2`のfindingは、現在のscopeの成立に必須な`gate`と、成立には不要な
`scope_candidate`へ分類します。sourceとaggregateのstatusは`gate`だけから決定し、
`scope_candidate`は利用者が採用した場合だけfeedbackへ変換します。

Flow内部状態は`flow-state-v2`として`flow-state.yml`へ保存します。
新しい中継用request/result契約を追加する前に、既存artifactのpathとstatusで
接続できないかを検討してください。

各fileのwriterは一意にします。

- Flow: `flow-state.yml`、feedback、human source
- 同期skill: 明示された同期中のDesign・Plan・Implementと同期用feedback（通常writerと同時実行しない）
- 共通CLI: ownerに代わる保存と、排他的な`.flow/journal.md`追記と`audit.md`生成。直接編集しません。
- phase writer: 自分のphase artifact
- perspective reviewer: 自分のsource
- review hub: 自分のaggregate artifact
- executor: `implement.md`

Flowはreview開始ごとに一意な`review_cycle_id`を発行し、state、全source、aggregateで
一致を必須にします。review対象のSHA-256はaggregate作成時とphase移行時に
同一digestであることを確認します。古いcycleまたはrevisionのsource、aggregate、
feedbackは再利用しません。

Planは入力Designのpath、revision、SHA-256を保持し、Plan decision reviewと最終reviewの
開始前に現在のDesignと一致することを確認します。Implementの進捗は
`implement-artifact-v2`のfront matterへrevisionと
`in_progress / blocked / completed`を記録します。

## 状態遷移

人間が戻り先と修正範囲を承認した場合だけreplanning経由でDesign/Planへ戻ります。
checkpointで変更前を保存し、同期後の旧承認を無効化します。cycleとretry上限は保持します。

`design -> design_review -> plan`の後、未回答質問があれば
`plan_decision_review -> plan`を経て、`plan_review -> implement -> completed`へ進みます。
decision reviewの`passed`は質問提示の根拠、最終reviewの`passed`はImplement開始の根拠と
します。

AI reviewの変更要求に対する自動修正はDesign、Plan decision、Plan finalの各stageで
1回まで、実行障害の再試行も各stageで1回までです。使い切った場合はhuman modeへ
切り替えます。利用者判断が必要な`blocked`はFlowが質問し、回答をfeedbackへ正規化します。

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

## Flow 4.3.0 の機械処理

HOWは`.apm/skills/flow/references/`、schemaの正本は`src/contracts/`のZod定義です。
実行処理はTypeScriptで実装し、依存を含む`scripts/flowctl.js`をFlow skillへ同梱します。
成果物・監査の契約は`references/contracts.md`へ記載し、Zod定義と同時に更新します。
JSON Schemaの生成・配布は行いません。
保存にはpublish、状態更新にはtransition、監査にはaudit-appendを使います。
旧契約は読み替えず、同じrequest IDの再送は重複実行しません。
変更履歴は各固定artifactへ、フェーズ移行・問題・feedback・決定・検証結果の要点はaudit.mdへ残します。
通常の読取・検索・command開始・TDD各段階・説明だけの応答は記録しません。
復旧と重複実行防止の正本は`.flow/journal.md`とし、CLIが`audit.md`を生成します。
両fileをGit保存とcheckpointへ含め、直接編集しません。
旧audit-log-v1は明示的な`audit-migrate`で原本をjournalへ保持して移行します。
各agentは自分のイベントを共通記録処理へ渡し、監査を直接編集しません。
完了後も新しい課題・変更要求・判断訂正だけを監査へ記録します。
checkpointは専用Git commitとlocal tagで保存し、復帰用branch作成とFlowの再開を分けます。
監査/保存の中断はresume-checkで検出し、外部操作を自動で再実行しません。
Planの質問への回答待ちはplan_decision_reviewに置き、planには置きません。
検証追加時はapm.ymlのscriptと本書を同時に更新します。
