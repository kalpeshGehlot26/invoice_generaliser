import { describe, expect, it } from "vitest";
import { VENDOR_MASTER } from "@ifg/control-engine";
import { cleanString, sanitiseCharge, toInvoice } from "./enrich.js";
import type { ExtractedInvoice } from "./schema.js";

const BYTES = new Uint8Array([1, 2, 3, 4]);
const ctx = {
  docId: "D1",
  bytes: BYTES,
  sourceChannel: "portal_upload",
  master: VENDOR_MASTER,
};

const bare = (over: Partial<ExtractedInvoice> = {}): ExtractedInvoice => ({
  invoice_number: "X-1",
  clearance_id: null,
  issue_date: null,
  due_date: null,
  payment_terms_days: null,
  currency: "EUR",
  seller: { name: "S", country: "DE", vat_id: null, iban: null, address: null },
  buyer: { name: "B", country: "DE", vat_id: null, address: null },
  payee: { name: null, iban: null },
  po_number: null,
  delivery_note_ref: null,
  line_items: [],
  tax_breakdown: [],
  subtotal: null,
  tax_rate: null,
  tax_amount: null,
  discount: null,
  freight: null,
  total_due: null,
  ...over,
});

describe("cleanString", () => {
  it.each([
    "null", "NULL", " none ", "N/A", "-", "—", "not specified", "unknown", "",
    // Status words the model has been observed putting in value fields.
    "not_found", "NOT_FOUND", "not found", "unreadable", "not stated", "absent",
  ])(
    "coerces %o to null",
    (v) => {
      expect(cleanString(v)).toBeNull();
    },
  );

  it("keeps real values and trims them", () => {
    expect(cleanString("  INV-1 ")).toBe("INV-1");
  });

  it("does not eat values that merely contain a null-ish word", () => {
    expect(cleanString("Nullimex Trading GmbH")).toBe("Nullimex Trading GmbH");
    expect(cleanString("None-Stop Logistics")).toBe("None-Stop Logistics");
  });
});

describe("toInvoice null-ish coercion", () => {
  it('turns a "null" string clearance_id into a real null', () => {
    // Observed from GPT on a real document with no clearance identifier. Left
    // as-is, every truthiness check downstream reads it as present, turning a
    // missing state attestation into an apparently attested invoice.
    const inv = toInvoice(bare({ clearance_id: "null" }), ctx);
    expect(inv.clearance_id).toBeNull();
  });

  it('does not create a phantom payee from "null" strings', () => {
    const inv = toInvoice(bare({ payee: { name: "null", iban: "N/A" } }), ctx);
    // A phantom payee would fire PAYEE_NOT_SELLER on every clean invoice,
    // making the duplicate-financing sensor useless through noise.
    expect(inv.payee).toBeNull();
  });

  it("still records a genuinely named payee", () => {
    const inv = toInvoice(bare({ payee: { name: "Faktoria Kapital S.A.", iban: null } }), ctx);
    expect(inv.payee?.name).toBe("Faktoria Kapital S.A.");
  });

  it("trims whitespace from extracted identifiers", () => {
    const inv = toInvoice(bare({ invoice_number: "  NW-2026-08-1207  " }), ctx);
    expect(inv.invoice_number).toBe("NW-2026-08-1207");
  });
});

describe("sanitiseCharge", () => {
  it("keeps a genuine per-line fee", () => {
    // Amount 10,000 + Fee 25 = Total 10,025
    expect(sanitiseCharge(25, 1, 10000, 10025)).toBe(25);
  });

  it("rejects a charge equal to the row total", () => {
    // Observed: the model copied the Total column into charge as well, making
    // line arithmetic expect 60*80 + 5832 instead of 60*80.
    expect(sanitiseCharge(5832, 60, 80, 5832)).toBeNull();
  });

  it("rejects a charge larger than the row total", () => {
    expect(sanitiseCharge(9999, 1, 100, 100)).toBeNull();
  });

  it("rejects a charge that makes the row reconcile worse", () => {
    // 4 x 25 = 100 already equals the total; adding 10 moves it away.
    expect(sanitiseCharge(10, 4, 25, 100)).toBeNull();
  });

  it("treats zero as absent", () => {
    expect(sanitiseCharge(0, 1, 10, 10)).toBeNull();
  });

  it("keeps a charge when the row has no qty or unit price to check against", () => {
    expect(sanitiseCharge(25, null, null, 10025)).toBe(25);
  });
});
