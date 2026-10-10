import { createHash } from "node:crypto";
import { parseDocument, stringify, visit as visitYaml, isScalar } from "yaml";
import { FlowError, requireCondition as check } from "./errors.js";

export function utf8(data: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(data);
}

export function load(text: string): unknown {
  try {
    const doc = parseDocument(text, {
      uniqueKeys: true,
      stringKeys: false,
      version: "1.1",
      customTags: (tags) =>
        tags.map((tag) => {
          if (typeof tag === "string") return tag;
          if (tag.tag === "tag:yaml.org,2002:timestamp")
            return { ...tag, resolve: (value: unknown) => value };
          if (tag.format === "EXP" && tag.test)
            return {
              ...tag,
              test: /^[-+]?(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9_]+)[eE][-+]?[0-9]+$/,
            };
          return tag;
        }),
    });
    if (doc.errors.length)
      throw new Error(doc.errors.map((e) => e.message).join("; "));
    visitYaml(doc, {
      Map(_key, node) {
        for (const pair of node.items)
          check(
            isScalar(pair.key) && typeof pair.key.value === "string",
            "YAML mapping keys must be strings",
          );
      },
    });
    // YAML 1.1 matches the previous contract's scalar rules, except timestamps remain strings.
    const value = doc.toJS({ maxAliasCount: 100 });
    const visit = (v: unknown, seen = new Set<unknown>()): void => {
      if (v === null || typeof v === "string" || typeof v === "boolean") return;
      if (typeof v === "number") {
        check(Number.isFinite(v), "Non-finite YAML number");
        return;
      }
      check(
        typeof v === "object" && v !== undefined && !(v instanceof Date),
        "Non-JSON YAML value",
      );
      check(!seen.has(v), "Cyclic YAML value");
      seen.add(v);
      if (Array.isArray(v)) v.forEach((x) => visit(x, seen));
      else for (const x of Object.values(v)) visit(x, seen);
      seen.delete(v);
    };
    visit(value);
    return value;
  } catch (e) {
    throw new FlowError("Invalid YAML: " + (e as Error).message);
  }
}
export function dump(value: unknown): string {
  return stringify(value, {
    lineWidth: 0,
    version: "1.1",
    aliasDuplicateObjects: false,
  });
}
export function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00");
}
export function digest(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function equal(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b);
}
export function fingerprint(value: unknown): string {
  return digest(canonical(value));
}
// Dynamic documents are validated by Zod before semantic guards access their fields.
export type Fields = Record<string, any>;
export function object(value: unknown): Fields {
  check(
    value && typeof value === "object" && !Array.isArray(value),
    "Request must be a mapping",
  );
  return value as Fields;
}
export function markdown(text: string): [Fields, string] {
  check(text.startsWith("---\n"), "Markdown requires YAML front matter");
  const end = text.indexOf("\n---\n", 4);
  check(end !== -1, "Missing front matter terminator");
  return [object(load(text.slice(4, end))), text.slice(end + 5)];
}
export function render(meta: unknown, body: string): string {
  return "---\n" + dump(meta) + "---\n" + body.replace(/^\n+/, "");
}
