# Human reviewの提示契約


FlowがDesignまたはPlanをhuman modeで提示するときは、対象成果物だけでなく、
人間確認へ切り替えた理由と確認対象を同時に提示する。

提示内容は次の順とする。

1. 切替理由: 利用者指定、自動修正上限、またはreview再試行上限
2. 直前のreview cycleの対象revision、mode、status
3. 直前の`phase-review-v2`にあるfindingまたは失敗情報
4. 自動修正後なら、正規化feedbackと新成果物の`Feedback反映`から確認できる修正内容
5. 現在が「既知の未解決懸念あり」か「修正後revisionが未review」か
6. 人間が重点的に確認する項目、対象成果物のpath、回答形式

Flowは`phase-review-v2`、該当feedback、対象成果物、counterだけを根拠にし、
findingを再評価、拡張、縮小しない。自動修正後の新revisionに未解決findingが記録されて
いない場合は、既知の問題があるためではなく修正結果が未reviewであるため人間確認を
求める、と明記する。単に「human reviewが必要」とだけ提示してはならない。

```md
Human reviewが必要です。

- 切替理由: {理由}
- 直前のreview: revision {N} / {mode} / {status}
- 直前の指摘または失敗:
  - {phase-review-v2の内容}
- revision {M}での修正:
  - {feedbackとFeedback反映で追跡できる内容}
- 現在の状態: {既知の未解決懸念あり | 修正後revisionが未review}
- 確認してほしい点:
  - {review対象}
- 成果物: {path}

問題なければ`passed`、変更が必要なら
`changes_required: {変更内容}`と回答してください。
```

利用者指定で最初からhuman modeの場合など、直前のAI reviewや自動修正が存在しない項目は
`該当なし`と明記する。review再試行上限による切替では、findingの代わりにaggregateの
失敗情報と、成果物内容の評価が未完了であることを提示する。
