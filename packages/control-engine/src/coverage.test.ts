import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COVERED_FIELDS, REASON, isCovered, reasonFor } from "./coverage.js";

const here = dirname(fileURLToPath(import.meta.url));
const CONTROLS = join(here, "controls");

function controlSources(): string {
  return readdirSync(CONTROLS)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => readFileSync(join(CONTROLS, f), "utf8"))
    .join("\n");
}

/**
 * The whole point of COVERED_FIELDS is that a clean field can be reported as
 * "checked" rather than merely "not flagged". A control that starts naming a new
 * field without it being listed here would have that field reported as
 * unchecked forever — a quiet, permanent inaccuracy. So the list is re-derived
 * from source and compared, rather than trusted.
 */
describe("coverage stays in sync with the controls", () => {
  it("lists every literal field path the controls can emit", () => {
    const source = controlSources();
    const literals = new Set<string>();
    for (const block of source.match(/fields: \[[^\]]*\]/g) ?? []) {
      for (const quoted of block.match(/"[^"]+"/g) ?? []) {
        literals.add(quoted.slice(1, -1));
      }
    }
    expect(literals.size).toBeGreaterThan(10);
    const missing = [...literals].filter((f) => !COVERED_FIELDS.has(f));
    expect(missing).toEqual([]);
  });

  it("has a short reason for every code the controls can emit", () => {
    const codes = new Set(
      (controlSources().match(/code: "[A-Z_]+"/g) ?? []).map((m) => m.slice(7, -1)),
    );
    expect(codes.size).toBeGreaterThan(30);
    const unlabelled = [...codes].filter((c) => !(c in REASON));
    expect(unlabelled).toEqual([]);
  });
});

describe("indexed paths", () => {
  it("treats a line row and a tax band as covered", () => {
    expect(isCovered("line[3].line_total")).toBe(true);
    expect(isCovered("tax_breakdown[2].amount")).toBe(true);
  });

  it("does not claim coverage for a field no control reads", () => {
    expect(isCovered("seller.address")).toBe(false);
    expect(isCovered("content_hash")).toBe(false);
  });
});

describe("reasonFor", () => {
  it("falls back to a readable form for an unknown code", () => {
    expect(reasonFor("SOME_NEW_CODE")).toBe("some new code");
  });
});
