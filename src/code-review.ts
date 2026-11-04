import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CodeSnapshotSchema } from "./contracts/index.js";
import { digest, equal, type Fields } from "./format.js";
import { requireCondition as check } from "./errors.js";

function git(repository: string, args: string[]): string {
  const result = spawnSync("git", ["-C", repository, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  check(
    result.status === 0,
    "Code review Git operation failed: " +
      (result.stderr || result.error?.message),
  );
  return result.stdout;
}

// Ignore only this feature's artifacts. Other source, configuration and rules
// remain part of the snapshot, including files outside the immediate diff.
function context(repository: string, feature: string) {
  check(path.isAbsolute(repository), "Code repository must be absolute");
  const root = fs.realpathSync(repository);
  check(
    git(root, ["rev-parse", "--show-toplevel"]).trim() === root,
    "Code repository must be Git root",
  );
  const relative = path
    .relative(root, fs.realpathSync(feature))
    .split(path.sep)
    .join("/");
  check(relative !== "", "Feature directory must not be repository root");
  const excluded =
    !relative.startsWith("../") && !path.isAbsolute(relative)
      ? relative + "/"
      : null;
  const included = (name: string) => !excluded || !name.startsWith(excluded);
  return { root, included };
}

function tree(
  repository: string,
  commit: string,
  included: (p: string) => boolean,
): string {
  const entries = git(repository, ["ls-tree", "-rz", "--full-tree", commit])
    .split("\0")
    .filter(Boolean);
  return digest(
    entries
      .filter((entry) => included(entry.slice(entry.indexOf("\t") + 1)))
      .join("\0"),
  );
}

export function codeSnapshot(feature: string, request: Fields) {
  check(
    equal(
      Object.keys(request).sort(),
      ["repository", "base_commit", "head_commit"].sort(),
    ),
    "Invalid code-snapshot request",
  );
  const parsed = CodeSnapshotSchema.omit({ tree_sha256: true }).safeParse(
    request,
  );
  check(
    parsed.success,
    "Code snapshot requires full commit IDs and repository",
  );
  const { root, included } = context(request.repository, feature);
  for (const commit of [request.base_commit, request.head_commit])
    check(
      git(root, ["cat-file", "-t", commit]).trim() === "commit",
      "Snapshot object must be commit",
    );
  git(root, [
    "merge-base",
    "--is-ancestor",
    request.base_commit,
    request.head_commit,
  ]);
  git(root, ["merge-base", "--is-ancestor", request.head_commit, "HEAD"]);
  const snapshot = {
    ...request,
    repository: root,
    tree_sha256: tree(root, request.head_commit, included),
  };
  check(
    tree(root, "HEAD", included) === snapshot.tree_sha256,
    "Code changed after implementation commit",
  );
  for (const args of [
    ["diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "HEAD"],
    ["diff", "--cached", "--no-ext-diff", "--no-textconv", "--name-only", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ])
    check(
      !git(root, args).split("\0").filter(Boolean).some(included),
      "Uncommitted code prevents Implement review",
    );
  return snapshot;
}

export function checkCodeSnapshot(
  feature: string,
  snapshot: Fields,
  commit?: string,
): void {
  check(
    CodeSnapshotSchema.safeParse(snapshot).success,
    "Invalid code snapshot",
  );
  if (commit !== undefined)
    check(
      commit === snapshot.head_commit,
      "Implement commit/snapshot mismatch",
    );
  const actual = codeSnapshot(feature, {
    repository: snapshot.repository,
    base_commit: snapshot.base_commit,
    head_commit: snapshot.head_commit,
  });
  check(equal(actual, snapshot), "Stale code snapshot");
}
