/**
 * Console report over the sample book. Mirrors run.py.
 *
 * Deviation from the Python: run.py writes results.json in place. That file is
 * the golden oracle for the port's tests, so this writes to the package
 * directory instead and never touches the reference copy.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runControls } from "./engine.js";
import { BUYER_POS, INVOICES, VENDOR_MASTER } from "./samples.js";
import type { ControlResult, Decision, Invoice, Severity } from "./types.js";
import { fmtMoney } from "./util.js";

const SEV_ICON: Record<Severity, string> = {
  critical: "[CRIT]",
  high: "[HIGH]",
  warn: "[WARN]",
  info: "[INFO]",
};

const DEC_LABEL: Record<Decision, string> = {
  AUTO_FUND: "AUTO FUND",
  REVIEW_LIGHT: "LIGHT REVIEW",
  REVIEW: "REVIEW QUEUE",
  BLOCK: "BLOCK / ESCALATE",
};

/** CPython's str.center: left = marg/2 + (marg & width & 1). */
function center(s: string, width: number): string {
  const marg = width - s.length;
  if (marg <= 0) return s;
  const left = Math.floor(marg / 2) + (marg & width & 1);
  return " ".repeat(left) + s + " ".repeat(marg - left);
}

const pad = (s: string, w: number) => s.padEnd(w);

export function main(): void {
  const ledger: Invoice[] = [];
  const results: ControlResult[] = [];

  for (const inv of INVOICES) {
    const res = runControls(inv, VENDOR_MASTER, BUYER_POS, ledger);
    results.push(res);
    // Only a funded invoice enters the ledger, which is what makes DOC-0006
    // collide with DOC-0001.
    if (res.decision === "AUTO_FUND" || res.decision === "REVIEW_LIGHT") {
      ledger.push(inv);
    }
  }

  const width = 96;
  const line = "=".repeat(width);
  const out: string[] = [];

  out.push(line);
  out.push(center("IFG INVOICE INGESTION POC : DETERMINISTIC CONTROL LAYER", width));
  out.push(center("8 documents, 5 corridors, 6 input channels", width));
  out.push(line);

  for (const r of results) {
    out.push("");
    out.push(`${r.doc_id}  ${DEC_LABEL[r.decision]}   risk score ${r.risk_score}`);
    out.push(`  ${r.label}`);
    out.push(`  ${r.seller}  ->  ${r.buyer}`);
    out.push(
      `  ${r.invoice_number}   ${r.currency} ${fmtMoney(r.total_due as number)}   ` +
        `channel=${r.channel}   corridor=${r.corridor}`,
    );
    if (r.clearance_id) out.push(`  attested: ${r.clearance_id.slice(0, 44)}`);
    if (r.findings.length === 0) out.push("  no findings");
    for (const f of r.findings) {
      out.push(`  ${pad(SEV_ICON[f.severity], 7)} ${pad(f.code, 32)} ${f.message}`);
    }
  }

  out.push("");
  out.push(line);
  out.push(center("PORTFOLIO SUMMARY", width));
  out.push(line);

  const counts: Partial<Record<Decision, number>> = {};
  for (const r of results) counts[r.decision] = (counts[r.decision] ?? 0) + 1;
  const total = results.length;

  for (const d of ["AUTO_FUND", "REVIEW_LIGHT", "REVIEW", "BLOCK"] as Decision[]) {
    const n = counts[d] ?? 0;
    const bar = "#".repeat(Math.trunc((n / total) * 40));
    const pct = ((n / total) * 100).toFixed(1).padStart(5);
    out.push(`  ${pad(DEC_LABEL[d], 18)} ${n}/${total}  ${pct}%  ${bar}`);
  }

  const critCodes = new Map<string, number>();
  for (const r of results) {
    for (const f of r.findings) {
      if (f.severity === "critical" || f.severity === "high") {
        critCodes.set(f.code, (critCodes.get(f.code) ?? 0) + 1);
      }
    }
  }

  out.push("");
  out.push("  Controls that fired at high or critical severity:");
  for (const [code, n] of [...critCodes.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`    ${pad(code, 34)} ${n}`);
  }

  const moneyAtRisk = results
    .filter((r) => r.decision === "BLOCK")
    .reduce((acc, r) => acc + (r.total_due ?? 0), 0);

  out.push("");
  out.push(
    `  Value held back by the BLOCK decisions: ${fmtMoney(moneyAtRisk)} ` +
      "(mixed currency, illustrative)",
  );
  out.push("  Every finding above is deterministic, reproducible, and explainable in a");
  out.push("  field exam. None of it depends on which OCR model you choose.");

  console.log(out.join("\n"));

  const here = dirname(fileURLToPath(import.meta.url));
  const target = join(here, "..", "results.json");
  writeFileSync(target, JSON.stringify(results, null, 2));
  console.log(`\n  ${target} written\n`);
}

main();
