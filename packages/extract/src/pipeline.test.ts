import { zodResponseFormat } from "openai/helpers/zod";
import { describe, expect, it, vi } from "vitest";
import { VENDOR_MASTER, runControls } from "@ifg/control-engine";
import { resolveSupplierId, toInvoice } from "./enrich.js";
import type { LlmClient } from "./llm.js";
import { processInvoice } from "./pipeline.js";
import {
  ExtractedInvoiceSchema,
  ModelOutputSchema,
  type ExtractedInvoice,
} from "./schema.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** A clean invoice from a supplier that exists in the demo vendor master. */
const cleanInvoice = (): ExtractedInvoice => ({
  invoice_number: "NW-2026-08-1193",
  clearance_id: null,
  issue_date: "2026-08-06",
  due_date: "2026-09-20",
  payment_terms_days: 45,
  currency: "EUR",
  seller: {
    name: "Nordwerk Antriebstechnik GmbH",
    country: "DE",
    vat_id: "DE811234567",
    iban: "DE89370400440532013000",
    address: null,
  },
  buyer: { name: "Rheinstahl Werke AG", country: "DE", vat_id: "DE119876543", address: null },
  payee: { name: null, iban: null },
  po_number: "PO-DE-5521",
  line_items: [
    {
      description: "Planetengetriebe PG-240",
      qty: 40,
      uom: null,
      unit_price: 1685.0,
      line_total: 67400.0,
      tax_rate: 19.0,
      tax_category: "S",
    },
    {
      description: "Montagesatz",
      qty: 40,
      uom: null,
      unit_price: 92.5,
      line_total: 3700.0,
      tax_rate: 19.0,
      tax_category: "S",
    },
  ],
  subtotal: 71100.0,
  tax_rate: 19.0,
  tax_amount: 13509.0,
  discount: 0.0,
  freight: 0.0,
  total_due: 84609.0,
});

const stubClient = (invoice: unknown, requested: unknown[] = []): LlmClient => ({
  complete: vi.fn().mockResolvedValue({
    content: JSON.stringify({ invoice, requested }),
    model: "openai/gpt-5",
    promptTokens: 100,
    completionTokens: 50,
  }),
});

const run = (invoice: unknown, requestedFields: string[] = [], requested: unknown[] = []) =>
  processInvoice({
    bytes: PNG,
    docId: "DOC-TEST",
    requestedFields,
    client: stubClient(invoice, requested),
  });

describe("schema is compatible with the frozen control engine", () => {
  it("produces a value the engine accepts and scores", () => {
    const parsed = ExtractedInvoiceSchema.parse(cleanInvoice());
    const invoice = toInvoice(parsed, {
      docId: "DOC-X",
      bytes: PNG,
      sourceChannel: "portal_upload",
      master: VENDOR_MASTER,
    });
    // The real engine, unmodified, consuming extraction output.
    const result = runControls(invoice, VENDOR_MASTER, {}, []);
    expect(result.doc_id).toBe("DOC-X");
    expect(typeof result.risk_score).toBe("number");
  });

  it("emits a strict JSON Schema OpenAI will accept", () => {
    const format = zodResponseFormat(ModelOutputSchema, "invoice_extraction");
    expect(format.json_schema.strict).toBe(true);

    const walk = (node: any): void => {
      if (!node || typeof node !== "object") return;
      expect(node.allOf).toBeUndefined();
      if (node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect(new Set(node.required ?? [])).toEqual(
          new Set(Object.keys(node.properties ?? {})),
        );
      }
      Object.values(node).forEach(walk);
    };
    walk(format.json_schema.schema);
  });
});

describe("supplier resolution", () => {
  it("matches on tax ID", () => {
    expect(
      resolveSupplierId(
        { name: "Anything Else Ltd", country: "DE", vat_id: "DE811234567", iban: null, address: null },
        VENDOR_MASTER,
      ),
    ).toBe("SUP-2277");
  });

  it("falls back to a normalised name match", () => {
    expect(
      resolveSupplierId(
        { name: "nordwerk antriebstechnik gmbh", country: "DE", vat_id: null, iban: null, address: null },
        VENDOR_MASTER,
      ),
    ).toBe("SUP-2277");
  });

  it("returns null for an unknown supplier rather than guessing", () => {
    expect(
      resolveSupplierId(
        { name: "Brand New Vendor Ltd", country: "GB", vat_id: "GB999999999", iban: null, address: null },
        VENDOR_MASTER,
      ),
    ).toBeNull();
  });

  it("an unresolved supplier makes the engine fire SUPPLIER_UNKNOWN", async () => {
    const inv = cleanInvoice();
    inv.seller.name = "Brand New Vendor Ltd";
    inv.seller.vat_id = "DE999999999";
    const { control } = await run(inv);
    expect(control.findings.map((f) => f.code)).toContain("SUPPLIER_UNKNOWN");
  });
});

describe("payee handling", () => {
  it("leaves payee null when the document names none", async () => {
    const { invoice, control } = await run(cleanInvoice());
    expect(invoice.payee).toBeNull();
    // Defaulting payee to seller would permanently silence this control.
    expect(control.findings.map((f) => f.code)).not.toContain("PAYEE_NOT_SELLER");
  });

  it("blocks when a distinct payee is named", async () => {
    const inv = cleanInvoice();
    inv.payee = { name: "Faktoria Kapital S.A.", iban: "PL27114020040000300201355387" };
    const { control } = await run(inv);
    expect(control.findings.map((f) => f.code)).toContain("PAYEE_NOT_SELLER");
    expect(control.decision).toBe("BLOCK");
  });
});

describe("controls run over extracted data", () => {
  it("detects a total that does not foot, and never repairs it", async () => {
    const inv = cleanInvoice();
    inv.total_due = 99999.0;
    const { invoice, control } = await run(inv);
    expect(control.findings.map((f) => f.code)).toContain("TOTAL_MISMATCH");
    // The reported value must survive untouched.
    expect(invoice.total_due).toBe(99999.0);
    expect(control.decision).toBe("BLOCK");
  });

  it("detects an invalid tax rate for the seller's country", async () => {
    const inv = cleanInvoice();
    inv.tax_rate = 17.5;
    const { control } = await run(inv);
    expect(control.findings.map((f) => f.code)).toContain("TAX_RATE_INVALID");
  });
});

describe("EXTRACTION_UNVERIFIED", () => {
  it("is raised when extraction supplies no confidence or grounding", async () => {
    const { control } = await run(cleanInvoice());
    const codes = control.findings.map((f) => f.code);
    expect(codes).toContain("EXTRACTION_UNVERIFIED");
    // An otherwise clean invoice must not present as fully auto-fundable.
    expect(control.decision).not.toBe("AUTO_FUND");
  });

  it("is counted in the risk score, not merely displayed", async () => {
    const { control } = await run(cleanInvoice());
    expect(control.risk_score).toBeGreaterThanOrEqual(8);
    expect(control.warn).toBeGreaterThanOrEqual(1);
  });
});

describe("requested fields", () => {
  it("guarantees one entry per required field even if the model omits it", async () => {
    const { requested } = await run(cleanInvoice(), ["po_number", "approver signature"]);
    expect(requested.map((r) => r.key)).toEqual(["po_number", "approver signature"]);
    expect(requested.every((r) => r.status === "not_found")).toBe(true);
  });

  it("labels catalog fields canonical and free-text fields custom", async () => {
    const { requested } = await run(
      cleanInvoice(),
      ["po_number", "approver signature"],
      [
        { key: "po_number", status: "found", value: "PO-DE-5521", reason: null },
        { key: "approver signature", status: "not_found", value: null, reason: "Not present." },
      ],
    );
    expect(requested[0]).toMatchObject({ key: "po_number", status: "found", source: "canonical" });
    expect(requested[1]).toMatchObject({ key: "approver signature", source: "custom" });
  });
});
