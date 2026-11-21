import type { Store } from "./persistence/store.js";
import {
  type ArtifactRef,
  type FlowState,
  InterruptResultSchema,
} from "./contracts/index.js";
import { equal, type Fields } from "./format.js";
import { requireCondition as check } from "./errors.js";
import { replanTransition } from "./replanning.js";

export const INTERRUPT_ACTIONS = [
  "enqueue_interrupt",
  "begin_interrupt",
  "record_interrupt_result",
  "present_interrupt",
  "finish_interrupt",
  "decide_interrupt_proposal",
];
export const activeInterrupt = (state: FlowState) =>
  state.interrupts?.find(
    (i) => i.status === "running" || i.status === "result_ready",
  );
export const pendingInterrupt = (state: FlowState) =>
  activeInterrupt(state) ??
  state.interrupts?.find((i) => i.status === "queued");

export function interruptTransition(
  store: Store,
  state: FlowState,
  action: string,
  args: Fields,
  evidence: ArtifactRef[],
) {
  const fields = (...keys: string[]) =>
    check(
      equal(Object.keys(args).sort(), keys.sort()),
      "Invalid fields for action " + action,
    );
  const records = (state.interrupts ??= []);
  const events = store.events()[1];
  const origin = (id: string) => {
    const event = events.find(
      (e) => e.event_id === id && e.run_id === state.run_id,
    );
    check(event, "Missing interruption origin event");
    return event;
  };
  const record = () => {
    const item = records.find((i) => i.id === args.interrupt_id);
    check(item, "Unknown interruption");
    return item;
  };
  if (action === "enqueue_interrupt") {
    fields("interrupt_id", "kind", "origin_event_ids", "reason", "parent_id");
    check(
      !records.some((i) => i.id === args.interrupt_id),
      "Interruption ID already used",
      true,
    );
    check(
      ["async_feedback", "project_knowledge"].includes(args.kind),
      "Unknown interruption kind",
    );
    check(
      Array.isArray(args.origin_event_ids) &&
        args.origin_event_ids.length &&
        new Set(args.origin_event_ids).size === args.origin_event_ids.length,
      "Invalid interruption origins",
    );
    for (const id of args.origin_event_ids) {
      const event = origin(id);
      if (args.kind === "async_feedback")
        check(
          event.event_type === "interaction.received" &&
            event.actor === "human" &&
            event.data.prompt_event_id === null,
          "Async feedback requires unsolicited human feedback",
        );
    }
    check(
      args.parent_id === null || records.some((i) => i.id === args.parent_id),
      "Unknown parent interruption",
    );
    check(
      !records.some(
        (i) =>
          i.kind === args.kind &&
          i.operation !== "update" &&
          equal(
            [...i.origin_event_ids].sort(),
            [...args.origin_event_ids].sort(),
          ),
      ),
      "Interruption trigger already registered",
      true,
    );
    records.push({
      id: args.interrupt_id,
      kind: args.kind,
      operation: args.kind === "async_feedback" ? "feedback" : "assess",
      origin_event_ids: args.origin_event_ids,
      reason: args.reason,
      parent_id: args.parent_id,
      proposal_id: null,
      status: "queued",
      basis: null,
      result: null,
      presentation: null,
      outcome: null,
    });
    return;
  }
  const item = record();
  if (action === "begin_interrupt") {
    fields("interrupt_id");
    check(
      !activeInterrupt(state) && !state.active_invocation && !state.replan,
      "Finish active operation or replan before interruption",
      true,
    );
    check(
      state.pending_feedback === null,
      "Consume pending feedback before starting interruption",
      true,
    );
    check(
      item.status === "queued" &&
        records.find((i) => i.status === "queued") === item,
      "Start queued interruptions in order",
      true,
    );
    for (const ref of [
      ...Object.values(state.artifacts),
      ...Object.values(state.reviews),
    ])
      if (ref) store.reference(ref);
    item.basis = {
      phase: state.phase,
      state: state.state,
      artifacts: structuredClone(state.artifacts),
      reviews: structuredClone(state.reviews),
    };
    item.status = "running";
  } else if (action === "record_interrupt_result") {
    fields("interrupt_id", "result");
    check(activeInterrupt(state) === item, "Interruption is not active", true);
    const parsed = InterruptResultSchema.safeParse(args.result);
    check(parsed.success, "Invalid interruption result");
    const result = parsed.data!;
    check(
      result.proposals.every(
        (p) => p.disposition === "pending" && p.response_event_id === null,
      ),
      "New proposals cannot contain adopted decisions",
    );
    check(
      new Set(result.proposals.map((p) => p.id)).size ===
        result.proposals.length,
      "Duplicate interruption proposal IDs",
    );
    check(
      (result.effect === "revise") === Boolean(result.feedback),
      "Interruption feedback/effect mismatch",
    );
    check(
      (result.effect === "replan") === Boolean(result.target_phase),
      "Interruption replan target/effect mismatch",
    );
    check(
      item.kind !== "project_knowledge" || result.knowledge !== null,
      "Knowledge interruption requires coverage",
    );
    check(
      (result.knowledge_update !== "updated" &&
        result.document_sync !== "updated") ||
        item.operation === "update",
      "Knowledge assessment cannot claim adopted updates",
    );
    if (result.feedback) {
      store.reference(result.feedback);
      evidence.push(result.feedback);
    }
    if (result.knowledge)
      store.checkKnowledgeDocuments({ project_knowledge: result.knowledge });
    item.result = result;
    item.presentation = null;
    item.status = "result_ready";
  } else if (action === "present_interrupt") {
    fields("interrupt_id", "text", "proposal_ids");
    check(
      item.status === "result_ready" && activeInterrupt(state) === item,
      "Record interruption result before presentation",
      true,
    );
    check(
      typeof args.text === "string" && args.text.trim(),
      "Missing interruption presentation",
    );
    check(
      Array.isArray(args.proposal_ids) &&
        equal(
          [...args.proposal_ids].sort(),
          item.result!.proposals.map((p) => p.id).sort(),
        ),
      "Presentation must cover all interruption proposals",
    );
    item.presentation = args.text;
  } else if (action === "decide_interrupt_proposal") {
    fields(
      "interrupt_id",
      "proposal_id",
      "disposition",
      "response_event_id",
      "followup_id",
      ...("approved_scope" in args ? ["approved_scope"] : []),
    );
    check(
      item.status === "completed" && item.presentation && item.result,
      "Proposal requires a completed presented result",
      true,
    );
    const proposal = item.result!.proposals.find(
      (p) => p.id === args.proposal_id,
    );
    check(
      proposal && proposal.disposition === "pending",
      "Proposal is not pending",
      true,
    );
    check(
      ["adopt", "exclude"].includes(args.disposition),
      "Invalid proposal disposition",
    );
    const response = origin(args.response_event_id);
    const scope = args.approved_scope;
    const existingApproval = scope !== undefined && scope !== null;
    if (existingApproval) {
      check(
        args.disposition === "adopt" &&
          typeof scope === "object" &&
          equal(Object.keys(scope).sort(), ["change", "location"]) &&
          scope.location === proposal.location &&
          scope.change === proposal.change &&
          item.origin_event_ids.includes(response.event_id),
        "Existing approval must match proposal scope and origin",
      );
    }
    check(
      response.event_type === "interaction.received" &&
        response.actor === "human" &&
        (existingApproval ||
          (response.data.prompt_event_id === null &&
            response.data.interaction_id ===
              `interrupt:${item.id}:${proposal.id}`)),
      "Missing human response for this proposal",
    );
    proposal.disposition = args.disposition;
    proposal.response_event_id = response.event_id;
    if (args.disposition === "adopt") {
      check(
        typeof args.followup_id === "string" &&
          args.followup_id.trim() &&
          !records.some((i) => i.id === args.followup_id),
        "Invalid update interruption ID",
      );
      records.push({
        id: args.followup_id,
        kind: "project_knowledge",
        operation: "update",
        origin_event_ids: [response.event_id],
        reason: proposal.reason,
        parent_id: item.id,
        proposal_id: proposal.id,
        status: "queued",
        basis: null,
        result: null,
        presentation: null,
        outcome: null,
      });
    } else
      check(
        args.followup_id === null,
        "Excluded proposal cannot schedule an update",
      );
  } else {
    fields("interrupt_id", "reason", "replan");
    check(
      item.status === "result_ready" &&
        item.result &&
        item.presentation &&
        activeInterrupt(state) === item,
      "Record and present interruption result before resuming",
      true,
    );
    check(
      typeof args.reason === "string" && args.reason.trim(),
      "Missing resumption assessment",
    );
    const result = item.result!;
    const basis = item.basis!;
    check(
      state.phase === basis.phase &&
        state.state === basis.state &&
        equal(state.artifacts, basis.artifacts) &&
        equal(state.reviews, basis.reviews),
      "Interruption basis changed; reassess current state",
      true,
    );
    if (result.knowledge)
      store.checkKnowledgeDocuments({ project_knowledge: result.knowledge });
    if (result.effect === "continue") {
      for (const ref of [
        ...Object.values(state.artifacts),
        ...Object.values(state.reviews),
      ])
        if (ref) {
          const [meta] = store.reference(ref);
          // Immutable historical reviews retain their original targets. Only
          // reviews of the current artifact/input can authorize current work.
          if (
            meta.schema_version === "flow/phase-review-v2" &&
            (!equal(
              meta.target,
              state.artifacts[meta.phase as "design" | "plan" | "implement"],
            ) ||
              (meta.design !== null &&
                !equal(meta.design, state.artifacts.design)))
          )
            continue;
          store.checkDocumentInputs(meta);
          store.checkKnowledgeDocuments(meta);
          evidence.push(ref);
        }
    } else if (result.effect === "revise") {
      check(
        state.state !== "completed" && !state.replan,
        "Completed Flow changes require approved replan",
        true,
      );
      check(
        state.pending_feedback === null,
        "Consume pending feedback before interrupt revision",
        true,
      );
      const [fm] = store.reference(result.feedback!);
      const phase = state.phase.startsWith("design")
        ? "design"
        : state.phase.startsWith("plan")
          ? "plan"
          : "implement";
      check(
        fm.schema_version === "flow/phase-feedback-v2" &&
          fm.operation === "revise" &&
          fm.phase === phase &&
          equal(fm.target, state.artifacts[phase]),
        "Interrupt revision must target current phase with change feedback",
      );
      store.checkDocumentInputs(fm, true);
      check(
        !(phase === "design" && state.artifacts.plan) &&
          !(phase === "plan" && state.artifacts.implement),
        "Existing downstream artifacts require synchronized replanning",
        true,
      );
      Object.assign(state, {
        phase,
        state: "running",
        active_review: null,
        waiting: null,
        blocker: null,
        pending_operation: phase === "implement" ? "execute" : "revise",
        pending_feedback: result.feedback,
      });
      state.reviews[phase === "plan" ? "plan_final" : phase] = null;
      if (phase === "plan") state.reviews.plan_decision = null;
      evidence.push(result.feedback!);
    } else if (result.effect === "block") {
      check(
        state.state !== "completed",
        "Completed Flow stays completed; use replan for required changes",
        true,
      );
      Object.assign(state, {
        state: "blocked",
        blocker: result.reason,
        waiting: null,
      });
    }
    if (result.effect === "replan") {
      check(
        args.replan && args.replan.target_phase === result.target_phase,
        "Missing matching replan request",
      );
      replanTransition(store, state, "request_replan", args.replan, evidence);
    } else check(args.replan === null, "Unexpected replan request");
    item.status = "completed";
    item.outcome = result.effect;
  }
}
