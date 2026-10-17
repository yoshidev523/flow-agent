# flowctl 操作

## 実行環境

Node.js 22以上だけを必要とする。ZodとYAML処理は単一のflowctl.jsへ同梱する。
利用側ではnpm install、ビルド、Python、schema fileの読み込みは不要。
repositoryでは`.apm/skills/flow/scripts/flowctl.js`、配置後はこのFlow skillのscriptsを使う。
他leafからは隣接する`../flow/scripts/flowctl.js`へ参照する。
独立したflow-artifact-syncには同じCLI・契約・templateを同梱し、そのskill内だけで利用できる。
同期ownerのpublishはphaseを制限せず、active invocationとの同時更新だけを拒否する。
同期はstateを更新せず、旧参照がstaleになったことを呼出側へ報告する。
Flowは人間承認付きreplanning中に同期し、finish_replanで最新参照を登録する。

```sh
node {flow-skill-dir}/scripts/flowctl.js --root flow-spec/YYYYMMDD_feature-name init --request /tmp/init.yml
```

全commandはstdoutへJSONを返す。成功は`ok:true,result`。
終了codeは0成功、2条件不成立・stale・上限、3契約不一致、4保存/入力file障害。
command失敗時は利用者へ理由を示し、成功として次phaseへ進まない。
requestはJSONまたはYAML file。`--request -`ならstdin。永続phase境界にrequest fileを追加しない。

## init

request: request_id、feature_id、run_id、text。
要求をinputs/request.mdへ保存し、Flow stateと監査を初期化する。既存featureを上書きしない。
単独leafのpublish/audit-appendは監査だけを初期化でき、Flow stateを作らない。

## validate

```sh
node {flowctl} --root {feature_dir} validate artifacts/plan.md --references
node {flowctl} --root {feature_dir} validate audit.md
```

既定は構造検証。--referencesは現在の入力参照も検証する。
消費済みfeedbackは保存時の変更前digestを監査へ照合する。
過去cycleのreviewやfeedbackは現在参照と一致しないことがあるため、歴史資料として構造検証する。
flow-state.ymlの--referencesはresume-check相当。

## publish

request fieldは次をすべて指定する。

```yaml
request_id: publish-unique-id
run_id: run-001
target_path: artifacts/design.md
expected_revision: 0
expected_sha256: null
document: |
  {front matterと本文。変更履歴sectionは空}
change: 初版を作成
reason: 開始要求を整理したため
sections: [目的, 要件]
references: []
```

既存fileの更新では現在revisionとdigestをexpectedへ指定する。
Design/Planはcreateが初版だけ、revise/respondには対応feedbackをinputsへ指定する。
CLIがrevision、updated_at、変更履歴を管理する。別revision fileを作らない。
review/feedbackは初版revision 1だけをpublishし、上書きしない。
feedbackはtarget_pathを`feedback/{phase}/next`にするとlock内で次番号を割り当てる。
返却artifact参照をFlowのfinish_invocationへ渡す。

## review-check

request: stage design|plan_decision|plan_final、target参照、design参照またはnull、
review_cycle_id、mode ai|human、source_paths。
必要source全部のpathを指定し、欠落pathも含める。
返却値へschema_version flow/phase-review-v2、revision 1、mode、created_atを加え、
本文をhubが作成してpublishする。返却された機械fieldを変更しない。

## audit-append

request: event_key、event_type、actor、run_id、invocation_idまたはnull、
occurred_at、caused_by、data。
dataは[contracts.mdの監査イベント契約](contracts.md#イベント一覧)に一致させる。
CLI専用の予約eventはflow.started、flow.transition_prepared、flow.transitioned、
flow.transition_aborted、artifact.update_prepared、artifact.updated、artifact.update_aborted。
これらはaudit-appendへ直接送信できない。invocation.*はtransitionが通常自動記録する。
その他の行動は、操作前にstarted、実施後にcompletedを記録する。
AIの自動判断はdecision.made、人間の提示/回答はinteraction.presented/receivedを使う。
feedback.createdでは原文イベントとitem IDの対応を記録する。

## transition

共通requestはrequest_id、expected_state_revision、action。
以下以外のfieldを受理しない。Flowだけが呼び出す。

| action | 追加field |
| --- | --- |
| start_invocation | invocation_id、component、operation、inputs |
| finish_invocation | invocation_id、outputs |
| fail_invocation | invocation_id、reason |
| start_review | stage |
| wait | kind、prompt_event_id |
| answer | response_event_id、feedback_path、source_path、scope_disposition |
| revise | feedback_path |
| retry | なし |
| set_mode | stage、mode、reason、origin_event_id |
| advance | なし |
| block | reason、resume_condition |
| resume | reason、evidence |
| request_replan | prompt_event_id、target_phase design/plan、scope、reason、checkpoint_event_id |
| begin_replan | response_event_id、approval approve |
| cancel_replan | response_event_id |
| finish_replan | artifacts（design/plan/implementの参照またはnull） |

start_reviewの返却active_reviewにcycle ID、出力path、対象、modeがある。
waitのkindはwriter_question/human_review/review_decision/scope_candidate/implement_blocker。
先に提示全文を監査へ保存し、そのevent IDをwaitへ渡す。
answerは先に人間回答の原文を監査へ保存する。
質問への回答は対応promptを参照する。利用者からの自発的feedbackはprompt_event_id:nullで記録できる。不要な追加fieldはnullを指定する。
writer/review判断への回答はrespond feedback、human_reviewはhuman source、
scope候補はexcludeならfeedbackなし、adoptならrevise feedbackを指定する。
set_modeの利用者指定は人間回答event ID、上限による自動切替はorigin_event_id:null。

各遷移はpreparedへ変更前後stateと操作引数を、transitionedへ適用したactionと証拠を記録する。
自動修正・retryのcounterは起動前に消費する。再送でも増えない。

## resume-check

```sh
node {flowctl} --root {feature_dir} resume-check
node {flowctl} --root {feature_dir} resume-check --recover
```

stateと監査snapshot、現在の参照、未完了preparedを検査する。
--recoverは保存の前後digestが一致する場合だけ監査を補完する。
保存済みtransitionの付随監査eventの欠落も検出し、--recoverまたは元のtransition request再送で補完する。
欠落がある間は別のmutationを拒否する。補完ではstate revisionを増やさない。
外部操作、writer、commit、testを再実行しない。
active invocationが残る場合はattentionを返す。実態を確認してfinishまたはfail_invocationする。

## 排他制御

ローカルfile system上でprocess間の排他制御を行う。`.flowctl.lock`はPIDとtokenを持つ内部file、
`.flowctl.lock.recovery`は取得・死んだownerの回収を直列化する内部directory。
ownerが終了していれば次のCLIが回収する。取得処理中の中断でrecovery directoryが残った場合は、
CLIが動作していないことを確認してdirectoryだけを除去する。保存の未完了はresume-checkで照合する。
共有network file systemと複数PCによる同時操作は対象外。
Windowsではdirectory fsyncを行えない。
旧Python版の空のlock fileが残っている場合は、旧CLIが動作していないことを確認して除去する。

## checkpoint-create / checkpoint-recover / checkpoint-restore

Gitが必要。Git repository内のfeature directoryと既存HEADを対象にする。
checkpoint-createのrequestはrequest_id、checkpoint_id（kebab-case）、reason、paths（repo相対）、
decision_event_ids。feature directoryは自動で保存し、pathsに今回の実装fileだけを指定する。
機密を含むfileを対象にしない。feature directoryの成果物を保存するためignore指定でも含める。
CLIは一時indexで専用commitを作り、flow/{feature_id}/{run_id}/{checkpoint_id}にlocal tagを付ける。
現在HEAD・index・作業fileは変更しない。commit前の監査地点をsnapshotに含め、結果は後続監査へ記録する。
失敗を通常成功として進めない。同じrequest再送は完了確認だけを行い、未完了は明示復旧する。

checkpoint-recoverは元のrequest_id、create_missing_tag（boolean）。falseならtag存在と整合だけを確認する。
未作成tagを作る必要がある場合だけtrueを明示する。既存tagの変更・削除は行わない。
checkpoint-restoreはrequest_id、checkpoint_id、branch。指定commitへ新しいbranchだけを作る。
中断後は同じrequestでbranchのcommitを照合して監査を補完できる。checkout/reset/pushは行わない。

## 応答終了前の保存commit

Flowは各応答の終了前に、監査・state・成果物を保存した後、対象feature directoryの成果物と
起動時に補完した`.gitattributes`を現在のbranchへ通常commitする。回答待ち・停止・完了後も対象。
対象はFlow自身のタスクに限定し、無関係な変更や一時fileを混入させない。保存失敗は応答で報告する。
この手順はFlowの責務で、独立したleafやflow-artifact-syncの単独実行には適用しない。
これはFlowが行うGit操作であり、CLI commandやcheckpointの副作用としては追加しない。
この保存commitと付随する差分確認・stage・結果確認は監査対象から除外し、Git履歴を証跡とする。
保存結果をaudit.mdや成果物へ追記しない。実装commitとcheckpoint操作は引き続き監査対象とする。

## 完了後の監査

completedでもaudit-appendは利用できる。タスクに関係する質問・調査・訂正を記録し、説明だけなら
stateを変更しない。過去の対話の補記では再構成であること、証拠、元日時の不明をdataに明示する。
occurred_atは補記操作の実測日時、recorded_atはCLIが付ける。元日時を推測しない。

checkpoint.preparedが未完了なら他のmutationを拒否する。resume-checkはcheckpoint-recoverを案内し、Git操作を再実行しない。
