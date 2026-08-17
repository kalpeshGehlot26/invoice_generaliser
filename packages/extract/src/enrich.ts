import { createHash } from "node:crypto";
import type { Invoice, VendorMaster } from "@ifg/control-engine";
import type { ExtractedInvoice } from "./schema.js";

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

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
  const payeeNamed = Boolean(extracted.payee?.name || extracted.payee?.iban);

  return {
    doc_id: ctx.docId,
    label: ctx.label ?? "",
    source_channel: ctx.sourceChannel,
    invoice_number: extracted.invoice_number,
    clearance_id: extracted.clearance_id,
    issue_date: extracted.issue_date,
    due_date: extracted.due_date,
    payment_terms_days: extracted.payment_terms_days,
    currency: extracted.currency,
    seller: {
      supplier_id: resolveSupplierId(extracted.seller, ctx.master),
      name: extracted.seller.name,
      country: extracted.seller.country,
      vat_id: extracted.seller.vat_id,
      iban: extracted.seller.iban,
      address: extracted.seller.address,
    },
    buyer: {
      name: extracted.buyer.name,
      country: extracted.buyer.country,
      vat_id: extracted.buyer.vat_id,
      address: extracted.buyer.address,
    },
    // An absent payee must stay absent. Defaulting it to the seller would
    // permanently silence PAYEE_NOT_SELLER, the duplicate-financing sensor.
    payee: payeeNamed ? { name: extracted.payee.name, iban: extracted.payee.iban } : null,
    po_number: extracted.po_number,
    line_items: extracted.line_items.map((li) => ({
      description: li.description,
      qty: li.qty,
      uom: li.uom,
      unit_price: li.unit_price,
      line_total: li.line_total,
      tax_rate: li.tax_rate,
      tax_category: li.tax_category,
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
