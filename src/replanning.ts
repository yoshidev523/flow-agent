import type { Store } from "./persistence/store.js";
import type { FlowState, ArtifactRef } from "./contracts/index.js";
import { equal, type Fields } from "./format.js";
import { requireCondition as check } from "./errors.js";

export function replanTransition(
  store: Store,
  state: FlowState,
  action: string,
  args: Fields,
  evidence: ArtifactRef[],
) {
  const fields = (...names: string[]) =>
    check(
      equal(Object.keys(args).sort(), names.sort()),
      "Invalid fields for action " + action,
    );
  const events = store.events()[1];
  if (action === "request_replan") {
    fields(
      "prompt_event_id",
      "target_phase",
      "scope",
      "reason",
      "checkpoint_event_id",
    );
    check(
      !state.active_invocation && !state.replan,
      "Resolve active operation before replanning",
      true,
    );
    check(
      ["design", "plan"].includes(args.target_phase) &&
        typeof args.scope === "string" &&
        args.scope.trim() &&
        typeof args.reason === "string" &&
        args.reason.trim(),
      "Invalid replan scope/phase",
    );
    store.resumeCheck();
    const prompt = events.find((e) => e.event_id === args.prompt_event_id);
    check(
      prompt &&
        prompt.event_type === "interaction.presented" &&
        prompt.run_id === state.run_id &&
        prompt.data.kind === "replan",
      "Missing replan prompt",
    );
    check(
      (prompt.data.question_ids as string[]).length === 1,
      "Replan prompt must identify one approval question",
    );
    const target = state.artifacts[args.target_phase as "design" | "plan"];
    check(
      target && equal(prompt.data.target, target),
      "Replan prompt target mismatch",
    );
    store.reference(target);
    const checkpoint = events.find(
      (e) => e.event_id === args.checkpoint_event_id,
    );
    check(
      checkpoint &&
        checkpoint.event_type === "checkpoint.completed" &&
        checkpoint.run_id === state.run_id,
      "Missing pre-replan checkpoint",
    );
    const snapshot = checkpoint.data.checkpoint as Fields;
    check(
      equal(snapshot.artifacts, Object.values(state.artifacts).filter(Boolean)),
      "Checkpoint does not capture current artifacts",
    );
    // Checkpoint must include the current state snapshot, not only the same artifact revisions.
    const saved = events.find((e) => e.event_id === snapshot.audit_event_id);
    check(
      saved &&
        events.indexOf(saved) >
          events.findIndex(
            (e) => e.event_id === state.last_transition_event_id,
          ),
      "Checkpoint predates current state",
    );
    state.replan = {
      target_phase: args.target_phase,
      scope: args.scope,
      reason: args.reason,
      prompt_event_id: prompt.event_id,
      response_event_id: null,
      checkpoint_event_id: checkpoint.event_id,
      approved: false,
      previous_phase: state.phase,
      before: structuredClone(state.artifacts),
    };
    state.phase = "replanning";
    state.state = "waiting_for_input";
    state.waiting = {
      kind: "replan",
      target,
      question_ids: prompt.data.question_ids as string[],
      prompt_event_id: prompt.event_id,
    };
    state.active_review = null;
    state.blocker = null;
    state.pending_operation = null;
    state.pending_feedback = null;
    evidence.push(target);
  } else if (action === "begin_replan") {
    fields("response_event_id", "approval");
    const context = state.replan;
    check(
      context && !context.approved && state.state === "waiting_for_input",
      "No pending replan approval",
      true,
    );
    check(args.approval === "approve", "Replan requires explicit approval");
    const response = events.find((e) => e.event_id === args.response_event_id),
      prompt = events.find((e) => e.event_id === context.prompt_event_id);
    check(
      response &&
        response.event_type === "interaction.received" &&
        response.actor === "human" &&
        response.run_id === state.run_id &&
        response.data.prompt_event_id === context.prompt_event_id &&
        response.data.interaction_id === prompt?.data.interaction_id,
      "Missing human approval for this replan",
    );
    check(
      !events.some(
        (e) =>
          e.event_type === "flow.transition_prepared" &&
          e.data.action === "begin_replan" &&
          (e.data.arguments as Fields).response_event_id === response.event_id,
      ),
      "Approval already consumed",
    );
    context.approved = true;
    context.response_event_id = response.event_id;
    state.state = "running";
    state.waiting = null;
  } else if (action === "cancel_replan") {
    fields("response_event_id");
    const context = state.replan;
    check(
      context && !context.approved,
      "Only unapproved replans can be cancelled",
      true,
    );
    const response = events.find((e) => e.event_id === args.response_event_id);
    const prompt = events.find((e) => e.event_id === context.prompt_event_id);
    check(
      response &&
        response.event_type === "interaction.received" &&
        response.actor === "human" &&
        response.run_id === state.run_id &&
        response.data.prompt_event_id === context.prompt_event_id &&
        response.data.interaction_id === prompt?.data.interaction_id,
      "Missing human cancellation",
    );
    const prepared = events.find(
      (e) =>
        e.event_type === "flow.transition_prepared" &&
        e.data.action === "request_replan" &&
        ((e.data.after as Fields).replan as Fields).prompt_event_id ===
          context.prompt_event_id,
    );
    check(prepared, "Missing original replan state");
    for (const ref of Object.values(context.before))
      if (ref) store.reference(ref);
    const revision = state.state_revision;
    Object.assign(state, prepared.data.before, {
      state_revision: revision,
      replan: null,
    });
  } else {
    fields("artifacts");
    const context = state.replan;
    check(
      context?.approved &&
        state.phase === "replanning" &&
        state.state === "running",
      "No approved replan",
      true,
    );
    check(
      args.artifacts &&
        equal(Object.keys(args.artifacts).sort(), [
          "design",
          "implement",
          "plan",
        ]),
      "Invalid replan artifacts",
    );
    const approval = events.findIndex(
      (e) =>
        e.event_type === "flow.transitioned" &&
        e.data.action === "begin_replan" &&
        e.run_id === state.run_id &&
        e.data.after_revision === state.state_revision,
    );
    for (const artifact of ["design", "plan", "implement"] as const) {
      const before = context.before[artifact],
        ref = args.artifacts[artifact] as ArtifactRef | null;
      check(!before || ref, "Cannot discard existing artifact");
      check(before || !ref, "Replan only synchronizes existing artifacts");
      if (!ref) continue;
      const [meta] = store.reference(ref);
      check(
        ref.path === `artifacts/${artifact}.md` && meta.artifact === artifact,
        "Wrong replan artifact identity",
      );
      store.checkDocumentInputs(meta);
      if (!equal(ref, before)) {
        check(
          meta.producer === "flow-artifact-sync" &&
            ref.revision > before!.revision,
          "Replan update must be owned by sync",
        );
        check(
          events.some(
            (e, index) =>
              index > approval &&
              e.event_type === "artifact.updated" &&
              equal(e.data.artifact, ref),
          ),
          "Artifact was not synchronized after approval",
        );
      }
      evidence.push(ref);
    }
    check(
      !equal(
        args.artifacts[context.target_phase],
        context.before[context.target_phase],
      ),
      "Approved target was not revised",
    );
    if (context.target_phase === "plan")
      check(
        equal(args.artifacts.design, context.before.design),
        "Plan replan cannot change Design",
      );
    const design = args.artifacts.design as ArtifactRef,
      plan = args.artifacts.plan as ArtifactRef | null;
    if (plan)
      check(
        store
          .reference(plan)[0]
          .inputs.some((r: ArtifactRef) => equal(r, design)),
        "Replanned Plan must reference latest Design",
      );
    const implement = args.artifacts.implement as ArtifactRef | null;
    if (implement) {
      const [meta] = store.reference(implement);
      check(
        meta.producer === "flow-artifact-sync" &&
          meta.status === "blocked" &&
          equal(meta.plan, plan),
        "Replan must invalidate old implementation evidence",
      );
    }
    state.artifacts = args.artifacts;
    state.reviews.plan_decision = null;
    state.reviews.plan_final = null;
    if (context.target_phase === "design") state.reviews.design = null;
    state.phase = context.target_phase;
    state.replan = null;
    state.pending_operation = null;
    state.pending_feedback = null;
    state.active_review = null;
    state.blocker = null;
    // Counters and cycle numbers are deliberately retained across replan attempts.
  }
}
