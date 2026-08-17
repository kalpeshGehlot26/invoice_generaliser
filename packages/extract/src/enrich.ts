import { createHash } from "node:crypto";
import {
  CLEARANCE_REGIMES,
  DECENTRALISED_MANDATED,
  type FieldState,
  type Invoice,
  type VendorMaster,
} from "@ifg/control-engine";
import { FIELD_CATALOG } from "./fields.js";
import type { ExtractedInvoice, RequestedField } from "./schema.js";

export const SCHEMA_VERSION = "1.0";

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Strings that mean "absent" but arrive as text.
 *
 * Observed in practice: GPT returned the four-character string "null" for a
 * clearance_id that was not on the document. The schema accepts it, because
 * "null" is a valid string — but downstream every truthiness check then reads
 * the field as present. For clearance_id specifically that would turn a
 * missing state attestation into an apparently attested invoice, which is the
 * exact silent corruption the control layer exists to catch.
 */
const NULLISH = new Set([
  // Literal nulls rendered as text.
  "null", "nil", "none", "n/a", "na", "n.a.", "-", "--", "–", "—", "undefined", "",
  // Absence described in prose.
  "not specified", "not applicable", "not present", "not available", "not stated",
  "not provided", "not shown", "not given", "no data", "unknown", "absent", "missing",
  // Status words leaking into a value field. Observed: the model returned the
  // literal "not_found" as a clearance_id, which then rendered as though the
  // document carried a clearance identifier reading "not_found".
  "not_found", "not found", "notfound", "unreadable", "no value",
]);

/**
 * A per-line charge is only meaningful if it is a *part* of the row total.
 *
 * Observed: on a table with an empty "Tax" column, the model copied the row's
 * Total into `charge` as well as `line_total`. Line arithmetic then computed
 * qty * unit_price + charge and reported an expectation of 10,632 where the
 * honest figure was 4,800 — corrupting the numbers in a finding that was
 * otherwise a true positive.
 *
 * Deterministic guard: a charge at or above the row total, or one that makes the
 * row reconcile worse than ignoring it, is a misread and becomes null. This
 * never suppresses a real fee, which is by definition smaller than the total.
 */
export function sanitiseCharge(
  charge: number | null | undefined,
  qty: number | null | undefined,
  unitPrice: number | null | undefined,
  lineTotal: number | null | undefined,
): number | null {
  if (charge === null || charge === undefined || charge === 0) return null;
  if (lineTotal === null || lineTotal === undefined) return charge;

  // A fee cannot be the whole row.
  if (Math.abs(charge) >= Math.abs(lineTotal)) return null;

  // If including it moves the row further from its printed total, it is not a fee.
  if (qty !== null && qty !== undefined && unitPrice !== null && unitPrice !== undefined) {
    const base = qty * unitPrice;
    if (Math.abs(base + charge - lineTotal) > Math.abs(base - lineTotal)) return null;
  }

  return charge;
}

/** Row descriptions that mean "this line *is* the shipping cost". */
const SHIPPING_LINE = /\b(shipping|freight|carriage|postage|delivery|courier|transport)\b/i;

/**
 * A shipping cost belongs on the invoice once.
 *
 * Observed on an Indian GST invoice: "Shipping & Packaging 112.00" appeared as a
 * line item *and* was copied into the header `freight`. The total control then
 * computed subtotal + tax - discount + freight = 27,536.90 against a printed
 * 27,425.00 and raised a critical TOTAL_MISMATCH — a BLOCK on an invoice that
 * foots to the last paisa. The document was fine; the extraction counted the
 * carriage twice.
 *
 * Dropped only when a shipping row genuinely exists and matches the header
 * figure, so an invoice that states freight *outside* its line items keeps it.
 */
export function dedupeFreight(
  freight: number | null | undefined,
  lines: { description?: string | null; line_total?: number | null }[],
): { freight: number | null; warning: string | null } {
  if (freight === null || freight === undefined || freight === 0) {
    return { freight: freight ?? null, warning: null };
  }

  const duplicate = lines.some(
    (li) =>
      typeof li.description === "string" &&
      SHIPPING_LINE.test(li.description) &&
      li.line_total !== null &&
      li.line_total !== undefined &&
      Math.abs(li.line_total - freight) < 0.01,
  );

  if (!duplicate) return { freight, warning: null };

  return {
    freight: null,
    warning:
      `Header freight of ${freight.toFixed(2)} matched a shipping line item of the ` +
      "same amount and was dropped from the header to avoid counting the carriage " +
      "twice. It remains in line_items.",
  };
}

/**
 * A row's tax column is tax, not a surcharge.
 *
 * Observed on the same invoice: the model put the row's IGST of 12.00 into
 * `charge`. It happened to make that row reconcile, but for the wrong reason —
 * and on the rows where tax was larger it would have inflated the net amount.
 * Where the value matches the row's own stated tax rate, it is reclassified.
 */
export function splitChargeAndTax(li: {
  qty?: number | null;
  unit_price?: number | null;
  charge?: number | null;
  discount?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
}): { charge: number | null; tax_amount: number | null } {
  const charge = li.charge ?? null;
  const taxAmount = li.tax_amount ?? null;

  if (charge === null || charge === 0) return { charge: null, tax_amount: taxAmount };
  if (li.tax_rate === null || li.tax_rate === undefined || li.tax_rate === 0) {
    return { charge, tax_amount: taxAmount };
  }
  if (li.qty === null || li.qty === undefined || li.unit_price === null || li.unit_price === undefined) {
    return { charge, tax_amount: taxAmount };
  }

  const base = li.qty * li.unit_price - (li.discount ?? 0);
  const impliedTax = (base * li.tax_rate) / 100;
  if (Math.abs(impliedTax - charge) >= 0.01) return { charge, tax_amount: taxAmount };

  // It is the tax. Keep it as tax if that slot is free, otherwise discard the
  // duplicate rather than let it be added to the row twice.
  return { charge: null, tax_amount: taxAmount ?? charge };
}

/** Coerce absent-meaning text to a real null. Also trims. */
export function cleanString(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return NULLISH.has(trimmed.toLowerCase()) ? null : trimmed;
}

/**
 * `supplier_id` is a master-data join key, not something readable off the page.
 * Resolve it by tax ID first (exact identity), then by normalised name.
 *
 * Returning null when nothing matches is the correct outcome, not a failure:
 * the control layer turns it into SUPPLIER_UNKNOWN, which is exactly what a
 * first-time supplier should trigger.
 */
export function resolveSupplierId(
  seller: ExtractedInvoice["seller"],
  master: VendorMaster,
): string | null {
  const vat = norm(seller.vat_id);
  if (vat) {
    for (const [id, rec] of Object.entries(master)) {
      if (norm(rec.vat_id) === vat) return id;
    }
  }

  const name = norm(seller.name);
  if (name) {
    for (const [id, rec] of Object.entries(master)) {
      if (norm(rec.name) === name) return id;
    }
  }

  return null;
}

export function contentHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/** Full digest. `contentHash` stays truncated: the duplicate fingerprint is
 *  built from it and changing it would alter every existing fingerprint. */
export function contentSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * PRD §4 regime block, derived rather than extracted.
 *
 * A clearance regime issues a state-attested identifier; a decentralised
 * mandate does not. The distinction is a property of the corridor, so it is
 * computed here deterministically instead of being asked of the model.
 */
export function deriveRegime(
  buyerCountry: string | null | undefined,
  sellerCountry: string | null | undefined,
  clearanceId: string | null,
): Pick<Invoice, "regime_model" | "clearance_authority" | "attested"> {
  const country = buyerCountry || sellerCountry;
  if (country && country in CLEARANCE_REGIMES) {
    return {
      regime_model: "clearance",
      clearance_authority: CLEARANCE_REGIMES[country] ?? null,
      attested: clearanceId !== null,
    };
  }
  if (country && DECENTRALISED_MANDATED.has(country)) {
    return { regime_model: "decentralised", clearance_authority: null, attested: false };
  }
  return { regime_model: "none", clearance_authority: null, attested: false };
}

function resolvePath(invoice: Invoice, path: string): unknown {
  let node: unknown = invoice;
  for (const part of path.split(".")) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * PRD §4 demands three value states rather than two, so that omission and
 * hallucination stay distinguishable.
 *
 *   present    — a value was read off the document
 *   absent     — the document genuinely has no value (we asked, model confirmed)
 *   unreadable — present on the page but illegible
 *   unknown    — nobody asked, so absent-from-document and absent-from-extraction
 *                cannot be told apart. That needs per-field provenance, which is
 *                the same gap as the missing confidence and grounding data.
 *
 * `unknown` is reported rather than quietly folded into `absent`: guessing here
 * is precisely the collapse the PRD warns against.
 */
export function deriveFieldStates(
  invoice: Invoice,
  requested: RequestedField[],
): Record<string, FieldState> {
  const askedFor = new Map(requested.map((r) => [r.key, r.status]));
  const states: Record<string, FieldState> = {};

  for (const field of FIELD_CATALOG) {
    const value = resolvePath(invoice, field.path);
    const populated = Array.isArray(value)
      ? value.length > 0
      : value !== null && value !== undefined;

    if (populated) {
      states[field.path] = "present";
      continue;
    }
    const status = askedFor.get(field.key);
    states[field.path] =
      status === "unreadable" ? "unreadable" : status === "not_found" ? "absent" : "unknown";
  }
  return states;
}

export interface EnrichContext {
  docId: string;
  bytes: Uint8Array;
  sourceChannel: string;
  master: VendorMaster;
  label?: string;
  /**
   * Collects notes about corrections made here. A deterministic repair must be
   * visible: silently fixing an extraction is how a reviewer loses the ability
   * to tell a clean document from a rescued one.
   */
  warnings?: string[];
}

/**
 * Turn model output into the control engine's Invoice.
 *
 * Everything the model could not know is supplied here. Nothing is invented:
 * `field_confidence` and `grounding` are left empty because a vision model
 * cannot produce calibrated values for them, and a fabricated 0.95 would
 * silently disable the tier gates that exist to catch bad extraction.
 */
export function toInvoice(extracted: ExtractedInvoice, ctx: EnrichContext): Invoice {
  // Computed on cleaned values: a payee of {name: "null"} must not count as named.
  const payeeNamed = Boolean(
    cleanString(extracted.payee?.name) || cleanString(extracted.payee?.iban),
  );

  const lineItems = extracted.line_items.map((li) => {
    const { charge, tax_amount } = splitChargeAndTax({
      qty: li.qty,
      unit_price: li.unit_price,
      charge: li.charge,
      discount: li.discount,
      tax_rate: li.tax_rate,
      tax_amount: li.tax_amount,
    });
    return {
      seq: li.seq,
      description: cleanString(li.description),
      qty: li.qty,
      uom: cleanString(li.uom),
      unit_price: li.unit_price,
      charge: sanitiseCharge(charge, li.qty, li.unit_price, li.line_total),
      discount: li.discount,
      tax_amount,
      line_total: li.line_total,
      tax_rate: li.tax_rate,
      tax_category: cleanString(li.tax_category),
    };
  });

  const freight = dedupeFreight(extracted.freight, lineItems);
  if (freight.warning) ctx.warnings?.push(freight.warning);

  return {
    schema_version: SCHEMA_VERSION,
    doc_id: ctx.docId,
    label: ctx.label ?? "",
    source_channel: ctx.sourceChannel,
    invoice_number: cleanString(extracted.invoice_number),
    clearance_id: cleanString(extracted.clearance_id),
    issue_date: cleanString(extracted.issue_date),
    due_date: cleanString(extracted.due_date),
    payment_terms_days: extracted.payment_terms_days,
    currency: cleanString(extracted.currency),
    seller: {
      supplier_id: resolveSupplierId(extracted.seller, ctx.master),
      name: cleanString(extracted.seller.name),
      country: cleanString(extracted.seller.country),
      vat_id: cleanString(extracted.seller.vat_id),
      iban: cleanString(extracted.seller.iban),
      address: cleanString(extracted.seller.address),
    },
    buyer: {
      name: cleanString(extracted.buyer.name),
      country: cleanString(extracted.buyer.country),
      vat_id: cleanString(extracted.buyer.vat_id),
      address: cleanString(extracted.buyer.address),
    },
    // An absent payee must stay absent. Defaulting it to the seller would
    // permanently silence PAYEE_NOT_SELLER, the duplicate-financing sensor.
    payee: payeeNamed
      ? { name: cleanString(extracted.payee.name), iban: cleanString(extracted.payee.iban) }
      : null,
    po_number: cleanString(extracted.po_number),
    delivery_note_ref: cleanString(extracted.delivery_note_ref),
    tax_breakdown: extracted.tax_breakdown.map((t) => ({
      rate: t.rate,
      category: cleanString(t.category),
      taxable_base: t.taxable_base,
      amount: t.amount,
    })),
    line_items: lineItems,
    subtotal: extracted.subtotal,
    tax_rate: extracted.tax_rate,
    tax_amount: extracted.tax_amount,
    discount: extracted.discount,
    freight: freight.freight,
    rounding_adjustment: extracted.rounding_adjustment,
    total_due: extracted.total_due,
    content_hash: contentHash(ctx.bytes),
    content_sha256: contentSha256(ctx.bytes),
    ...deriveRegime(
      extracted.buyer.country,
      extracted.seller.country,
      cleanString(extracted.clearance_id),
    ),
    field_confidence: {},
    grounding: {},
  };
}
