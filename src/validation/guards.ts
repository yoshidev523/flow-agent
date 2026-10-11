import {
  contracts,
  eventData,
  type ContractName,
  type EventType,
  type Finding,
} from "../contracts/index.js";
import { equal, type Fields } from "../format.js";
import { requireCondition as check } from "../errors.js";
export const KINDS: Record<string, ContractName> = {
  "flow/phase-artifact-v2": "phase-artifact",
  "flow/implement-artifact-v2": "implement-artifact",
  "flow/review-source-v2": "review-source",
  "flow/phase-review-v2": "phase-review",
  "flow/phase-feedback-v2": "phase-feedback",
  "flow/flow-state-v2": "flow-state",
  "flow/audit-log-v1": "audit-log",
};
export const STAGES = {
  design: ["design_review", "design", "design"],
  plan_decision: ["plan_decision_review", "plan", "decision"],
  plan_final: ["plan_review", "plan", "final"],
} as const;
export type Stage = keyof typeof STAGES;
export const EXPECTED: Record<Stage, string[]> = {
  design: ["requirements", "quality-risk"],
  plan_decision: ["decision-quality"],
  plan_final: ["task-readiness"],
};
export const HEADINGS: Record<string, string[]> = {
  design: [
    "目的",
    "背景",
    "利用者",
    "スコープ",
    "要件",
    "制約",
    "決定事項",
    "確認事項",
    "受け入れ条件",
    "Planへの引き継ぎ",
    "Feedback反映",
    "変更履歴",
  ],
  plan: [
    "目的",
    "要件サマリ",
    "実装スコープ",
    "既存コンテキスト",
    "確認事項",
    "実行サマリ",
    "変更ファイル",
    "タスク分解",
    "詳細手順",
    "テスト・検証計画",
    "リスクと停止条件",
    "実装引き継ぎチェック",
    "Feedback反映",
    "変更履歴",
  ],
  implement: [
    "タスク進捗",
    "変更サマリ",
    "検証ログ",
    "補足・計画との差分",
    "未完了事項",
    "変更履歴",
  ],
  "review-source": ["評価結果", "指摘", "失敗情報"],
  "phase-review": [
    "集約結果",
    "指摘",
    "追加スコープ候補",
    "利用者判断",
    "失敗情報",
  ],
  "phase-feedback": ["Feedback"],
};
export const MANAGED_EVENTS = new Set([
  "flow.started",
  "flow.transition_prepared",
  "flow.transitioned",
  "flow.transition_aborted",
  "artifact.update_prepared",
  "artifact.updated",
  "artifact.update_aborted",
  "checkpoint.prepared",
  "checkpoint.completed",
]);
export function schemaCheck(
  name: ContractName | "event-data",
  value: unknown,
  eventType?: string,
): void {
  const schema =
    name === "event-data" ? eventData[eventType as EventType] : contracts[name];
  check(schema, "Unknown event type: " + eventType);
  const result = schema.safeParse(value);
  check(
    result.success,
    name +
      ": " +
      (result.success
        ? ""
        : result.error.issues
            .slice(0, 5)
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join("; ")),
  );
}
export function uniqueIds(items: Fields[], label: string): void {
  check(
    new Set(items.map((x) => x.id)).size === items.length,
    "Duplicate " + label + " IDs",
  );
}
function judgment(q: Fields): void {
  uniqueIds(q.options, "option");
  check(
    q.options.some((x: Fields) => x.id === q.recommendation),
    "Recommendation must name an option",
  );
}
export function findingStatus(
  findings: Finding[] | Fields[],
): "blocked" | "changes_required" | "passed" {
  const gates = findings.filter((x) => x.classification === "gate");
  return gates.some((x) => x.resolution === "human_decision")
    ? "blocked"
    : gates.length
      ? "changes_required"
      : "passed";
}
export function validateMeta(meta: Fields, body?: string): ContractName {
  const kind = KINDS[meta.schema_version];
  check(kind, "Unsupported schema_version (no implicit migration)");
  schemaCheck(kind, meta);
  if (kind === "phase-artifact") {
    for (const [key, label] of [
      ["questions", "question"],
      ["tasks", "task"],
      ["verification_plan", "verification plan"],
      ["handoff_checks", "handoff check"],
      ["feedback_results", "feedback"],
    ])
      uniqueIds(meta[key], label);
    for (const q of meta.questions) {
      judgment(q);
      check(
        (q.status === "open") === (q.answer === null),
        "Question status/answer mismatch",
      );
    }
    const open = meta.questions.filter(
      (q: Fields) => q.required && q.status === "open",
    );
    check(
      (meta.status === "needs_input") === Boolean(open.length),
      "Writer status/open questions mismatch",
    );
    check(
      meta.status !== "ready" ||
        meta.feedback_results.every((x: Fields) => x.result === "applied"),
      "ready cannot contain unresolved feedback",
    );
    check(
      meta.producer === "flow-" + meta.artifact ||
        meta.producer === "flow-artifact-sync",
      "Wrong artifact owner",
    );
    if (meta.artifact === "design")
      check(
        !meta.tasks.length &&
          !meta.verification_plan.length &&
          !meta.handoff_checks.length,
        "Design cannot define implementation tasks/checks",
      );
    else if (meta.status === "ready") {
      check(meta.tasks.length, "ready Plan requires tasks");
      check(
        equal(
          meta.handoff_checks.map((x: Fields) => x.id).sort(),
          [
            "scope",
            "files",
            "responsibilities",
            "interfaces",
            "errors",
            "dependencies",
            "completion",
            "verification",
          ].sort(),
        ),
        "Missing handoff checks",
      );
      check(
        meta.handoff_checks.every((x: Fields) => x.status !== "pending"),
        "Pending handoff check",
      );
      check(meta.verification_plan.length, "Missing verification plan");
    }
    const verificationIds = new Set(
      meta.verification_plan.map((x: Fields) => x.id),
    );
    check(
      meta.tasks.every((x: Fields) =>
        x.verification_ids.every((id: string) => verificationIds.has(id)),
      ),
      "Unknown task verification",
    );
    const taskIds = new Set(meta.tasks.map((x: Fields) => x.id));
    let pending = new Map<string, Set<string>>(
      meta.tasks.map((x: Fields) => [x.id, new Set<string>(x.dependencies)]),
    );
    check(
      [...pending.values()].every((deps) =>
        [...deps].every((id) => taskIds.has(id)),
      ),
      "Unknown task dependency",
    );
    while (pending.size) {
      const resolved = new Set(
        [...pending].filter(([, deps]) => !deps.size).map(([key]) => key),
      );
      check(resolved.size, "Cyclic task dependencies");
      pending = new Map(
        [...pending]
          .filter(([key]) => !resolved.has(key))
          .map(([key, deps]) => [
            key,
            new Set([...deps].filter((id) => !resolved.has(id))),
          ]),
      );
    }
  }
  if (kind === "implement-artifact") {
    uniqueIds(meta.tasks, "task");
    uniqueIds(meta.verifications, "verification");
    check(
      (meta.status === "blocked") === Boolean(meta.blocker),
      "Implement blocker/status mismatch",
    );
    if (meta.status === "completed") {
      check(
        meta.tasks.length &&
          meta.tasks.every((t: Fields) => t.status === "completed"),
        "Unfinished tasks",
      );
      check(
        meta.verifications.length,
        "Completion requires verification records",
      );
      check(
        meta.verifications.every(
          (v: Fields) => !v.required || v.status === "passed",
        ),
        "Required verification did not pass",
      );
      check(meta.commit !== null, "Completion requires implementation commit");
    }
  }
  if (kind === "review-source" || kind === "phase-review") {
    check(
      (meta.phase === "design") === (meta.review_stage === "design"),
      "Review phase/stage mismatch",
    );
    check(
      (meta.phase === "plan") === (meta.design !== null),
      "Plan review requires Design reference",
    );
    uniqueIds(meta.findings, "finding");
    for (const f of meta.findings)
      if (f.classification === "gate") {
        check(
          (f.resolution === "human_decision") === (f.judgment !== null),
          "Gate resolution/judgment mismatch",
        );
        if (f.judgment) judgment(f.judgment);
      }
    check(
      meta.review_stage !== "decision" ||
        !meta.findings.some(
          (f: Fields) => f.classification === "scope_candidate",
        ),
      "Decision review cannot contain scope candidates",
    );
    check(
      meta.status ===
        (meta.failure
          ? kind === "review-source"
            ? "unable"
            : "incomplete"
          : findingStatus(meta.findings)),
      "Review status disagrees with gates/failure",
    );
    if (kind === "phase-review") {
      uniqueIds(meta.judgments, "judgment");
      check(
        equal(
          meta.judgments,
          meta.findings
            .filter((f: Fields) => f.classification === "gate" && f.judgment)
            .map((f: Fields) => f.judgment),
        ),
        "Aggregate judgments must preserve gate judgments",
      );
    }
  }
  if (kind === "phase-feedback") {
    uniqueIds(meta.items, "feedback item");
    check(
      meta.items.every(
        (x: Fields) =>
          x.kind === (meta.operation === "revise" ? "change" : "answer"),
      ),
      "Mixed feedback kinds",
    );
  }
  if (kind === "flow-state") {
    check(
      (meta.phase === "replanning") === Boolean(meta.replan),
      "Replanning phase/context mismatch",
    );
    if (meta.replan)
      check(
        meta.active_invocation === null &&
          meta.active_review === null &&
          (meta.replan.approved
            ? meta.state === "running"
            : meta.state === "waiting_for_input"),
        "Invalid replan state",
      );
    check(
      (meta.phase === "completed") === (meta.state === "completed"),
      "Completed phase/state mismatch",
    );
    check(
      (meta.state === "waiting_for_input") === (meta.waiting !== null),
      "Waiting state/context mismatch",
    );
    check(
      (meta.state === "blocked") === Boolean(meta.blocker),
      "Blocked state/reason mismatch",
    );
    check(
      meta.phase !== "plan" || meta.state !== "waiting_for_input",
      "Plan questions require decision review",
    );
    check(
      meta.state === "running" || meta.active_invocation === null,
      "Non-running state cannot have an active invocation",
    );
    check(
      meta.state !== "completed" || meta.active_review === null,
      "Completed state cannot have active review",
    );
    if (meta.active_review)
      check(
        meta.phase === STAGES[meta.active_review.stage as Stage][0],
        "Active review/phase mismatch",
      );
  }
  if (body !== undefined && kind !== "audit-log" && kind !== "flow-state") {
    for (const heading of HEADINGS[meta.artifact ?? kind])
      check(
        body.split("\n").some((line) => line.trimEnd() === "## " + heading),
        "Missing section: " + heading,
      );
    check(
      !/^(?:#+\s*)?(?:承認状態|approval|Pending|Approved|Draft)\s*[:：]/m.test(
        body,
      ),
      "Parallel lifecycle status is forbidden",
    );
  }
  return kind;
}
