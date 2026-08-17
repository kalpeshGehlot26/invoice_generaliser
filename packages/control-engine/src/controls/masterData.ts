import type { BuyerPos, Finding, Invoice, VendorMaster } from "../types.js";
import { fmtMoney } from "../util.js";

export function vBankChange(inv: Invoice, master: VendorMaster): Finding[] {
  const out: Finding[] = [];
  const sid = inv.seller?.supplier_id;
  const rec = sid ? master[sid] : undefined;

  if (!rec) {
    out.push({
      code: "SUPPLIER_UNKNOWN",
      severity: "warn",
      message:
        `Supplier id '${sid ?? "None"}' is not in the vendor master. ` +
        "First-time supplier: full KYB required before funding.",
      fields: ["seller.name"],
      control: "master_data",
    });
    return out;
  }

  const seen = inv.payee?.iban || inv.seller?.iban;
  const known = rec.iban;
  if (seen && known && seen.replace(/\s/g, "") !== known.replace(/\s/g, "")) {
    out.push({
      code: "REMIT_TO_CHANGED",
      severity: "critical",
      message:
        `Remit-to account changed from ${known} (on file) to ` +
        `${seen} (on this invoice). This is the exact shape of an ` +
        "invoice-redirection attack. Out-of-band callback to a " +
        "known contact required before funding.",
      fields: ["payee.iban"],
      control: "payment_integrity",
    });
  }

  if (rec.vat_id && inv.seller?.vat_id && rec.vat_id !== inv.seller.vat_id) {
    out.push({
      code: "VAT_ID_CHANGED",
      severity: "high",
      message: `Seller VAT ID differs from master (${rec.vat_id}).`,
      fields: ["seller.vat_id"],
      control: "master_data",
    });
  }

  return out;
}

/** Two-way match against the buyer PO. Three-way needs the GRN. */
export function vPoMatch(inv: Invoice, pos: BuyerPos): Finding[] {
  const out: Finding[] = [];
  const po = inv.po_number;

  if (!po) {
    out.push({
      code: "NO_PO",
      severity: "warn",
      message:
        "No PO reference. Two-way match impossible: eligibility " +
        "rests on debtor confirmation alone.",
      fields: ["po_number"],
      control: "matching",
    });
    return out;
  }

  const rec = pos[po];
  if (!rec) {
    out.push({
      code: "PO_NOT_FOUND",
      severity: "high",
      message: `PO '${po}' not found in the buyer PO feed.`,
      fields: ["po_number"],
      control: "matching",
    });
    return out;
  }

  if (rec.buyer_vat_id && inv.buyer?.vat_id && rec.buyer_vat_id !== inv.buyer.vat_id) {
    out.push({
      code: "PO_BUYER_MISMATCH",
      severity: "critical",
      message: "PO belongs to a different buyer entity than the invoice names.",
      fields: ["buyer.vat_id"],
      control: "matching",
    });
  }

  const openAmt = rec.open_amount;
  if (openAmt !== null && openAmt !== undefined && (inv.total_due || 0) > openAmt * 1.02) {
    out.push({
      code: "PO_OVERBILL",
      severity: "high",
      message:
        `Invoice ${fmtMoney(inv.total_due as number)} exceeds PO open balance ` +
        `${fmtMoney(openAmt)}. Value-inflation typology.`,
      fields: ["total_due"],
      control: "matching",
    });
  }

  return out;
}
