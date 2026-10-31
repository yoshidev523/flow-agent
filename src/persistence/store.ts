import fs from "node:fs";
import path from "node:path";
import { Files } from "./files.js";
import { FlowError, requireCondition as check } from "../errors.js";
import {
  load,
  utf8,
  dump,
  object,
  markdown,
  render,
  now,
  digest,
  equal,
  fingerprint,
  type Fields,
} from "../format.js";
import {
  KINDS,
  STAGES,
  EXPECTED,
  MANAGED_EVENTS,
  validateMeta,
  schemaCheck,
  findingStatus,
  type Stage,
} from "../validation/guards.js";
import {
  type ArtifactRef,
  type FlowState,
  type AuditEvent,
  type EventType,
} from "../contracts/index.js";
import { transition } from "../transitions.js";
import { JOURNAL, auditView } from "./audit.js";
export const eventId = (n: number) => "E-" + String(n).padStart(6, "0");
export class Store extends Files {
  document(name: string): [Fields, string, ArtifactRef] {
    const p = this.path(name);
    check(
      fs.existsSync(p) && fs.statSync(p).isFile(),
      "Missing artifact: " + name,
    );
    const raw = fs.readFileSync(p);
    const [meta, body] = markdown(utf8(raw));
    validateMeta(meta, body);
    return [
      meta,
      body,
      { path: name, revision: meta.revision, sha256: digest(raw) },
    ];
  }
  reference(expected: ArtifactRef): [Fields, string] {
    schemaCheck("reference", expected);
    const [meta, body, actual] = this.document(expected.path);
    check(equal(actual, expected), "Stale reference: " + expected.path, true);
    return [meta, body];
  }
  state(): FlowState {
    const meta = object(
      load(utf8(fs.readFileSync(this.path("flow-state.yml")))),
    );
    validateMeta(meta);
    return meta as FlowState;
  }
  events(): [Fields, AuditEvent[]] {
    const p = this.path(JOURNAL);
    check(
      fs.existsSync(p),
      "Missing .flow/journal.md; legacy audit.md requires audit-migrate",
    );
    return this.parseEvents(utf8(fs.readFileSync(p)));
  }
  private parseEvents(raw: string): [Fields, AuditEvent[]] {
    const [meta, body] = markdown(raw);
    schemaCheck("audit-log", meta);
    check(body.startsWith("# 監査ログ\n"), "Invalid audit heading");
    const tail = body.slice("# 監査ログ\n".length),
      pattern =
        /\n## (E-[0-9]{6,}) — ([a-z_.]+)\n\n```yaml\n([\s\S]*?)\n```\n/y;
    const events: AuditEvent[] = [],
      keys = new Set<string>(),
      ids = new Set<string>();
    let offset = 0;
    while (offset < tail.length) {
      pattern.lastIndex = offset;
      const m = pattern.exec(tail);
      check(
        m,
        "Truncated or malformed audit record; preserve and inspect .flow/journal.md",
      );
      const e = object(load(m[3])) as AuditEvent;
      schemaCheck("audit-event", e);
      schemaCheck("event-data", e.data, e.event_type);
      check(
        e.event_id === eventId(events.length + 1),
        "Audit sequence mismatch",
      );
      check(
        m[1] === e.event_id && m[2] === e.event_type,
        "Audit heading/event mismatch",
      );
      check(!keys.has(e.event_key), "Duplicate event_key");
      check(
        e.caused_by.every((id) => ids.has(id)),
        "Unknown causal event",
      );
      events.push(e);
      keys.add(e.event_key);
      ids.add(e.event_id);
      offset = pattern.lastIndex;
    }
    return [meta, events];
  }
  append(
    eventType: EventType,
    data: unknown,
    key: string,
    actor = "flow",
    run = "run-001",
    invocation: string | null = null,
    causedBy: string[] = [],
    occurred?: string,
  ): AuditEvent {
    const [, events] = this.events();
    const event = {
      event_id: eventId(events.length + 1),
      event_key: key,
      event_type: eventType,
      run_id: run,
      invocation_id: invocation,
      occurred_at: occurred ?? now(),
      recorded_at: now(),
      actor,
      caused_by: causedBy,
      data,
    };
    schemaCheck("audit-event", event);
    schemaCheck("event-data", data, eventType);
    for (const old of events)
      if (old.event_key === key) {
        for (const k of [
          "event_type",
          "run_id",
          "invocation_id",
          "actor",
          "caused_by",
          "data",
        ] as const)
          check(
            equal(old[k], event[k]),
            "Idempotency key reused for different event",
          );
        this.syncAudit();
        return old;
      }
    check(
      causedBy.every((id) => events.some((e) => e.event_id === id)),
      "Unknown causal event",
    );
    const record = `\n## ${event.event_id} — ${eventType}\n\n\`\`\`yaml\n${dump(event)}\`\`\`\n`;
    const fd = fs.openSync(this.path(JOURNAL), "a");
    try {
      fs.writeFileSync(fd, record);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this.syncAudit();
    return event as AuditEvent;
  }
  pending(): AuditEvent[] {
    const [, events] = this.events();
    const resolved = new Set(
      events
        .filter((e) =>
          [
            "artifact.updated",
            "artifact.update_aborted",
            "flow.transitioned",
            "flow.transition_aborted",
          ].includes(e.event_type),
        )
        .map((e) => e.data.prepared_event_id),
    );
    return events.filter(
      (e) =>
        ["artifact.update_prepared", "flow.transition_prepared"].includes(
          e.event_type,
        ) && !resolved.has(e.event_id),
    );
  }
  private transitionAudit(prepared: AuditEvent, completed: AuditEvent) {
    check(
      prepared.event_type === "flow.transition_prepared" &&
        completed.event_type === "flow.transitioned" &&
        completed.data.prepared_event_id === prepared.event_id,
      "Invalid committed transition audit linkage",
    );
    const { action, arguments: args, after } = prepared.data as Fields;
    const key = prepared.event_key.replace(/:prepared$/, "");
    if (action === "start_invocation")
      return {
        type: "invocation.started" as const,
        key: key + ":invocation",
        invocation: args.invocation_id,
        data: {
          component: args.component,
          operation: args.operation,
          inputs: args.inputs,
        },
      };
    if (action === "finish_invocation")
      return {
        type: "invocation.completed" as const,
        key: key + ":invocation",
        invocation: args.invocation_id,
        data: { outputs: args.outputs },
      };
    if (action === "fail_invocation")
      return {
        type: "invocation.failed" as const,
        key: key + ":invocation",
        invocation: args.invocation_id,
        data: { reason: args.reason, evidence: [] },
      };
    if (action === "advance" && after.state === "completed")
      return {
        type: "flow.completed" as const,
        key: key + ":flow-completed",
        invocation: null,
        data: { implement: after.artifacts.implement },
      };
    return null;
  }
  missingTransitionAudits(events = this.events()[1]) {
    return events
      .filter((e) => e.event_type === "flow.transitioned")
      .flatMap((completed) => {
        const prepared = events.find(
          (e) => e.event_id === completed.data.prepared_event_id,
        );
        check(prepared, "Missing prepared transition audit");
        const expected = this.transitionAudit(prepared, completed);
        if (!expected) return [];
        const recorded = events.find((e) => e.event_key === expected.key);
        if (recorded) {
          check(
            recorded.event_type === expected.type &&
              recorded.actor === "flow" &&
              recorded.run_id === prepared.run_id &&
              recorded.invocation_id === expected.invocation &&
              equal(recorded.data, expected.data) &&
              equal(recorded.caused_by, [completed.event_id]),
            "Transition audit differs from committed operation",
          );
          return [];
        }
        return [{ prepared, completed }];
      });
  }
  completeTransitionAudit(
    prepared: AuditEvent,
    completed: AuditEvent,
  ): string[] {
    const expected = this.transitionAudit(prepared, completed);
    if (!expected) return [];
    return [
      this.append(
        expected.type,
        expected.data,
        expected.key,
        "flow",
        prepared.run_id,
        expected.invocation,
        [completed.event_id],
        completed.occurred_at,
      ).event_id,
    ];
  }
  consistent(replayingRequestId?: string): void {
    this.syncAudit();
    const checkpointEvents = this.events()[1];
    check(
      checkpointEvents
        .filter((e) => e.event_type === "checkpoint.prepared")
        .every(
          (e) =>
            checkpointEvents.some(
              (done) =>
                done.event_type === "checkpoint.completed" &&
                done.caused_by.includes(e.event_id),
            ) ||
            (replayingRequestId !== undefined &&
              e.event_key === replayingRequestId + ":checkpoint-prepared"),
        ),
      "Unfinished checkpoint; use checkpoint-recover",
      true,
    );
    check(
      !this.pending().length,
      "Unfinished persistence operation; run resume-check --recover",
      true,
    );
    check(
      this.missingTransitionAudits().every(
        ({ prepared }) =>
          replayingRequestId !== undefined &&
          prepared.event_key === replayingRequestId + ":prepared",
      ),
      "Unfinished transition audit; run resume-check --recover or resend the original transition request",
      true,
    );
  }
  reviewCheck(
    stage: Stage,
    target: ArtifactRef,
    design: ArtifactRef | null,
    cycle: string,
    mode: string,
    paths: string[],
  ): Fields {
    check(
      stage in STAGES && ["ai", "human"].includes(mode),
      "Invalid review stage/mode",
    );
    schemaCheck("reference", target);
    if (design !== null) schemaCheck("reference", design);
    const [, artifact, reviewStage] = STAGES[stage],
      base = {
        phase: artifact,
        review_stage: reviewStage,
        review_cycle_id: cycle,
        target,
        design,
      };
    let tm: Fields;
    try {
      [tm] = this.reference(target);
      check(
        tm.artifact === artifact &&
          tm.status === (stage === "plan_decision" ? "needs_input" : "ready"),
        "Wrong review target/status",
      );
      if (artifact === "plan") {
        check(design, "Missing Design input");
        const [dm] = this.reference(design);
        check(
          dm.artifact === "design" && dm.status === "ready",
          "Invalid Design input",
        );
        check(
          tm.inputs.some((r: ArtifactRef) => equal(r, design)),
          "Plan Design reference mismatch",
        );
      } else
        check(design === null, "Design review cannot carry a Design input");
    } catch (e) {
      if (!(e instanceof FlowError)) throw e;
      return {
        ...base,
        status: "incomplete",
        sources: [],
        source_paths: paths,
        findings: [],
        judgments: [],
        failure: { kind: "contract", reason: e.message },
      };
    }
    const expected = mode === "ai" ? EXPECTED[stage] : ["human"];
    check(new Set(paths).size === paths.length, "Duplicate source paths");
    const sources: ArtifactRef[] = [],
      findings: Fields[] = [],
      seen = new Set<string>();
    let failure: Fields | null = null;
    let projectKnowledge: Fields | undefined;
    for (const sourcePath of paths) {
      if (!fs.existsSync(this.path(sourcePath))) {
        if (!failure || failure.kind !== "contract")
          failure = {
            kind: "execution",
            reason: "Missing source: " + sourcePath,
          };
        continue;
      }
      try {
        const [sm, , sr] = this.document(sourcePath);
        check(
          sm.schema_version === "flow/review-source-v2",
          "Not a review source",
        );
        check(
          Object.entries(base).every(([k, v]) => equal(sm[k], v)),
          "Source cycle/target mismatch",
        );
        check(
          sourcePath ===
            `reviews/${stage.replace("_", "-")}/cycle-${cycle.split("-cycle-").at(-1)}/sources/${sm.source_id}.md`,
          "Wrong cycle source path",
        );
        check(
          sm.source_kind === mode &&
            expected.includes(sm.source_id) &&
            !seen.has(sm.source_id),
          "Unexpected source owner/mode",
        );
        if (!sm.failure) this.checkKnowledgeDocuments(sm);
        seen.add(sm.source_id);
        sources.push(sr);
        if (sm.failure && (!failure || sm.failure.kind === "contract"))
          failure = sm.failure;
        for (const original of sm.findings) {
          check(
            original.decision_refs.every((id: string) =>
              tm.questions.some((q: Fields) => q.id === id),
            ),
            "Unknown decision reference",
          );
          const f = structuredClone(original);
          f.id = sm.source_id + ":" + f.id;
          if (f.judgment) f.judgment.id = sm.source_id + ":" + f.judgment.id;
          findings.push(f);
        }
        if (sm.project_knowledge) {
          projectKnowledge = structuredClone(sm.project_knowledge);
          for (const c of projectKnowledge!.checks)
            c.finding_ids = c.finding_ids.map(
              (id: string) => sm.source_id + ":" + id,
            );
        }
      } catch (e) {
        if (!(e instanceof FlowError)) throw e;
        failure = { kind: "contract", reason: e.message };
      }
    }
    if (!equal([...seen].sort(), [...expected].sort()) && !failure)
      failure = { kind: "execution", reason: "Required sources are missing" };
    this.reference(target);
    if (design) this.reference(design);
    return {
      ...base,
      ...(projectKnowledge ? { project_knowledge: projectKnowledge } : {}),
      status: failure ? "incomplete" : findingStatus(findings),
      sources,
      source_paths: paths,
      findings,
      failure,
      judgments: findings.filter((f) => f.judgment).map((f) => f.judgment),
    };
  }
  checkKnowledgeDocuments(meta: Fields): void {
    for (const d of meta.project_knowledge?.documents ?? []) {
      if (d.status !== "available" || !path.isAbsolute(d.location)) continue;
      check(
        fs.existsSync(d.location) && fs.statSync(d.location).isFile(),
        "Missing knowledge document: " + d.location,
        true,
      );
      check(
        digest(fs.readFileSync(d.location)) === d.sha256,
        "Stale knowledge document: " + d.location,
        true,
      );
    }
  }
  checkDocumentInputs(meta: Fields, publishing = false): void {
    const kind = KINDS[meta.schema_version];
    if (kind === "phase-artifact") {
      for (const r of meta.inputs) {
        const [im] = this.reference(r);
        if (im.schema_version === "flow/phase-feedback-v2") {
          const target = im.target,
            [, , current] = this.document(target.path);
          if (publishing)
            check(equal(target, current), "Stale feedback target", true);
          else
            check(
              this.events()[1].some(
                (e) =>
                  e.event_type === "artifact.update_prepared" &&
                  equal(e.data.after, current) &&
                  e.data.before_sha256 === target.sha256 &&
                  current.revision === target.revision + 1,
              ),
              "Feedback consumption has no matching publication record",
            );
          check(
            im.phase === meta.artifact && im.operation === meta.operation,
            "Feedback phase/operation mismatch",
          );
          check(
            im.items.every((x: Fields) =>
              meta.feedback_results.some((y: Fields) => x.id === y.id),
            ),
            "Missing feedback result",
          );
        }
      }
      if (meta.artifact === "plan")
        check(
          meta.inputs.filter(
            (r: ArtifactRef) => this.document(r.path)[0].artifact === "design",
          ).length <= 1,
          "Multiple Design inputs",
        );
    } else if (kind === "implement-artifact") {
      if (meta.status === "blocked" && meta.producer !== "flow-artifact-sync")
        return;
      const [plan] = this.reference(meta.plan);
      check(
        plan.artifact === "plan" &&
          (plan.status === "ready" || meta.producer === "flow-artifact-sync"),
        "Executor requires ready Plan",
      );
      check(
        equal(
          meta.tasks.map((t: Fields) => t.id).sort(),
          plan.tasks.map((t: Fields) => t.id).sort(),
        ),
        "Implement task set differs from Plan",
      );
      const expected = new Map<string, Fields>(
        plan.verification_plan.map((v: Fields) => [v.id, v]),
      );
      for (const v of meta.verifications) {
        const ev = expected.get(v.id);
        check(ev, "Unknown verification result");
        check(
          v.command === ev.command && v.required === ev.required,
          "Verification command/requirement differs from Plan",
        );
      }
      if (meta.status === "completed")
        check(
          equal(
            [...expected.keys()].sort(),
            meta.verifications.map((v: Fields) => v.id).sort(),
          ),
          "Missing Plan verification results",
        );
    } else if (kind === "phase-feedback") {
      check(
        this.reference(meta.target)[0].artifact === meta.phase,
        "Wrong feedback target",
      );
    } else if (kind === "review-source" && meta.failure === null) {
      this.checkKnowledgeDocuments(meta);
      const [target] = this.reference(meta.target);
      check(
        target.status ===
          (meta.review_stage === "decision" ? "needs_input" : "ready") &&
          target.artifact === meta.phase,
        "Wrong review target/status",
      );
      if (meta.design) {
        const [dm] = this.reference(meta.design);
        check(
          dm.artifact === "design" &&
            dm.status === "ready" &&
            target.inputs.some((r: ArtifactRef) => equal(r, meta.design)),
          "Plan Design input mismatch",
        );
      }
    } else if (kind === "phase-review") {
      const stage = (
        {
          design: "design",
          decision: "plan_decision",
          final: "plan_final",
        } as const
      )[meta.review_stage as "design" | "decision" | "final"];
      const result = this.reviewCheck(
        stage,
        meta.target,
        meta.design,
        meta.review_cycle_id,
        meta.mode,
        meta.source_paths,
      );
      for (const key of [
        "status",
        "sources",
        "findings",
        "failure",
        "judgments",
        "project_knowledge",
      ])
        check(
          equal(meta[key], result[key]),
          "Aggregate differs from mechanical review result: " + key,
        );
    }
  }
  syncAudit(): number {
    const [meta, events] = this.events();
    const expected = Buffer.from(auditView(meta, events));
    if (
      !fs.existsSync(this.path("audit.md")) ||
      !fs.readFileSync(this.path("audit.md")).equals(expected)
    )
      this.atomic("audit.md", expected);
    return events.length;
  }
  migrateAudit(): Fields {
    if (!fs.existsSync(this.path(JOURNAL))) {
      const original = fs.readFileSync(this.path("audit.md"));
      // Validate the entire legacy stream before creating a journal or replacing the view.
      this.parseEvents(utf8(original));
      this.atomic(JOURNAL, original);
    }
    return { events: this.syncAudit(), journal: JOURNAL };
  }
  ensureAudit(): void {
    if (fs.existsSync(this.path(JOURNAL))) return;
    check(
      !fs.existsSync(this.path("audit.md")),
      "Legacy audit.md requires explicit audit-migrate",
      true,
    );
    this.atomic(
      JOURNAL,
      render(
        {
          schema_version: "flow/audit-log-v1",
          feature_id: path.basename(this.root),
          created_at: now(),
        },
        "# 監査ログ\n",
      ),
    );
    this.syncAudit();
  }
  replay(request: Fields): Fields | null {
    const [, events] = this.events(),
      prepared = events.find(
        (e) => e.event_key === request.request_id + ":prepared",
      );
    if (!prepared) return null;
    check(
      prepared.data.request_sha256 === fingerprint(request),
      "Request ID reused for different operation",
    );
    const complete = events.find(
      (e) => e.event_key === request.request_id + ":completed",
    );
    check(
      complete,
      "Operation was aborted or interrupted; use resume-check and a new request ID",
      true,
    );
    if (complete.event_type === "flow.transitioned")
      this.completeTransitionAudit(prepared, complete);
    return complete.event_type === "artifact.updated"
      ? { artifact: complete.data.artifact, event_id: complete.event_id }
      : (prepared.data.after as Fields);
  }
  publish(request: Fields): Fields {
    check(
      equal(
        Object.keys(request).sort(),
        [
          "request_id",
          "run_id",
          "target_path",
          "expected_revision",
          "expected_sha256",
          "document",
          "change",
          "reason",
          "sections",
          "references",
        ].sort(),
      ),
      "Invalid publish request fields",
    );
    this.ensureAudit();
    this.consistent();
    const replay = this.replay(request);
    if (replay) return replay;
    let name = request.target_path;
    const [meta, draftBody] = markdown(request.document);
    let body = draftBody;
    if (
      meta.schema_version === "flow/phase-feedback-v2" &&
      name === "feedback/" + meta.phase + "/next"
    ) {
      const directory = this.path("feedback/" + meta.phase),
        numbers = fs.existsSync(directory)
          ? fs
              .readdirSync(directory)
              .filter((p) => /^feedback-[0-9]{4,}\.md$/.test(p))
              .map((p) => Number(p.slice(9, -3)))
          : [];
      name = `feedback/${meta.phase}/feedback-${String(Math.max(0, ...numbers) + 1).padStart(4, "0")}.md`;
    }
    const p = this.path(name),
      kind = KINDS[meta.schema_version];
    const syncing = meta.producer === "flow-artifact-sync";
    if (syncing && fs.existsSync(this.path("flow-state.yml"))) {
      check(
        !this.state().replan || this.state().replan?.approved,
        "Replan is awaiting human approval",
        true,
      );
      check(
        this.state().active_invocation === null,
        "Cannot sync during an active invocation",
        true,
      );
    }
    check(
      kind &&
        kind !== "flow-state" &&
        kind !== "audit-log" &&
        kind !== "audit-view",
      "publish only accepts phase documents",
    );
    let old: Fields | null = null,
      oldBody = "",
      before: ArtifactRef | null = null;
    if (fs.existsSync(p)) [old, oldBody, before] = this.document(name);
    if (syncing) {
      check(old !== null, "Sync only updates existing artifacts", true);
      if (kind === "implement-artifact")
        check(
          meta.status === "blocked" &&
            meta.commit === null &&
            meta.tasks.every((t: Fields) => t.status === "pending") &&
            meta.verifications.every((v: Fields) => v.status === "not_run"),
          "Sync must invalidate implementation completion and verification evidence",
        );
    }
    check(
      Number.isInteger(request.expected_revision) &&
        request.expected_revision === (old?.revision ?? 0),
      "Revision changed before save",
      true,
    );
    check(
      request.expected_sha256 === (before?.sha256 ?? null),
      "Content changed before save",
      true,
    );
    const mutable = kind === "phase-artifact" || kind === "implement-artifact";
    check(mutable || old === null, "Review/feedback files are immutable", true);
    if (mutable) {
      check(
        name === "artifacts/" + meta.artifact + ".md",
        "Phase artifacts use fixed paths",
      );
      check(
        !old || old.artifact === meta.artifact,
        "Cannot change artifact identity",
      );
      check(
        !old || old.status !== "completed" || syncing,
        "Completed implementation is terminal",
        true,
      );
      if (kind === "phase-artifact") {
        check(
          (meta.operation === "create") === (old === null),
          "create is only for initial publication",
        );
        check(
          meta.operation === "create" ||
            meta.inputs.some(
              (r: ArtifactRef) =>
                this.document(r.path)[0].schema_version ===
                "flow/phase-feedback-v2",
            ),
          "revise/respond requires feedback",
        );
      }
      meta.revision = (old?.revision ?? 0) + 1;
      meta.updated_at = now();
      const index = body.indexOf("## 変更履歴");
      check(index !== -1, "Missing change history section");
      check(
        !body.slice(index + "## 変更履歴".length).trim(),
        "Submit body with an empty history section; publisher preserves history",
      );
      const history = old
        ? oldBody.slice(oldBody.indexOf("## 変更履歴") + "## 変更履歴".length)
        : "\n";
      let entry = `\n### revision ${meta.revision}\n\n`;
      const values = [
        ["日時", meta.updated_at],
        ["操作", meta.operation],
        ["変更内容", request.change],
        ["背景・理由", request.reason],
        ["変更箇所", request.sections.join("、")],
        ["参照", request.references.join("、") || "なし"],
        ["状態変更", `${old?.status ?? "初版"} → ${meta.status}`],
      ];
      for (const [label, value] of values) {
        check(
          typeof value === "string" && value.length && !value.includes("\n"),
          "History values must be nonempty single lines",
        );
        entry += `- ${label}: ${value}\n`;
      }
      body =
        body.slice(0, index) + "## 変更履歴" + history.trimEnd() + "\n" + entry;
    }
    validateMeta(meta, body);
    if (kind === "phase-feedback")
      check(
        new RegExp(
          "^feedback/" + meta.phase + "/feedback-[0-9]{4,}\\.md$",
        ).test(name),
        "Invalid feedback path",
      );
    if (kind === "review-source" || kind === "phase-review") {
      const directory = (
        {
          design: "design",
          decision: "plan-decision",
          final: "plan-final",
        } as const
      )[meta.review_stage as "design" | "decision" | "final"];
      check(
        meta.review_cycle_id.startsWith(directory + "-cycle-"),
        "Cycle stage prefix mismatch",
      );
      const base = `reviews/${directory}/cycle-${meta.review_cycle_id.split("-cycle-")[1]}/`;
      if (kind === "phase-review")
        check(name === base + "review.md", "Invalid aggregate path");
      else {
        const allowed =
          meta.review_stage === "design"
            ? EXPECTED.design
            : meta.review_stage === "decision"
              ? EXPECTED.plan_decision
              : EXPECTED.plan_final;
        check(
          (meta.source_kind === "ai" ? allowed : ["human"]).includes(
            meta.source_id,
          ),
          "Invalid source owner",
        );
        check(
          name === base + "sources/" + meta.source_id + ".md",
          "Invalid source path",
        );
      }
    }
    this.checkDocumentInputs(meta, true);
    const text = render(meta, body),
      after = { path: name, revision: meta.revision, sha256: digest(text) };
    const event = this.append(
      "artifact.update_prepared",
      {
        target_path: name,
        before_sha256: before?.sha256 ?? null,
        request_sha256: fingerprint(request),
        after,
        operation: meta.operation ?? "create",
        change: request.change,
        reason: request.reason,
        sections: request.sections,
        references: request.references,
        old_status: old?.status ?? null,
        new_status: meta.status ?? null,
      },
      request.request_id + ":prepared",
      meta.producer ??
        (meta.source_kind === "human" ? "human" : (meta.source_id ?? "flow")),
      request.run_id,
      meta.invocation_id ?? null,
    );
    this.atomic(name, text);
    const complete = this.append(
      "artifact.updated",
      { prepared_event_id: event.event_id, artifact: after },
      request.request_id + ":completed",
      event.actor,
      event.run_id,
      event.invocation_id,
      [event.event_id],
    );
    return { artifact: after, event_id: complete.event_id };
  }
  initialize(request: Fields): FlowState {
    check(
      equal(
        Object.keys(request).sort(),
        ["request_id", "feature_id", "run_id", "text"].sort(),
      ),
      "Invalid init request",
    );
    check(
      !fs.existsSync(this.path("flow-state.yml")) &&
        !fs.existsSync(this.path("audit.md")) &&
        !fs.existsSync(this.path(JOURNAL)),
      "Feature already initialized",
      true,
    );
    const state: FlowState = {
      schema_version: "flow/flow-state-v2",
      feature_id: request.feature_id,
      run_id: request.run_id,
      state_revision: 1,
      phase: "design",
      state: "running",
      artifacts: { design: null, plan: null, implement: null },
      reviews: { design: null, plan_decision: null, plan_final: null },
      review_mode: { design: "ai", plan: "ai" },
      counters: {
        design: { automatic_revision: 0, execution_retry: 0, human_retry: 0 },
        plan_decision: {
          automatic_revision: 0,
          execution_retry: 0,
          human_retry: 0,
        },
        plan_final: {
          automatic_revision: 0,
          execution_retry: 0,
          human_retry: 0,
        },
      },
      cycle_counters: { design: 0, plan_decision: 0, plan_final: 0 },
      active_review: null,
      active_invocation: null,
      waiting: null,
      blocker: null,
      pending_operation: "create",
      pending_feedback: null,
      last_transition_event_id: "E-000001",
      updated_at: now(),
    };
    validateMeta(state);
    check(
      typeof request.text === "string" && request.text.trim(),
      "Empty initial request",
    );
    this.atomic("inputs/request.md", "# 開始要求\n\n" + request.text + "\n");
    this.atomic(
      JOURNAL,
      render(
        {
          schema_version: "flow/audit-log-v1",
          feature_id: request.feature_id,
          created_at: now(),
        },
        "# 監査ログ\n",
      ),
    );
    this.append(
      "flow.started",
      { state, request_path: "inputs/request.md" },
      request.request_id,
      "flow",
      request.run_id,
    );
    this.atomic("flow-state.yml", dump(state));
    return state;
  }
  auditAppend(request: Fields): AuditEvent {
    this.ensureAudit();
    this.consistent();
    check(
      equal(
        Object.keys(request).sort(),
        [
          "event_key",
          "event_type",
          "actor",
          "run_id",
          "invocation_id",
          "caused_by",
          "data",
          "occurred_at",
        ].sort(),
      ),
      "Invalid audit request fields",
    );
    check(
      !MANAGED_EVENTS.has(request.event_type),
      "Persistence events are reserved for flowctl",
    );
    check(
      !["review.completed", "flow.blocked", "flow.resumed"].includes(
        request.event_type,
      ),
      "Legacy event is read-only; use publish for reviews or transition for block/resume",
    );
    schemaCheck("event-data", request.data, request.event_type);
    if (request.event_type === "interaction.received") {
      check(
        request.actor === "human",
        "Received interaction must identify the human actor",
      );
      if (request.data.prompt_event_id !== null) {
        const prompt = this.events()[1].find(
          (e) => e.event_id === request.data.prompt_event_id,
        );
        check(
          prompt &&
            prompt.event_type === "interaction.presented" &&
            prompt.run_id === request.run_id &&
            prompt.data.interaction_id === request.data.interaction_id,
          "Received interaction has no matching prompt",
        );
      }
    }
    return this.append(
      request.event_type,
      request.data,
      request.event_key,
      request.actor,
      request.run_id,
      request.invocation_id,
      request.caused_by,
      request.occurred_at,
    );
  }
  verifyStateRecord(state: FlowState, events: AuditEvent[]): void {
    const event = events.find(
      (e) => e.event_id === state.last_transition_event_id,
    );
    check(
      event && ["flow.started", "flow.transitioned"].includes(event.event_type),
      "State has no committed audit event",
    );
    let expected: unknown;
    if (event.event_type === "flow.started") expected = event.data.state;
    else {
      const prepared = events.find(
        (e) => e.event_id === event.data.prepared_event_id,
      );
      check(
        prepared && prepared.event_type === "flow.transition_prepared",
        "Missing prepared state",
      );
      expected = prepared.data.after;
    }
    check(
      equal(state, expected),
      "State differs from committed audit snapshot",
    );
  }
  reviewResult(state: FlowState): Fields {
    const active = state.active_review;
    check(active, "No active review", true);
    const ref = state.reviews[active.stage];
    check(ref, "Review has not been registered", true);
    const [result] = this.reference(ref);
    check(
      result.review_cycle_id === active.review_cycle_id &&
        result.mode === active.mode,
      "Review cycle/mode mismatch",
    );
    check(
      equal(result.target, active.target) &&
        equal(result.design, active.design),
      "Review target mismatch",
    );
    if (result.status === "passed") this.checkDocumentInputs(result);
    this.reference(active.target);
    if (active.design) this.reference(active.design);
    return result;
  }
  transition(request: Fields): FlowState {
    return transition(this, request);
  }
  resumeCheck(recover = false): Fields {
    let [, events] = this.events();
    this.syncAudit();
    const standalone = !events.some((e) => e.event_type === "flow.started");
    if (!fs.existsSync(this.path("flow-state.yml")) && !standalone) {
      const started = events.filter((e) => e.event_type === "flow.started");
      check(
        started.length === 1,
        "Cannot recover missing state without unique flow.started event",
      );
      check(recover, "Initialization interrupted; use --recover", true);
      this.atomic("flow-state.yml", dump(started[0].data.state));
    }
    const pending = this.pending();
    check(pending.length <= 1, "Multiple unfinished persistence operations");
    const recovered: string[] = [];
    for (const event of pending) {
      check(recover, "Unfinished persistence operation; use --recover", true);
      const data = event.data as Fields,
        p =
          data.target_path && event.event_type === "artifact.update_prepared"
            ? data.target_path
            : "flow-state.yml";
      const current = fs.existsSync(this.path(p))
          ? digest(fs.readFileSync(this.path(p)))
          : null,
        after =
          event.event_type === "artifact.update_prepared"
            ? data.after.sha256
            : data.after_sha256,
        key = event.event_key.replace(/:prepared$/, "");
      if (current === after) {
        let type: EventType, payload: Fields;
        if (event.event_type === "artifact.update_prepared") {
          type = "artifact.updated";
          payload = { prepared_event_id: event.event_id, artifact: data.after };
        } else {
          check(
            data.after.last_transition_event_id === eventId(events.length + 1),
            "Reserved transition event ID is no longer available",
          );
          type = "flow.transitioned";
          payload = {
            prepared_event_id: event.event_id,
            action: data.action,
            before_revision: data.after.state_revision - 1,
            after_revision: data.after.state_revision,
            from_phase: data.before.phase,
            to_phase: data.after.phase,
            from_state: data.before.state,
            to_state: data.after.state,
            evidence: data.evidence,
          };
        }
        recovered.push(
          this.append(
            type,
            payload,
            key + ":completed",
            event.actor,
            event.run_id,
            event.invocation_id,
            [event.event_id],
          ).event_id,
        );
      } else if (current === data.before_sha256)
        recovered.push(
          this.append(
            event.event_type === "artifact.update_prepared"
              ? "artifact.update_aborted"
              : "flow.transition_aborted",
            {
              prepared_event_id: event.event_id,
              reason:
                "Target still matches pre-operation digest; no external action was repeated",
            },
            key + ":aborted",
            "flow",
            event.run_id,
            null,
            [event.event_id],
          ).event_id,
        );
      else
        throw new FlowError(
          "Target matches neither before nor after; preserve files and resolve manually",
          "condition",
          2,
        );
    }
    [, events] = this.events();
    for (const { prepared, completed } of this.missingTransitionAudits(
      events,
    )) {
      check(recover, "Unfinished transition audit; use --recover", true);
      recovered.push(...this.completeTransitionAudit(prepared, completed));
    }
    if (standalone)
      return { state: null, recovered_events: recovered, attention: null };
    const state = this.state();
    [, events] = this.events();
    this.verifyStateRecord(state, events);
    if (
      events.some(
        (e) =>
          e.event_type === "checkpoint.prepared" &&
          !events.some(
            (done) =>
              done.event_type === "checkpoint.completed" &&
              done.caused_by.includes(e.event_id),
          ),
      )
    )
      return {
        state,
        recovered_events: recovered,
        attention:
          "Inspect checkpoint commit/tag and use checkpoint-recover; Git operations were not repeated",
      };
    if (state.replan?.approved)
      return {
        state,
        recovered_events: recovered,
        attention:
          "Inspect synchronization and finish_replan; do not resume ordinary work",
      };
    for (const [artifact, r] of Object.entries(state.artifacts))
      if (r) {
        try {
          this.reference(r);
        } catch (e) {
          if (!(e instanceof FlowError)) throw e;
          const active = state.active_invocation;
          check(
            active && active.component === "flow-" + artifact,
            "Active artifact reference is stale",
            true,
          );
          const [candidate, , candidateRef] = this.document(r.path);
          check(
            candidate.invocation_id === active.invocation_id &&
              candidateRef.revision > r.revision,
            "Stale reference is not an output of the active writer",
            true,
          );
        }
      }
    if (state.active_review) {
      this.reference(state.active_review.target);
      if (state.active_review.design)
        this.reference(state.active_review.design);
    }
    if (state.waiting) this.reference(state.waiting.target);
    for (const r of Object.values(state.reviews)) if (r) this.reference(r);
    return {
      state,
      recovered_events: recovered,
      attention: state.active_invocation
        ? "Inspect active invocation before re-execution"
        : null,
    };
  }
}
