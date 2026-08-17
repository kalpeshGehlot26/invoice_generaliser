import type { Finding, Invoice, LineBasis, LineItem } from "../types.js";
import { fmtMoney, pyRound, relClose } from "../util.js";

/** The row's net extended amount: what it costs before its own tax. */
function netOf(li: LineItem): number {
  return pyRound(
    (li.qty || 0) * (li.unit_price || 0) - (li.discount || 0) + (li.charge || 0),
    2,
  );
}

/** The same row with its own tax column added. */
function grossOf(li: LineItem): number {
  return pyRound(netOf(li) + (li.tax_amount || 0), 2);
}

/** A row can only be checked when there is something to multiply. */
function isMultipliable(li: LineItem): boolean {
  return (
    li.qty !== null && li.qty !== undefined && li.unit_price !== null && li.unit_price !== undefined
  );
}

/**
 * Decide, from the rows themselves, whether the printed total column is net or
 * gross of the row's tax.
 *
 * The test is agreement, not preference: a basis is only adopted if *every*
 * checkable row foots that way. A document where some rows are net and others
 * gross is not a document with a basis — it is a document with an error, so the
 * answer is `unknown` and each row is judged on its own.
 *
 * Where no row carries tax the two hypotheses are identical and `net` wins,
 * which is what keeps this identical to the pre-existing single-hypothesis
 * behaviour on every invoice that has no per-line tax column.
 */
export function detectLineBasis(inv: Invoice): LineBasis {
  const rows = (inv.line_items ?? []).filter(
    (li) => isMultipliable(li) && li.line_total !== null && li.line_total !== undefined,
  );
  if (rows.length === 0) return "unknown";

  if (rows.every((li) => relClose(netOf(li), li.line_total!))) return "net";
  if (rows.every((li) => relClose(grossOf(li), li.line_total!))) return "gross";
  return "unknown";
}

export function vLineArithmetic(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const lines = inv.line_items ?? [];

  lines.forEach((li, idx) => {
    const i = idx + 1;
    const net = netOf(li);
    const gross = grossOf(li);
    const got = li.line_total;

    // A lump-sum row prints no quantity or no unit price. There is nothing to
    // multiply, so asserting "qty x unit_price = 0.00" against a real total
    // invents a discrepancy that is not on the document.
    if (!isMultipliable(li)) return;

    if (got === null || got === undefined) {
      out.push({
        code: "LINE_MISSING_TOTAL",
        severity: "warn",
        message: `Line ${i} has no line_total.`,
        fields: [`line[${i}].line_total`],
        control: "arithmetic",
      });
      return;
    }

    // Either reading is a row that foots. Only a row that foots on neither
    // basis is a finding.
    if (relClose(net, got) || relClose(gross, got)) return;

    // Report against the net reading, and name the tax reading too when the row
    // carries tax, so the reviewer can see both hypotheses were tried.
    const alternative =
      li.tax_amount !== null && li.tax_amount !== undefined && li.tax_amount !== 0
        ? ` (with tax, ${fmtMoney(gross)})`
        : "";

    out.push({
      code: "LINE_MATH",
      severity: "high",
      message:
        `Line ${i}: qty x unit_price = ${fmtMoney(net)}${alternative} ` +
        `but line_total reads ${fmtMoney(got)}.`,
      fields: [`line[${i}].line_total`],
      control: "arithmetic",
    });
  });

  return out;
}

/**
 * Does the document actually carry per-line discount or tax data?
 *
 * The alternative readings below are only meaningful when it does. On a document
 * that states neither, "subtotal net of line discounts" is not a second
 * hypothesis — it is the same number wearing a different name, and admitting it
 * would silently retire a check rather than sharpen it.
 */
function hasLineLevelAdjustments(lines: LineItem[]): boolean {
  return lines.some(
    (li) =>
      (li.discount !== null && li.discount !== undefined && li.discount !== 0) ||
      (li.tax_amount !== null && li.tax_amount !== undefined && li.tax_amount !== 0),
  );
}

export function vTotals(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const lines = inv.line_items ?? [];
  const basis = detectLineBasis(inv);
  const adjusted = hasLineLevelAdjustments(lines);

  // Whether the header subtotal is stated before or after the line discounts
  // decides both this check and whether the header discount may be subtracted
  // again below. Both conventions are in live use, and the default is to
  // subtract: only positive evidence that the subtotal ALREADY nets the discount
  // may suppress it. Defaulting the other way was a bug — one dropped line item
  // made every hypothesis miss, the discount silently stopped being subtracted,
  // and the total check reported a 29,267.00 expectation on an invoice whose own
  // figures give 27,537.00, overstating the gap by exactly the discount.
  let subtotalIsNetOfDiscount = false;

  if (lines.length > 0 && inv.subtotal !== null && inv.subtotal !== undefined) {
    const printed = pyRound(
      lines.reduce((acc, li) => acc + (li.line_total || 0), 0),
      2,
    );
    const net = pyRound(
      lines.reduce((acc, li) => acc + netOf(li), 0),
      2,
    );
    const preDiscount = pyRound(
      lines.reduce((acc, li) => acc + netOf(li) + (li.discount || 0), 0),
      2,
    );

    // Three defensible readings of "subtotal", all computed from the same
    // figures on the page: the printed column summed as-is, the same rows net
    // of their own tax, and the rows before their discounts were applied
    // (the convention where the discount is aggregated into a header line).
    const matchesPrinted = relClose(printed, inv.subtotal);
    const matchesNet = adjusted && relClose(net, inv.subtotal);
    const matchesPreDiscount = adjusted && relClose(preDiscount, inv.subtotal);

    subtotalIsNetOfDiscount = matchesNet && !matchesPreDiscount;

    if (!matchesPrinted && !matchesNet && !matchesPreDiscount) {
      // Compare against whichever reading the rows themselves support, so the
      // number quoted back to the reviewer is the one they can re-add.
      const expect = basis === "gross" ? net : printed;
      out.push({
        code: "SUBTOTAL_MISMATCH",
        severity: "high",
        message:
          `Line items sum to ${fmtMoney(expect)} but subtotal reads ` +
          `${fmtMoney(inv.subtotal)}. Difference ` +
          `${fmtMoney(Math.abs(expect - inv.subtotal))}.`,
        fields: ["subtotal"],
        control: "arithmetic",
      });
    }
  }

  const sub = inv.subtotal || 0;
  const tax = inv.tax_amount || 0;
  const disc = inv.discount || 0;
  const freight = inv.freight || 0;
  const rounding = inv.rounding_adjustment || 0;

  // Subtracting a header discount that the subtotal has already netted off
  // would report a shortfall of exactly the discount. So it is skipped only when
  // the rows positively show the subtotal is already net of it.
  const applyDiscount = !(adjusted && lines.length > 0 && subtotalIsNetOfDiscount);
  const expect = pyRound(sub + tax - (applyDiscount ? disc : 0) + freight + rounding, 2);

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
