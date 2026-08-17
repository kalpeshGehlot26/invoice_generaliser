/**
 * What the controls actually look at, and how to say it briefly.
 *
 * This exists so a per-field score can be shown for EVERY field rather than
 * only for fields that happen to have failed. That needs three states, not two:
 *
 *   points > 0   a control objected — show the points and why
 *   0, covered    a control examined this field and was satisfied
 *   0, uncovered  no control examines this field at all
 *
 * The third state is the one worth surfacing. Collapsing it into "0" would
 * report `seller.address` as verified when nothing has ever checked it, which is
 * the same quiet false assurance as a confident extraction from an unreadable
 * page. A reviewer needs to know which clean fields are clean because they were
 * checked, and which are clean because nobody looked.
 *
 * Kept beside the controls deliberately, and held to it by coverage.test.ts,
 * which re-derives this set from the control sources and fails if a new control
 * names a field that is missing here.
 */
export const COVERED_FIELDS: ReadonlySet<string> = new Set([
  // arithmetic
  "subtotal",
  "total_due",
  // tax
  "tax_rate",
  "tax_amount",
  "tax_breakdown",
  // currency
  "currency",
  // dates
  "issue_date",
  "due_date",
  // identity + payment integrity
  "seller.vat_id",
  "buyer.vat_id",
  "seller.iban",
  "payee.name",
  "payee.iban",
  // master data + matching
  "seller.name",
  "po_number",
  // regime + duplicates
  "clearance_id",
  "invoice_number",
]);

/**
 * Line rows and tax bands are addressed with an index, so they cannot be listed
 * as literals. `line[3].line_total` and `tax_breakdown[2].amount` are covered.
 */
export function isCovered(path: string): boolean {
  if (COVERED_FIELDS.has(path)) return true;
  if (/^line\[\d+\]/.test(path)) return true;
  if (/^tax_breakdown\[\d+\]/.test(path)) return true;
  return false;
}

/**
 * A few words naming what a code objected to — for a badge, not a report. The
 * finding's own `message` stays the authority; this is the label beside a number.
 */
export const REASON: Record<string, string> = {
  // arithmetic
  LINE_MATH: "row does not foot",
  LINE_MISSING_TOTAL: "no row total",
  SUBTOTAL_MISMATCH: "rows do not sum to subtotal",
  TOTAL_MISMATCH: "total does not foot",
  // tax
  TAX_RATE_INVALID: "not a valid rate for the country",
  TAX_AMOUNT_MISMATCH: "tax does not match the rate",
  TAX_BREAKDOWN_MISMATCH: "breakdown does not sum to tax",
  TAX_BAND_MISMATCH: "band rate and amount disagree",
  TAX_COUNTRY_UNKNOWN: "no rate table for this country",
  TAX_NO_NATIONAL_RATE: "no national rate to check against",
  // currency
  CURRENCY_COUNTRY_MISMATCH: "currency unusual for the seller's country",
  // dates
  DUE_BEFORE_ISSUE: "due before issue",
  TERMS_MISMATCH: "terms disagree with the dates",
  FUTURE_DATED: "dated in the future",
  // identity and payment integrity
  VAT_ID_MALFORMED: "tax ID not in the country's format",
  VAT_ID_CHANGED: "tax ID differs from the vendor master",
  IBAN_CHECKSUM_FAIL: "IBAN fails its checksum",
  REMIT_TO_CHANGED: "bank details differ from the vendor master",
  PAYEE_NOT_SELLER: "paid to a party other than the seller",
  // master data and matching
  SUPPLIER_UNKNOWN: "supplier not in the vendor master",
  NO_PO: "no purchase order quoted",
  PO_NOT_FOUND: "PO not in the buyer's feed",
  PO_BUYER_MISMATCH: "PO belongs to a different buyer",
  PO_OVERBILL: "billed above the PO's open amount",
  // duplicates
  DUPLICATE_EXACT: "already financed",
  DUPLICATE_NORMALISED: "matches a financed invoice",
  DUPLICATE_CONTENT_HASH: "identical document already financed",
  DUPLICATE_FUZZY: "closely resembles a financed invoice",
  // regime and structure
  CLEARANCE_MISSING: "no state clearance ID",
  CLEARANCE_ATTESTED: "state-attested",
  TRANSPORT_ONLY: "mandate proves transport, not attestation",
  STRUCTURED_INPUT: "structured input",
  HYBRID_DIVERGENCE: "embedded XML disagrees with the page",
  FACTURX_PROFILE_INSUFFICIENT: "Factur-X profile too thin",
  // audit
  LOW_CONFIDENCE: "read with low confidence",
  NO_GROUNDING: "not traceable to a page region",
  EXTRACTION_UNVERIFIED: "no confidence or grounding data",
};

export function reasonFor(code: string): string {
  return REASON[code] ?? code.toLowerCase().replace(/_/g, " ");
}
