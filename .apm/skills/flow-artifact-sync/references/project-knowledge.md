# プロジェクト知識の適用と育成

## 正本と責務

正本は適用範囲のAGENTS.mdと、projectの文書運用に従う参照先。
別repository・外部文書serviceも対象であり、ローカルMarkdownへ配置を固定しない。
AGENTS.mdは短い入口、詳細はprojectで定めた正本へ置く。参照不能時に代替正本を作らない。
専用agentのflow-project-knowledge-agentは知識スキルで更新判断・実装と文書の乖離チェック・
採用済み文書更新を担当する。writer/executorは自身の成果物への適用、
専用reviewerは独立評価、hubは収集・機械集約、Flowは対話・通知・再計画を所有する。
同期skillは他skillなしで同じ原則を使い、変更が知識の適用に及ぼす影響も反映する。

## project_knowledge

phase-artifact-v2、implement-artifact-v2、review-source-v2、phase-review-v2の追加field。
既存v2成果物では省略可能とし、省略を確認済み・適合へ読み替えない。
新規作成・改訂時のwriter/executorと、project-rules sourceでは記録する。
他のAI sourceはこのfieldを持たず、human sourceは人間の確認内容から同じ形式へ正規化する。
新しい中継用request/result契約は作らない。

```yaml
project_knowledge:
  discovery: 対象fileに適用するAGENTS.mdとそこからの参照を確認した範囲・結果
  completeness: complete # complete | partial
  documents:
  - id: DOC-001
    location: /absolute/project/AGENTS.md # または正本のURL/service URI
    scope: project全体
    status: available # available | unavailable
    sha256: '0000000000000000000000000000000000000000000000000000000000000000'
    version: null # 外部serviceの版IDなど、取得できる場合
    reason: 開発規約の入口を確認。必須と推奨の区別を参照
  checks:
  - id: RULE-001
    document_ids: [DOC-001]
    rule: 公開APIの互換性を維持する（出典の該当見出しも示す）
    requirement: required # required | recommended | context | assumption | exception
    applicability: 今回変更する公開APIに適用
    status: compliant # compliant | non_compliant | not_applicable | unverifiable
    evidence: artifacts/plan.mdの互換性維持手順・検証タスクを確認
    finding_ids: [] # source内のfinding ID。writer/executorでは空
```

documents/checksのIDは各記録内で一意。document_idsは存在するdocumentだけを参照する。
availableは取得内容のSHA-256を必須とし、unavailableはsha256:nullと理由を記録する。
未取得資料を根拠にcompliantとしない。versionは取得版を補足し、digestの代わりにはしない。
探索して独自ルールがなかった場合はdiscoveryに根拠を記録し、空配列を許可する。
空配列だけでは探索完了の証拠にならない。CLIは探索・意味判断の十分性までは保証しない。

reviewでpartialならfailureを必須とする。必須項目のnon_compliant/unverifiableには
対応gateまたはfailureが必要。推奨・仮説の不適合だけでgateを作らない。
sourceが評価不能の場合はfieldの省略を許可するが、確認できた範囲はできるだけ残す。
findingsのない適合項目・対象外項目も記録する。gate/status算出は既存規則に従う。
review-checkはproject-rulesまたはhumanの記録をaggregateへ保存し、finding_idsをsource IDで
名前空間化する。hubはこのfieldも機械結果から変更しない。
本文には「プロジェクト知識」の表で出典・確認結果・根拠・例外を読みやすく記載する。
「知識の更新候補」は別の本文項目とし、review statusや必須質問へ混入させない。

## 鮮度確認

評価前・source保存前・集約前・phase移行前に、適用範囲と正本の参照を確認する。
CLIはavailableなローカル絶対pathの内容をsource保存時、review-check、passedの利用時に
digestで照合する。相違・欠落なら旧reviewを新しい文書への適合根拠にしない。
外部URIをCLIからfetchしない。Flow/hub/単独review呼出側が利用可能なconnectorで現在版を
再確認する。版IDまたは取得内容のdigestが変わったら旧reviewを再利用せず、影響を確認する。
再確認できない必須資料は評価未完了として扱う。文書の版番号からdigestを捏造しない。
進行中の文書変更は、影響に応じて新cycleでの再評価または人間承認付き再計画へ接続する。
変更だけでretry上限をリセットせず、既存の契約不一致・停止・再計画の経路を使う。

## 通知と非同期feedback

Flowはreview結果を登録した後、phase移行前にチャットへ確認概要を表示する。
確認した主要ルール、適合・不適合・対象外・確認不能、例外・未確認事項、詳細Markdownへのlinkを含める。
passedの通知だけではwaitを作らない。質問・gate・既存scope候補の扱いは通常契約に従う。
Implementの報告にも規約適用と検証結果を含める。単独利用では各呼出側が結果を表示する。

利用者の新しいfeedbackは受領時点の成果物・revision・phaseと照合する。
古い通知への返信も無視せず、原文をinteraction.receivedへ一度記録して現在への影響を確認する。
- 説明補足だけなら対応の要点を記録し、成果物を変える必要がある場合だけownerへ渡す。
- 現在工程の許可範囲で直せる場合は通常feedback・修正・再検証を使う。
- 要件・制約・受け入れ条件への影響はDesign、HOW・タスク・検証条件への影響はPlanを戻り先とする。
- 将来の文書運用だけに関わる場合は知識更新候補とし、現在phaseを戻さない。

進行中invocationは実態を確認し、安全な区切りで保存・finish/failしてから切り替える。
上流変更やcompleted後の成果物変更は既存の人間承認付き再計画を使う。
戻り先・修正範囲の明示承認は再利用できるが、感想を承認へ変換しない。
旧review・完了証拠を流用せず、cycle/retry上限を保持する。実行主体同士で同時更新しない。

## 更新判断・乖離チェックの委譲と通知

Flowは次の契機でflow-project-knowledge-agentへ更新判断・乖離チェックを明示委譲する。

- 決定事項が確定したとき。利用者回答の採用や、許可範囲内で確定した実装方針も含む。
- 人間feedbackを受領したとき。修正不要の可能性がある場合も委譲する。
- AIレビュー指摘を登録したとき。gateとscope_candidateを区別して渡す。

Flowは進行中操作を安全な区切りで保存してから、対象project・対象範囲、契機の原文または
既存event・finding参照、現在成果物のpath・revision・digest、関連する実装差分・文書参照を渡す。
存在しない成果物や実装は未作成と伝える。新しい中継request/result契約や状態fieldは作らない。
同じ契機の複数指摘はまとめて委譲できる。Flowが先に更新不要と判断して委譲を省略しない。
Human modeでもこの委譲は行い、review sourceの収集・判定と混ぜない。

専用agentはflow-project-knowledgeの判断手順で、ルール・ナレッジへの反映要否と、
実装・文書の乖離への対応を別々に返す。文書更新・実装修正・判断待ち・同期不要・確認不能を区別し、
実装やAI指摘を無条件に正本としない。確認だけの操作では実装・文書・Flow成果物を変更しない。
Flowは結果を受け取り、対象の決定事項・feedback・指摘、反映要否と理由、乖離と同期要否、
根拠・未確認事項をチャットへ表示する。更新不要・提案なしでも具体的な理由を表示する。
未解決判断は現時点の提案見送り理由として示し、修正・判断が固まった時点で変更範囲を再委譲する。
更新案は修正・判断が固まった時点で提示する。工程・全体完了時には未確認の候補や実装変更を
追加確認へ渡し、未報告の結果も補う。根拠や判断が変わっていない報告済みの内容は繰り返さない。
子agentを起動できない場合も確認不能の理由と未確認範囲を表示し、更新不要・確認済みと扱わない。
必要な委譲は再開時に未処理の契機と現在の成果物を照合して行い、完了済みの外部更新は再実行しない。
writer/reviewer/executorは候補を自分の成果物へ残し、利用者へ直接提案・質問しない。
単独利用では呼出側が同じタイミングで知識スキルを利用できる。

Flowは正本への具体的な差分と採用範囲をチャットへ示す。採否待ちだけで通常進行を止めない。
提案と採否の要点は既存actionイベントで記録し、通常の探索や提案なしの判断は監査しない。
文書のreview・保存はそのprojectの運用へ接続し、利用者が採用した範囲だけ専用agentが知識スキルで更新する。
「今回直す」と「今後の規約にする」を区別し、既に明示された更新を再確認しない。
この確認はreviewの代替ではなく、review statusやretry上限を変えない。任意候補の採否待ちだけで
進行を止めず、実装の必須要件違反や上流変更が必要なら通常修正・再評価・人間承認付き再計画へ接続する。
更新後は現在成果物への影響も照合し、必要なら再計画・再reviewを行う。
