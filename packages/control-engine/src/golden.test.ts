import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runControls } from "./engine.js";
import { BUYER_POS, INVOICES, VENDOR_MASTER } from "./samples.js";
import type { ControlResult, Invoice } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(here, "../../../IFG_POC_code/results.json");

/**
 * Reproduces run.py's loop, including the detail that makes the demo work:
 * only a funded invoice enters the ledger, which is what lets DOC-0006 collide
 * with DOC-0001.
 */
function runBook(): ControlResult[] {
  const ledger: Invoice[] = [];
  const results: ControlResult[] = [];

  for (const inv of INVOICES) {
    const res = runControls(inv, VENDOR_MASTER, BUYER_POS, ledger);
    results.push(res);
    if (res.decision === "AUTO_FUND" || res.decision === "REVIEW_LIGHT") {
      ledger.push(inv);
    }
  }
  return results;
}

describe("golden file parity with engine.py", () => {
  const expected = JSON.parse(readFileSync(GOLDEN, "utf8")) as ControlResult[];
  const actual = runBook();

  it("produces the same number of documents", () => {
    expect(actual).toHaveLength(expected.length);
  });

  // Per-document assertions so a failure names the document rather than
  // dumping the whole book as one diff.
  for (let i = 0; i < 8; i++) {
    describe(`document ${i + 1}`, () => {
      it("matches decision and risk score", () => {
        expect({
          doc_id: actual[i]!.doc_id,
          decision: actual[i]!.decision,
          risk_score: actual[i]!.risk_score,
          reason: actual[i]!.reason,
        }).toEqual({
          doc_id: expected[i]!.doc_id,
          decision: expected[i]!.decision,
          risk_score: expected[i]!.risk_score,
          reason: expected[i]!.reason,
        });
      });

      it("emits the same findings in the same order", () => {
        expect(actual[i]!.findings).toEqual(expected[i]!.findings);
      });

      it("matches the full result record", () => {
        expect(actual[i]).toEqual(expected[i]);
      });
    });
  }

  it("matches the entire book", () => {
    expect(actual).toEqual(expected);
  });

  it("reproduces the portfolio split from the Python run", () => {
    const counts: Record<string, number> = {};
    for (const r of actual) counts[r.decision] = (counts[r.decision] ?? 0) + 1;
    expect(counts).toEqual({ AUTO_FUND: 2, REVIEW: 2, BLOCK: 4 });
  });
});
