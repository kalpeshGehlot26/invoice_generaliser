export interface FieldDescriptor {
  /** Stable identifier used by the UI checkboxes and by callers. */
  key: string;
  label: string;
  group: string;
  description: string;
}

/**
 * The fields a caller can tick to mark as required. Ticking does not restrict
 * extraction — the full canonical structure always comes back. It guarantees
 * an explicit found / not_found / unreadable answer for that field.
 */
export const FIELD_CATALOG: FieldDescriptor[] = [
  { key: "invoice_number", label: "Invoice number", group: "Document", description: "The vendor's invoice identifier" },
  { key: "po_number", label: "PO number", group: "Document", description: "Purchase order reference" },
  { key: "clearance_id", label: "Clearance ID", group: "Document", description: "State-attested identifier: IRN, KSeF, SdI, CFDI, NF-e" },
  { key: "issue_date", label: "Issue date", group: "Document", description: "Date the invoice was issued" },
  { key: "due_date", label: "Due date", group: "Document", description: "Date payment falls due" },
  { key: "payment_terms_days", label: "Payment terms (days)", group: "Document", description: "Net terms in days, if stated" },

  { key: "seller_name", label: "Seller name", group: "Seller", description: "Party issuing the invoice" },
  { key: "seller_country", label: "Seller country", group: "Seller", description: "Country of the seller" },
  { key: "seller_vat_id", label: "Seller tax ID", group: "Seller", description: "VAT number, GSTIN, ABN or equivalent" },
  { key: "seller_iban", label: "Seller bank account", group: "Seller", description: "IBAN or account details for the seller" },
  { key: "seller_address", label: "Seller address", group: "Seller", description: "Full postal address" },

  { key: "buyer_name", label: "Buyer name", group: "Buyer", description: "Party being billed" },
  { key: "buyer_country", label: "Buyer country", group: "Buyer", description: "Country of the buyer" },
  { key: "buyer_vat_id", label: "Buyer tax ID", group: "Buyer", description: "VAT number, GSTIN or equivalent" },
  { key: "buyer_address", label: "Buyer address", group: "Buyer", description: "Full postal address" },

  { key: "payee_name", label: "Payee name", group: "Payee", description: "Named payee, when different from the seller" },
  { key: "payee_iban", label: "Payee bank account", group: "Payee", description: "Remit-to account, when different from the seller's" },

  { key: "currency", label: "Currency", group: "Amounts", description: "ISO-4217 currency code" },
  { key: "subtotal", label: "Subtotal", group: "Amounts", description: "Total before tax" },
  { key: "tax_rate", label: "Tax rate", group: "Amounts", description: "Headline tax rate as a percentage" },
  { key: "tax_amount", label: "Tax amount", group: "Amounts", description: "Total tax charged" },
  { key: "discount", label: "Discount", group: "Amounts", description: "Total discount applied" },
  { key: "freight", label: "Freight / shipping", group: "Amounts", description: "Delivery or freight charge" },
  { key: "total_due", label: "Total due", group: "Amounts", description: "Grand total payable" },

  { key: "line_items", label: "Line items", group: "Line items", description: "Itemised goods or services with quantities and prices" },
];

const BY_KEY = new Map(FIELD_CATALOG.map((f) => [f.key, f]));

export function getFieldByKey(key: string): FieldDescriptor | undefined {
  return BY_KEY.get(key);
}

export function fieldGroups(): Array<{ group: string; fields: FieldDescriptor[] }> {
  const order: string[] = [];
  const byGroup = new Map<string, FieldDescriptor[]>();
  for (const f of FIELD_CATALOG) {
    if (!byGroup.has(f.group)) {
      byGroup.set(f.group, []);
      order.push(f.group);
    }
    byGroup.get(f.group)!.push(f);
  }
  return order.map((group) => ({ group, fields: byGroup.get(group)! }));
}
