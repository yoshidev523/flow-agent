import type { ArtifactRef, AuditEvent } from "../contracts/index.js";
import { render, type Fields } from "../format.js";

export const JOURNAL = ".flow/journal.md";

// The journal is authoritative. This view can always be rebuilt without replaying an action.
export function auditView(meta: Fields, events: AuditEvent[]): string {
  const phases = new Map<string, string>();
  const byId = new Map(events.map((event) => [event.event_id, event]));
  const reviews = new Set<string>();
  const entries: string[] = [];
  const text = (value: unknown) => String(value).replace(/\s+/g, " ").trim();
  const ref = (value: ArtifactRef | null) =>
    value ? `${value.path} r${value.revision}` : "";
  for (const event of events) {
    const d = event.data as Fields;
    let phase = phases.get(event.run_id) ?? "standalone";
    let title = "",
      fact = "",
      reason = "",
      references: string[] = [];
    switch (event.event_type) {
      case "flow.started":
        phase = d.state.phase;
        title = "開始";
        fact = "要求を受領し、Flowを開始した。";
        references = [d.request_path];
        break;
      case "flow.transitioned": {
        phase = d.to_phase;
        const prepared = byId.get(d.prepared_event_id)?.data as
          Fields | undefined;
        if (d.from_phase !== d.to_phase) {
          title = "フェーズ移行";
          fact = `${d.from_phase} → ${d.to_phase}`;
        } else if (
          d.from_state !== d.to_state &&
          [d.from_state, d.to_state].some((s) =>
            ["blocked", "waiting"].includes(s),
          )
        ) {
          title =
            d.to_state === "blocked"
              ? "停止"
              : d.to_state === "waiting"
                ? "回答待ち"
                : "再開";
          fact = `${d.from_state} → ${d.to_state}`;
        }
        reason = prepared?.arguments?.reason ?? "";
        if (prepared?.arguments?.resume_condition)
          fact += `。再開条件：${prepared.arguments.resume_condition}`;
        references = d.evidence.map(ref);
        break;
      }
      case "invocation.started":
        if (phase === "standalone") {
          const inferred = /flow-(design|plan|implement)(?:$|-)/.exec(
            d.component,
          )?.[1];
          if (inferred) phase = inferred;
        }
        break;
      case "invocation.failed":
        title = "実行障害";
        fact = d.reason;
        references = d.evidence;
        break;
      case "artifact.updated": {
        const prepared = byId.get(d.prepared_event_id)?.data as
          Fields | undefined;
        // Review details live in the aggregate; do not copy findings or source metadata here.
        if (
          d.artifact.path.startsWith("reviews/") &&
          d.artifact.path.endsWith("/review.md")
        ) {
          title = "レビュー結果";
          fact = prepared?.new_status ?? "保存済み";
          references = [ref(d.artifact)];
          reviews.add(ref(d.artifact));
        }
        break;
      }
      case "action.completed":
        title = d.action;
        fact = d.result;
        references = d.evidence;
        break;
      case "decision.made":
        title = "決定";
        fact = d.decision;
        reason = d.reason;
        references = d.evidence;
        if (d.assumptions.length)
          reason += ` 前提：${d.assumptions.join("、")}`;
        break;
      case "interaction.presented":
        title = "判断依頼";
        fact = d.text;
        references = [ref(d.target)];
        break;
      case "interaction.received":
        title = "利用者フィードバック";
        fact = d.text;
        break;
      case "feedback.created":
        title = "フィードバック登録";
        fact = "変更・回答を成果物へ渡すフィードバックとして保存した。";
        references = [ref(d.feedback), ...d.origin_event_ids];
        break;
      case "review.completed":
        if (!reviews.has(ref(d.review))) {
          title = "レビュー結果";
          fact = d.status;
          references = [ref(d.review)];
        }
        break;
      case "review.mode_changed":
        title = "レビュー方式変更";
        fact = `${d.stage}: ${d.from} → ${d.to}`;
        reason = d.reason;
        break;
      case "retry.scheduled":
        title = "再試行";
        fact = `${d.stage}: ${d.counter} ${d.used}回`;
        reason = d.reason;
        break;
      case "flow.blocked":
        title = "問題・課題";
        fact = `${d.reason}。再開条件：${d.resume_condition}`;
        break;
      case "flow.resumed":
        title = "再開";
        fact = d.reason;
        references = d.evidence;
        break;
      case "artifact.update_aborted":
      case "flow.transition_aborted":
        title = "保存中断";
        fact = d.reason;
        references = [d.prepared_event_id];
        break;
      // Prepared/completed pairs, snapshots, invocations and checkpoint bookkeeping stay internal.
    }
    phases.set(event.run_id, phase);
    if (!title) continue;
    entries.push(
      `\n## ${text(event.occurred_at)} — ${text(phase)} — ${text(title)} (${event.event_id})\n\n` +
        `- 事実：${text(fact)}\n` +
        (reason ? `- 理由：${text(reason)}\n` : "") +
        (references.length
          ? `- 参照：${references.map(text).join("、")}\n`
          : ""),
    );
  }
  return render(
    { ...meta, schema_version: "flow/audit-log-v2" },
    "# 監査ログ\n" + entries.join(""),
  );
}
