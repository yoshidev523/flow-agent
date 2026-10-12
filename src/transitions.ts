import fs from "node:fs";
import type { Store } from "./persistence/store.js";
import { eventId } from "./persistence/store.js";
import { type ArtifactRef, type FlowState } from "./contracts/index.js";
import {
  now,
  dump,
  digest,
  equal,
  fingerprint,
  type Fields,
} from "./format.js";
import { STAGES, validateMeta, type Stage } from "./validation/guards.js";
import { FlowError, requireCondition as check } from "./errors.js";

import { replanTransition } from "./replanning.js";

export function transition(store: Store, request: Fields): FlowState {
  store.consistent(request.request_id);
  check(
    ["request_id", "expected_state_revision", "action"].every(
      (k) => k in request,
    ),
    "Missing transition fields",
  );
  const replay = store.replay(request);
  if (replay) return replay as FlowState;
  const current = store.state();
  store.verifyStateRecord(current, store.events()[1]);
  check(
    Number.isInteger(request.expected_state_revision) &&
      current.state_revision === request.expected_state_revision,
    "State revision changed",
    true,
  );
  check(
    current.state !== "completed" || request.action === "request_replan",
    "Completed Flow is terminal without replan approval",
    true,
  );
  check(
    !current.replan ||
      ["begin_replan", "finish_replan", "cancel_replan"].includes(
        request.action,
      ),
    "Resolve replan before other transitions",
    true,
  );
  const state = structuredClone(current),
    action = request.action,
    args = Object.fromEntries(
      Object.entries(request).filter(
        ([k]) =>
          !["request_id", "expected_state_revision", "action"].includes(k),
      ),
    ),
    evidence: ArtifactRef[] = [];
  const fields = (...names: string[]) =>
    check(
      equal(Object.keys(args).sort(), names.sort()),
      "Invalid fields for action " + action,
    );
  const running = () =>
    check(
      state.state === "running" && state.active_invocation === null,
      "Action requires idle running state",
      true,
    );
  const feedback = (p: string, operation: string): [Fields, ArtifactRef] => {
    const [fm, , fr] = store.document(p);
    check(
      fm.schema_version === "flow/phase-feedback-v2" &&
        fm.operation === operation,
      "Wrong feedback operation",
    );
    check(
      equal(fm.target, state.artifacts[fm.phase as "design" | "plan"]),
      "Feedback targets wrong active artifact",
    );
    const expected =
      state.active_review?.target ??
      state.artifacts[state.phase as "design" | "plan" | "implement"];
    check(equal(fm.target, expected), "Feedback cannot revise another phase");
    store.reference(fm.target);
    evidence.push(fr);
    return [fm, fr];
  };
  const writer = (
    phase: "design" | "plan",
    operation: "revise" | "respond",
    ref: ArtifactRef,
  ) =>
    Object.assign(state, {
      phase,
      state: "running",
      active_review: null,
      waiting: null,
      blocker: null,
      pending_operation: operation,
      pending_feedback: ref,
    });
  if (
    [
      "request_replan",
      "begin_replan",
      "finish_replan",
      "cancel_replan",
    ].includes(action)
  ) {
    replanTransition(store, state, action, args, evidence);
  } else if (action === "start_invocation") {
    fields("invocation_id", "component", "operation", "inputs");
    running();
    const components = {
      design: "flow-design",
      plan: "flow-plan",
      implement: "flow-implement",
      design_review: "flow-design-review",
      plan_decision_review: "flow-plan-decision-review",
      plan_review: "flow-plan-review",
      completed: null,
      replanning: null,
    };
    check(
      args.component === components[state.phase],
      "Wrong component for phase",
    );
    check(
      args.operation ===
        (["design", "plan", "implement"].includes(state.phase)
          ? state.pending_operation
          : "review"),
      "Wrong operation for phase",
    );
    if (
      ["design_review", "plan_decision_review", "plan_review"].includes(
        state.phase,
      )
    ) {
      check(state.active_review, "Start review cycle first");
      evidence.push(state.active_review.target);
      if (state.active_review.mode === "human") {
        check(
          state.active_review.human_source,
          "Human review requires a recorded human response",
        );
        store.reference(state.active_review.human_source);
      }
    }
    for (const r of args.inputs) {
      store.reference(r);
      evidence.push(r);
    }
    if (state.pending_feedback)
      check(
        args.inputs.some((r: ArtifactRef) => equal(r, state.pending_feedback)),
        "Writer invocation must include pending feedback",
      );
    if (state.phase === "plan" || state.phase === "implement") {
      const input = state.artifacts[state.phase === "plan" ? "design" : "plan"];
      check(
        input && args.inputs.some((r: ArtifactRef) => equal(r, input)),
        "Missing active upstream artifact",
      );
      if (state.phase === "implement") {
        const [pm] = store.reference(input);
        check(
          pm.inputs.some((r: ArtifactRef) => equal(r, state.artifacts.design)),
          "Plan Design reference mismatch",
        );
        check(state.artifacts.design, "Missing Design");
        store.reference(state.artifacts.design);
      }
    }
    const invocationEvents = store.events()[1];
    check(
      !invocationEvents.some(
        (e) =>
          (e.event_type === "invocation.started" &&
            e.invocation_id === args.invocation_id) ||
          (e.event_type === "flow.transition_prepared" &&
            e.data.action === "start_invocation" &&
            (e.data.arguments as Fields).invocation_id === args.invocation_id &&
            invocationEvents.some(
              (completed) =>
                completed.event_type === "flow.transitioned" &&
                completed.data.prepared_event_id === e.event_id,
            )),
      ),
      "Invocation ID already used",
    );
    state.active_invocation = args as FlowState["active_invocation"];
  } else if (action === "finish_invocation") {
    fields("invocation_id", "outputs");
    const active = state.active_invocation;
    check(
      active && active.invocation_id === args.invocation_id,
      "Unknown active invocation",
    );
    check(
      args.outputs.length === 1,
      "Phase invocation must publish one owned artifact",
    );
    const output: ArtifactRef = args.outputs[0],
      [meta] = store.reference(output);
    evidence.push(output);
    if (
      state.phase === "design" ||
      state.phase === "plan" ||
      state.phase === "implement"
    ) {
      const artifact = state.phase;
      check(
        meta.artifact === artifact &&
          meta.invocation_id === active.invocation_id,
        "Wrong invocation output",
      );
      check(
        meta.operation === active.operation,
        "Output operation differs from invocation",
      );
      check(
        meta.revision > (state.artifacts[artifact]?.revision ?? 0),
        "Output revision did not increase",
      );
      if (state.pending_feedback)
        check(
          meta.inputs.some((r: ArtifactRef) =>
            equal(r, state.pending_feedback),
          ),
          "Output does not reference pending feedback",
        );
      if (artifact === "plan") {
        check(
          meta.inputs.some((r: ArtifactRef) =>
            equal(r, state.artifacts.design),
          ),
          "Plan does not reference active Design",
        );
        check(state.artifacts.design, "Missing Design");
        store.reference(state.artifacts.design);
      }
      if (artifact === "implement") {
        check(
          equal(meta.plan, state.artifacts.plan),
          "Implement Plan mismatch",
        );
        store.reference(meta.plan);
      }
      state.artifacts[artifact] = output;
      state.pending_feedback = null;
      state.pending_operation = artifact === "implement" ? "execute" : null;
    } else {
      const ar = state.active_review;
      check(ar, "No active review");
      check(
        output.path === ar.path &&
          meta.schema_version === "flow/phase-review-v2",
        "Wrong review output path",
      );
      check(
        meta.review_cycle_id === ar.review_cycle_id && meta.mode === ar.mode,
        "Wrong review output cycle/mode",
      );
      store.checkDocumentInputs(meta);
      state.reviews[ar.stage] = output;
    }
    state.active_invocation = null;
  } else if (action === "fail_invocation") {
    fields("invocation_id", "reason");
    check(
      state.active_invocation &&
        state.active_invocation.invocation_id === args.invocation_id,
      "Unknown active invocation",
    );
    Object.assign(state, {
      state: "blocked",
      blocker: args.reason,
      active_invocation: null,
    });
  } else if (action === "start_review") {
    fields("stage");
    running();
    const stage = args.stage as Stage;
    check(stage in STAGES, "Unknown review stage");
    const [phase, artifact] = STAGES[stage];
    check(
      state.phase === artifact || state.phase === phase,
      "Review stage cannot start from this phase",
      true,
    );
    check(
      state.active_review === null,
      "Resolve active review before starting another cycle",
      true,
    );
    const target = state.artifacts[artifact];
    check(target, "Missing target artifact");
    const [tm] = store.reference(target);
    check(
      tm.status === (stage === "plan_decision" ? "needs_input" : "ready"),
      "Wrong target status",
      true,
    );
    const design = artifact === "plan" ? state.artifacts.design : null;
    if (design) {
      const [dm] = store.reference(design);
      check(
        dm.status === "ready" &&
          tm.inputs.some((r: ArtifactRef) => equal(r, design)),
        "Stale Plan Design input",
      );
      evidence.push(design);
    }
    const number = ++state.cycle_counters[stage],
      directory = stage.replace("_", "-"),
      mode = state.review_mode[stage === "design" ? "design" : "plan"];
    Object.assign(state, {
      phase,
      pending_operation: null,
      pending_feedback: null,
    });
    state.reviews[stage] = null;
    state.active_review = {
      stage,
      review_cycle_id: `${directory}-cycle-${String(number).padStart(4, "0")}`,
      mode,
      target,
      design,
      path: `reviews/${directory}/cycle-${String(number).padStart(4, "0")}/review.md`,
      scope_acknowledged: false,
      human_source: null,
    };
    evidence.push(target);
  } else if (action === "wait") {
    fields("kind", "prompt_event_id");
    running();
    const prompt = store
      .events()[1]
      .find((e) => e.event_id === args.prompt_event_id);
    check(
      prompt && prompt.event_type === "interaction.presented",
      "Missing presented interaction",
    );
    check(prompt.run_id === state.run_id, "Prompt belongs to another run");
    const data = prompt.data as Fields;
    check(data.kind === args.kind, "Prompt kind mismatch");
    const kind = args.kind,
      target = data.target,
      [tm] = store.reference(target),
      ids: string[] = data.question_ids;
    check(
      new Set(ids).size === ids.length && ids.length,
      "Invalid question IDs",
    );
    if (kind === "writer_question") {
      check(
        state.phase === "design" &&
          equal(target, state.artifacts.design) &&
          tm.status === "needs_input",
        "Writer questions are only presented directly in Design",
      );
      check(
        ids.every((id) =>
          tm.questions.some((q: Fields) => q.id === id && q.status === "open"),
        ),
        "Unknown open question",
      );
    } else if (kind === "human_review") {
      const ar = state.active_review;
      check(
        ar &&
          ar.mode === "human" &&
          equal(target, ar.target) &&
          state.reviews[ar.stage] === null,
        "No pending human review",
      );
    } else if (kind === "review_decision" || kind === "scope_candidate") {
      const result = store.reviewResult(state);
      check(
        state.active_review && equal(target, state.active_review.target),
        "Prompt target mismatch",
      );
      if (kind === "review_decision") {
        if (result.status === "blocked")
          check(
            ids.every((id) =>
              result.judgments.some((q: Fields) => q.id === id),
            ),
            "Unknown review judgment",
          );
        else {
          check(
            state.phase === "plan_decision_review" &&
              result.status === "passed",
            "Questions require passed decision review",
          );
          check(
            ids.every((id) =>
              tm.questions.some(
                (q: Fields) => q.id === id && q.status === "open",
              ),
            ),
            "Unknown Plan question",
          );
        }
      } else
        check(
          result.status === "passed" &&
            equal(
              [...ids].sort(),
              result.findings
                .filter((f: Fields) => f.classification === "scope_candidate")
                .map((f: Fields) => f.id)
                .sort(),
            ),
          "Invalid scope candidate prompt",
        );
    } else if (kind === "implement_blocker")
      check(
        state.phase === "implement" &&
          equal(target, state.artifacts.implement) &&
          tm.status === "blocked",
        "No Implement blocker",
      );
    else throw new FlowError("Unknown waiting kind");
    Object.assign(state, {
      state: "waiting_for_input",
      waiting: {
        kind,
        target,
        question_ids: ids,
        prompt_event_id: prompt.event_id,
      },
    });
    evidence.push(target);
  } else if (action === "answer") {
    fields(
      "response_event_id",
      "feedback_path",
      "source_path",
      "scope_disposition",
    );
    check(state.state === "waiting_for_input", "No pending question", true);
    const waiting = state.waiting;
    check(waiting, "Missing waiting context");
    const events = store.events()[1],
      response = events.find((e) => e.event_id === args.response_event_id),
      prompt = events.find((e) => e.event_id === waiting.prompt_event_id);
    check(
      response &&
        response.event_type === "interaction.received" &&
        response.actor === "human" &&
        response.run_id === state.run_id,
      "Missing human response",
    );
    check(
      prompt &&
        response.data.prompt_event_id === prompt.event_id &&
        response.data.interaction_id === prompt.data.interaction_id,
      "Response belongs to another prompt",
    );
    store.reference(waiting.target);
    const kind = waiting.kind;
    if (kind === "writer_question" || kind === "review_decision") {
      check(
        args.source_path === null && args.scope_disposition === null,
        "Unexpected answer inputs",
      );
      const [fm, fr] = feedback(args.feedback_path, "respond");
      check(
        equal(
          [...new Set(fm.items.map((x: Fields) => x.target))].sort(),
          [...waiting.question_ids].sort(),
        ),
        "Feedback must answer presented questions",
      );
      writer(fm.phase, "respond", fr);
    } else if (kind === "human_review") {
      check(
        args.feedback_path === null && args.scope_disposition === null,
        "Unexpected human review inputs",
      );
      const [sm, , sr] = store.document(args.source_path),
        ar = state.active_review;
      check(ar, "No active review");
      check(
        sm.schema_version === "flow/review-source-v2" &&
          sm.source_kind === "human" &&
          sm.source_id === "human",
        "Invalid human source",
      );
      check(
        sm.review_cycle_id === ar.review_cycle_id &&
          equal(sm.target, ar.target) &&
          equal(sm.design, ar.design),
        "Human source target/cycle mismatch",
      );
      state.state = "running";
      state.waiting = null;
      evidence.push(sr);
      ar.human_source = sr;
    } else if (kind === "scope_candidate") {
      check(
        args.source_path === null &&
          ["exclude", "adopt"].includes(args.scope_disposition),
        "Invalid scope disposition",
      );
      if (args.scope_disposition === "exclude") {
        check(
          args.feedback_path === null,
          "Excluded candidates cannot create feedback",
        );
        check(state.active_review, "No active review");
        state.active_review.scope_acknowledged = true;
        state.state = "running";
        state.waiting = null;
      } else {
        const [fm, fr] = feedback(args.feedback_path, "revise");
        check(
          fm.items.every((x: Fields) =>
            waiting.question_ids.includes(x.target),
          ),
          "Only adopted candidates may create feedback",
        );
        writer(fm.phase, "revise", fr);
      }
    } else {
      check(
        args.feedback_path === null &&
          args.source_path === null &&
          args.scope_disposition === null,
        "Unexpected blocker answer inputs",
      );
      Object.assign(state, {
        state: "running",
        waiting: null,
        pending_operation: "execute",
      });
    }
  } else if (action === "revise") {
    fields("feedback_path");
    running();
    const result = store.reviewResult(state);
    check(
      result.status === "changes_required",
      "Revision requires changes_required review",
      true,
    );
    const ar = state.active_review;
    check(ar, "No active review");
    if (ar.mode === "ai") {
      const counter = state.counters[ar.stage];
      check(
        counter.automatic_revision === 0,
        "Automatic revision exhausted; switch to human",
        true,
      );
      counter.automatic_revision = 1;
    }
    const [fm, fr] = feedback(args.feedback_path, "revise");
    writer(fm.phase, "revise", fr);
  } else if (action === "retry") {
    fields();
    running();
    const result = store.reviewResult(state);
    check(
      result.status === "incomplete" && result.failure.kind === "execution",
      "Only execution failures can retry",
      true,
    );
    const ar = state.active_review;
    check(ar, "No active review");
    const counter = ar.mode === "ai" ? "execution_retry" : "human_retry";
    check(state.counters[ar.stage][counter] === 0, "Retry exhausted", true);
    state.counters[ar.stage][counter] = 1;
    state.active_review = null;
  } else if (action === "set_mode") {
    fields("stage", "mode", "reason", "origin_event_id");
    running();
    const stage = args.stage as Stage,
      mode = args.mode;
    check(
      stage in STAGES && ["ai", "human"].includes(mode),
      "Invalid mode/stage",
    );
    if (args.origin_event_id)
      check(
        store
          .events()[1]
          .some(
            (e) =>
              e.event_id === args.origin_event_id &&
              e.event_type === "interaction.received" &&
              e.actor === "human" &&
              e.run_id === state.run_id,
          ),
        "Manual mode switch requires a human response event",
      );
    else {
      const result = store.reviewResult(state),
        ar = state.active_review;
      check(
        ar && ar.stage === stage && ar.mode === "ai" && mode === "human",
        "Invalid automatic mode switch",
      );
      const counter = state.counters[stage];
      check(
        (result.status === "changes_required" &&
          counter.automatic_revision === 1) ||
          (result.status === "incomplete" &&
            result.failure.kind === "execution" &&
            counter.execution_retry === 1),
        "Mode switch limit condition is not met",
        true,
      );
    }
    state.review_mode[stage === "design" ? "design" : "plan"] = mode;
    state.active_review = null;
  } else if (action === "advance") {
    fields();
    running();
    if (state.phase === "design_review" || state.phase === "plan_review") {
      const result = store.reviewResult(state);
      check(result.status === "passed", "Review did not pass", true);
      const ar = state.active_review;
      check(ar, "No active review");
      check(
        !result.findings.some(
          (f: Fields) => f.classification === "scope_candidate",
        ) || ar.scope_acknowledged,
        "Scope candidates require disposition",
        true,
      );
      evidence.push(ar.target);
      if (ar.design) evidence.push(ar.design);
      const phase = state.phase === "design_review" ? "plan" : "implement";
      Object.assign(state, {
        phase,
        active_review: null,
        pending_operation:
          phase === "plan"
            ? state.artifacts.plan
              ? null
              : "create"
            : "execute",
        pending_feedback: null,
      });
    } else if (state.phase === "implement") {
      const ref = state.artifacts.implement;
      check(ref, "Missing Implement output");
      const [im] = store.reference(ref);
      check(
        im.status === "completed" && equal(im.plan, state.artifacts.plan),
        "Implement is not completed against active Plan",
        true,
      );
      store.reference(im.plan);
      evidence.push(ref);
      Object.assign(state, {
        phase: "completed",
        state: "completed",
        pending_operation: null,
        pending_feedback: null,
      });
    } else
      throw new FlowError(
        "No advance transition from this phase",
        "condition",
        2,
      );
  } else if (action === "block") {
    fields("reason", "resume_condition");
    Object.assign(state, {
      state: "blocked",
      blocker: args.reason + " / 再開条件: " + args.resume_condition,
      waiting: null,
      active_invocation: null,
    });
  } else if (action === "resume") {
    fields("reason", "evidence");
    check(state.state === "blocked", "Resume requires blocked state", true);
    for (const r of args.evidence) {
      store.reference(r);
      evidence.push(r);
    }
    state.state = "running";
    state.blocker = null;
  } else throw new FlowError("Unknown transition action: " + action);
  state.state_revision++;
  state.updated_at = now();
  state.last_transition_event_id = eventId(store.events()[1].length + 2);
  validateMeta(state);
  const before = digest(fs.readFileSync(store.path("flow-state.yml"))),
    afterData = dump(state);
  const prepared = store.append(
    "flow.transition_prepared",
    {
      action,
      before_sha256: before,
      request_sha256: fingerprint(request),
      after_sha256: digest(afterData),
      after: state,
      before: current,
      arguments: args,
      evidence,
    },
    request.request_id + ":prepared",
    "flow",
    state.run_id,
  );
  store.atomic("flow-state.yml", afterData);
  const completed = store.append(
    "flow.transitioned",
    {
      prepared_event_id: prepared.event_id,
      action,
      before_revision: current.state_revision,
      after_revision: state.state_revision,
      from_phase: current.phase,
      to_phase: state.phase,
      from_state: current.state,
      to_state: state.state,
      evidence,
    },
    request.request_id + ":completed",
    "flow",
    state.run_id,
    null,
    [prepared.event_id],
  );
  check(
    completed.event_id === state.last_transition_event_id,
    "Transition event sequence mismatch",
  );
  store.completeTransitionAudit(prepared, completed);
  return state;
}
