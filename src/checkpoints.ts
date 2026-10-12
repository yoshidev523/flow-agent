import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Store } from "./persistence/store.js";
import { fingerprint, equal, type Fields } from "./format.js";
import { requireCondition as check } from "./errors.js";
import {
  CheckpointRequestSchema,
  CheckpointRecoverSchema,
  CheckpointRestoreSchema,
} from "./contracts/index.js";

function git(cwd: string, args: string[], input?: string, env = {}) {
  const result = spawnSync("git", args, {
    cwd,
    input,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  });
  check(
    result.status === 0,
    "Git operation failed: " +
      (result.stderr || result.error?.message || args[0]),
    true,
  );
  return result.stdout.trim();
}
function repository(store: Store) {
  return fs.realpathSync(git(store.root, ["rev-parse", "--show-toplevel"]));
}
function verify(store: Store, repo: string, checkpoint: Fields) {
  check(
    git(repo, ["rev-parse", "refs/tags/" + checkpoint.tag]) ===
      checkpoint.commit,
    "Checkpoint tag differs from recorded commit",
    true,
  );
  const relative = path.relative(repo, store.root).split(path.sep).join("/");
  for (const ref of checkpoint.artifacts) {
    const result = spawnSync(
      "git",
      [
        "show",
        checkpoint.commit +
          ":" +
          [relative, ref.path].filter(Boolean).join("/"),
      ],
      { cwd: repo },
    );
    check(result.status === 0, "Checkpoint artifact is missing");
    // Verify bytes rather than the working copy: historical snapshots remain valid after revisions.
    check(
      createHash("sha256").update(result.stdout).digest("hex") === ref.sha256,
      "Checkpoint artifact digest mismatch",
    );
  }
}

export function createCheckpoint(store: Store, request: Fields): Fields {
  check(
    CheckpointRequestSchema.safeParse(request).success,
    "Invalid checkpoint request",
  );
  store.ensureAudit();
  store.consistent(request.request_id);
  const repo = repository(store),
    events = store.events()[1];
  const prepared = events.find(
    (e) => e.event_key === request.request_id + ":checkpoint-prepared",
  );
  if (prepared) {
    check(
      prepared.data.request_sha256 === fingerprint(request),
      "Checkpoint request ID reused with different content",
    );
    const done = events.find(
      (e) => e.event_key === request.request_id + ":checkpoint-completed",
    );
    check(done, "Checkpoint interrupted; use checkpoint-recover", true);
    verify(store, repo, done.data.checkpoint as Fields);
    return done.data.checkpoint as Fields;
  }
  const feature = path.relative(repo, store.root).split(path.sep).join("/");
  check(
    feature !== "" && !feature.startsWith("../"),
    "Feature must be inside a Git repository subdirectory",
  );
  const selected = [...new Set([feature, ...request.paths])];
  for (const name of selected) {
    check(
      typeof name === "string" &&
        name.length &&
        !path.isAbsolute(name) &&
        !name.split(/[\\/]/).some((p) => p === ".." || p === ".git") &&
        !name.startsWith(":"),
      "Invalid checkpoint path",
    );
    const candidate = path.resolve(repo, name);
    if (fs.existsSync(candidate))
      check(
        fs.realpathSync(candidate).startsWith(repo + path.sep),
        "Checkpoint path escapes repository",
      );
  }
  const state = store.state();
  store.resumeCheck();
  check(
    !state.active_invocation && !state.replan?.approved,
    "Checkpoint requires idle state",
    true,
  );
  for (const id of request.decision_event_ids)
    check(
      events.some(
        (e) =>
          e.event_id === id &&
          e.run_id === state.run_id &&
          ["decision.made", "interaction.received"].includes(e.event_type),
      ),
      "Unknown checkpoint decision event",
    );
  const tag = `flow/${state.feature_id}/${state.run_id}/${request.checkpoint_id}`;
  const existing = spawnSync(
    "git",
    ["show-ref", "--verify", "--quiet", "refs/tags/" + tag],
    { cwd: repo },
  );
  check(existing.status === 1, "Checkpoint tag already exists", true);
  git(repo, ["check-ref-format", "refs/tags/" + tag]);
  const parent = git(repo, ["rev-parse", "HEAD"]);
  const start = store.append(
    "action.started",
    {
      action: "checkpoint:" + request.checkpoint_id,
      detail: JSON.stringify({
        request_sha256: fingerprint(request),
        reason: request.reason,
      }),
    },
    request.request_id + ":checkpoint-start",
    "flow",
    state.run_id,
  );
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "flow-checkpoint-index-"),
  );
  let commit: string;
  try {
    const env = { GIT_INDEX_FILE: path.join(temporary, "index") };
    git(repo, ["read-tree", parent], undefined, env);
    git(repo, ["add", "-f", "--", ...selected], undefined, env);
    // Never include transient Flow locks in the snapshot.
    git(
      repo,
      [
        "rm",
        "-r",
        "--cached",
        "--ignore-unmatch",
        "--",
        feature + "/.flowctl.lock",
        feature + "/.flowctl.lock.recovery",
      ],
      undefined,
      env,
    );
    const tree = git(repo, ["write-tree"], undefined, env);
    commit = git(
      repo,
      ["commit-tree", tree, "-p", parent],
      `Flow checkpoint ${request.checkpoint_id}\n\n${request.reason}\n`,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const checkpoint = {
    checkpoint_id: request.checkpoint_id,
    tag,
    commit,
    parent,
    paths: selected,
    artifacts: Object.values(state.artifacts).filter(Boolean),
    audit_event_id: start.event_id,
    decision_event_ids: request.decision_event_ids,
  };
  const saved = store.append(
    "checkpoint.prepared",
    { checkpoint, request_sha256: fingerprint(request) },
    request.request_id + ":checkpoint-prepared",
    "flow",
    state.run_id,
    null,
    [start.event_id],
  );
  git(repo, [
    "update-ref",
    "refs/tags/" + tag,
    commit,
    "0".repeat(commit.length),
  ]);
  verify(store, repo, checkpoint);
  store.append(
    "checkpoint.completed",
    { checkpoint },
    request.request_id + ":checkpoint-completed",
    "flow",
    state.run_id,
    null,
    [saved.event_id],
  );
  return checkpoint;
}

export function recoverCheckpoint(store: Store, request: Fields): Fields {
  check(
    CheckpointRecoverSchema.safeParse(request).success,
    "Invalid checkpoint recovery request",
  );
  store.consistent(request.request_id);
  const events = store.events()[1],
    prepared = events.find(
      (e) => e.event_key === request.request_id + ":checkpoint-prepared",
    );
  check(prepared, "Missing prepared checkpoint");
  const checkpoint = prepared.data.checkpoint as Fields,
    repo = repository(store);
  const exists = spawnSync(
    "git",
    ["show-ref", "--verify", "--quiet", "refs/tags/" + checkpoint.tag],
    { cwd: repo },
  );
  if (exists.status === 1) {
    check(
      request.create_missing_tag,
      "Checkpoint tag is missing; explicit create_missing_tag is required",
      true,
    );
    check(
      git(repo, ["cat-file", "-t", checkpoint.commit]) === "commit",
      "Checkpoint commit is missing",
    );
    git(repo, [
      "update-ref",
      "refs/tags/" + checkpoint.tag,
      checkpoint.commit,
      "0".repeat(checkpoint.commit.length),
    ]);
  }
  verify(store, repo, checkpoint);
  store.append(
    "checkpoint.completed",
    { checkpoint },
    request.request_id + ":checkpoint-completed",
    "flow",
    prepared.run_id,
    null,
    [prepared.event_id],
  );
  return checkpoint;
}

export function restoreCheckpoint(store: Store, request: Fields): Fields {
  check(
    CheckpointRestoreSchema.safeParse(request).success,
    "Invalid checkpoint restore request",
  );
  store.consistent();
  const repo = repository(store),
    events = store.events()[1];
  const event = events.find(
    (e) =>
      e.event_type === "checkpoint.completed" &&
      (e.data.checkpoint as Fields).checkpoint_id === request.checkpoint_id,
  );
  check(event, "Unknown completed checkpoint");
  const checkpoint = event.data.checkpoint as Fields;
  verify(store, repo, checkpoint);
  git(repo, ["check-ref-format", "refs/heads/" + request.branch]);
  const key = "checkpoint-restore:" + request.request_id;
  const previous = events.find((e) => e.event_key === key);
  if (previous)
    check(
      equal(previous.data.evidence, [checkpoint.commit, request.branch]),
      "Restore request ID reused",
    );
  const branch = spawnSync(
    "git",
    ["rev-parse", "--verify", "refs/heads/" + request.branch],
    { cwd: repo, encoding: "utf8" },
  );
  if (branch.status === 0) {
    const started = events.find((e) => e.event_key === key + ":started");
    check(
      (previous ||
        (started &&
          started.data.detail ===
            JSON.stringify({
              commit: checkpoint.commit,
              branch: request.branch,
            }))) &&
        branch.stdout.trim() === checkpoint.commit,
      "Restore branch already exists",
      true,
    );
  } else {
    store.append(
      "action.started",
      {
        action: key,
        detail: JSON.stringify({
          commit: checkpoint.commit,
          branch: request.branch,
        }),
      },
      key + ":started",
      "flow",
      event.run_id,
    );
    git(repo, [
      "update-ref",
      "refs/heads/" + request.branch,
      checkpoint.commit,
      "0".repeat(checkpoint.commit.length),
    ]);
  }
  store.append(
    "action.completed",
    {
      action: key,
      result: "復帰用branchを作成。checkoutとFlow再開は未実施。",
      evidence: [checkpoint.commit, request.branch],
    },
    key,
    "flow",
    event.run_id,
  );
  return { commit: checkpoint.commit, branch: request.branch };
}
