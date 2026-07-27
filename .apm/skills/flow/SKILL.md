---
name: flow
description: 本プロジェクト向け仕様駆動開発の一連フロー。flow-designer、flow-planner、flow-implementer サブエージェントを順番に使い、design -> plan -> implement の流れで要件定義、実装計画、実装・検証を進める。
---

# Flow

## 目的

要件定義から実装までを、以下の 3 段階で進める。

1. `flow-designer` + `$flow-design`: 要件・仕様・受け入れ条件を明確化し、
   `spec/{yyyymmdd_feature}/design.md` を作成する。
2. `flow-planner` + `$flow-plan`: `design.md` または要件をもとに、
   `spec/{yyyymmdd_feature}/plan.md` を作成する。
3. `flow-implementer` + `$flow-implement`: `plan.md` をもとに実装・検証し、
   `spec/{yyyymmdd_feature}/implement.md` に進捗を記録する。

このスキルは 3 つの段階を束ねるオーケストレーション用スキルである。各段階の実務は対応するサブエージェントとスキルに委譲する。

## 基本方針

- `design -> plan -> implement` の順番を守る。
- 前段階の成果物がユーザー明示承認済み、または同一 SHA-256 の有効な
  Flow 管理の `PhaseTransitionAuthorization` を持たない場合は、次段階へ進まない。
- 各段階でユーザー確認が必要な場合は停止し、フィードバックを待つ。
- 依存関係があるため、3 エージェントを並列起動しない。
- 実装まで一気に進める明示依頼があっても、ユーザー明示承認または
  Flow のフェーズ移行許可によるゲートは維持する。
- `承認状態: Approved` はユーザーの明示承認を表す。サブエージェントやメインエージェントの自己判断で `Approved` にしてはいけない。
- ユーザーの明示承認を該当フェーズのサブエージェントが成果物へ反映したら、メインエージェントは追加確認を挟まず次フェーズのサブエージェントを起動する。
- Design は WHAT、Plan は HOW を扱う。Design で質問済みであることを理由に、Plan の HOW 確認を省略しない。
- 各サブエージェントは最終報告で `次に取るべきステップ` と `ユーザーに提示する文言` を明示する。メインエージェントはそれに従い、質問回答待ちと承認待ちを混同しない。
- メインエージェントは phase 成果物の作成、更新、承認反映、フィードバック反映を
  直接行わない。これらは必ず該当フェーズのサブエージェントに委譲する。
  review artifactは対応するフェーズ reviewer orchestratorが単一 writerとして管理し、
  Flowはrequest/result中継、外側検証、ユーザー提示、フェーズ移行状態を管理する。

## フェーズ独立の原則

- `flow-design`、`flow-plan`、`flow-implement` は、それぞれ自身の入力、成果物、
  質問、完了条件だけを扱う。Design / Planは汎用review request/resultを扱えるが、
  reviewerのidentity、review artifact、他フェーズ、Flow内部状態を参照しない。
- 各観点 reviewer は汎用 `PerspectiveReviewRequest` を読み、指定された
  decisionを担当観点だけで評価して `PerspectiveReviewResult` を返す。
  呼び出し元、他 reviewer、集約結果、
  ユーザー対話、次フェーズを認識しない。
- フェーズ reviewer orchestrator は自フェーズの3 reviewerの選択・起動、
  結果集約、review artifactだけを所有する。他phaseやユーザー対話を扱わない。
- phase writerは推奨案、評価用候補、`ProposalReviewRequest`の作成と、
  `ProposalReviewResult`を受けた同一decision内の推奨修正を所有する。
- phase 間の接続、phase writerとreviewer orchestrator間の結果中継、
  reviewer orchestratorの起動、SHA-256の外側照合、ユーザーへの提示、
  再試行、条件付き自動採用、フェーズ移行許可は Flow だけが所有する。
- leaf skill / agent の出力文言は Flow にとって提案であり、Flow 実行中は
  そのままユーザーへ転送せず、Flow が現在状態に基づき次アクションを決める。
- leaf skill / agent を単独利用した場合は、reviewer の有無に依存せず、
  その skill 自身の通常の質問・承認・完了フローで動作する。

## recommendation-gated オーケストレーション

### 推奨案を中心にした評価対象

Design / Plan のphase writerが質問待ちを報告し、全質問に推奨案がある場合、
Flowはユーザーへ質問を提示する前に、同じphase writerへ評価用候補モードを指定する。
phase writerは推奨案を仮適用した候補と、decision単位の
`ProposalReviewRequest`を返す。

Flowは次を検証する。

- request/series IDとattempt 1〜3
- phase、target path、小文字64桁hexのtarget SHA-256
- decision IDの一意性
- 質問、選択肢、推奨、理由、仮採用差分
- reviewerが照合する確定要件、制約、受け入れ条件
- scope/out of scope
- attempt 2以降は前回結果と推奨変更の差分

候補に推奨なし、候補化不能なOpen、request不備が残る場合はreviewを開始せず、
通常どおりユーザーへ質問する。Flowはdecision内容や推奨を作成・修正しない。

### 兄弟reviewer orchestratorへの中継

Flowはphase writerから受けたrequestを、兄弟agentとして起動する対応hubへ渡す。

- Designは `flow-design-reviewer` + `$flow-design-review`
- Planは `flow-plan-reviewer` + `$flow-plan-review`

hubが配下の3観点reviewerを直接起動し、`ProposalReviewResult`をreview artifactへ
追記する。物理階層は `Flow -> phase writer` と
`Flow -> phase reviewer orchestrator -> 3 reviewer` の兄弟構成を維持する。
phase writerからreviewerを直接起動せず、Flowも観点reviewerを代理起動しない。

Flowは返されたresultのrequest/series ID、attempt、target path/SHA-256、
必要な3 reviewer、completion、Complete時のoutcome、decision対応を検証し、
内容を編集せず同じphase writerへ中継する。phase writerは
`RevisionRequired`のときだけ、同じdecision、既存選択肢、既存scope内で
推奨を修正し、attemptを1増やした新しい候補/requestを返せる。

次の場合は自律修正を止め、phase writerが判断点をまとめてFlowへ返す。

- `Indeterminate`、reviewer間の矛盾、選択肢内に妥当案なし
- scope変更、重要な価値判断、リスク受容が必要
- `GuardrailEscalation`
- attempt 3でも `RevisionRequired`

`OutOfReviewScope`は記録だけ行い、質問、候補修正、再review、ゲート、
外部タスク作成の理由にしない。

### Incompleteと再試行

`completion: Incomplete`ではoutcomeを採用せず、部分結果をフェーズ判断に使わない。
同一target SHA-256、series、attempt、decision setを維持できる場合だけ、
Flowは成功済みのComplete結果をhubへ返し、失敗reviewerを新しいrequest IDで
1回だけ再試行させる。proposal attemptは増やさない。

再試行後もIncomplete、またはtargetが変化して部分結果を再利用できない場合は、
成果物の修正を求めずユーザーへ次を提示して停止する。

- 現在phaseと `ProposalReviewIncomplete`
- 失敗reviewerと理由
- 部分結果を移行根拠に使っていないこと
- 成果物修正が不要であること
- 同じ候補で再開する方法

### 条件付き自動採用

`ProposalReviewResult`がCompleteかつValidatedでも、Flowは次をすべて満たす場合だけ
推奨案を条件付き自動採用できる。

- Confirmedな目的、要件、制約から一意または優位に導ける
- scope、利用者、成果物を増減しない
- 重要な利用者価値のtrade-offを含まない
- 破壊的操作、公開API、security、privacy、法務、継続costに新しい判断を持ち込まない
- Designでは利用者から見える重要な仕様選択ではない
- Planでは承認済みDesignと既存規約内の内部的かつ可逆な実装選択である

満たさない場合はValidated済みの選択肢と根拠をユーザーへ提示し、回答を待つ。
自動採用できる場合、Flowは対象path/SHA-256、phase、review series/attempt、
根拠種別を持つ `PhaseTransitionAuthorization` を作り、targetを書き換えず
次フェーズへ進む。

### SHA-256と状態遷移

Flowはhub起動前、hub追記前、次フェーズ移行直前の三点で
`sha256sum`、`shasum -a 256`、`openssl dgst -sha256` の順に
target全バイトのSHA-256を照合する。不一致、Incomplete、result契約不整合、
stale resultでは移行しない。

`承認状態: Approved`は引き続きユーザー明示承認だけを表す。
Approvedの既存design/planはreviewなしでも通過できる。
評価用候補単独、Incomplete、RevisionRequired、EscalationRequired、
自動採用条件を満たさないValidatedは次フェーズ根拠にならない。

## 推測ゲート

flow では、根拠が弱い判断を推測で確定して先へ進めてはいけない。
各フェーズは重要な判断を次の根拠分類で扱う。

| 分類 | 意味 | 扱い |
| --- | --- | --- |
| `Confirmed` | ユーザーの明示回答、承認済み成果物、コードまたは実行結果で確認済み | 決定事項として扱える |
| `Review-validated` | 推奨案がComplete/Validatedとなり、Flowが条件付き自動採用基準を確認済み | Approvedとはせず、同一SHA-256の移行許可根拠にできる |
| `Docs-derived` | 既存ドキュメント由来だが、今回ユーザーが明示承認していない | ユーザー確認なしに確定しない |
| `Assumption` | エージェントの仮説、推奨案、便宜上の案 | 決定事項にせず質問へ回す |
| `Open` | 判断に必要な情報が不足 | 質問へ回す |

推奨案は回答候補であり、ユーザー回答前の確定事項ではない。
すべての事項において、根拠のない推測は禁止する。
ユーザー回答、確認可能な根拠、または有効な `Review-validated` がない内容は、
些細に見えても確定事項にしない。
候補化できない `Docs-derived` / `Assumption` / `Open` が残る場合は review や
次フェーズへ進まない。Flow が phase agent に作らせた完全な評価用候補は
ユーザー質問前の review 対象にできるが、単独では次フェーズ根拠にならない。
Complete/Validatedと条件付き自動採用基準を満たした同一SHA-256だけが
`Review-validated`として移行許可の根拠になる。
Plan から Implement へ進む前に、`plan.md` が implementer へ十分な情報を渡しているか確認する。
`承認状態: Approved` だけでは Implement に進めない。

メインエージェントは各成果物を受け取ったら、承認状態だけでなく
`確認事項`、根拠分類、`Assumption` / `Open` の残存有無を短く確認する。
根拠が弱い決定事項を見つけた場合は次フェーズへ進まず、該当フェーズのサブエージェントへ差し戻す。

## 次アクション判定

サブエージェントの最終報告には、以下を必ず含めさせる。

- `次に取るべきステップ`: ユーザーまたはメインエージェントが次に行うこと
- `理由`: なぜそのステップなのか
- `ユーザーに提示する文言`: メインエージェントがそのまま、または要約してユーザーへ提示できる文言

各フェーズの代表例:

| フェーズ | 状態 | 次に取るべきステップ |
| --- | --- | --- |
| Design | Open の確認事項あり | ユーザーが質問に回答する |
| Design | Open の確認事項なし、`Pending` | ユーザーが設計をレビューし、承認または修正依頼する |
| Design | `Approved` | メインエージェントが Plan へ進む |
| Plan | Open の HOW 確認事項あり | ユーザーが質問に回答する |
| Plan | Open の確認事項なし、`Pending` | ユーザーが計画をレビューし、承認または修正依頼する |
| Plan | `Approved` | メインエージェントが Implement へ進む |
| Implement | 実装前ブロックあり | ユーザーがブロック事項に回答する |
| Implement | 実装完了、一部検証未実施 | ユーザーが結果を確認し、必要なら追加検証条件を渡す |
| Implement | 実装・検証完了 | ユーザーが結果を確認する |

Open の確認事項がある場合、メインエージェントは承認を促してはいけない。
承認を促すのは、該当成果物が `Pending` かつ Open の確認事項がない場合だけにする。

## 入力

ユーザー入力から以下を抽出する。

- 実現したいこと
- 背景・目的
- 対象範囲
- 制約・前提
- 参考情報（チケット、URL、既存ドキュメント、関連ファイル）
- 希望する停止位置（design まで / plan まで / implement まで）

停止位置の指定がなければ、まず `design.md` の通常ドラフトを作る。
推奨案が揃った質問待ちなら Flow が評価用候補を依頼して Design review まで進める。
Validatedかつ条件付き自動採用可能ならPlanへ進み、それ以外のValidated、
EscalationRequired、再試行後のIncompleteはユーザー判断を待つ。
ユーザーが「最後まで」「実装まで」と明示した場合も各 review または明示承認ゲートを維持する。

## 実行フロー

### 1. Design

`flow-designer` サブエージェントを起動し、`$flow-design` を使わせる。

依頼内容に含めること:

- ユーザー入力の要件全文
- このリポジトリの `AGENTS.md` に従うこと
- 成果物は `spec/{yyyymmdd_feature}/design.md`
- 成果物の見出しは日本語にし、承認欄は `承認状態: Pending` とすること
- 不明点があれば質問し、ユーザーフィードバックを反映すること
- 質問は WHAT に限定し、どのような状態にしたいか、何を実現したいか、対象範囲、制約、受け入れ条件を確認すること
- 具体的な修正方法、関数名、ファイル分割、実装順序、検証コマンドなどの HOW は質問せず、必要なら plan 側への引き継ぎ事項として記録すること
- 質問は A/B/C の選択肢だけで終わらせず、各選択肢の説明、メリット、デメリット、推奨有無、回答欄またはチェックボックスを含めること
- ユーザーの明示承認がない限り `承認状態: Pending` のままにすること
- 承認状態を最終報告に含めること
- 最終報告に `次に取るべきステップ`、`理由`、`ユーザーに提示する文言` を含めること

ドラフト完了判定:

- `design.md` が存在する。
- `承認状態: Pending` になっている。
- 受け入れ条件が明文化されている。
- `Docs-derived` / `Assumption` / `Open` が決定事項に混入していない。

承認完了判定:

- ユーザーが会話上で明示的に内容を承認している。
- その後 `承認状態: Approved` に更新されている。

未承認でも同一SHA-256のComplete/ValidatedなDesign recommendation reviewを
Flowが確認し、条件付き自動採用基準を満たして
Design用 `PhaseTransitionAuthorization` を作成できればPlanへ進む。
RevisionRequiredは同じdesignerへ中継し、EscalationRequired、
自動採用できないValidated、再試行後のIncompleteはユーザーへ提示して停止する。

### 2. Plan

Design が明示承認済み、または Flow が有効な Design 用
`PhaseTransitionAuthorization` を持つ場合だけ、
`flow-planner` サブエージェントを起動し、`$flow-plan` を使わせる。
ユーザーの明示承認により `design.md` が `Approved` になった場合、メインエージェントは追加確認を挟まず `flow-planner` を起動する。

依頼内容に含めること:

- 入力となる `design.md` のパス
- Flow が事前にフェーズ移行可否を確認済みであること。reviewer名、
  review artifact、review内部状態はplannerへ渡さないこと
- 成果物は同じ feature ディレクトリの `plan.md`
- 成果物の見出しは日本語にし、承認欄は `承認状態: Pending` とすること
- 不明点があれば質問し、ユーザーフィードバックを反映すること
- Design の確認事項とは別に、HOW の未決事項を必ず棚卸しすること
- 質問は HOW に集中し、ファイル構成、API 形状、関数名、責務分担、実装順序、検証方法などを確認すること
- 追加質問が不要な場合でも、確認した HOW 観点と質問不要と判断した理由を `確認事項` に明記すること
- 質問は A/B/C の選択肢だけで終わらせず、各選択肢の説明、メリット、デメリット、推奨有無、回答欄またはチェックボックスを含めること
- HOW 質問が残る間は、実行サマリ、変更ファイル一覧、変更ファイル詳細、タスク分解、詳細手順、実装引き継ぎチェックを確定内容として作り込まず、「質問回答後に清書」と明記すること
- HOW 質問が解消し追加質問が不要になった時点で、実行サマリ、変更ファイル一覧、変更ファイル詳細、タスク分解、詳細手順、検証方法、実装引き継ぎチェックを清書すること
- 変更種別に応じて、対象ファイルごとの変更内容、追加・変更する関数 / メソッド / export、input/output、エラー時の扱い、既存コードとの接続、完了条件を明記すること
- `実装引き継ぎチェック` を作成し、すべて `OK` または根拠つきの `該当なし` にすること
- `実装引き継ぎチェック` に `NG` / 未記入 / 矛盾がある場合は、レビュー待ちへ進めず HOW 質問待ちに戻すこと
- ユーザーの明示承認がない限り `承認状態: Pending` のままにすること
- 承認状態を最終報告に含めること
- 最終報告に `次に取るべきステップ`、`理由`、`ユーザーに提示する文言` を含めること

質問待ちドラフト完了判定:

- `plan.md` が存在する。
- `承認状態: Pending` になっている。
- HOW の未決事項が質問として記載されている。
- 実行サマリ、変更ファイル一覧、変更ファイル詳細、タスク分解、詳細手順、実装引き継ぎチェックは確定内容として作り込まず、「質問回答後に清書」と明記されている。
- `次に取るべきステップ` がユーザーの HOW 質問回答になっている。

レビュー待ちドラフト完了判定:

- `plan.md` が存在する。
- `承認状態: Pending` になっている。
- タスク分解、対象ファイル、依存関係、検証方法が明文化されている。
- 実行サマリ、追加・修正・削除で区分した変更ファイル一覧、変更ファイル詳細、詳細手順が明文化されている。
- 変更種別に応じて、公開名、input/output、エラー時の扱い、
  既存コードとの接続箇所が明記されている。
  該当しない場合は理由つきで `該当なし` になっている。
- 各タスクの完了条件が明記されている。
- `実装引き継ぎチェック` がすべて `OK` または根拠つきの `該当なし` になっている。
- `Docs-derived` / `Assumption` / `Open` が実装方針、実行サマリ、変更ファイル一覧、変更ファイル詳細、タスク分解、詳細手順、実装引き継ぎチェックに混入していない。

承認完了判定:

- ユーザーが会話上で明示的に内容を承認している。
- その後 `承認状態: Approved` に更新されている。

未承認でも同一SHA-256のComplete/ValidatedなPlan recommendation reviewを
Flowが確認し、条件付き自動採用基準を満たして
Plan用 `PhaseTransitionAuthorization` を作成できればImplementへ進む。
RevisionRequiredは同じplannerへ中継し、EscalationRequired、
自動採用できないValidated、再試行後のIncompleteはユーザーへ提示して停止する。

### 3. Implement

Plan が明示承認済み、または Flow が有効な Plan 用
`PhaseTransitionAuthorization` を持つ場合だけ、
`flow-implementer` サブエージェントを起動し、`$flow-implement` を使わせる。
ユーザーの明示承認により `plan.md` が `Approved` になった場合、
メインエージェントはユーザーへの追加確認を挟まず `flow-implementer` を起動する。
ただし、起動前にメインエージェントは `実装引き継ぎチェック`、`変更ファイル詳細`、`詳細手順` を短く確認する。
Plan が `Approved` でも、実装に必要な情報が不足している場合は Implement へ進まず、`flow-planner` へ差し戻す。

依頼内容に含めること:

- 入力となる `plan.md` のパス
- 未承認 plan を渡す場合は、reviewer や review artifact を含めず、
  `status: Authorized`、対象 path、対象 SHA-256、発行 phase を持つ
  汎用 `PhaseEntryAuthorization` を渡すこと
- 同じ feature ディレクトリの `design.md` があれば参照すること
- `実装引き継ぎチェック`、`変更ファイル詳細`、`詳細手順` を作業前に確認すること
- plan が承認済みでも、引き継ぎチェックに `NG` / 未記入 / 矛盾がある場合や、関数名、input/output、エラー時の扱い、接続箇所、完了条件、検証方法が不足している場合は実装を開始しないこと
- 進捗は `implement.md` に記録すること
- `implement.md` の見出しは日本語にし、変更サマリを追加・修正・削除で区分して記録すること
- 既存変更を勝手に戻さないこと
- 必要な検証を実行し、結果または未実行理由を記録すること
- plan にない判断事項や入力条件が見つかった場合は実装を進めず、ブロック理由を記録してユーザー確認へ回すこと
- コミット、push、PR 作成は明示依頼がない限り行わないこと
- 最終報告に `次に取るべきステップ`、`理由`、`ユーザーに提示する文言` を含めること

完了判定:

- `implement.md` が存在する。
- 実装済みタスク、変更ファイル、検証結果が記録されている。
- 作業前に `plan.md` の承認状態と実装引き継ぎチェックが確認されている。
- 作業後の `git status --short` が確認されている。

## サブエージェント運用

- 各段階のサブエージェントは 1 つずつ起動する。
- フェーズ reviewer orchestratorはphase agentとは別枠でFlowが1つ起動する。
- フェーズ reviewer orchestratorは配下の3観点 reviewerを直接起動し、
  相互依存がないため並列実行してよい。
- 観点 reviewer自身から別agentを起動させない。
- 前段階の最終報告と成果物パスを次段階の入力として渡す。
- 各フェーズでは、原則として 1 つのサブエージェントをフェーズ完了まで再利用する。
- サブエージェントが質問待ち、承認待ち、またはブロックを報告した場合、メインエージェントはユーザーへ要点を伝えて待つが、そのサブエージェントは閉じない。
- ユーザー回答、承認、修正依頼、追加検証、追加実装が発生した場合は、同じフェーズの既存サブエージェントへ追加入力する。
- フェーズが完了して次フェーズへ進む場合、またはユーザーが明示的に停止した場合だけ、不要になったサブエージェントを閉じる。
- 既存サブエージェントが利用できない、閉じられている、または現在のセッションで参照できない場合だけ、新しいサブエージェントを起動し、既存成果物パスとユーザーの最新入力から再開させる。
- サブエージェントへ追加入力または起動ができない場合、メインエージェントは成果物を直接更新せず、再試行またはユーザーへの報告で停止する。
- メインエージェントは成果物全文を読み込みすぎず、承認状態、確認事項、
  実行サマリ、変更サマリ、検証ログなど必要箇所だけを確認する。

## フィードバック反映の委譲ルール

- `design.md` の質問回答、設計承認、修正依頼は、Design フェーズ中の既存 `flow-designer` に
  既存 `design.md` とユーザー最新入力を渡して反映させる。
- `plan.md` の質問回答、修正依頼、計画承認は、Plan フェーズ中の既存 `flow-planner` に
  既存 `plan.md` とユーザー最新入力を渡して反映させる。
- recommendation reviewのエスカレーション後の回答は、Flowが判断点とユーザー入力を対応付け、
  対象 phase の既存 agent へ渡す。観点 reviewer へユーザー入力を直接渡さない。
- 実装後の追加検証、環境準備、レビュー修正、タスク状態更新は、
  Implement フェーズ中の既存 `flow-implementer` に既存 `plan.md` / `implement.md` と
  ユーザー最新入力を渡して実行させる。
- 既存サブエージェントが利用できない場合だけ、同じフェーズのサブエージェントを新しく起動し、成果物ベースで再開させる。
- メインエージェントはサブエージェントの結果を要約し、
  次の承認ゲートまたは完了報告をユーザーに返す。
- 承認反映後に次フェーズへ進める場合、メインエージェントは次フェーズのサブエージェント起動だけを担当する。

## メインエージェントのフィードバック処理

ユーザーから質問回答、承認、修正依頼、追加検証、追加実装、ブロック回答が返った場合、メインエージェントは phase 成果物の内容を深掘りしない。
メインエージェントが判断してよいのは以下だけとする。

- 現在フェーズ: Design / Plan / Implement
- 入力種別: 回答 / 承認 / 修正依頼 / 追加検証 / 追加実装 / ブロック回答 / 不明
- 渡すべき成果物パス
- 既存サブエージェントへ追加入力するか、利用不能のため新規起動するか

追加質問の要否、回答内容の妥当性、成果物更新、承認反映、ブロック解除可否は、必ず該当フェーズのサブエージェントが判断する。
メインエージェントはユーザー入力を要約しすぎず、原文に近い形でサブエージェントへ渡す。
ただし review の request 管理、結果集約、SHA-256 照合、ゲート判定、
`PhaseTransitionAuthorization` の発行は Flow 自身が判断する。

追加入力テンプレート:

```md
現在フェーズ: {Design|Plan|Implement}
既存成果物: {path}
ユーザーの最新入力:
{ユーザー入力を原文に近い形で貼る}

指示:
- 最新入力の解釈、追加質問の要否、成果物更新、承認反映、ブロック解除可否はあなたが行う。
- 成果物を source of truth とし、必要箇所だけ更新する。
- メインエージェント側では内容判断していない。
- 最終報告には `次に取るべきステップ`、`理由`、`ユーザーに提示する文言` を含める。
```

代表的な状態遷移:

| 現在状態 | ユーザー入力 | メインエージェントの行動 |
| --- | --- | --- |
| Design 質問待ち | 回答 | 既存 `flow-designer` に追加入力する |
| Design 推奨案あり | review前 | 同じdesignerに評価用候補/requestを依頼し、Flowが兄弟Design reviewer orchestratorを起動する |
| Design `RevisionRequired` | 結果中継 | 同じdesignerに結果を渡し、同一decision内で推奨を修正させる |
| Design `EscalationRequired` / 再試行後`Incomplete` | ユーザー判断 | Flowが判断点または実行不能理由を提示する |
| Design `Validated` | 採用判定 | 条件付き自動採用可能なら移行許可を発行し、不可ならユーザーへ選択肢を提示する |
| Design レビュー待ち | 承認 | 既存 `flow-designer` に承認反映を依頼する |
| Design レビュー待ち | 修正依頼 | 既存 `flow-designer` に追加入力する |
| Design `Approved` | 次フェーズ開始 | `flow-designer` を閉じ、`flow-planner` を起動する |
| Plan 質問待ち | 回答 | 既存 `flow-planner` に追加入力する |
| Plan 推奨案あり | review前 | 同じplannerに評価用候補/requestを依頼し、Flowが兄弟Plan reviewer orchestratorを起動する |
| Plan `RevisionRequired` | 結果中継 | 同じplannerに結果を渡し、同一decision内で推奨HOWを修正させる |
| Plan `EscalationRequired` / 再試行後`Incomplete` | ユーザー判断 | Flowが判断点または実行不能理由を提示する |
| Plan `Validated` | 採用判定 | 条件付き自動採用可能なら移行許可を発行し、不可ならユーザーへ選択肢を提示する |
| Plan レビュー待ち | 承認 | 既存 `flow-planner` に承認反映を依頼する |
| Plan レビュー待ち | 修正依頼 | 既存 `flow-planner` に追加入力する |
| Plan `Approved` | 次フェーズ開始 | `flow-planner` を閉じ、`flow-implementer` を起動する |
| Implement ブロック | 回答 | 既存 `flow-implementer` に追加入力する |
| Implement 完了 | 追加検証・修正 | 既存 `flow-implementer` に追加入力する。閉じていれば新規起動する |

## ユーザー向け次アクション提示

メインエージェントの最終応答では、次の項目を先頭付近に簡潔に示す。

- 現在のフェーズ:
- 状態:
- あなたが次にやること:
- 判断が必要な項目:
- 成果物:

Open の質問がある場合は、承認依頼を同時に出さない。
承認待ちの場合は、質問回答ではなく「承認」または「修正依頼」のどちらが必要かを明示する。
承認済みで次フェーズへ進んだ場合は、どのサブエージェントを起動したかを明示する。

## 最終報告

実行した段階に応じて、以下を簡潔に報告する。

- `design.md` のパスと承認状態
- `plan.md` のパスと承認状態
- `implement.md` のパスと完了状態
- 変更ファイル
- 検証結果
- 未完了事項・リスク
- 次に取るべきステップ

## 注意事項

- このスキルは、サブエージェントを使うための手順を定義する。自動的に常駐実行されるものではない。
- サブエージェントは明示的に起動されたときだけ動作する。
- 現在のセッションで新しいカスタムエージェントが認識されない場合は、Codex の再読み込みまたは新しいターンで再試行する。
