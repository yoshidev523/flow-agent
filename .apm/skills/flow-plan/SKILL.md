---
name: flow-plan
description: Flowからの明示委譲、または利用者による`$flow-plan`（Claudeでは`/flow-plan`）の明示呼び出し時だけ、Designまたは要求と正規化済みfeedbackからPlan成果物を作成・修正する独立writer。通常の計画依頼から暗黙に起動しない。
---

# Flow Plan

## 責務

Designまたは要求を実行可能なHOWへ展開し、固定path `artifacts/plan.md`を更新する。
review、利用者対話、Flow state、前後のphase状態を扱わない。

## 入力

- `create`: Designのpath・revision・digest、または直接の要求、target path。
- `revise / respond`: 現在のPlanと正規化feedbackのpath。
- feature directoryと監査用run ID・invocation ID。

Designを入力された場合はfront matterのinputsへ保持する。
feedbackはphase planで現在のPlanを参照し、revise/change、respond/answerが一致すること。
出所メタデータを判断材料にしない。単独利用の直接要求ではinputsを空にできる。

## 出力と状態

`phase-artifact-v2`、artifactはplan、statusは`needs_input | ready`。
needs_inputは利用者が決める必要のあるHOWが未解決、readyは追加の重要判断なしで
実装に着手できることを表す。readyはreview通過を意味しない。

## 手順

1. AGENTS.md、入力Designまたは要求、既存コード・テスト・設定を読む。
2. 根拠をConfirmed / Docs-derived / Assumption / Openに区別する。
3. 公開契約、責務、互換性、外部依存・権限・継続cost、不可逆な挙動、受容trade-offのうち
   利用者判断が必要なHOWだけを質問する。
4. 各質問へ現在のscopeで成立する2〜3個の選択肢、影響、推奨、理由、前提を記録する。
5. 未回答判断に依存する詳細タスクを確定せずneeds_inputにする。
6. respondで採用回答を反映し、対象file、責務、入出力、error、接続点、順序、
   完了条件、検証方法を詳細化する。回答後も質問と選択肢を残す。
7. revise/respondは全feedbackをapplied/unresolvedで追跡する。
8. 未回答の必須質問がなく、実装引き継ぎチェックがOKまたは理由付き該当なしならready。
9. publishでrevisionと変更履歴を更新する。

内部変数名、import順、軽微な構造、個別test caseなど既存規約で決められる事項は質問しない。
選択肢外の回答を勝手に写像しない。Designやscopeの変更が必要ならneeds_inputで理由を示す。
questions、tasks、verification_plan、handoff_checks、feedback_resultsの正本はfront matter。本文は詳細と成立根拠を説明する。
自分のPlan以外を編集せず、最終報告にpath・revision・status・未解決事項を含める。

## 重要判断の根拠

採用・変更する重要判断に安定した判断IDを付け、既存本文へ採用内容、根拠、前提、影響、
再検討条件を記す。利用者の指定、既存方針、公式情報、実測、仮定を区別する。
既存方針は根拠の一つとして扱い、必須制約か見直し可能な選定かを明示する。
影響の大きい判断、情報の鮮度が重要な判断、実測と前提に差がある判断を優先する。
最低成立条件を推奨条件として扱わず、弱い根拠の重要判断を質問なしだけで確定しない。
通常の可逆な判断まで一律に利用者へ質問したり、全既存選定を毎回再調査したりしない。

## プロジェクト知識の適用

対象projectと対象範囲は呼出側の指定を使い、単独利用では対象コードと作業directoryから確認する。

[flow-project-knowledge](../flow-project-knowledge/SKILL.md)の把握手順で、適用範囲のAGENTS.mdと
参照先を確認する。参照先は別repository・外部文書serviceも含み、projectの文書運用を守る。
[共通手順](../flow/references/project-knowledge.md)に従い、project_knowledgeへ出典・版・digest・
適用範囲と照合結果を記録し、本文の「プロジェクト知識」で根拠・例外・未確認事項を説明する。
HOW・タスク・検証への反映を確認する。対象範囲が具体化したら配下の規約も読む。
必須ルールと推奨・仮説を混同せず、評価前の把握を適合としない。規約との矛盾で上流変更が必要ならneeds_inputで理由を示す。

再利用できる暗黙知やfeedbackは本文の「知識の更新候補」へ根拠とともに残す。
自分で恒久ルールを採用・文書更新したり、利用者へ直接提案したりしない。Flowまたは単独利用の
呼出側が判断の確定後に知識スキルへ更新提案を依頼する。候補だけでstatusを変更しない。
最終報告には規約の適用結果・例外・確認不能事項と成果物linkを含める。

## 共通契約と機械処理

実行前に隣接するFlow skillの`../flow/references/contracts.md`と
`../flow/references/cli.md`の該当契約・commandを読む。
入出力形式は`../flow/references/contracts.md`とtemplateを参照する。
機械検証はCLI内のZod定義に従い、旧schemaを読み替えない。
`../flow/assets/templates/`の対応templateを使う。
CLIは`node ../flow/scripts/flowctl.js --root {feature_dir}`。
Node.js 22以上が必要。依存はCLIへ同梱済みで、利用側のnpm install・ビルドは不要。

各成果物はdraftを作り、`publish`で保存して`validate`で確認する。
固定artifactのrevision、変更履歴、保存、digestはCLIに任せ、直接上書きしない。
監査は[共通の記録方針](../flow/references/contracts.md#監査の記録方針)に従い、自分の担当事項だけを共通CLIで記録する。
契約不一致は補完せず報告し、監査の保存障害時は次の操作へ進まない。
