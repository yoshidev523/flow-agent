---
name: flow-implement
description: Flowからの明示委譲、または利用者による`$flow-implement`（Claudeでは`/flow-implement`）の明示呼び出し時だけ、plan.mdの内容を実装・検証し、implement.mdへ進捗と結果を記録する独立executor。通常の実装依頼から暗黙に起動しない。
---

# Flow Implement

## 責務

指定Planだけを実装・検証し、固定path `artifacts/implement.md`へ進捗を残す独立executor。
Planが渡された経路、review、Flow stateを扱わない。

## 入力

Planのpath・revision・digest、target path、feature directory、監査用run ID・invocation ID。
単独利用でも同じ契約を使う。

## 出力と状態

`implement-artifact-v2`、artifact implement、statusは`in_progress | blocked | completed`。
- in_progress: 未完了の実装・検証がある。
- blocked: 現在のPlanでは継続できない。blockerを必須とする。
- completed: Planの全タスク、必須検証、実装commitを完了した終端状態。

## 手順

1. git status、AGENTS.md、Plan、関連fileを確認する。
2. Planのschema、ready、対象file、責務、手順、完了条件、検証方法を確認する。
   内容不足や契約不一致なら実装せず、渡されたPlan参照と停止理由をblocked成果物へ残す。
   参照自体が欠落・不正で契約を作れない場合は推測せず、監査と最終報告へ停止理由を残す。
3. 再開時はimplementのPlan参照と現在のPlanが一致することを確認する。
4. タスクの依存順に実装する。監査はタスク単位の検証結果、問題・課題と重要な決定へ絞る。
5. checkpointsでtasks、verifications、blockerを更新し、publishする。
6. Plan外の公開API、責務、入出力、error、範囲、検証条件の変更が必要ならblockedで停止する。
   矛盾・崩れた前提の証拠、影響、通常修正で解決できない理由、必要な変更をblockerと本文へ記録し、
   呼出側へ人間判断を求める。上流成果物やscopeを勝手に変更しない。
7. 検証のcommand、結果、未実施理由を記録する。必須検証の未実施・失敗をcompletedにしない。
8. 全タスクと必須検証の完了後、Plan対象fileとimplementにgit check-ignore --no-indexを実行する。
   ignore対象を強制追加しない。既存変更・Plan外変更を含めず、今回の実装変更だけをcommitする。
   件名は`[flow-implement] {短い命令形}`。
9. commit成功後にcommit SHAを記録しcompletedをpublishする。分離・commitに失敗したらblocked。
   commit済み内容が確定後のimplement.md自身のdigestを含む必要はない。
10. 保存したfront matterとgit statusを確認して報告する。

既存規約への軽微な調整はPlanの意味を変えない範囲で判断でき、その理由を監査へ残す。
completedは再開しない。push・PR作成は明示依頼時だけ。

## プロジェクト知識の適用

対象projectと対象範囲は呼出側の指定を使い、単独利用では対象コードと作業directoryから確認する。

[flow-project-knowledge](../flow-project-knowledge/SKILL.md)の把握手順で、適用範囲のAGENTS.mdと
参照先を確認する。参照先は別repository・外部文書serviceも含み、projectの文書運用を守る。
[共通手順](../flow/references/project-knowledge.md)に従い、project_knowledgeへ出典・版・digest・
適用範囲と照合結果を記録し、本文の「プロジェクト知識」で根拠・例外・未確認事項を説明する。
実際の対象fileの規約を適用し、検証結果・逸脱理由を記録する。
必須ルールと推奨・仮説を混同せず、評価前の把握を適合としない。Planの意味を変えない軽微な調整だけを自律判断し、Plan外の変更はblockedで呼出側へ返す。

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
