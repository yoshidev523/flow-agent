# 共通の割り込み管理

Flow内の非同期feedbackとプロジェクト知識の確認・採用済み更新を、phaseと直交する割り込みとして扱う。
独立したleafの利用にはFlow stateを要求しない。phase境界のrequest/result成果物は追加しない。

## 受付と一時停止

1. 原文・決定・レビュー指摘の元eventを先に保存する。自発的feedbackは
   interaction.received、actor human、prompt_event_id null。通常質問の回答は既存answerを使う。
2. enqueue_interruptで一意ID、kind、元event ID、理由、parent_idを登録する。
   kindはasync_feedbackまたはproject_knowledge。同じ種類・元event集合の重複受付を拒否する。
   既存の更新承認を再利用する場合は、その原文の人間回答eventも受付時のorigin_event_idsへ含める。
3. 実行中invocationは出力を保存してfinish_invocation、または実態を確認してfail_invocationする。
   queuedがある間は通常の新規操作を始めない。実行中の操作を強制終了しない。
   ただし未消費pending feedbackがある場合は、既に受け付けたwriterのrevise/respond/executeだけを先に完了する。
   その起動にも既存のcomponent・operation・feedback参照の検証を適用する。失敗後は実態と原因を確認してresumeする。
   追加指示で既存操作の継続が不適切なら実行を強制せず、進行中invocationがないことを確認してblockまたは人間承認付きrequest_replanへ進む。
4. pending feedbackの消費を確認してから受付順にbegin_interruptする。phase、state、質問待ち、review、pending feedbackは保持する。
   同時処理は1件。再計画中に受けた割り込みは待機させ、同期の途中へ割り込まない。

Flowだけが割り込みの状態をtransitionで更新する。担当agentはstate・phase成果物を変更しない。
kindごとの意味判断はFlowまたは専用agentが行い、CLIは追跡・保存・整合性を保証する。

## 結果の登録と提示

非同期feedbackはFlowが現在への影響を確認する。プロジェクト知識は専用agentへ委譲する。
担当へID、operation、根拠、対象project・範囲、現在の参照を渡す。採用済みupdateでは
親の提案・採用回答を渡し、その範囲だけを更新する。

record_interrupt_resultへinterrupt-resultを渡す。summary/reason、effect、feedback/target_phase、
knowledge_update/document_sync、knowledge、proposals、unresolved、evidenceをすべて記録する。
effectはcontinue/revise/replan/block。knowledge_update/document_syncは
needed/not_needed/updated/unknown/not_applicable。知識確認ではknowledgeが必須。
提案はid/location/change/reason/disposition pending/response_event_id nullを持つ。
判断不能・起動不能も理由と未確認範囲を記録し、更新不要へ読み替えない。

Flowは結果・根拠・未確認事項と、全提案のID・更新先・具体的な差分・採否と既存承認の照合状況を
チャットへ提示し、その全文をpresent_interruptのtext、全提案IDをproposal_idsへ記録する。提案なしでも結果を報告する。
結果を再登録した場合は古い提示を無効化するため、再提示する。
CLIは提示記録の存在を確認するが、チャットへの実表示・説明の妥当性はFlowが確認する。

## 現状の確認と復帰

finish_interruptへ現状との照合理由と、必要な場合だけreplan requestを渡す。
結果登録・提示記録がないまま通常処理へ戻らない。再開地点を盲目的に実行しない。
全effectで結果のknowledgeにあるローカル根拠文書の鮮度を再検証する。変更・欠落があれば結果を再評価・再登録して再提示する。

| effect | 処理 |
| --- | --- |
| continue | 現在成果物と、それを対象にしたreviewの入力・知識文書を検証し、保持した状態へ戻る。元が回答待ち・blocked・completedなら維持する |
| revise | 現在工程内のchange feedbackを渡し、writer/reviseまたはImplement/executeへ接続。架空reviewや自動修正counterを使わない |
| replan | checkpointと承認質問を用意し、既存request_replan相当へ接続。同期は人間承認後だけ行う |
| block | 必須の判断・証拠が不足している理由で停止。completedを通常作業へ戻さない |

旧成果物・旧Design入力を対象にした履歴reviewは構造と保存digestだけを確認し、現在の対象で再集約しない。
現在の成果物を対象にしたreviewは通常どおり鮮度を検証する。履歴を現在の承認へ流用しない。
reviseは現在の対象成果物だけを変更し、既存pending feedbackは割り込み開始前に消費して記録を保持する。
既存の下流成果物がある場合は参照同期が必要なためreplanを使う。Flowがchange feedbackを準備してから結果へ参照を記録する。
上流変更、completed成果物の変更、旧reviewが新ルールへ適合しなくなった場合はreplanへ接続する。
対象参照がstaleならcontinueを拒否する。結果を再評価し、停止・再計画を判断する。
割り込みの終了自体ではretry/cycleをリセットせず、レビュー合格や実装完了を付与しない。

## 提案の採否と採用済み更新

任意提案は提示して割り込みを完了すれば、採否待ちを残して通常作業を再開できる。
利用者が採否を回答したらinteraction.receivedを記録する。interaction_idは
`interrupt:{割り込みID}:{提案ID}`、prompt_event_idはnullとし、原文は一度だけ保存する。
内容・範囲の明示承認を確認してdecide_interrupt_proposalを呼ぶ。

- exclude: followup_id null。理由を含む人間回答へ紐付け、更新しない。
- adopt: 新しいfollowup_idを指定。CLIがproject_knowledge/operation updateを自動で待機列へ追加する。

既に更新内容・範囲が明示承認されている場合は、追加の回答や原文の再記録を求めない。
まずassessで更新先と差分を具体化し、結果を保存・提示して完了する。その後、既存の原文eventを
response_event_idへ指定し、approved_scopeに提案と一致するlocation/changeを渡してadoptする。
CLIは原文eventがこの割り込みのorigin_event_idsに含まれる人間回答であり、scopeが提案と一致することを検証する。
既存eventのinteraction_idやprompt_event_idは変更しない。原文が実際にその恒久化内容・範囲を承認しているかはFlowが照合する。
approved_scopeはこの既存承認の再利用時だけ指定し、通常の採否回答では省略またはnullにする。

同じ提案の採否を二重登録しない。変更付き回答は元提案へ勝手に写像せず、新しい根拠として再評価する。
今回の実装修正への同意を恒久化へ読み替えない。既に明示された採用回答は再確認しない。
採用済み更新後も影響を照合し、古いreviewを再利用しない。

## 監査・復旧・互換性

割り込みの全遷移・構造化結果は既存transitionのprepared/transitionedとしてjournalへ保存する。
audit.mdには受付・開始・結果・提示・採否・復帰判断の要点を生成する。別actionで重複記録しない。
Flow stateのinterruptsは待機・処理・提示・完了と採否を保持し、完了記録も重複防止に使う。
同じrequest再送は同じ結果を返す。

resume-checkは未処理ID・状態をattentionへ返す。実態と保存済み結果を照合して残りの処理を行う。
処理中の外部更新を自動で再実行しない。結果不明なら現在の正本文書を確認してから結果を登録する。
旧flow-state-v2はinterruptsの省略を許容し、読取時はstate・journalを書き換えない。
初回の割り込みtransitionでだけinterruptsを追加する。旧schemaの暗黙移行は行わない。
