import { createHash } from "node:crypto";
import type { Finding, Invoice } from "../types.js";
import { daysBetween, normaliseInvoiceNumber, parseDate, relClose } from "../util.js";

export interface Fingerprints {
  exact: string;
  normalised: string;
  amount_date: string;
  amount_po: string;
  content: string;
}

export function fingerprints(inv: Invoice): Fingerprints {
  const sid = inv.seller?.supplier_id || "";
  const num = inv.invoice_number || "";
  const tot = (inv.total_due || 0).toFixed(2);
  const cur = inv.currency || "";
  const d = parseDate(inv.issue_date);

  return {
    exact: `${sid}|${num}`,
    normalised: `${sid}|${normaliseInvoiceNumber(num)}`,
    amount_date: `${sid}|${tot}|${cur}|${d ? d.toISOString().slice(0, 10) : ""}`,
    amount_po: `${sid}|${tot}|${inv.po_number || ""}`,
    content:
      inv.content_hash ||
      createHash("sha256").update(`${sid}${num}${tot}`).digest("hex").slice(0, 16),
  };
}

export function vDuplicates(inv: Invoice, ledger: Invoice[]): Finding[] {
  const out: Finding[] = [];
  const fp = fingerprints(inv);
  const dNew = parseDate(inv.issue_date);

  for (const prior of ledger) {
    const pfp = fingerprints(prior);

    if (fp.exact === pfp.exact) {
      out.push({
        code: "DUPLICATE_EXACT",
        severity: "critical",
        message:
          `Exact duplicate of ${prior.doc_id} ` +
          "(same supplier + invoice number), already funded.",
        fields: ["invoice_number"],
        control: "duplicate",
      });
      continue;
    }

    if (fp.normalised === pfp.normalised) {
      out.push({
        code: "DUPLICATE_NORMALISED",
        severity: "critical",
        message:
          `Invoice number '${inv.invoice_number}' normalises ` +
          `to the same key as ${prior.doc_id} ` +
          `('${prior.invoice_number}'). OCR character ` +
          "confusion, not a different invoice.",
        fields: ["invoice_number"],
        control: "duplicate",
      });
      continue;
    }

    if (fp.content === pfp.content) {
      out.push({
        code: "DUPLICATE_CONTENT_HASH",
        severity: "critical",
        message:
          `Byte-level content hash matches ${prior.doc_id}: the ` +
          "same file re-submitted through a different channel.",
        fields: [],
        control: "duplicate",
      });
      continue;
    }

    const dOld = parseDate(prior.issue_date);
    const sameAmt = relClose(inv.total_due, prior.total_due, 0.005);
    const nearDate = dNew !== null && dOld !== null && Math.abs(daysBetween(dNew, dOld)) <= 3;

    if (sameAmt && nearDate && inv.currency === prior.currency) {
      out.push({
        code: "DUPLICATE_FUZZY",
        severity: "high",
        message:
          `Same supplier, same amount and currency, issue dates ` +
          `${Math.abs(daysBetween(dNew as Date, dOld as Date))} day(s) apart from ` +
          `${prior.doc_id}. Probable re-presentation.`,
        fields: ["total_due", "issue_date"],
        control: "duplicate",
      });
    }
  }

  return out;
}
