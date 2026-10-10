import fs from "node:fs";
import { Store } from "./persistence/store.js";
import { load, object, equal, utf8 } from "./format.js";
import { FlowError, requireCondition as check } from "./errors.js";
import type { Stage } from "./validation/guards.js";
const help = `flowctl 4.0.0 — Flow persistence and contract guards\nUsage: node flowctl.js --root FEATURE COMMAND [OPTIONS]\nCommands: init, publish, transition, audit-append, review-check --request FILE|-\n          validate PATH [--references]\n          resume-check [--recover]\nOptions: --version, --help\n`;
async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    if (argv.includes("--version")) {
      console.log("flowctl 4.0.0");
      return 0;
    }
    if (argv.includes("--help") || argv.includes("-h")) {
      console.log(help);
      return 0;
    }
    check(
      Number(process.versions.node.split(".")[0]) >= 22,
      "Node.js 22 or newer is required",
    );
    const rootIndex = argv.indexOf("--root");
    check(rootIndex >= 0 && argv[rootIndex + 1], "--root is required");
    const root = argv[rootIndex + 1];
    argv = [...argv.slice(0, rootIndex), ...argv.slice(rootIndex + 2)];
    const command = argv.shift();
    const store = new Store(root);
    const result = await store.locked(() => {
      if (command === "validate") {
        const name = argv.shift();
        check(name, "validate requires a path");
        check(
          argv.every((x) => x === "--references") && argv.length <= 1,
          "Invalid validate arguments",
        );
        if (name === "audit.md") return { events: store.events()[1].length };
        if (name === "flow-state.yml")
          return argv.includes("--references")
            ? store.resumeCheck()
            : store.state();
        const [meta, , ref] = store.document(name);
        if (argv.includes("--references")) store.checkDocumentInputs(meta);
        return { artifact: ref, status: meta.status ?? null };
      }
      if (command === "resume-check") {
        check(
          argv.length === 0 || equal(argv, ["--recover"]),
          "Invalid resume-check arguments",
        );
        return store.resumeCheck(argv.includes("--recover"));
      }
      check(
        [
          "init",
          "publish",
          "transition",
          "audit-append",
          "review-check",
        ].includes(command ?? ""),
        "Unknown command",
      );
      check(
        argv.length === 2 && argv[0] === "--request",
        "--request FILE|- is required",
      );
      const request = object(
        load(utf8(fs.readFileSync(argv[1] === "-" ? 0 : argv[1]))),
      );
      if (command === "init") return store.initialize(request);
      if (command === "publish") return store.publish(request);
      if (command === "transition") return store.transition(request);
      if (command === "audit-append") return store.auditAppend(request);
      check(
        equal(
          Object.keys(request).sort(),
          [
            "stage",
            "target",
            "design",
            "review_cycle_id",
            "mode",
            "source_paths",
          ].sort(),
        ),
        "Invalid review-check request",
      );
      return store.reviewCheck(
        request.stage as Stage,
        request.target,
        request.design,
        request.review_cycle_id,
        request.mode,
        request.source_paths,
      );
    });
    console.log(JSON.stringify({ ok: true, result }));
    return 0;
  } catch (e) {
    if (e instanceof FlowError) {
      console.log(
        JSON.stringify({ ok: false, code: e.code, message: e.message }),
      );
      return e.exitCode;
    }
    console.log(
      JSON.stringify({
        ok: false,
        code: "storage_or_input",
        message: (e as Error).message,
      }),
    );
    return 4;
  }
}
void main().then((code) => {
  process.exitCode = code;
});
