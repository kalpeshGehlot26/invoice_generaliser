import { createHash } from "node:crypto";
import type { Invoice, VendorMaster } from "@ifg/control-engine";
import type { ExtractedInvoice } from "./schema.js";

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
  "null", "nil", "none", "n/a", "na", "n.a.", "-", "--", "–", "—",
  "not specified", "not applicable", "not present", "unknown", "undefined", "",
]);

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

export interface EnrichContext {
  docId: string;
  bytes: Uint8Array;
  sourceChannel: string;
  master: VendorMaster;
  label?: string;
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

  return {
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
    line_items: extracted.line_items.map((li) => ({
      description: cleanString(li.description),
      qty: li.qty,
      uom: cleanString(li.uom),
      unit_price: li.unit_price,
      charge: li.charge,
      line_total: li.line_total,
      tax_rate: li.tax_rate,
      tax_category: cleanString(li.tax_category),
    })),
    subtotal: extracted.subtotal,
    tax_rate: extracted.tax_rate,
    tax_amount: extracted.tax_amount,
    discount: extracted.discount,
    freight: extracted.freight,
    total_due: extracted.total_due,
    content_hash: contentHash(ctx.bytes),
    field_confidence: {},
    grounding: {},
  };
}
