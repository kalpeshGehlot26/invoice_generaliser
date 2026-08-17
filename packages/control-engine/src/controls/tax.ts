import { CURRENCY_BY_COUNTRY, VALID_RATES } from "../reference.js";
import type { Finding, Invoice } from "../types.js";
import { fmtMoney, fmtRateList, pyFloat, pyRound, relClose } from "../util.js";

export function vTax(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const country = inv.seller?.country;
  const rate = inv.tax_rate;

  // Three states, matching the Python: country absent from the table entirely,
  // country present with a null rate set (US), or country present with rates.
  const known =
    typeof country === "string" && Object.prototype.hasOwnProperty.call(VALID_RATES, country);
  const valid = known ? VALID_RATES[country] : undefined;

  if (!known) {
    out.push({
      code: "TAX_COUNTRY_UNKNOWN",
      severity: "warn",
      message: `No VAT/GST rate table for country '${country ?? "None"}'.`,
      fields: ["tax_rate"],
      control: "tax",
    });
  } else if (valid === null) {
    out.push({
      code: "TAX_NO_NATIONAL_RATE",
      severity: "info",
      message:
        "US sales tax is state/county level: rate check skipped, " +
        "arithmetic check still applies.",
      fields: ["tax_rate"],
      control: "tax",
    });
  } else if (rate !== null && rate !== undefined && valid !== undefined && !valid.includes(rate)) {
    out.push({
      code: "TAX_RATE_INVALID",
      severity: "high",
      message: `${pyFloat(rate)}% is not a valid ${country} rate. Valid: ${fmtRateList(valid)}.`,
      fields: ["tax_rate"],
      control: "tax",
    });
  }

  const breakdown = inv.tax_breakdown ?? [];

  // A multi-rate invoice has no single "the" rate. Where the document prints a
  // per-rate breakdown, that is the authoritative statement of the tax and it is
  // checked directly; the headline-rate check below would otherwise report a
  // mismatch on every mixed-rate invoice, which in India or the EU is routine.
  if (breakdown.length > 0) {
    const summed = pyRound(
      breakdown.reduce((acc, t) => acc + (t.amount || 0), 0),
      2,
    );

    if (
      inv.tax_amount !== null &&
      inv.tax_amount !== undefined &&
      !relClose(summed, inv.tax_amount, 0.01)
    ) {
      out.push({
        code: "TAX_BREAKDOWN_MISMATCH",
        severity: "high",
        message:
          `Per-rate breakdown sums to ${fmtMoney(summed)} but tax_amount reads ` +
          `${fmtMoney(inv.tax_amount)}. Difference ` +
          `${fmtMoney(Math.abs(summed - inv.tax_amount))}.`,
        fields: ["tax_amount", "tax_breakdown"],
        control: "tax",
      });
    }

    // Each band must also be internally consistent: a taxable base and a rate
    // that do not produce the stated amount is how an under-declared band hides
    // inside a total that foots.
    breakdown.forEach((t, idx) => {
      if (
        t.rate === null ||
        t.rate === undefined ||
        t.taxable_base === null ||
        t.taxable_base === undefined ||
        t.amount === null ||
        t.amount === undefined
      ) {
        return;
      }
      const implied = pyRound((t.taxable_base * t.rate) / 100.0, 2);
      if (!relClose(implied, t.amount, 0.01)) {
        out.push({
          code: "TAX_BAND_MISMATCH",
          severity: "high",
          message:
            `Tax band ${idx + 1}: ${pyFloat(t.rate)}% of ` +
            `${fmtMoney(t.taxable_base)} = ${fmtMoney(implied)} but the band ` +
            `states ${fmtMoney(t.amount)}.`,
          fields: [`tax_breakdown[${idx + 1}].amount`],
          control: "tax",
        });
      }
    });

    return out;
  }

  const sub = inv.subtotal;
  // Python `if rate and sub:` — a 0.0 rate is falsy, so zero-rated invoices
  // skip this check entirely. Deliberate: ported as-is.
  if (rate && sub) {
    const implied = pyRound((sub * rate) / 100.0, 2);
    if (
      inv.tax_amount !== null &&
      inv.tax_amount !== undefined &&
      !relClose(implied, inv.tax_amount, 0.01)
    ) {
      out.push({
        code: "TAX_AMOUNT_MISMATCH",
        severity: "high",
        message:
          `${pyFloat(rate)}% of ${fmtMoney(sub)} = ${fmtMoney(implied)} but ` +
          `tax_amount reads ${fmtMoney(inv.tax_amount)}.`,
        fields: ["tax_amount"],
        control: "tax",
      });
    }
  }

  return out;
}

export function vCurrency(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const cur = inv.currency;
  const country = inv.seller?.country;
  const expect = country ? CURRENCY_BY_COUNTRY[country] : undefined;

  if (expect && cur && cur !== expect) {
    out.push({
      code: "CURRENCY_COUNTRY_MISMATCH",
      severity: "warn",
      message:
        `Seller is in ${country} but invoice currency is ${cur} ` +
        `(expected ${expect}). Legitimate for export, but the ` +
        "FX and the debtor's payment currency must agree.",
      fields: ["currency"],
      control: "currency",
    });
  }

  return out;
}
