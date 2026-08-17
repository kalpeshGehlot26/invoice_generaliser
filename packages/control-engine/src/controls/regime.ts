import { CLEARANCE_REGIMES, DECENTRALISED_MANDATED } from "../reference.js";
import type { Finding, Invoice } from "../types.js";

/** Trust weight of the source channel. */
export function vRegime(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const country = inv.buyer?.country || inv.seller?.country;
  const ch = inv.source_channel;
  const cid = inv.clearance_id;

  if (country && country in CLEARANCE_REGIMES) {
    if (cid) {
      out.push({
        code: "CLEARANCE_ATTESTED",
        severity: "info",
        message:
          `${CLEARANCE_REGIMES[country]} identifier present ` +
          `(${cid}). The tax authority independently attests this ` +
          "invoice exists and was issued to this buyer. Strongest " +
          "verification artefact available, no debtor call needed.",
        fields: ["clearance_id"],
        control: "regime",
      });
    } else {
      out.push({
        code: "CLEARANCE_MISSING",
        severity: "high",
        message:
          `${country} is a clearance regime ` +
          `(${CLEARANCE_REGIMES[country]}) but no attested ` +
          "identifier was found. A genuine invoice in this " +
          "corridor should have one.",
        fields: ["clearance_id"],
        control: "regime",
      });
    }
  } else if (
    country &&
    DECENTRALISED_MANDATED.has(country) &&
    (ch === "peppol" || ch === "xml")
  ) {
    out.push({
      code: "TRANSPORT_ONLY",
      severity: "info",
      message:
        `${country} is a decentralised regime: the Peppol/EN 16931 ` +
        "payload proves transport, not state attestation. Do not " +
        "treat structured as verified.",
      fields: [],
      control: "regime",
    });
  }

  if (ch === "xml" || ch === "peppol" || ch === "factur-x_xml") {
    out.push({
      code: "STRUCTURED_INPUT",
      severity: "info",
      message:
        "Structured payload: extraction bypassed entirely, zero " +
        "OCR cost, zero extraction risk.",
      fields: [],
      control: "regime",
    });
  }

  return out;
}

/**
 * Factur-X / ZUGFeRD: the XML is the operational source, the PDF layer is a
 * sensor. A divergence is a fraud exception, never an automatic reconciliation.
 */
export function vHybridDiff(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const diff = inv.hybrid_diff;

  // Python `if not diff: return out` — an empty dict is falsy, so a document
  // with `hybrid_diff: {}` exits here and never reaches the profile check below.
  if (!diff || Object.keys(diff).length === 0) return out;

  const profile = inv.facturx_profile;
  if (profile && ["MINIMUM", "BASIC WL", "BASIC"].includes(profile.toUpperCase())) {
    out.push({
      code: "FACTURX_PROFILE_INSUFFICIENT",
      severity: "warn",
      message:
        `Factur-X profile '${profile}' is not fully EN 16931 ` +
        "compliant: required business terms may be absent.",
      fields: [],
      control: "regime",
    });
  }

  for (const [f, pair] of Object.entries(diff)) {
    const [xmlV, pdfV] = pair;
    const sev =
      f === "payee.iban" || f === "total_due" || f === "buyer.vat_id" ? "critical" : "high";
    out.push({
      code: "HYBRID_DIVERGENCE",
      severity: sev,
      message:
        `Hybrid PDF disagrees with its embedded XML on '${f}': ` +
        `XML says '${xmlV}', the human-readable page says ` +
        `'${pdfV}'. Treat as a fraud exception, never silently ` +
        "reconcile.",
      fields: [f],
      control: "hybrid_diff",
    });
  }

  return out;
}
