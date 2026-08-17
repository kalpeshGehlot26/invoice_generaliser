import { z } from "zod";

/**
 * What the model is asked to return.
 *
 * This deliberately mirrors the control engine's `Invoice` shape rather than
 * inventing a second canonical schema — there is one schema in this system and
 * the engine owns it. Fields the model cannot know (content_hash,
 * source_channel, supplier_id, field_confidence, grounding) are filled in by
 * `enrich.ts` or left absent; they are not asked for here.
 *
 * Every field is nullable. OpenAI strict mode requires every property to appear
 * in `required`, so "absent" is expressed as an explicit null — which is also
 * exactly the semantics we want: null means "read the document, not present".
 */

const nstr = () => z.string().nullable();
const nnum = () => z.number().nullable();

/** ISO date, or null when the day/month order cannot be determined. */
const ndate = () =>
  z
    .string()
    .nullable()
    .describe(
      "Date as YYYY-MM-DD. If the printed form is numeric and the day/month " +
        "order cannot be determined from the document, return null rather than guessing.",
    );

export const SellerSchema = z.object({
  name: nstr(),
  country: nstr().describe("ISO-3166 alpha-2, e.g. DE, GB, IN"),
  vat_id: nstr().describe("VAT number, GSTIN, ABN, EIN — whichever this document carries"),
  iban: nstr().describe("Bank account exactly as printed"),
  address: nstr(),
});

export const BuyerSchema = z.object({
  name: nstr(),
  country: nstr().describe("ISO-3166 alpha-2"),
  vat_id: nstr(),
  address: nstr(),
});

/**
 * EN 16931 models Payee separately from Seller. In invoice finance that
 * separation is the whole point: a payee that differs from the seller means the
 * receivable already carries an assignment to a third party.
 */
export const PayeeSchema = z.object({
  name: nstr().describe("Only if the document names a payee distinct from the seller"),
  iban: nstr(),
});

export const LineItemSchema = z.object({
  description: nstr(),
  qty: nnum(),
  uom: nstr(),
  unit_price: nnum(),
  line_total: nnum(),
  tax_rate: nnum().describe("Percentage, e.g. 19 for 19%"),
  tax_category: nstr().describe("EN 16931 code if shown: S, Z, E, AE, K, G, O"),
});

export const ExtractedInvoiceSchema = z.object({
  invoice_number: nstr(),
  clearance_id: nstr().describe(
    "State-attested identifier if present: IRN (India), KSeF (Poland), " +
      "SdI (Italy), CFDI/UUID (Mexico), NF-e (Brazil), ZATCA (Saudi Arabia)",
  ),
  issue_date: ndate(),
  due_date: ndate(),
  payment_terms_days: nnum().describe("Only if stated, e.g. 'Net 30' gives 30"),
  currency: nstr().describe("ISO-4217 code"),
  seller: SellerSchema,
  buyer: BuyerSchema,
  payee: PayeeSchema,
  po_number: nstr(),
  line_items: z.array(LineItemSchema),
  subtotal: nnum(),
  tax_rate: nnum().describe("Single headline tax rate as a percentage"),
  tax_amount: nnum(),
  discount: nnum(),
  freight: nnum(),
  total_due: nnum(),
});

export const RequestedFieldSchema = z.object({
  key: z.string(),
  status: z.enum(["found", "not_found", "unreadable"]),
  value: nstr().describe("Stringified value; null unless status is 'found'"),
  reason: nstr().describe("Why absent or unreadable; null when found"),
});

export const ModelOutputSchema = z.object({
  invoice: ExtractedInvoiceSchema,
  requested: z.array(RequestedFieldSchema),
});

export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
export type RequestedField = z.infer<typeof RequestedFieldSchema> & {
  source: "canonical" | "custom";
};
export type ModelOutput = z.infer<typeof ModelOutputSchema>;
