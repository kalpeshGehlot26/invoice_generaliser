import type { Finding, Invoice } from "../types.js";
import { fmtMoney, pyRound, relClose } from "../util.js";

export function vLineArithmetic(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const lines = inv.line_items ?? [];

  lines.forEach((li, idx) => {
    const i = idx + 1;
    // A per-line fee / surcharge / handling column is part of the row total.
    // Without it, an invoice that foots perfectly reports as broken arithmetic
    // and the control loses the reviewer's trust.
    const expect = pyRound((li.qty || 0) * (li.unit_price || 0) + (li.charge || 0), 2);
    const got = li.line_total;

    if (got === null || got === undefined) {
      out.push({
        code: "LINE_MISSING_TOTAL",
        severity: "warn",
        message: `Line ${i} has no line_total.`,
        fields: [`line[${i}].line_total`],
        control: "arithmetic",
      });
    } else if (!relClose(expect, got)) {
      out.push({
        code: "LINE_MATH",
        severity: "high",
        message:
          `Line ${i}: qty x unit_price = ${fmtMoney(expect)} ` +
          `but line_total reads ${fmtMoney(got)}.`,
        fields: [`line[${i}].line_total`],
        control: "arithmetic",
      });
    }
  });

  return out;
}

export function vTotals(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const lines = inv.line_items ?? [];

  if (lines.length > 0) {
    const s = pyRound(
      lines.reduce((acc, li) => acc + (li.line_total || 0), 0),
      2,
    );
    if (inv.subtotal !== null && inv.subtotal !== undefined && !relClose(s, inv.subtotal)) {
      out.push({
        code: "SUBTOTAL_MISMATCH",
        severity: "high",
        message:
          `Line items sum to ${fmtMoney(s)} but subtotal reads ` +
          `${fmtMoney(inv.subtotal)}. Difference ` +
          `${fmtMoney(Math.abs(s - inv.subtotal))}.`,
        fields: ["subtotal"],
        control: "arithmetic",
      });
    }
  }

  const sub = inv.subtotal || 0;
  const tax = inv.tax_amount || 0;
  const disc = inv.discount || 0;
  const freight = inv.freight || 0;
  const expect = pyRound(sub + tax - disc + freight, 2);

  if (inv.total_due !== null && inv.total_due !== undefined && !relClose(expect, inv.total_due)) {
    out.push({
      code: "TOTAL_MISMATCH",
      severity: "critical",
      message:
        `subtotal + tax - discount + freight = ${fmtMoney(expect)} ` +
        `but total_due reads ${fmtMoney(inv.total_due)}. ` +
        "Never auto-repair a total: recompute and flag.",
      fields: ["total_due"],
      control: "arithmetic",
    });
  }

  return out;
}
