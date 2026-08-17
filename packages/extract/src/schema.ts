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

/** One line per distinct tax rate shown on the document. */
export const TaxLineSchema = z.object({
  rate: nnum().describe("Percentage, e.g. 19 for 19%"),
  category: nstr().describe(
    "EN 16931 category code if shown: S standard, Z zero-rated, E exempt, " +
      "AE reverse charge, K intra-community, G export, O outside scope",
  ),
  taxable_base: nnum().describe("Amount this rate was applied to"),
  amount: nnum().describe("Tax charged at this rate"),
});

export const LineItemSchema = z.object({
  seq: nnum().describe("Row number as printed, if the table numbers its rows"),
  description: nstr(),
  qty: nnum(),
  uom: nstr(),
  unit_price: nnum(),
  charge: nnum().describe(
    "Per-line fee, surcharge, handling or freight shown as its own column on " +
      "this row, separate from unit price. Null when the row has no such column.",
  ),
  discount: nnum().describe(
    "Discount on THIS row as an amount, not a percentage. If the row prints " +
      "'-Discount 5%', compute 5% of qty x unit_price and give the amount. " +
      "Null when the row shows no discount.",
  ),
  tax_amount: nnum().describe(
    "Tax charged on THIS row, when the row has its own tax column (GST, IGST, " +
      "CESS, sales tax). Add the columns together if there are several. Null " +
      "when tax appears only in the footer.",
  ),
  line_total: nnum().describe(
    "The row's total exactly as printed. Do not adjust it, and do not compute " +
      "it — some documents print this net of tax, others print it including " +
      "tax, and both are recorded as printed.",
  ),
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
  delivery_note_ref: nstr().describe(
    "The reference labelled 'Delivery Note', 'Despatch Note', 'DN' or 'GRN'. " +
      "Transport references printed beside it are NOT this: a Waybill No, LR No " +
      "(lorry receipt), AWB, Bill of Lading or Vehicle No identifies the " +
      "carriage, not the goods-received document a three-way match needs. Null " +
      "if no delivery note reference is printed.",
  ),
  line_items: z.array(LineItemSchema),
  tax_breakdown: z
    .array(TaxLineSchema)
    .describe(
      "One entry per distinct tax rate shown. On an Indian invoice CGST and " +
        "SGST are separate entries. Empty array when the document shows no " +
        "per-rate breakdown.",
    ),
  subtotal: nnum(),
  tax_rate: nnum().describe("Single headline tax rate as a percentage"),
  tax_amount: nnum(),
  discount: nnum(),
  freight: nnum().describe(
    "Shipping or carriage stated as its OWN header line, separate from the " +
      "line-item table. Null if shipping appears as a row in the table — it " +
      "must be counted once, not in both places.",
  ),
  rounding_adjustment: nnum().describe(
    "The document's own rounding line ('Rounded off 0.10'), signed as printed: " +
      "negative if it reduces the total. Null if absent.",
  ),
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

export type TaxLine = z.infer<typeof TaxLineSchema>;
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
export type RequestedField = z.infer<typeof RequestedFieldSchema> & {
  source: "canonical" | "custom";
};
export type ModelOutput = z.infer<typeof ModelOutputSchema>;
