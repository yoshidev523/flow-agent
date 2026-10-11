import fs from "node:fs";
import { build } from "esbuild";
import { isBuiltin } from "node:module";
const check = process.argv.includes("--check");
const bundle = await build({
  entryPoints: ["src/cli.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  write: false,
  metafile: true,
  legalComments: "inline",
  charset: "ascii",
});
for (const output of Object.values(bundle.metafile.outputs))
  for (const imported of output.imports)
    if (imported.external && !isBuiltin(imported.path))
      throw new Error("Unexpected external dependency: " + imported.path);
// A dynamic import bootstrap allows the same .js file in ESM and CommonJS consumer projects.
const licenses = ["zod", "yaml"]
  .map(
    (name) =>
      `/* Bundled ${name} license:\n${fs.readFileSync(`node_modules/${name}/LICENSE`, "utf8").replaceAll("*/", "* /")}\n*/`,
  )
  .join("\n");
const js =
  "#!/usr/bin/env node\n" +
  licenses +
  '\n(async () => {\nconst { createRequire } = await import("node:module");\nconst require = createRequire(process.cwd() + "/__flowctl__.cjs");\n' +
  bundle.outputFiles[0].text +
  '\n})().catch(error => { console.log(JSON.stringify({ok:false,code:"storage_or_input",message:error.message})); process.exitCode=4; });\n';
const outputs = [
  ".apm/skills/flow/scripts/flowctl.js",
  ".apm/skills/flow-artifact-sync/scripts/flowctl.js",
];
for (const output of outputs) {
  if (check) {
    if (fs.readFileSync(output, "utf8") !== js)
      throw new Error(
        "Distribution is stale: " + output + "; run npm run build",
      );
  } else {
    fs.mkdirSync(output.slice(0, output.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(output, js, { mode: 0o755 });
  }
}
for (const directory of ["references", "assets/templates"]) {
  const source = ".apm/skills/flow/" + directory;
  const target = ".apm/skills/flow-artifact-sync/" + directory;
  for (const file of fs.readdirSync(source)) {
    const contents = fs.readFileSync(source + "/" + file);
    if (check) {
      if (!fs.readFileSync(target + "/" + file).equals(contents))
        throw new Error("Sync resources are stale; run npm run build");
    } else {
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(target + "/" + file, contents);
    }
  }
}
if (!check) {
  await build({
    entryPoints: ["src/testing.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    outfile: ".test-runtime/flowctl.cjs",
    legalComments: "none",
  });
}
console.log(check ? "Distribution is current" : "Built standalone flowctl.js");
