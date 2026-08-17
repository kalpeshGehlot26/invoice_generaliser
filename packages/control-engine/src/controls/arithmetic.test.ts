import { describe, expect, it } from "vitest";
import type { Invoice, LineItem } from "../types.js";
import { detectLineBasis, vLineArithmetic, vTotals } from "./arithmetic.js";

const line = (over: Partial<LineItem>): LineItem => ({
  qty: 1,
  unit_price: 100,
  charge: null,
  discount: null,
  tax_amount: null,
  line_total: 100,
  ...over,
});

const invoice = (over: Partial<Invoice>): Invoice => ({ doc_id: "DOC-T", ...over });

/**
 * A real Indian GST invoice (Sleek Bill, INVOICE X33) that footed to the last
 * paisa and was nonetheless reported BLOCK / 356 with a critical total mismatch,
 * three line-math failures and a subtotal mismatch — every one of them false.
 *
 * The document prints:
 *   - AMOUNT per row as net-of-discount PLUS that row's IGST
 *   - per-row discounts as percentages ("-Discount 5%")
 *   - TOTAL BEFORE TAX as the sum of qty x unit_price, i.e. BEFORE those discounts
 *   - DISCOUNT 1,730.00 as a header line aggregating them
 *   - ROUNDED OFF 0.10
 *   - Shipping & Packaging as a table row, not a header freight line
 */
const sleekBill = invoice({
  line_items: [
    // 23 x 200 = 4,600, less 5% = 4,370, plus IGST 524.40 = 4,894.40
    line({ qty: 23, unit_price: 200, discount: 230, tax_amount: 524.4, line_total: 4894.4, tax_rate: 12 }),
    // 3 x 2,000 = 6,000, no discount, plus IGST 1,080 = 7,080
    line({ qty: 3, unit_price: 2000, tax_amount: 1080, line_total: 7080, tax_rate: 18 }),
    // 100 x 150 = 15,000, less 10% = 13,500, plus IGST 1,620 = 15,120
    line({ qty: 100, unit_price: 150, discount: 1500, tax_amount: 1620, line_total: 15120, tax_rate: 12 }),
    // Shipping row: 100, plus IGST 12 = 112
    line({ description: "Shipping & Packaging", tax_amount: 12, line_total: 112, tax_rate: 12 }),
  ],
  subtotal: 25700,
  tax_amount: 3454.9,
  discount: 1730,
  freight: null,
  rounding_adjustment: 0.1,
  total_due: 27425,
});

describe("row-total basis", () => {
  it("reads a tax-inclusive amount column as gross", () => {
    expect(detectLineBasis(sleekBill)).toBe("gross");
  });

  it("reads a plain net column as net", () => {
    const inv = invoice({ line_items: [line({ qty: 4, unit_price: 25, line_total: 100 })] });
    expect(detectLineBasis(inv)).toBe("net");
  });

  it("refuses to pick a basis when the rows disagree with each other", () => {
    // Both rows carry tax, so the two hypotheses are genuinely distinct: the
    // first row foots only net, the second only gross.
    const inv = invoice({
      line_items: [
        line({ qty: 4, unit_price: 25, tax_amount: 19, line_total: 100 }),
        line({ qty: 4, unit_price: 25, tax_amount: 19, line_total: 119 }),
      ],
    });
    expect(detectLineBasis(inv)).toBe("unknown");
  });
});

describe("an invoice that foots produces no arithmetic findings", () => {
  it("clears every row of a discounted, tax-inclusive table", () => {
    expect(vLineArithmetic(sleekBill)).toEqual([]);
  });

  it("clears the subtotal stated before line discounts", () => {
    const codes = vTotals(sleekBill).map((f) => f.code);
    expect(codes).not.toContain("SUBTOTAL_MISMATCH");
  });

  it("clears the total, honouring the document's own rounding line", () => {
    const codes = vTotals(sleekBill).map((f) => f.code);
    expect(codes).not.toContain("TOTAL_MISMATCH");
  });

  it("produces no findings at all", () => {
    expect([...vLineArithmetic(sleekBill), ...vTotals(sleekBill)]).toEqual([]);
  });
});

describe("the checks still bite", () => {
  it("catches a row that foots on neither basis", () => {
    const inv = invoice({
      line_items: [line({ qty: 10, unit_price: 100, tax_amount: 190, line_total: 1500 })],
    });
    const findings = vLineArithmetic(inv);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("LINE_MATH");
    // Both hypotheses are quoted, so the reviewer can see neither was ignored.
    expect(findings[0]!.message).toContain("1,000.00");
    expect(findings[0]!.message).toContain("1,190.00");
  });

  it("catches an inflated total on a gross-basis invoice", () => {
    const codes = vTotals({ ...sleekBill, total_due: 31000 }).map((f) => f.code);
    expect(codes).toContain("TOTAL_MISMATCH");
  });

  it("catches a subtotal that matches none of the readings", () => {
    const codes = vTotals({ ...sleekBill, subtotal: 19000 }).map((f) => f.code);
    expect(codes).toContain("SUBTOTAL_MISMATCH");
  });

  it("does not let a double-counted freight pass just because rounding exists", () => {
    // The original defect: shipping in the table AND in header freight.
    const codes = vTotals({ ...sleekBill, freight: 112 }).map((f) => f.code);
    expect(codes).toContain("TOTAL_MISMATCH");
  });

  it("still subtracts a header discount when the rows carry no adjustments", () => {
    const inv = invoice({
      line_items: [line({ qty: 1, unit_price: 1000, line_total: 1000 })],
      subtotal: 1000,
      tax_amount: 0,
      discount: 100,
      total_due: 1000,
    });
    expect(vTotals(inv).map((f) => f.code)).toContain("TOTAL_MISMATCH");
  });
});

describe("the header discount is subtracted unless the rows say otherwise", () => {
  it("still subtracts when a dropped row makes every subtotal reading miss", () => {
    // Regression: the shipping row went missing from an extraction, the
    // pre-discount reading fell 100 short, and the discount silently stopped
    // being subtracted — inflating the expected total by the whole 1,730.
    const short = invoice({
      line_items: sleekBill.line_items!.slice(0, 3),
      subtotal: 25700,
      tax_amount: 3454.9,
      discount: 1730,
      freight: 112,
      rounding_adjustment: 0.1,
      total_due: 27425,
    });
    const total = vTotals(short).find((f) => f.code === "TOTAL_MISMATCH");
    expect(total).toBeDefined();
    expect(total!.message).toContain("27,537.00");
    expect(total!.message).not.toContain("29,267.00");
  });

  it("skips the subtraction only on positive evidence the subtotal is already net", () => {
    // subtotal 23,970 equals the rows net of their discounts, so subtracting
    // the header discount again would invent a 1,730 shortfall.
    const netStated = invoice({
      line_items: sleekBill.line_items,
      subtotal: 23970,
      tax_amount: 3454.9,
      discount: 1730,
      rounding_adjustment: 0.1,
      total_due: 27425,
    });
    expect(vTotals(netStated).map((f) => f.code)).not.toContain("TOTAL_MISMATCH");
  });
});
