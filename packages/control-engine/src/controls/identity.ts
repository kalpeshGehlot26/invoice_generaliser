import { VAT_ID_PATTERN } from "../reference.js";
import type { Finding, Invoice } from "../types.js";
import { ibanValid } from "../util.js";

export function vIdentifiers(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const seller = inv.seller ?? {};
  const country = seller.country;
  const vat = seller.vat_id;

  const pat = country ? VAT_ID_PATTERN[country] : undefined;
  if (pat && vat && !pat.test(vat.replace(/ /g, ""))) {
    out.push({
      code: "VAT_ID_MALFORMED",
      severity: "high",
      message:
        `seller VAT/tax ID '${vat}' does not match the ${country} ` +
        "format. Registry lookup (VIES/GSTIN) required.",
      fields: ["seller.vat_id"],
      control: "identity",
    });
  }

  const payeeIban = inv.payee?.iban || seller.iban;
  // US and AU do not use IBAN; their account strings would always fail mod-97.
  if (payeeIban && !(payeeIban.startsWith("US") || payeeIban.startsWith("AU"))) {
    if (!ibanValid(payeeIban)) {
      out.push({
        code: "IBAN_CHECKSUM_FAIL",
        severity: "critical",
        message:
          `IBAN '${payeeIban}' fails the mod-97 checksum. ` +
          "Either an OCR error or a tampered remit-to line. " +
          "Do not fund.",
        fields: ["payee.iban"],
        control: "payment_integrity",
      });
    }
  }

  return out;
}

/**
 * EN 16931 models Payee separately from Seller. In factoring that separation is
 * the entire point: a payee that is not the seller means the receivable already
 * carries an assignment.
 */
export function vPayeeAssignment(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const seller = inv.seller ?? {};
  const payee = inv.payee;

  if (!payee || Object.keys(payee).length === 0) return out;

  if (
    payee.name &&
    payee.name.trim().toLowerCase() !== (seller.name ?? "").trim().toLowerCase()
  ) {
    out.push({
      code: "PAYEE_NOT_SELLER",
      severity: "critical",
      message:
        `Payee '${payee.name}' differs from Seller ` +
        `'${seller.name}'. This invoice already carries an ` +
        "assignment to a third party. Funding it risks financing a " +
        "receivable that has been sold to another funder.",
      fields: ["payee.name"],
      control: "duplicate_financing",
    });
  }

  return out;
}
