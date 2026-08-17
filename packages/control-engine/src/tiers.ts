/** Tier 1: exact match, no tolerance. A wrong value here can misdirect money. */
export const TIER1 = new Set([
  "invoice_number", "seller_vat_id", "buyer_vat_id", "payee_iban",
  "currency", "po_number", "clearance_id",
]);

/** Tier 2: numeric, 0.1% tolerance, must survive arithmetic validation. */
export const TIER2 = new Set([
  "subtotal", "tax_amount", "total_due", "discount", "freight",
  "line_total", "unit_price", "qty",
]);

/** Tier 3: fuzzy / semantic match acceptable. */
export const TIER3 = new Set([
  "seller_name", "buyer_name", "payee_name", "description",
  "address", "payment_terms",
]);

export const TIER_THRESHOLD: Record<number, number> = { 1: 0.95, 2: 0.9, 3: 0.75 };

/**
 * Tier of a field name. Dotted paths resolve on their last segment, so
 * `line[1].line_total` is tier 2 via `line_total`.
 */
export function tierOf(fieldName: string): number {
  const parts = fieldName.split(".");
  const base = parts[parts.length - 1] ?? fieldName;
  if (TIER1.has(base)) return 1;
  if (TIER2.has(base)) return 2;
  return 3;
}
