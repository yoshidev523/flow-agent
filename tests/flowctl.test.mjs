import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  f = require("../.test-runtime/flowctl.cjs");
const SCRIPT = path.resolve(".apm/skills/flow/scripts/flowctl.js");
const body = (kind) =>
  "# 成果物\n\n" +
  f.HEADINGS[kind]
    .map((h) => "## " + h + (h === "変更履歴" ? "" : "\n実施内容。"))
    .join("\n\n") +
  "\n";
const question = () => ({
  id: "Q-001",
  question: "保存方針を選ぶ",
  required: true,
  status: "open",
  options: [
    { id: "A", text: "即時保存", impact: "毎回保存" },
    { id: "B", text: "手動保存", impact: "操作が必要" },
  ],
  recommendation: "A",
  reason: "要求に一致",
  assumptions: [],
  answer: null,
});
const task = () => ({
  id: "T-001",
  files: ["app.js"],
  dependencies: [],
  completion: "保存できる",
  verification: "保存テストが成功",
  verification_ids: ["V-001"],
});
class Fixture {
  constructor(t) {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), "flow-v4-node-test-"));
    t.after(() => fs.rmSync(this.root, { recursive: true, force: true }));
    this.store = new f.Store(this.root);
    this.store.initialize({
      request_id: "init",
      feature_id: "20261010_example",
      run_id: "run-001",
      text: "保存機能を作る",
    });
  }
  tr(action, args = {}) {
    return this.store.transition({
      request_id: randomUUID(),
      expected_state_revision: this.store.state().state_revision,
      action,
      ...args,
    });
  }
  pub(p, meta, kind) {
    const old = fs.existsSync(this.store.path(p))
      ? this.store.document(p)[2]
      : null;
    const request = {
      request_id: randomUUID(),
      run_id: "run-001",
      target_path: p,
      expected_revision: old?.revision ?? 0,
      expected_sha256: old?.sha256 ?? null,
      document: f.render(
        meta,
        body(kind ?? meta.artifact ?? f.KINDS[meta.schema_version]),
      ),
      change: "内容を確定",
      reason: "要求に対応",
      sections: ["目的"],
      references: [],
    };
    return [this.store.publish(request).artifact, request];
  }
  artifact(
    artifact,
    status = "ready",
    inputs = [],
    operation = "create",
    invocation = "inv-001",
  ) {
    return {
      schema_version: "flow/phase-artifact-v2",
      artifact,
      revision: 1,
      status,
      producer: "flow-" + artifact,
      invocation_id: invocation,
      operation,
      updated_at: f.now(),
      inputs,
      questions: status === "needs_input" ? [question()] : [],
      feedback_results: [],
      tasks: artifact === "plan" && status === "ready" ? [task()] : [],
      verification_plan:
        artifact === "plan" && status === "ready"
          ? [{ id: "V-001", command: "node --test", required: true }]
          : [],
      handoff_checks:
        artifact === "plan" && status === "ready"
          ? [
              "scope",
              "files",
              "responsibilities",
              "interfaces",
              "errors",
              "dependencies",
              "completion",
              "verification",
            ].map((id) => ({ id, status: "ok", reason: "計画に記載" }))
          : [],
    };
  }
  writer(
    artifact,
    status = "ready",
    operation = "create",
    inputs = null,
    meta = null,
  ) {
    const invocation = randomUUID();
    inputs ??= artifact === "plan" ? [this.store.state().artifacts.design] : [];
    this.tr("start_invocation", {
      invocation_id: invocation,
      component: "flow-" + artifact,
      operation,
      inputs,
    });
    meta ??= this.artifact(artifact, status, inputs, operation, invocation);
    meta.invocation_id = invocation;
    const [ref] = this.pub("artifacts/" + artifact + ".md", meta);
    this.tr("finish_invocation", { invocation_id: invocation, outputs: [ref] });
    return ref;
  }
  source(sourceId, findings = [], failure = null) {
    const ar = this.store.state().active_review;
    return {
      schema_version: "flow/review-source-v2",
      revision: 1,
      phase: f.STAGES[ar.stage][1],
      review_stage: f.STAGES[ar.stage][2],
      review_cycle_id: ar.review_cycle_id,
      target: ar.target,
      design: ar.design,
      source_id: sourceId,
      source_kind: ar.mode,
      status: failure ? "unable" : f.findingStatus(findings),
      findings,
      failure,
      created_at: f.now(),
    };
  }
  review(stage, findings = [], failure = null, missing = false) {
    this.tr("start_review", { stage });
    const ar = this.store.state().active_review,
      paths = [];
    for (const id of ar.mode === "ai" ? f.EXPECTED[stage] : ["human"]) {
      const p = path.posix.join(
        path.posix.dirname(ar.path),
        "sources",
        id + ".md",
      );
      paths.push(p);
      if (!missing) this.pub(p, this.source(id, findings, failure));
    }
    if (ar.mode === "human" && !missing) {
      const response = this.interact("human_review", ar.target, ["HR-001"]);
      this.tr("answer", {
        response_event_id: response.event_id,
        feedback_path: null,
        source_path: paths[0],
        scope_disposition: null,
      });
    }
    const result = this.store.reviewCheck(
        stage,
        ar.target,
        ar.design,
        ar.review_cycle_id,
        ar.mode,
        paths,
      ),
      meta = {
        ...result,
        schema_version: "flow/phase-review-v2",
        revision: 1,
        created_at: f.now(),
        mode: ar.mode,
      },
      invocation = randomUUID();
    this.tr("start_invocation", {
      invocation_id: invocation,
      component: {
        design: "flow-design-review",
        plan_decision: "flow-plan-decision-review",
        plan_final: "flow-plan-review",
      }[stage],
      operation: "review",
      inputs: [ar.target],
    });
    const [ref] = this.pub(ar.path, meta);
    this.tr("finish_invocation", { invocation_id: invocation, outputs: [ref] });
    return meta;
  }
  gate(human = false) {
    return {
      id: "G-001",
      classification: "gate",
      resolution: human ? "human_decision" : "revise",
      decision_refs: [],
      target: "受け入れ条件",
      problem: "条件が不足",
      evidence: "要求に条件あり",
      instruction: "条件を追加",
      completion: "条件が記載される",
      judgment: human
        ? {
            id: "D-001",
            question: "条件を採用するか",
            background: "要求の確定が必要",
            options: question().options,
            recommendation: "A",
            reason: "要求に一致",
            answer_format: "AまたはB",
          }
        : null,
    };
  }
  feedback(phase, operation = "respond", targets = ["Q-001"]) {
    const directory = this.store.path("feedback/" + phase),
      number = fs.existsSync(directory)
        ? fs.readdirSync(directory).filter((p) => p.endsWith(".md")).length + 1
        : 1;
    const meta = {
      schema_version: "flow/phase-feedback-v2",
      revision: 1,
      phase,
      target: this.store.state().artifacts[phase],
      operation,
      created_at: f.now(),
      items: targets.map((target, i) => ({
        id: "F-" + String(i + 1).padStart(3, "0"),
        kind: operation === "respond" ? "answer" : "change",
        target,
        instruction: "Aを採用",
        evidence: "利用者回答",
        completion: "回答を反映",
      })),
    };
    return this.pub(
      `feedback/${phase}/feedback-${String(number).padStart(4, "0")}.md`,
      meta,
    )[0];
  }
  event(eventType, data, key = randomUUID(), actor = "flow") {
    return this.store.auditAppend({
      event_key: key,
      event_type: eventType,
      actor,
      run_id: "run-001",
      invocation_id: null,
      caused_by: [],
      data,
      occurred_at: f.now(),
    });
  }
  interact(kind, target, ids) {
    const prompt = this.event("interaction.presented", {
      interaction_id: randomUUID(),
      kind,
      target,
      question_ids: ids,
      text: "AかBを選んでください",
    });
    this.tr("wait", { kind, prompt_event_id: prompt.event_id });
    return this.event(
      "interaction.received",
      {
        interaction_id: prompt.data.interaction_id,
        prompt_event_id: prompt.event_id,
        text: "A",
      },
      randomUUID(),
      "human",
    );
  }
  implement(plan, status = "completed", invocation = "inv-x") {
    return {
      schema_version: "flow/implement-artifact-v2",
      artifact: "implement",
      revision: 1,
      status,
      producer: "flow-implement",
      invocation_id: invocation,
      operation: "execute",
      updated_at: f.now(),
      plan,
      tasks: [{ id: "T-001", status: "completed", evidence: "app.js変更済み" }],
      verifications: [
        {
          id: "V-001",
          command: "node --test",
          status: "passed",
          required: true,
          reason: "成功",
        },
      ],
      blocker: null,
      commit: "a".repeat(40),
    };
  }
}
const fixture = (name, fn) =>
  test(name, async (t) => {
    const x = new Fixture(t);
    await fn(x, t);
  });
fixture("full AI workflow completes and remains terminal", (x) => {
  x.writer("design");
  x.review("design");
  x.tr("advance");
  const plan = x.writer("plan");
  x.review("plan_final");
  x.tr("advance");
  const id = randomUUID();
  x.tr("start_invocation", {
    invocation_id: id,
    component: "flow-implement",
    operation: "execute",
    inputs: [plan],
  });
  const [impl] = x.pub(
    "artifacts/implement.md",
    x.implement(plan, "completed", id),
  );
  x.tr("finish_invocation", { invocation_id: id, outputs: [impl] });
  assert.equal(x.tr("advance").state, "completed");
  x.store.resumeCheck();
  assert.throws(() => x.tr("advance"), f.FlowError);
});
fixture(
  "Plan decision review precedes question, response, final review",
  (x) => {
    x.writer("design");
    x.review("design");
    x.tr("advance");
    const plan = x.writer("plan", "needs_input");
    assert.throws(
      () =>
        x.tr("wait", { kind: "writer_question", prompt_event_id: "E-000001" }),
      f.FlowError,
    );
    x.review("plan_decision");
    const response = x.interact("review_decision", plan, ["Q-001"]),
      feedback = x.feedback("plan");
    x.tr("answer", {
      response_event_id: response.event_id,
      feedback_path: feedback.path,
      source_path: null,
      scope_disposition: null,
    });
    const inputs = [x.store.state().artifacts.design, feedback],
      meta = x.artifact("plan", "ready", inputs, "respond");
    meta.questions = [{ ...question(), status: "resolved", answer: "A" }];
    meta.feedback_results = [
      { id: "F-001", result: "applied", location: "詳細手順" },
    ];
    x.writer("plan", "ready", "respond", inputs, meta);
    x.review("plan_final");
    assert.equal(x.tr("advance").phase, "implement");
  },
);
fixture("revision history, CAS, publication replay, fixed filename", (x) => {
  const ref = x.writer("design", "needs_input"),
    feedback = x.feedback("design"),
    meta = x.artifact("design", "ready", [feedback], "respond");
  meta.feedback_results = [
    { id: "F-001", result: "applied", location: "受け入れ条件" },
  ];
  const [next, request] = x.pub("artifacts/design.md", meta);
  assert.equal(next.revision, 2);
  const text = fs.readFileSync(x.store.path(ref.path), "utf8");
  assert.match(text, /### revision 1/);
  assert.match(text, /### revision 2/);
  assert.deepEqual(x.store.publish(request).artifact, next);
  assert.throws(
    () => x.store.publish({ ...request, request_id: randomUUID() }),
    f.FlowError,
  );
  assert.equal(
    fs
      .readdirSync(path.dirname(x.store.path(ref.path)))
      .filter((p) => p.endsWith(".md")).length,
    1,
  );
});
fixture(
  "reject duplicate YAML keys, old status/schema, unknown fields",
  (x) => {
    assert.throws(
      () => f.load("status: ready\nstatus: needs_input"),
      f.FlowError,
    );
    for (const update of [
      { schema_version: "flow/phase-artifact-v1" },
      { status: "Approved" },
      { approval: "passed" },
    ])
      assert.throws(
        () =>
          x.pub("artifacts/design.md", { ...x.artifact("design"), ...update }),
        f.FlowError,
      );
  },
);
fixture("ready writer cannot have required open question", (x) => {
  const meta = x.artifact("design");
  meta.questions = [question()];
  assert.throws(() => x.pub("artifacts/design.md", meta), f.FlowError);
});
fixture("task dependency cycle is rejected", (x) => {
  const meta = x.artifact("plan");
  meta.tasks[0].dependencies = ["T-001"];
  assert.throws(() => x.pub("artifacts/plan.md", meta), f.FlowError);
});
fixture("stale digest blocks advance and resume", (x) => {
  const ref = x.writer("design");
  x.review("design");
  const p = x.store.path(ref.path);
  fs.writeFileSync(
    p,
    fs.readFileSync(p, "utf8").replace("実施内容。", "変更された内容。"),
  );
  assert.throws(() => x.tr("advance"), f.FlowError);
  assert.throws(() => x.store.resumeCheck(), f.FlowError);
});
fixture(
  "scope candidates do not affect pass or automatic revision counter",
  (x) => {
    x.writer("design");
    const finding = {
      id: "S-001",
      classification: "scope_candidate",
      decision_refs: [],
      proposal: "追加機能",
      evidence: "任意改善",
      impact: "作業が増える",
      recommendation: "別タスク",
    };
    assert.equal(x.review("design", [finding]).status, "passed");
    assert.throws(() => x.tr("advance"), f.FlowError);
    const response = x.interact(
      "scope_candidate",
      x.store.state().artifacts.design,
      ["requirements:S-001", "quality-risk:S-001"],
    );
    x.tr("answer", {
      response_event_id: response.event_id,
      feedback_path: null,
      source_path: null,
      scope_disposition: "exclude",
    });
    x.tr("advance");
    assert.equal(x.store.state().counters.design.automatic_revision, 0);
  },
);
fixture("automatic revision limit then human review", (x) => {
  x.writer("design");
  x.review("design", [x.gate()]);
  const feedback = x.feedback("design", "revise", ["requirements:G-001"]);
  x.tr("revise", { feedback_path: feedback.path });
  const meta = x.artifact("design", "ready", [feedback], "revise");
  meta.feedback_results = [
    { id: "F-001", result: "applied", location: "受け入れ条件" },
  ];
  x.writer("design", "ready", "revise", [feedback], meta);
  x.review("design", [x.gate()]);
  assert.throws(
    () => x.tr("revise", { feedback_path: feedback.path }),
    f.FlowError,
  );
  x.tr("set_mode", {
    stage: "design",
    mode: "human",
    reason: "自動修正上限",
    origin_event_id: null,
  });
  x.review("design");
  x.tr("advance");
  assert.equal(x.store.state().counters.design.automatic_revision, 1);
});
fixture(
  "execution retry limit, human switch, contract failure cannot retry",
  (x) => {
    x.writer("design");
    x.review("design", [], null, true);
    x.tr("retry");
    x.review("design", [], null, true);
    assert.throws(() => x.tr("retry"), f.FlowError);
    x.tr("set_mode", {
      stage: "design",
      mode: "human",
      reason: "retry上限",
      origin_event_id: null,
    });
    x.review("design", [], { kind: "contract", reason: "schema不一致" });
    assert.throws(() => x.tr("retry"), f.FlowError);
    assert.throws(() => x.tr("advance"), f.FlowError);
  },
);
fixture("blocked review requires human answer feedback", (x) => {
  x.writer("design");
  assert.equal(x.review("design", [x.gate(true)]).status, "blocked");
  const response = x.interact(
      "review_decision",
      x.store.state().artifacts.design,
      ["requirements:D-001", "quality-risk:D-001"],
    ),
    feedback = x.feedback("design", "respond", [
      "requirements:D-001",
      "quality-risk:D-001",
    ]);
  assert.equal(
    x.tr("answer", {
      response_event_id: response.event_id,
      feedback_path: feedback.path,
      source_path: null,
      scope_disposition: null,
    }).phase,
    "design",
  );
});
fixture("mixed source modes fail aggregation", (x) => {
  x.writer("design");
  x.tr("start_review", { stage: "design" });
  const ar = x.store.state().active_review,
    meta = x.source("human");
  meta.source_kind = "human";
  const p = path.posix.join(path.posix.dirname(ar.path), "sources/human.md");
  x.pub(p, meta);
  const result = x.store.reviewCheck(
    "design",
    ar.target,
    null,
    ar.review_cycle_id,
    "ai",
    [p],
  );
  assert.equal(result.status, "incomplete");
  assert.equal(result.failure.kind, "contract");
});
fixture("audit idempotency and event data schema", (x) => {
  const data = {
    decision: "A",
    rule_id: "R-001",
    reason: "要求に一致",
    evidence: [],
    assumptions: [],
  };
  const first = x.event("decision.made", data, "same");
  assert.equal(x.event("decision.made", data, "same").event_id, first.event_id);
  assert.throws(
    () => x.event("decision.made", { ...data, decision: "B" }, "same"),
    f.FlowError,
  );
  assert.throws(
    () => x.event("decision.made", { text: "自由形式" }),
    f.FlowError,
  );
});
function runCli(args, input, options = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    input: typeof input === "string" ? input : JSON.stringify(input),
    encoding: "utf8",
    ...options,
  });
}
function concurrentCli(args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, out, err }));
    child.stdin.end(JSON.stringify(input));
  });
}
fixture("five processes append contiguous unique audit records", async (x) => {
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, n) =>
      concurrentCli(["--root", x.root, "audit-append", "--request", "-"], {
        event_key: "parallel-" + n,
        event_type: "action.completed",
        actor: "reviewer-" + n,
        run_id: "run-001",
        invocation_id: null,
        occurred_at: f.now(),
        caused_by: [],
        data: { action: "review", result: "finished", evidence: [] },
      }),
    ),
  );
  for (const r of results) assert.equal(r.code, 0, r.out + r.err);
  assert.equal(x.store.events()[1].length, 6);
});
fixture("truncated audit blocks writes", (x) => {
  fs.appendFileSync(
    x.store.path("audit.md"),
    "\n## E-000002 — action.started\n",
  );
  assert.throws(
    () => x.event("action.started", { action: "x", detail: "x" }),
    f.FlowError,
  );
});
fixture(
  "publication failure before and after atomic replacement recovers",
  (x) => {
    const original = x.store.atomic.bind(x.store);
    x.store.atomic = () => {
      throw new Error("simulated disk failure");
    };
    assert.throws(() => x.pub("artifacts/design.md", x.artifact("design")));
    x.store.atomic = original;
    assert.throws(() => x.tr("advance"), f.FlowError);
    x.store.resumeCheck(true);
    assert.equal(fs.existsSync(x.store.path("artifacts/design.md")), false);
    x.store.atomic = (name, data) => {
      original(name, data);
      throw new Error("simulated interruption");
    };
    assert.throws(() => x.pub("artifacts/design.md", x.artifact("design")));
    x.store.atomic = original;
    x.store.resumeCheck(true);
    assert.ok(fs.existsSync(x.store.path("artifacts/design.md")));
    assert.equal(x.store.pending().length, 0);
  },
);
fixture("transition replacement interruption recovers", (x) => {
  const original = x.store.atomic.bind(x.store);
  x.store.atomic = (name, data) => {
    original(name, data);
    throw new Error("interruption");
  };
  assert.throws(() =>
    x.tr("block", { reason: "環境障害", resume_condition: "環境復旧" }),
  );
  x.store.atomic = original;
  assert.equal(x.store.resumeCheck(true).state.state, "blocked");
  x.tr("resume", { reason: "環境復旧", evidence: [] });
});
fixture("path escape and escaping symlink are rejected", (x) => {
  assert.throws(() => x.store.path("../outside.md"), f.FlowError);
  fs.symlinkSync(os.tmpdir(), x.store.path("escape"), "dir");
  assert.throws(() => x.store.path("escape/outside.md"), f.FlowError);
});
fixture("standalone leaf publication creates audit without Flow state", (x) => {
  const s = new f.Store(path.join(x.root, "standalone"));
  s.publish({
    request_id: "leaf",
    run_id: "standalone",
    target_path: "artifacts/design.md",
    expected_revision: 0,
    expected_sha256: null,
    document: f.render(x.artifact("design"), body("design")),
    change: "初版",
    reason: "要求整理",
    sections: ["目的"],
    references: [],
  });
  assert.equal(fs.existsSync(s.path("flow-state.yml")), false);
  assert.ok(fs.existsSync(s.path("audit.md")));
});
fixture("handoff and required verification cannot be bypassed", (x) => {
  const meta = x.artifact("plan");
  meta.handoff_checks[0].status = "pending";
  assert.throws(() => x.pub("artifacts/plan.md", meta), f.FlowError);
  const impl = x.implement({
    path: "artifacts/plan.md",
    revision: 1,
    sha256: "0".repeat(64),
  });
  impl.verifications[0].status = "not_run";
  assert.throws(() => f.validateMeta(impl), f.FlowError);
});
fixture("executor cannot change required verification flag", (x) => {
  const [plan] = x.pub("artifacts/plan.md", x.artifact("plan"));
  const meta = x.implement(plan);
  meta.verifications[0].required = false;
  meta.verifications[0].status = "not_run";
  assert.throws(() => x.pub("artifacts/implement.md", meta), f.FlowError);
});
fixture("state mutation without audit is rejected", (x) => {
  const state = x.store.state();
  state.review_mode.design = "human";
  x.store.atomic("flow-state.yml", f.dump(state));
  assert.throws(
    () =>
      x.tr("start_invocation", {
        invocation_id: "inv-x",
        component: "flow-design",
        operation: "create",
        inputs: [],
      }),
    f.FlowError,
  );
  assert.throws(() => x.store.resumeCheck(), f.FlowError);
});
fixture("transition replay does not increment twice", (x) => {
  const request = {
      request_id: "block-once",
      expected_state_revision: 1,
      action: "block",
      reason: "環境障害",
      resume_condition: "環境復旧",
    },
    first = x.store.transition(request);
  assert.deepEqual(x.store.transition(request), first);
  assert.equal(x.store.state().state_revision, 2);
  assert.throws(
    () => x.store.transition({ ...request, reason: "異なる理由" }),
    f.FlowError,
  );
});
fixture("review and feedback are immutable", (x) => {
  x.writer("design", "needs_input");
  const ref = x.feedback("design"),
    [meta] = x.store.document(ref.path);
  assert.throws(() => x.pub(ref.path, meta), f.FlowError);
});
fixture("Plan review feedback cannot revise Design", (x) => {
  x.writer("design");
  x.review("design");
  x.tr("advance");
  x.writer("plan");
  x.review("plan_final", [x.gate()]);
  const ref = x.feedback("design", "revise");
  assert.throws(() => x.tr("revise", { feedback_path: ref.path }), f.FlowError);
  assert.equal(x.store.state().counters.plan_final.automatic_revision, 0);
});
fixture("human hub requires recorded human response", (x) => {
  const response = x.event(
    "interaction.received",
    { interaction_id: "mode-1", prompt_event_id: null, text: "humanで評価" },
    randomUUID(),
    "human",
  );
  x.tr("set_mode", {
    stage: "design",
    mode: "human",
    reason: "利用者指定",
    origin_event_id: response.event_id,
  });
  x.writer("design");
  x.tr("start_review", { stage: "design" });
  assert.throws(
    () =>
      x.tr("start_invocation", {
        invocation_id: "inv-x",
        component: "flow-design-review",
        operation: "review",
        inputs: [x.store.state().artifacts.design],
      }),
    f.FlowError,
  );
});
fixture("response for another prompt is rejected", (x) => {
  const ref = x.writer("design", "needs_input");
  x.interact("writer_question", ref, ["Q-001"]);
  const other = x.event(
      "interaction.received",
      { interaction_id: "other", prompt_event_id: null, text: "A" },
      randomUUID(),
      "human",
    ),
    feedback = x.feedback("design");
  assert.throws(
    () =>
      x.tr("answer", {
        response_event_id: other.event_id,
        feedback_path: feedback.path,
        source_path: null,
        scope_disposition: null,
      }),
    f.FlowError,
  );
});
fixture("standalone recovery does not fabricate Flow state", (x) => {
  const s = new f.Store(path.join(x.root, "leaf")),
    original = s.atomic.bind(s);
  s.atomic = (name, data) => {
    original(name, data);
    if (name === "artifacts/design.md") throw new Error("interrupted");
  };
  assert.throws(() =>
    s.publish({
      request_id: "leaf",
      run_id: "standalone",
      target_path: "artifacts/design.md",
      expected_revision: 0,
      expected_sha256: null,
      document: f.render(x.artifact("design"), body("design")),
      change: "初版",
      reason: "要求整理",
      sections: ["目的"],
      references: [],
    }),
  );
  s.atomic = original;
  assert.equal(s.resumeCheck(true).state, null);
  assert.equal(fs.existsSync(s.path("flow-state.yml")), false);
});
fixture("diverged target is not automatically recovered", (x) => {
  const original = x.store.atomic.bind(x.store);
  x.store.atomic = (name, data) => {
    original(name, data);
    throw new Error("interrupted");
  };
  assert.throws(() => x.pub("artifacts/design.md", x.artifact("design")));
  x.store.atomic = original;
  fs.writeFileSync(
    x.store.path("artifacts/design.md"),
    "unrelated replacement",
  );
  assert.throws(() => x.store.resumeCheck(true), f.FlowError);
  assert.equal(x.store.pending().length, 1);
});
fixture("lost initial state is recoverable from audit", (x) => {
  fs.unlinkSync(x.store.path("flow-state.yml"));
  assert.throws(() => x.store.resumeCheck(), f.FlowError);
  assert.equal(x.store.resumeCheck(true).state.state_revision, 1);
});
fixture("feedback filename allocation and replay", (x) => {
  x.writer("design", "needs_input");
  const ref = x.feedback("design"),
    [meta] = x.store.document(ref.path),
    req = {
      request_id: "auto-feedback",
      run_id: "run-001",
      target_path: "feedback/design/next",
      expected_revision: 0,
      expected_sha256: null,
      document: f.render(meta, body("phase-feedback")),
      change: "回答を保存",
      reason: "利用者回答",
      sections: ["Feedback"],
      references: [],
    },
    result = x.store.publish(req);
  assert.equal(result.artifact.path, "feedback/design/feedback-0002.md");
  assert.deepEqual(x.store.publish(req), result);
});
fixture("standalone aggregate preserves invalid target failure", (x) => {
  const [ref] = x.pub("artifacts/design.md", x.artifact("design"));
  fs.writeFileSync(
    x.store.path(ref.path),
    fs
      .readFileSync(x.store.path(ref.path), "utf8")
      .replace("flow/phase-artifact-v2", "flow/phase-artifact-v1"),
  );
  const result = x.store.reviewCheck(
    "design",
    ref,
    null,
    "design-cycle-0001",
    "ai",
    [
      "reviews/design/cycle-0001/sources/requirements.md",
      "reviews/design/cycle-0001/sources/quality-risk.md",
    ],
  );
  assert.equal(result.status, "incomplete");
  assert.equal(result.failure.kind, "contract");
  x.pub("reviews/design/cycle-0001/review.md", {
    ...result,
    schema_version: "flow/phase-review-v2",
    revision: 1,
    mode: "ai",
    created_at: f.now(),
  });
});
fixture("executor records blocked for invalid Plan but cannot execute", (x) => {
  const [plan] = x.pub("artifacts/plan.md", x.artifact("plan"));
  fs.writeFileSync(
    x.store.path(plan.path),
    fs
      .readFileSync(x.store.path(plan.path), "utf8")
      .replace("status: ready", "status: Approved"),
  );
  const meta = {
    ...x.implement(plan, "blocked"),
    tasks: [],
    verifications: [],
    blocker: "Planのstatusが契約外",
    commit: null,
  };
  const [ref] = x.pub("artifacts/implement.md", meta);
  assert.equal(x.store.document(ref.path)[0].status, "blocked");
  assert.throws(
    () =>
      x.pub("artifacts/implement.md", {
        ...meta,
        status: "in_progress",
        blocker: null,
      }),
    f.FlowError,
  );
});
fixture("templates match schemas and semantic contracts", () => {
  for (const p of fs.readdirSync(".apm/skills/flow/assets/templates")) {
    const [meta, content] = f.markdown(
      fs.readFileSync(".apm/skills/flow/assets/templates/" + p, "utf8"),
    );
    f.validateMeta(meta, content);
  }
});
fixture("CLI emits fixed condition exit code and JSON", (x) => {
  const result = runCli(["--root", x.root, "transition", "--request", "-"], {
    request_id: "bad",
    expected_state_revision: 1,
    action: "advance",
  });
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).code, "condition");
});

fixture(
  "YAML preserves event IDs, timestamps, scalar semantics and rejects non-string keys",
  () => {
    const time = "2026-10-10T00:00:00+09:00";
    assert.deepEqual(f.load(`id: E-000001\ntime: ${time}\nflag: yes`), {
      id: "E-000001",
      time,
      flag: true,
    });
    for (const input of ["1: a", "true: a", "x: &a [*a]", "x: .nan", "x: .inf"])
      assert.throws(() => f.load(input), f.FlowError);
    const shared = { id: "E-000001" };
    assert.deepEqual(f.load(f.dump({ a: shared, b: shared, time })), {
      a: shared,
      b: shared,
      time,
    });
  },
);

fixture(
  "standalone JavaScript runs all commands in ESM and CommonJS projects without dependencies",
  (x) => {
    for (const type of ["module", "commonjs"]) {
      const directory = path.join(x.root, "node-only-" + type);
      fs.mkdirSync(directory);
      fs.writeFileSync(
        path.join(directory, "package.json"),
        JSON.stringify({ type }),
      );
      const isolated = path.join(directory, "flowctl.js");
      fs.copyFileSync(SCRIPT, isolated);
      const root = path.join(directory, "feature");
      const cli = (command, input, extra = []) => {
        const args = ["--root", root, command, ...extra];
        if (input !== undefined) args.push("--request", "-");
        const r = spawnSync(process.execPath, [isolated, ...args], {
          cwd: directory,
          input: input === undefined ? undefined : JSON.stringify(input),
          encoding: "utf8",
          env: { ...process.env, NODE_PATH: "" },
        });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        return JSON.parse(r.stdout).result;
      };
      cli("init", {
        request_id: "init",
        feature_id: "standalone",
        run_id: "run-001",
        text: "単一JSを検証",
      });
      cli("transition", {
        request_id: "invoke",
        expected_state_revision: 1,
        action: "start_invocation",
        invocation_id: "inv-001",
        component: "flow-design",
        operation: "create",
        inputs: [],
      });
      const artifact = cli("publish", {
        request_id: "publish",
        run_id: "run-001",
        target_path: "artifacts/design.md",
        expected_revision: 0,
        expected_sha256: null,
        document: f.render(x.artifact("design"), body("design")),
        change: "初版",
        reason: "検証",
        sections: ["目的"],
        references: [],
      }).artifact;
      cli("transition", {
        request_id: "finish",
        expected_state_revision: 2,
        action: "finish_invocation",
        invocation_id: "inv-001",
        outputs: [artifact],
      });
      cli("validate", undefined, ["artifacts/design.md", "--references"]);
      assert.equal(
        cli("review-check", {
          stage: "design",
          target: artifact,
          design: null,
          review_cycle_id: "design-cycle-0001",
          mode: "ai",
          source_paths: [],
        }).status,
        "incomplete",
      );
      cli("audit-append", {
        event_key: "isolated",
        event_type: "action.completed",
        actor: "flow",
        run_id: "run-001",
        invocation_id: null,
        occurred_at: f.now(),
        caused_by: [],
        data: { action: "verify", result: "completed", evidence: [] },
      });
      assert.equal(cli("resume-check").state.state_revision, 3);
      assert.ok(cli("validate", undefined, ["audit.md"]).events > 1);
      assert.equal(fs.existsSync(path.join(directory, "node_modules")), false);
      assert.equal(
        fs.existsSync(path.join(directory, "contracts.schema.json")),
        false,
      );
    }
  },
);

fixture(
  "live process exclusion, abrupt process death, and dead-owner reclaim",
  async (x) => {
    const modulePath = path.resolve(".test-runtime/flowctl.cjs");
    const child = spawn(
      process.execPath,
      [
        "-e",
        `const {Store}=require(${JSON.stringify(modulePath)});new Store(${JSON.stringify(x.root)}).locked(async()=>{process.send('locked');await new Promise(resolve=>setTimeout(resolve,60000));});`,
      ],
      { stdio: ["ignore", "pipe", "pipe", "ipc"] },
    );
    await new Promise((resolve, reject) => {
      child.once("message", resolve);
      child.once("error", reject);
    });
    const request = {
      event_key: "after-lock",
      event_type: "action.completed",
      actor: "flow",
      run_id: "run-001",
      invocation_id: null,
      occurred_at: f.now(),
      caused_by: [],
      data: { action: "verify", result: "completed", evidence: [] },
    };
    const waiter = concurrentCli(
      ["--root", x.root, "audit-append", "--request", "-"],
      request,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(x.store.events()[1].length, 1);
    const closed = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await closed;
    const result = await waiter;
    assert.equal(result.code, 0, result.out + result.err);
    assert.equal(x.store.events()[1].length, 2);
    assert.equal(fs.existsSync(path.join(x.root, ".flowctl.lock")), false);
  },
);

fixture(
  "same publication retried concurrently commits only once",
  async (x) => {
    const request = {
      request_id: "parallel-publish",
      run_id: "run-001",
      target_path: "artifacts/design.md",
      expected_revision: 0,
      expected_sha256: null,
      document: f.render(x.artifact("design"), body("design")),
      change: "初版",
      reason: "検証",
      sections: ["目的"],
      references: [],
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        concurrentCli(["--root", x.root, "publish", "--request", "-"], request),
      ),
    );
    for (const r of results) assert.equal(r.code, 0, r.out + r.err);
    assert.ok(
      results.every(
        (r) =>
          JSON.parse(r.out).result.event_id ===
          JSON.parse(results[0].out).result.event_id,
      ),
    );
    assert.equal(
      x.store.events()[1].filter((e) => e.event_type === "artifact.updated")
        .length,
      1,
    );
  },
);

fixture("CLI distinguishes contract and storage/input failures", (x) => {
  let r = runCli(["--root", x.root, "publish", "--request", "-"], {});
  assert.equal(r.status, 3);
  assert.equal(JSON.parse(r.stdout).code, "contract");
  r = runCli([
    "--root",
    x.root,
    "publish",
    "--request",
    path.join(x.root, "missing.json"),
  ]);
  assert.equal(r.status, 4);
  assert.equal(JSON.parse(r.stdout).code, "storage_or_input");
  const invalidUtf8 = path.join(x.root, "invalid.yml");
  fs.writeFileSync(invalidUtf8, Buffer.from([0xff]));
  r = runCli(["--root", x.root, "publish", "--request", invalidUtf8]);
  assert.equal(r.status, 4);
  assert.equal(JSON.parse(r.stdout).code, "storage_or_input");
});

fixture(
  "Markdown documents all Zod contract and event fields without obsolete schema dependency",
  () => {
    const document = fs.readFileSync(
      ".apm/skills/flow/references/contracts.md",
      "utf8",
    );
    const rows = new Map(
      [
        ...document.matchAll(/^\| ([a-z][a-z0-9_./-]*) \| ([a-z_]+:.+) \|$/gm),
      ].map(([, name, cell]) => [
        name,
        cell
          .split(";")
          .map((field) => field.trim().split(":")[0])
          .sort(),
      ]),
    );
    const expectedRows = [];
    for (const [name, schema] of Object.entries(f.contracts)) {
      if (name === "finding") {
        for (const option of schema.options) {
          const row = "finding/" + option.shape.classification.value;
          expectedRows.push(row);
          assert.deepEqual(
            rows.get(row),
            Object.keys(option.shape).sort(),
            row,
          );
        }
      } else {
        expectedRows.push(name);
        assert.deepEqual(
          rows.get(name),
          Object.keys(schema.shape).sort(),
          name,
        );
      }
    }
    for (const [name, schema] of Object.entries(f.eventData)) {
      expectedRows.push(name);
      assert.deepEqual(rows.get(name), Object.keys(schema.shape).sort(), name);
    }
    assert.deepEqual([...rows.keys()].sort(), expectedRows.sort());
    assert.equal(
      fs.existsSync(".apm/skills/flow/references/contracts.schema.json"),
      false,
    );
  },
);

for (const action of [
  "start_invocation",
  "finish_invocation",
  "fail_invocation",
  "advance",
])
  for (const interruption of ["state_saved", "transition_committed"])
    fixture(
      `recover ${action} audit after ${interruption} without repeating operation`,
      (x) => {
        let args, expectedType;
        const invocation = "interrupted-invocation";
        if (action === "advance") {
          x.writer("design");
          x.review("design");
          x.tr("advance");
          const plan = x.writer("plan");
          x.review("plan_final");
          x.tr("advance");
          x.tr("start_invocation", {
            invocation_id: invocation,
            component: "flow-implement",
            operation: "execute",
            inputs: [plan],
          });
          const [ref] = x.pub(
            "artifacts/implement.md",
            x.implement(plan, "completed", invocation),
          );
          x.tr("finish_invocation", {
            invocation_id: invocation,
            outputs: [ref],
          });
          args = {};
          expectedType = "flow.completed";
        } else {
          args = {
            invocation_id: invocation,
            component: "flow-design",
            operation: "create",
            inputs: [],
          };
          expectedType = {
            start_invocation: "invocation.started",
            finish_invocation: "invocation.completed",
            fail_invocation: "invocation.failed",
          }[action];
          if (action !== "start_invocation") {
            x.tr("start_invocation", args);
            if (action === "finish_invocation") {
              const [ref] = x.pub(
                "artifacts/design.md",
                x.artifact("design", "ready", [], "create", invocation),
              );
              args = { invocation_id: invocation, outputs: [ref] };
            } else args = { invocation_id: invocation, reason: "実行障害" };
          }
        }
        const request = {
          request_id: "interrupted-transition",
          expected_state_revision: x.store.state().state_revision,
          action,
          ...args,
        };
        const atomic = x.store.atomic.bind(x.store),
          append = x.store.append.bind(x.store);
        if (interruption === "state_saved")
          x.store.atomic = (name, data) => {
            atomic(name, data);
            throw new Error("simulated interruption");
          };
        else
          x.store.append = (type, ...rest) => {
            if (type === expectedType)
              throw new Error("simulated interruption");
            return append(type, ...rest);
          };
        assert.throws(
          () => x.store.transition(request),
          /simulated interruption/,
        );
        x.store.atomic = atomic;
        x.store.append = append;
        const savedState = x.store.state(),
          revision = savedState.state_revision;
        assert.throws(() => x.store.resumeCheck(), f.FlowError);
        assert.throws(
          () =>
            x.tr("block", { reason: "監査未完了", resume_condition: "復旧" }),
          /Unfinished (persistence operation|transition audit)/,
        );
        assert.throws(
          () => x.pub("artifacts/design.md", x.artifact("design")),
          /Unfinished (persistence operation|transition audit)/,
        );
        assert.throws(
          () =>
            x.event("action.started", {
              action: "next",
              detail: "must wait for recovery",
            }),
          f.FlowError,
        );
        if (interruption === "state_saved") x.store.resumeCheck(true);
        else assert.deepEqual(x.store.transition(request), savedState);
        assert.equal(x.store.state().state_revision, revision);
        assert.deepEqual(x.store.state(), savedState);
        const events = x.store.events()[1],
          key =
            request.request_id +
            (action === "advance" ? ":flow-completed" : ":invocation");
        const recorded = events.filter((e) => e.event_key === key);
        assert.equal(recorded.length, 1);
        assert.equal(recorded[0].event_type, expectedType);
        const committed = events.find(
          (e) => e.event_key === request.request_id + ":completed",
        );
        assert.deepEqual(recorded[0].caused_by, [committed.event_id]);
        assert.equal(recorded[0].occurred_at, committed.occurred_at);
        assert.deepEqual(x.store.transition(request), savedState);
        assert.deepEqual(x.store.resumeCheck(true).recovered_events, []);
        assert.equal(x.store.events()[1].length, events.length);
        if (action === "start_invocation") {
          x.tr("fail_invocation", {
            invocation_id: invocation,
            reason: "実行前に停止",
          });
          x.tr("resume", { reason: "再試行", evidence: [] });
          assert.throws(
            () => x.tr("start_invocation", args),
            /Invocation ID already used/,
          );
        }
      },
    );

fixture(
  "replay after supplementary audit was saved does not duplicate it",
  (x) => {
    const append = x.store.append.bind(x.store);
    x.store.append = (type, ...args) => {
      const result = append(type, ...args);
      if (type === "invocation.started")
        throw new Error("interrupted after audit");
      return result;
    };
    const request = {
      request_id: "saved-audit",
      expected_state_revision: 1,
      action: "start_invocation",
      invocation_id: "saved-inv",
      component: "flow-design",
      operation: "create",
      inputs: [],
    };
    assert.throws(() => x.store.transition(request), /interrupted after audit/);
    x.store.append = append;
    const count = x.store.events()[1].length;
    x.store.transition(request);
    x.store.resumeCheck(true);
    assert.equal(x.store.events()[1].length, count);
  },
);

for (const invalid of ["malformed", "contract_failure"])
  for (const reverse of [false, true])
    fixture(
      `contract failure wins over missing source: ${invalid}, reverse=${reverse}`,
      (x) => {
        x.writer("design");
        x.tr("start_review", { stage: "design" });
        const ar = x.store.state().active_review;
        const bad = "reviews/design/cycle-0001/sources/requirements.md",
          missing = "reviews/design/cycle-0001/sources/quality-risk.md";
        if (invalid === "malformed") {
          fs.mkdirSync(path.dirname(x.store.path(bad)), { recursive: true });
          fs.writeFileSync(x.store.path(bad), "invalid source");
        } else
          x.pub(
            bad,
            x.source("requirements", [], {
              kind: "contract",
              reason: "契約不一致",
            }),
          );
        const result = x.store.reviewCheck(
          "design",
          ar.target,
          ar.design,
          ar.review_cycle_id,
          ar.mode,
          reverse ? [missing, bad] : [bad, missing],
        );
        assert.equal(result.status, "incomplete");
        assert.equal(result.failure.kind, "contract");
        const invocation = "contract-review";
        x.tr("start_invocation", {
          invocation_id: invocation,
          component: "flow-design-review",
          operation: "review",
          inputs: [ar.target],
        });
        const [ref] = x.pub(ar.path, {
          ...result,
          schema_version: "flow/phase-review-v2",
          revision: 1,
          mode: ar.mode,
          created_at: f.now(),
        });
        x.tr("finish_invocation", {
          invocation_id: invocation,
          outputs: [ref],
        });
        assert.throws(() => x.tr("retry"), /Only execution failures can retry/);
        assert.throws(
          () =>
            x.tr("set_mode", {
              stage: "design",
              mode: "human",
              reason: "契約不一致",
              origin_event_id: null,
            }),
          /Mode switch limit condition/,
        );
        assert.equal(x.store.state().counters.design.execution_retry, 0);
      },
    );
