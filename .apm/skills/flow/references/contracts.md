# Flow 4.3.0 契約

## 正本

repositoryの`src/contracts/`に置くZod定義が機械契約の正本。
成果物と監査の入出力形式はこの文書とtemplateで参照する。CLIはZodを内蔵する。
契約の変更時はZod定義・この文書・templateを同時に更新する。
field間の整合性・状態遷移・file参照の検査は別のguardで実施する。
全fieldを必須とし、nullable fieldはnullを明記する。未知field、重複YAML key、旧schema、
別名status、並行する承認状態を拒否する。日時はtimezone付きISO 8601。
pathはfeature directoryからの相対pathで、絶対path、親directory参照、外へのsymlinkを拒否する。
SHA-256は保存完了後の全バイトから計算する。成果物自身のdigestを自身へ埋め込まない。

## 型と必須フィールド

次の表はfront matterとFlow stateの入力項目を列挙する。すべて必須で、省略や暗黙の補完はしない。
`text`は空でない文字列、`boolean`はtrue/false、`integer`は安全に表現できる整数、
`timestamp`はtimezone付きISO 8601文字列、`sha256`は小文字16進64桁。
`T[]`は型Tの配列で、空配列は明記する。`T|null`は値がない場合にnullを明記する。
`json-object`は文字列keyとJSON値を持つobject。名前付きobjectは未知fieldを拒否する。
`reference`などの型名は同じ表の契約を指す。表中のschema_versionは文字列の固定値。

| 契約 | 必須フィールド（field:型。区切りはセミコロン） |
| --- | --- |
| reference | path:text; revision:integer>=1; sha256:sha256 |
| option | id:text; text:text; impact:text |
| question | id:text; question:text; required:boolean; status:open/resolved; options:option[2..3]; recommendation:text; reason:text; assumptions:text[]; answer:text\|null |
| feedback-result | id:text; result:applied/unresolved; location:text |
| task | id:text; files:text[1..]; dependencies:text[]; completion:text; verification:text; verification_ids:text[1..]（重複不可） |
| verification-plan | id:text; command:text; required:boolean |
| handoff-check | id:scope/files/responsibilities/interfaces/errors/dependencies/completion/verification; status:ok/not_applicable/pending; reason:text |
| task-progress | id:text; status:pending/in_progress/blocked/completed; evidence:text |
| verification | id:text; command:text; status:passed/failed/not_run; required:boolean; reason:text |
| failure | kind:execution/contract; reason:text |
| judgment | id:text; question:text; background:text; options:option[2..3]; recommendation:text; reason:text; answer_format:text |
| finding/gate | id:text; classification:gate; resolution:revise/human_decision; decision_refs:text[]; target:text; problem:text; evidence:text; instruction:text; completion:text; judgment:judgment\|null |
| finding/scope_candidate | id:text; classification:scope_candidate; decision_refs:text[]; proposal:text; evidence:text; impact:text; recommendation:text |
| phase-artifact | schema_version:flow/phase-artifact-v2; artifact:design/plan; revision:integer>=1; status:needs_input/ready; producer:text; invocation_id:text; operation:create/revise/respond; updated_at:timestamp; inputs:reference[]; questions:question[]; feedback_results:feedback-result[]; tasks:task[]; verification_plan:verification-plan[]; handoff_checks:handoff-check[] |
| implement-artifact | schema_version:flow/implement-artifact-v2; artifact:implement; revision:integer>=1; status:in_progress/blocked/completed; producer:flow-implement/flow-artifact-sync; invocation_id:text; operation:execute; updated_at:timestamp; plan:reference; tasks:task-progress[]; verifications:verification[]; blocker:text\|null; commit:小文字16進40〜64桁\|null |
| review-source | phase:design/plan; review_stage:design/decision/final; review_cycle_id:cycle ID; target:reference; design:reference\|null; findings:finding[]; failure:failure\|null; schema_version:flow/review-source-v2; revision:1; source_id:text; source_kind:ai/human; status:passed/changes_required/blocked/unable; created_at:timestamp |
| phase-review | phase:design/plan; review_stage:design/decision/final; review_cycle_id:cycle ID; target:reference; design:reference\|null; findings:finding[]; failure:failure\|null; schema_version:flow/phase-review-v2; revision:1; mode:ai/human; status:passed/changes_required/blocked/incomplete; sources:reference[]; judgments:judgment[]; created_at:timestamp; source_paths:text[]（重複不可） |
| feedback-item | id:text; kind:change/answer; target:text; instruction:text; evidence:text; completion:text |
| phase-feedback | schema_version:flow/phase-feedback-v2; revision:1; phase:design/plan; target:reference; operation:revise/respond; created_at:timestamp; items:feedback-item[1..] |
| counter | automatic_revision:0/1; execution_retry:0/1; human_retry:0/1 |
| active-review | stage:design/plan_decision/plan_final; review_cycle_id:text; mode:ai/human; target:reference; design:reference\|null; path:text; scope_acknowledged:boolean; human_source:reference\|null |
| invocation | invocation_id:text; component:text; operation:text; inputs:reference[] |
| waiting | kind:writer_question/human_review/review_decision/scope_candidate/implement_blocker/replan; target:reference; question_ids:text[1..]; prompt_event_id:text |
| flow-state | schema_version:flow/flow-state-v2; feature_id:text; run_id:text; state_revision:integer>=1; phase:design/design_review/plan/plan_decision_review/plan_review/implement/completed/replanning; state:running/waiting_for_input/blocked/completed; artifacts:artifact参照map; reviews:review参照map; review_mode:mode map; counters:counter map; cycle_counters:cycle map; active_review:active-review\|null; active_invocation:invocation\|null; waiting:waiting\|null; blocker:text\|null; last_transition_event_id:text; updated_at:timestamp; pending_operation:create/revise/respond/execute/null; pending_feedback:reference\|null; replan:replan\|null（省略可） |
| audit-event | event_id:E-に続く6桁以上の数字; event_key:text; event_type:イベント一覧の名前; run_id:text; invocation_id:text\|null; occurred_at:timestamp; recorded_at:timestamp; actor:text; caused_by:text[]; data:イベント別object |
| audit-log | schema_version:flow/audit-log-v1; feature_id:text; created_at:timestamp |
| audit-view | schema_version:flow/audit-log-v2; feature_id:text; created_at:timestamp |
| replan | target_phase:design/plan; scope:text; reason:text; prompt_event_id:text; response_event_id:text\|null; checkpoint_event_id:text; approved:boolean; previous_phase:text; before:artifact参照map |
| checkpoint | checkpoint_id:text; tag:text; commit:SHA; parent:SHA; paths:text[]; artifacts:reference[]; audit_event_id:text; decision_event_ids:text[] |
| checkpoint-request | request_id:text; checkpoint_id:kebab-case; reason:text; paths:text[]; decision_event_ids:text[] |
| checkpoint-recover | request_id:text; create_missing_tag:boolean |
| checkpoint-restore | request_id:text; checkpoint_id:text; branch:text |

flow-stateのmapは次の固定keyをすべて持ち、未知keyを拒否する。

- artifacts: design、plan、implement。それぞれreferenceまたはnull。
- reviews: design、plan_decision、plan_final。それぞれreferenceまたはnull。
- review_mode: design、plan。それぞれaiまたはhuman。
- counters: design、plan_decision、plan_final。それぞれcounter。
- cycle_counters: design、plan_decision、plan_final。それぞれ0以上のinteger。

finding[]はgateとscope_candidateを混在できるが、decision reviewはgateだけ。
cycle IDの形式は`{design|plan-decision|plan-final}-cycle-{4桁以上の数字}`。
質問・選択肢・task・verification・handoff・feedback・finding・judgmentのIDの一意性、
statusと内容の整合性、参照の鮮度、保存pathは各契約の説明とCLIのguardで検証する。
本文の必須見出しは対応templateに従う。固定artifactの変更履歴sectionはdraft時に空にする。

## 配置と所有

```text
flow-spec/YYYYMMDD_feature-name/
├── flow-state.yml
├── audit.md
├── .flow/journal.md
├── inputs/request.md
├── artifacts/{design,plan,implement}.md
├── feedback/{design,plan}/feedback-0001.md
└── reviews/{design,plan-decision,plan-final}/cycle-0001/
    ├── review.md
    └── sources/{source-id}.md
```

state、feedback、human sourceのownerはFlow。
明示的な同期中はflow-artifact-syncがDesign・Plan・Implementと同期用feedbackのownerになる。
他ownerと同時実行せず、同期はstate・reviewを更新しない。
Design/Planは対応writer、implementはexecutor、観点sourceは担当reviewer、aggregateはhub。
CLIはownerの代わりに決まった形式で保存するだけで、内容を生成・評価しない。
監査の物理writerは共通CLIだけ。各componentは自分が扱った問題・重要判断・feedback対応・検証結果の要点だけを記録する。
`.flowctl.lock`は排他制御用であり成果物ではない。draft/requestは一時directoryまたはstdinを使う。

## phase-artifact-v2

Design/Planは固定path、status needs_input/ready、正のrevision、producer、invocation_id、operation、
updated_at、inputs、questions、feedback_results、tasks、verification_plan、handoff_checksを保持する。
Designのproducerはflow-design、Planはflow-plan。明示的な同期ではどちらもflow-artifact-syncを使える。
同期ownerは既存成果物だけを更新し、他ownerのactive invocation中にはpublishしない。Designのtasksは空。

questionsはid、question、required、status open/resolved、2〜3 options、recommendation、reason、
assumptions、answerを持つ。optionはid/text/impact。openのanswerはnull、resolvedは空でない文字列。
needs_inputは未回答の必須質問が1件以上、readyは未回答の必須質問とunresolved feedbackがない。
任意質問は重要判断の代わりに使わない。readyのPlanは1件以上のtaskを必要とする。

taskはid/files/dependencies/completion/verification/verification_ids。
Planはverification_planにid/command/requiredを保持し、taskからIDで参照する。
readyはhandoff_checksのscope/files/responsibilities/interfaces/errors/dependencies/completion/verificationが
okまたは理由付きnot_applicableであることを必要とする。Designはこれらを空にする。依存先IDの存在と循環を検証する。
feedback_resultsはid/result applied|unresolved/location。入力feedback全itemの処理結果を保持する。
PlanにDesignを渡す場合はinputsへpath/revision/digestを記録する。
単独Planの直接要求ではDesign参照を省略できるが、Flow内のPlan reviewにはDesignが必須。

### 変更履歴

本文末尾の`## 変更履歴`はpublisherが管理する。draftの同sectionは空にする。
更新ごとにrevision、日時、操作、変更内容、背景・理由、変更箇所、参照、状態変更を追加する。
過去履歴は保持し、訂正を新revisionへ記録する。読み取りや検証だけではrevisionを増やさない。
過去本文の完全復元は目的としない。

## implement-artifact-v2

status in_progress/blocked/completed、revision、producer flow-implementまたはflow-artifact-sync、invocation_id、operation execute、
updated_at、plan参照、tasks、verifications、blocker、commitを持つ。
task進捗はid/status pending|in_progress|blocked|completed/evidence。
verificationはid/command/status passed|failed|not_run/required/reason。
blockedはblocker必須。他statusのblockerはnull。
blocked記録は不正なPlanを修復せず、呼出側が指定した参照と停止理由を保存できる。
開始・再開・完了には有効なready Planとの一致が必要。
completedは全Plan taskがcompleted、Planに指定した検証結果がすべてあり、必須検証がpassed、commit SHAが記録済み。
検証commandとrequiredはPlanの値から変更できない。
commitが実際に対象変更を含むことと検証結果の真実性はexecutorが確認し、証拠を監査へ記録する。
通常executorにとってcompleted成果物は終端。同期ownerだけは既存のcompletedも更新できる。
同期のpublishではstatus blocked、commit null、全tasks pending、全verifications not_runを必須とし、
旧完了証拠を新Planへ流用しない。変更前の証拠は変更履歴・監査へ残す。
in_progress/blockedの進捗変更もrevisionと変更履歴を更新する。
同期はFlow stateを変更しない。旧revisionを参照するstate・reviewはstaleとして再利用しない。

## review-source-v2 / phase-review-v2

sourceはrevision 1、phase、review_stage design|decision|final、review_cycle_id、target、design、
source_id、source_kind ai|human、status、findings、failure、created_atを保持する。
Designはdesign:null。Planは入力Design参照が必須。
cycle IDはdesign-cycle-0001、plan-decision-cycle-0001、plan-final-cycle-0001。
cycle番号はstageごとに増やし、再試行・mode変更でも再利用しない。

AIの必要sourceはDesignがrequirementsとquality-risk、decisionがdecision-quality、finalがtask-readiness。
Humanはhuman 1件だけ。同cycleで混在させない。

findingはgate/scope_candidate。
gateはid/classification/resolution revise|human_decision/decision_refs/target/problem/evidence/instruction/completion/judgment。
human_decisionにはjudgment必須、それ以外はnull。
scope_candidateはid/classification/decision_refs/proposal/evidence/impact/recommendation。
judgmentはid/question/background/options/recommendation/reason/answer_format。
現在scopeの成立に必須な問題だけをgateとし、追加scopeはstatusから除外する。
decision reviewではscope_candidateを生成しない。

sourceのstatusはfailureありならunable、human_decision gateありならblocked、revise gateありなら
changes_required、gateなしならpassed。failureはkind execution|contract/reason。

aggregateはphase/review_stage/review_cycle_id/target/design/findings/failureをsourceと共有し、
schema_version、revision、mode、status、sources参照、source_paths、judgments、created_atを持つ。
source_idとsource_kindはaggregateへ持ち込まない。
source_pathsには欠落・不正sourceも含めた必要path全部を保持し、sourcesには検証済みsourceだけを保持する。
review-checkがstatus、参照、findings、failure、judgmentsを算出する。
sourceのfinding IDとjudgment IDはsource-id:IDへ名前空間化する。
契約不一致/欠落/unableがあればincomplete、その後blocked、changes_required、passedの順。
複数sourceで契約不一致と実行障害が混在する場合はcontractを優先する。sourceの読込順で分類を変えない。
本文の重複説明を整理できるが機械的なfindingsと結論は削除・変更しない。
各cycleのsourceとaggregateは一度だけpublishし、上書きしない。

## phase-feedback-v2

revision 1、phase design|plan、target参照、operation revise|respond、created_at、itemsを保持する。
itemはid/kind change|answer/target/instruction/evidence/completion。
reviseはchangeだけ、respondはanswerだけ。回答itemのtargetは提示済み質問ID。
review主体やsource固有のmetadataはwriterへ渡さず、対応関係はauditへ記録する。
feedbackは発行後不変。古いtargetへ再適用しない。
inputsは今回の操作へ渡された入力だけを保持し、過去feedbackの参照は変更履歴と監査へ残す。
feedbackにはstatusを設けず、監査の状態欄もnullにする。

## flow-state-v2

phaseはdesign/design_review/plan/plan_decision_review/plan_review/implement/completed/replanning。
stateはrunning/waiting_for_input/blocked/completed。
completed phase/stateは同時に成立し、実行・review・回答待ちがない。
Planの質問はdecision review通過後に提示するためplanにwaiting_for_inputを置かない。
waiting_for_inputはwaiting必須、blockedはblocker必須。

artifactsとreviewsは現在の参照を持つ。review_modeはdesign/planでai|human。
countersはdesign/plan_decision/plan_finalごとのautomatic_revision/execution_retry/human_retryを0/1で持つ。
cycle_countersはstageごとの発行数。counterをcycle/revision更新でリセットしない。
active_reviewはstage/review_cycle_id/mode/target/design/path/scope_acknowledged/human_source。
Flow内のhuman hubは、人間回答を記録してhuman sourceを登録した後だけ起動する。
active_invocationはinvocation_id/component/operation/inputs。
waitingはkind/target/question_ids/prompt_event_id。
pending_operationとpending_feedbackは次writerへ許可した操作とfeedback。
next_actionは保存せず、検証済みphase/stateから導く。

### 遷移条件

| 操作 | 条件 | 結果 |
| --- | --- | --- |
| start_review design | Design ready | design_review、新cycle |
| advance design_review | 同一対象のpassed、追加scope処理済み | plan/create |
| start_review plan_decision | Plan needs_input、Design参照一致 | plan_decision_review |
| wait review_decision | decision passedまたはreview blocked | 提示済み質問への回答待ち |
| answer | 対応する人間回答、正規化feedback | writer/respond |
| start_review plan_final | Plan ready、Design参照一致 | plan_review |
| advance plan_review | 同一Plan/Designのpassed、追加scope処理済み | implement/execute |
| advance implement | Plan一致、Implement completed | completed |
| revise | changes_required、AIなら自動修正未使用 | writer/revise、事前にcounter消費 |
| retry | incomplete/execution、当該modeのretry未使用 | 新cycleの開始を許可 |
| set_mode自動 | AI自動修正後もchanges_required、またはretry後も実行障害 | humanへ切替 |
| block | 契約不一致・実行継続不能など | 停止理由と再開条件を保存 |
| resume | blocked、解消根拠を確認 | running、phaseを飛ばさない |

start_invocationで起動を予約し、完了後finish_invocationでownerの出力を登録する。
Flow内のwriterは承認したpending_operation/feedbackだけを使う。
reviewのpassedは評価時・移行時のdigest一致を必須とする。
blockedの採用回答変更は人間へ戻す。PlanでDesign/scope変更が必要なら人間承認付き再計画へ進む。

## audit-log-v2 と内部journal

`audit.md`は`flow/audit-log-v2`の事実履歴。front matterはschema_version/feature_id/created_at。
CLIが`.flow/journal.md`から決定的に生成する。手動編集・自由な追記は行わない。
一件は日時・フェーズ・イベント名・元event IDの見出し、事実、必要なら理由・参照だけを持つ。
フェーズはrunごとのflow.started/flow.transitionedから取得し、単独leafで不明ならstandaloneを示す。
発生日時はoccurred_atを使い、保存日時・digest・snapshot・run/invocation IDは本文へ展開しない。

```markdown
## 2026-10-31T14:20:00+09:00 — implement — 決定 (E-000042)

- 事実：必須security検証の失敗により完了を保留する。
- 理由：未解消のHighが2件残っている。
- 参照：artifacts/implement.md r18
```

記録対象はフェーズ移行、回答待ち・停止・再開、問題と解消、review結果、feedback、
重要な決定・承認、再計画、タスク単位の検証結果。
読取・検索・通常command開始、TDDの各Red/Green、説明だけの対話はイベントを送らない。
詳細は既存成果物へ残し、監査には要点とpathを記録する。判断依頼と原文回答は一度だけ保存し、
再利用はevent IDで参照する。完了後も新しい課題・変更要求・決定訂正だけを追記する。

viewにはflow.started、意味のあるflow.transitioned、invocation.failed、action.completed、
decision.made、interaction.presented/received、feedback.created、review.completed、
review.mode_changed、retry.scheduled、flow.blocked/resumed、保存中止を表示する。
aggregateのartifact.updatedからreview結果を表示し、同一参照のreview.completedは重複表示しない。
prepared、通常のartifact保存、invocation開始/終了、checkpointの内部処理は表示しない。
完了はcompletedへのフェーズ移行で表示し、flow.completedを重複表示しない。
通常操作は開始/完了の対を要求せず、重要な結果だけをaction.completedへまとめる。
同期全体のaction.startedだけは中断追跡の内部記録として保持し、viewには結果を表示する。

`.flow/journal.md`は従来の`flow/audit-log-v1`を使うCLI専用の追記型正本。
復旧、request再送の重複防止、因果参照、state snapshot照合はjournalだけを参照する。
両fileをGit保存とcheckpointへ含める。CLIはjournalをfsyncした後viewをatomic置換する。
view生成失敗は操作失敗として返し、次のmutationを拒否する。resume-check --recoverで
journalからviewを再生成し、保存の未完了も従来どおり照合する。外部操作は再実行しない。
validate audit.mdはjournalの構造とviewの完全一致を検証する。
旧audit.mdは自動読替えしない。明示的なaudit-migrateが全eventを検証して原本のbytesを
journalへatomic保存し、その後viewを生成する。途中中断と同じcommandの再送でも原本を上書きしない。
既存イベントの分類を推測して削除しないため、移行済みの過去の通常操作はviewにも残る。

### 内部journalの形式

front matterはschema_version/feature_id/created_atだけ。本文は`# 監査ログ`に続き、
`## E-000001 — event.type`と1つのyaml blockを追記する。自由な段落を挟まない。
共通fieldはevent_id/event_key/event_type/run_id/invocation_id/occurred_at/recorded_at/actor/caused_by/data。
event_keyは送信側の一意key、event_idは記録処理が付ける連番。
occurred_atは実際の発生時刻、recorded_atは保存時刻。並列の因果関係はcaused_byで表す。
人間回答のactorはhuman。Flowが原文を一度記録する。提示/受領をinteraction_idとprompt_event_idで結ぶ。
記録するのは事実・結論・根拠であり内部思考過程ではない。

### イベント一覧

dataは次の表のfieldをすべて持ち、未知fieldを拒否する。型は「型と必須フィールド」に従う。
`before_sha256`・`after_sha256`などtext型のdigest欄も、送信時は実測SHA-256を指定する。
文字列配列のevidenceは根拠のpathや識別子、reference配列のevidenceは成果物参照を保持する。

| イベント | dataの必須フィールド（field:型） |
| --- | --- |
| flow.started | state:flow-state; request_path:text |
| flow.transition_prepared | action:text; before_sha256:text; after_sha256:text; after:flow-state; evidence:reference[]; request_sha256:sha256; before:flow-state; arguments:json-object |
| flow.transitioned | prepared_event_id:text; action:text; before_revision:integer>=1; after_revision:integer>=1; from_phase:text; to_phase:text; from_state:text; to_state:text; evidence:reference[] |
| flow.transition_aborted | prepared_event_id:text; reason:text |
| artifact.update_prepared | target_path:text; before_sha256:text\|null; after:reference; operation:text; change:text; reason:text; sections:text[]; references:text[]; old_status:text\|null; new_status:text\|null; request_sha256:sha256 |
| artifact.updated | prepared_event_id:text; artifact:reference |
| artifact.update_aborted | prepared_event_id:text; reason:text |
| invocation.started | component:text; operation:text; inputs:reference[] |
| invocation.completed | outputs:reference[] |
| invocation.failed | reason:text; evidence:text[] |
| action.started | action:text; detail:text |
| action.completed | action:text; result:text; evidence:text[] |
| decision.made | decision:text; rule_id:text; reason:text; evidence:text[]; assumptions:text[] |
| interaction.presented | interaction_id:text; kind:text; target:reference; question_ids:text[]; text:text |
| interaction.received | interaction_id:text; prompt_event_id:text\|null; text:text |
| feedback.created | feedback:reference; origin_event_ids:text[]; mappings:feedback-mapping[] |
| review.completed | review:reference; status:text |
| review.mode_changed | stage:design/plan_decision/plan_final; from:ai/human; to:ai/human; reason:text |
| retry.scheduled | stage:design/plan_decision/plan_final; counter:execution_retry/human_retry/automatic_revision; used:1; reason:text |
| flow.blocked | reason:text; resume_condition:text |
| flow.resumed | reason:text; evidence:text[] |
| flow.completed | implement:reference |
| checkpoint.prepared | checkpoint:checkpoint; request_sha256:sha256 |
| checkpoint.completed | checkpoint:checkpoint |

feedback-mappingはitem_id:text、origin_ref:textのobject。item_idはfeedback item ID、
origin_refは元の回答・指摘を識別できる参照を保持する。origin_event_idsは対応する監査event ID。
interaction.presentedのkindはwaitと結ぶ場合、waiting.kindのいずれかを使う。
人間からの自発的feedbackはprompt_event_id:nullで記録する。
caused_byはすでに記録されたevent IDだけを指定し、同じevent_keyで異なる内容を再送しない。

CLI専用の予約eventはflow.started、flow.transition_prepared、flow.transitioned、
flow.transition_aborted、artifact.update_prepared、artifact.updated、artifact.update_aborted。
これらはinit/publish/transition/resume-checkが記録し、audit-appendへの直接送信は拒否する。
invocation.started/completed/failedとFlow完了時のflow.completedはtransitionが通常自動記録する。
同じ事実を別のevent_keyで重複記録しない。
その他のeventは各componentがaudit-appendで記録する。review.mode_changedなどは自動生成されず、
対応するtransitionの結果を確認してcomponentが記録する。復旧時も外部行動の完了を推測しない。

例: 利用者の回答を記録するaudit-appendのrequest。

```yaml
event_key: response-unique-id
event_type: interaction.received
actor: human
run_id: run-001
invocation_id: null
occurred_at: '2026-10-10T12:00:00+09:00'
caused_by: [E-000010]
data:
  interaction_id: question-001
  prompt_event_id: E-000010
  text: Aを採用してください
```

CLIがevent_idとrecorded_atを付けて`.flow/journal.md`へ追記し、audit.mdを生成する。提示に対する回答ではprompt_event_id、
interaction_id、run_idが先行するinteraction.presentedと一致することを確認する。

### 保存と中断

publishとtransitionは、変更前/変更後digestを含むpreparedイベント、対象fileのatomic置換、
completedイベントの順で処理する。stateの遷移イベントは変更前後のsnapshotと操作引数を保持する。
単一lockで監査と保存を直列化し、request IDによる再送を重複実行しない。
未完了preparedが残れば次のmutationを拒否する。
resume-check --recoverは対象が保存後digestなら完了を記録し、保存前digestなら中止を記録する。
保存済みtransitionに対応するinvocation.started/completed/failed、flow.completedの欠落も検出する。
resume-check --recoverまたは元のtransition requestの再送で、保存済み引数から監査だけを補完する。
補完eventのoccurred_atは元の遷移時刻、recorded_atは補完時刻とする。外部操作は再実行しない。
欠落監査を解消するまでは別の保存・監査・状態更新を拒否する。invocation IDは保存済み開始遷移でも使用済みと判定する。
両方と不一致なら自動修復せず停止する。中止した要求の再実行には新request IDを使う。
末尾が途中のjournalは読み飛ばさず拒否し、原本を保存して人間へ修復を求める。
外部操作の完了は推測しない。active invocationは実態と証拠を確認して登録または停止する。
履歴は訂正イベントで補正する。暗号学的な改ざん防止や複数fileの完全transactionを保証しない。

## 再計画とチェックポイント（4.3.0）

request_replanは進行中invocationがないこと、現在参照とcheckpointの一致、現在stateより後の
checkpoint監査地点、kind replanの提示eventを検証し、phase replanningへ移す。
completedからの通常操作は終端のまま、request_replanだけを許可する。
begin_replanは提示と結び付くhuman回答とapproval approveを要求する。cancel_replanは未承認時だけ
human回答を根拠に元のstateを復元し、state revisionと監査は前へ進める。
finish_replanは承認後のsync保存event、最新入力参照、対象revisionの増加を検証する。
Planへの戻りではDesignを変更できない。既存成果物の削除・未作成成果物の追加は行わない。
既存Implementは最新Planに対するblockedへ同期する。必要なreview参照をnullにし、cycleとcounterを維持する。
replanは通常stateでは省略またはnull。replanning中はcontext必須でactive invocation/reviewはnull。
承認前はwaiting_for_input、承認後はrunning。resume-checkは承認済み同期中だけ旧artifact参照を
一時的に許容し、通常再開を指示せずattentionを返す。

checkpointは既存Git HEADを親とした専用commitとlocal tagで保存する。現在のHEAD・indexは変更しない。
feature directoryと明示pathsの内容を保存し、lockは除く。無関係な作業fileの未保存変更は含めない。
監査の保存地点はaudit_event_idで示し、commit/tag結果を後続eventへ追記する。
checkpoint.prepared/completedはCLI専用。直接audit-appendせずcheckpoint commandが保存する。
再送はfingerprintを照合し、未完了ならcheckpoint-recoverでcommit/tagを検査する。
未完了checkpointがあれば他mutationを拒否し、resume-checkは外部操作を繰り返さずattentionを返す。
未作成tagの作成はcreate_missing_tag:trueで明示した場合だけ行う。
checkpoint-restoreは新しいbranchだけを作り、checkout・reset・push・Flow再開はしない。
過去snapshotの参照はGit commit内のbytesと照合し、現在成果物のrevision変更で無効扱いにしない。
