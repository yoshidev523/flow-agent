import { z } from "zod";

// 機械検証の正本。利用者・agent向けの契約はFlow skillのreferences/contracts.mdを参照。
const text = z.string().min(1);
const timestamp = z.iso.datetime({ offset: true });

export const ReferenceSchema = z.strictObject({
  path: text,
  revision: z.number().int().min(1),
  sha256: z.string().regex(new RegExp("^[0-9a-f]{64}$")),
});

export const OptionSchema = z.strictObject({
  id: text,
  text: text,
  impact: text,
});

export const QuestionSchema = z.strictObject({
  id: text,
  question: text,
  required: z.boolean(),
  status: z.enum(["open", "resolved"]),
  options: z.array(OptionSchema).min(2).max(3),
  recommendation: text,
  reason: text,
  assumptions: z.array(text),
  answer: text.nullable(),
});

export const FeedbackResultSchema = z.strictObject({
  id: text,
  result: z.enum(["applied", "unresolved"]),
  location: text,
});

export const TaskSchema = z.strictObject({
  id: text,
  files: z.array(text).min(1),
  dependencies: z.array(text),
  completion: text,
  verification: text,
  verification_ids: z
    .array(text)
    .min(1)
    .refine(
      (items) =>
        new Set(items.map((item) => JSON.stringify(item))).size ===
        items.length,
      "Duplicate array items",
    ),
});

export const TaskProgressSchema = z.strictObject({
  id: text,
  status: z.enum(["pending", "in_progress", "blocked", "completed"]),
  evidence: text,
});

export const VerificationSchema = z.strictObject({
  id: text,
  command: text,
  status: z.enum(["passed", "failed", "not_run"]),
  required: z.boolean(),
  reason: text,
});

export const FailureSchema = z.strictObject({
  kind: z.enum(["execution", "contract"]),
  reason: text,
});

export const JudgmentSchema = z.strictObject({
  id: text,
  question: text,
  background: text,
  options: z.array(OptionSchema).min(2).max(3),
  recommendation: text,
  reason: text,
  answer_format: text,
});

export const FindingSchema = z.discriminatedUnion("classification", [
  z.strictObject({
    id: text,
    classification: z.literal("gate"),
    resolution: z.enum(["revise", "human_decision"]),
    decision_refs: z.array(text),
    target: text,
    problem: text,
    evidence: text,
    instruction: text,
    completion: text,
    judgment: JudgmentSchema.nullable(),
  }),
  z.strictObject({
    id: text,
    classification: z.literal("scope_candidate"),
    decision_refs: z.array(text),
    proposal: text,
    evidence: text,
    impact: text,
    recommendation: text,
  }),
]);

export const VerificationPlanSchema = z.strictObject({
  id: text,
  command: text,
  required: z.boolean(),
});

export const HandoffCheckSchema = z.strictObject({
  id: z.enum([
    "scope",
    "files",
    "responsibilities",
    "interfaces",
    "errors",
    "dependencies",
    "completion",
    "verification",
  ]),
  status: z.enum(["ok", "not_applicable", "pending"]),
  reason: text,
});

export const PhaseArtifactSchema = z.strictObject({
  schema_version: z.literal("flow/phase-artifact-v2"),
  artifact: z.enum(["design", "plan"]),
  revision: z.number().int().min(1),
  status: z.enum(["needs_input", "ready"]),
  producer: text,
  invocation_id: text,
  operation: z.enum(["create", "revise", "respond"]),
  updated_at: timestamp,
  inputs: z.array(ReferenceSchema),
  questions: z.array(QuestionSchema),
  feedback_results: z.array(FeedbackResultSchema),
  tasks: z.array(TaskSchema),
  verification_plan: z.array(VerificationPlanSchema),
  handoff_checks: z.array(HandoffCheckSchema),
});

export const ImplementArtifactSchema = z.strictObject({
  schema_version: z.literal("flow/implement-artifact-v2"),
  artifact: z.literal("implement"),
  revision: z.number().int().min(1),
  status: z.enum(["in_progress", "blocked", "completed"]),
  producer: z.literal("flow-implement"),
  invocation_id: text,
  operation: z.literal("execute"),
  updated_at: timestamp,
  plan: ReferenceSchema,
  tasks: z.array(TaskProgressSchema),
  verifications: z.array(VerificationSchema),
  blocker: text.nullable(),
  commit: z.string().regex(new RegExp("^[0-9a-f]{40,64}$")).nullable(),
});

export const ReviewSourceSchema = z.strictObject({
  phase: z.enum(["design", "plan"]),
  review_stage: z.enum(["design", "decision", "final"]),
  review_cycle_id: z
    .string()
    .regex(new RegExp("^(design|plan-decision|plan-final)-cycle-[0-9]{4,}$")),
  target: ReferenceSchema,
  design: ReferenceSchema.nullable(),
  findings: z.array(FindingSchema),
  failure: FailureSchema.nullable(),
  schema_version: z.literal("flow/review-source-v2"),
  revision: z.literal(1),
  source_id: text,
  source_kind: z.enum(["ai", "human"]),
  status: z.enum(["passed", "changes_required", "blocked", "unable"]),
  created_at: timestamp,
});

export const PhaseReviewSchema = z.strictObject({
  phase: z.enum(["design", "plan"]),
  review_stage: z.enum(["design", "decision", "final"]),
  review_cycle_id: z
    .string()
    .regex(new RegExp("^(design|plan-decision|plan-final)-cycle-[0-9]{4,}$")),
  target: ReferenceSchema,
  design: ReferenceSchema.nullable(),
  findings: z.array(FindingSchema),
  failure: FailureSchema.nullable(),
  schema_version: z.literal("flow/phase-review-v2"),
  revision: z.literal(1),
  mode: z.enum(["ai", "human"]),
  status: z.enum(["passed", "changes_required", "blocked", "incomplete"]),
  sources: z.array(ReferenceSchema),
  judgments: z.array(JudgmentSchema),
  created_at: timestamp,
  source_paths: z
    .array(text)
    .refine(
      (items) =>
        new Set(items.map((item) => JSON.stringify(item))).size ===
        items.length,
      "Duplicate array items",
    ),
});

export const FeedbackItemSchema = z.strictObject({
  id: text,
  kind: z.enum(["change", "answer"]),
  target: text,
  instruction: text,
  evidence: text,
  completion: text,
});

export const PhaseFeedbackSchema = z.strictObject({
  schema_version: z.literal("flow/phase-feedback-v2"),
  revision: z.literal(1),
  phase: z.enum(["design", "plan"]),
  target: ReferenceSchema,
  operation: z.enum(["revise", "respond"]),
  created_at: timestamp,
  items: z.array(FeedbackItemSchema).min(1),
});

export const CounterSchema = z.strictObject({
  automatic_revision: z.number().int().min(0).max(1),
  execution_retry: z.number().int().min(0).max(1),
  human_retry: z.number().int().min(0).max(1),
});

export const ActiveReviewSchema = z.strictObject({
  stage: z.enum(["design", "plan_decision", "plan_final"]),
  review_cycle_id: text,
  mode: z.enum(["ai", "human"]),
  target: ReferenceSchema,
  design: ReferenceSchema.nullable(),
  path: text,
  scope_acknowledged: z.boolean(),
  human_source: ReferenceSchema.nullable(),
});

export const InvocationSchema = z.strictObject({
  invocation_id: text,
  component: text,
  operation: text,
  inputs: z.array(ReferenceSchema),
});

export const WaitingSchema = z.strictObject({
  kind: z.enum([
    "writer_question",
    "human_review",
    "review_decision",
    "scope_candidate",
    "implement_blocker",
  ]),
  target: ReferenceSchema,
  question_ids: z.array(text).min(1),
  prompt_event_id: text,
});

export const FlowStateSchema = z.strictObject({
  schema_version: z.literal("flow/flow-state-v2"),
  feature_id: text,
  run_id: text,
  state_revision: z.number().int().min(1),
  phase: z.enum([
    "design",
    "design_review",
    "plan",
    "plan_decision_review",
    "plan_review",
    "implement",
    "completed",
  ]),
  state: z.enum(["running", "waiting_for_input", "blocked", "completed"]),
  artifacts: z.strictObject({
    design: ReferenceSchema.nullable(),
    plan: ReferenceSchema.nullable(),
    implement: ReferenceSchema.nullable(),
  }),
  reviews: z.strictObject({
    design: ReferenceSchema.nullable(),
    plan_decision: ReferenceSchema.nullable(),
    plan_final: ReferenceSchema.nullable(),
  }),
  review_mode: z.strictObject({
    design: z.enum(["ai", "human"]),
    plan: z.enum(["ai", "human"]),
  }),
  counters: z.strictObject({
    design: CounterSchema,
    plan_decision: CounterSchema,
    plan_final: CounterSchema,
  }),
  cycle_counters: z.strictObject({
    design: z.number().int().min(0),
    plan_decision: z.number().int().min(0),
    plan_final: z.number().int().min(0),
  }),
  active_review: ActiveReviewSchema.nullable(),
  active_invocation: InvocationSchema.nullable(),
  waiting: WaitingSchema.nullable(),
  blocker: text.nullable(),
  last_transition_event_id: text,
  updated_at: timestamp,
  pending_operation: z.union([
    z.literal("create"),
    z.literal("revise"),
    z.literal("respond"),
    z.literal("execute"),
    z.literal(null),
  ]),
  pending_feedback: ReferenceSchema.nullable(),
});

export const AuditEventSchema = z.strictObject({
  event_id: z.string().regex(new RegExp("^E-[0-9]{6,}$")),
  event_key: text,
  event_type: z.enum([
    "flow.started",
    "flow.transition_prepared",
    "flow.transitioned",
    "flow.transition_aborted",
    "artifact.update_prepared",
    "artifact.updated",
    "artifact.update_aborted",
    "invocation.started",
    "invocation.completed",
    "invocation.failed",
    "action.started",
    "action.completed",
    "decision.made",
    "interaction.presented",
    "interaction.received",
    "feedback.created",
    "review.completed",
    "review.mode_changed",
    "retry.scheduled",
    "flow.blocked",
    "flow.resumed",
    "flow.completed",
  ]),
  run_id: text,
  invocation_id: text.nullable(),
  occurred_at: timestamp,
  recorded_at: timestamp,
  actor: text,
  caused_by: z.array(text),
  data: z.record(z.string(), z.json()),
});

export const AuditLogSchema = z.strictObject({
  schema_version: z.literal("flow/audit-log-v1"),
  feature_id: text,
  created_at: timestamp,
});

export const contracts = {
  reference: ReferenceSchema,
  option: OptionSchema,
  question: QuestionSchema,
  "feedback-result": FeedbackResultSchema,
  task: TaskSchema,
  "task-progress": TaskProgressSchema,
  verification: VerificationSchema,
  failure: FailureSchema,
  judgment: JudgmentSchema,
  finding: FindingSchema,
  "phase-artifact": PhaseArtifactSchema,
  "implement-artifact": ImplementArtifactSchema,
  "review-source": ReviewSourceSchema,
  "phase-review": PhaseReviewSchema,
  "feedback-item": FeedbackItemSchema,
  "phase-feedback": PhaseFeedbackSchema,
  counter: CounterSchema,
  "active-review": ActiveReviewSchema,
  invocation: InvocationSchema,
  waiting: WaitingSchema,
  "flow-state": FlowStateSchema,
  "audit-event": AuditEventSchema,
  "audit-log": AuditLogSchema,
  "verification-plan": VerificationPlanSchema,
  "handoff-check": HandoffCheckSchema,
};

export const eventData = {
  "flow.started": z.strictObject({
    state: FlowStateSchema,
    request_path: text,
  }),
  "flow.transition_prepared": z.strictObject({
    action: text,
    before_sha256: text,
    after_sha256: text,
    after: FlowStateSchema,
    evidence: z.array(ReferenceSchema),
    request_sha256: z.string().regex(new RegExp("^[0-9a-f]{64}$")),
    before: FlowStateSchema,
    arguments: z.record(z.string(), z.json()),
  }),
  "flow.transitioned": z.strictObject({
    prepared_event_id: text,
    action: text,
    before_revision: z.number().int().min(1),
    after_revision: z.number().int().min(1),
    from_phase: text,
    to_phase: text,
    from_state: text,
    to_state: text,
    evidence: z.array(ReferenceSchema),
  }),
  "flow.transition_aborted": z.strictObject({
    prepared_event_id: text,
    reason: text,
  }),
  "artifact.update_prepared": z.strictObject({
    target_path: text,
    before_sha256: text.nullable(),
    after: ReferenceSchema,
    operation: text,
    change: text,
    reason: text,
    sections: z.array(text),
    references: z.array(text),
    old_status: text.nullable(),
    new_status: text.nullable(),
    request_sha256: z.string().regex(new RegExp("^[0-9a-f]{64}$")),
  }),
  "artifact.updated": z.strictObject({
    prepared_event_id: text,
    artifact: ReferenceSchema,
  }),
  "artifact.update_aborted": z.strictObject({
    prepared_event_id: text,
    reason: text,
  }),
  "invocation.started": z.strictObject({
    component: text,
    operation: text,
    inputs: z.array(ReferenceSchema),
  }),
  "invocation.completed": z.strictObject({
    outputs: z.array(ReferenceSchema),
  }),
  "invocation.failed": z.strictObject({
    reason: text,
    evidence: z.array(text),
  }),
  "action.started": z.strictObject({
    action: text,
    detail: text,
  }),
  "action.completed": z.strictObject({
    action: text,
    result: text,
    evidence: z.array(text),
  }),
  "decision.made": z.strictObject({
    decision: text,
    rule_id: text,
    reason: text,
    evidence: z.array(text),
    assumptions: z.array(text),
  }),
  "interaction.presented": z.strictObject({
    interaction_id: text,
    kind: text,
    target: ReferenceSchema,
    question_ids: z.array(text),
    text: text,
  }),
  "interaction.received": z.strictObject({
    interaction_id: text,
    prompt_event_id: text.nullable(),
    text: text,
  }),
  "feedback.created": z.strictObject({
    feedback: ReferenceSchema,
    origin_event_ids: z.array(text),
    mappings: z.array(
      z.strictObject({
        item_id: text,
        origin_ref: text,
      }),
    ),
  }),
  "review.completed": z.strictObject({
    review: ReferenceSchema,
    status: text,
  }),
  "review.mode_changed": z.strictObject({
    stage: z.enum(["design", "plan_decision", "plan_final"]),
    from: z.enum(["ai", "human"]),
    to: z.enum(["ai", "human"]),
    reason: text,
  }),
  "retry.scheduled": z.strictObject({
    stage: z.enum(["design", "plan_decision", "plan_final"]),
    counter: z.enum(["execution_retry", "human_retry", "automatic_revision"]),
    used: z.literal(1),
    reason: text,
  }),
  "flow.blocked": z.strictObject({
    reason: text,
    resume_condition: text,
  }),
  "flow.resumed": z.strictObject({
    reason: text,
    evidence: z.array(text),
  }),
  "flow.completed": z.strictObject({
    implement: ReferenceSchema,
  }),
};

export type ArtifactRef = z.infer<typeof ReferenceSchema>;
export type FlowState = z.infer<typeof FlowStateSchema>;
export type PhaseArtifact = z.infer<typeof PhaseArtifactSchema>;
export type ReviewSource = z.infer<typeof ReviewSourceSchema>;
export type PhaseReview = z.infer<typeof PhaseReviewSchema>;
export type PhaseFeedback = z.infer<typeof PhaseFeedbackSchema>;
export type ImplementArtifact = z.infer<typeof ImplementArtifactSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type ContractName = keyof typeof contracts;
export type EventType = keyof typeof eventData;
