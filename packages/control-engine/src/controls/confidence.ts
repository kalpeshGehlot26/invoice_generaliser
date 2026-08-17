import { TIER_THRESHOLD, tierOf } from "../tiers.js";
import type { Finding, Invoice, Severity } from "../types.js";

const SEVERITY_BY_TIER: Record<number, Severity> = { 1: "high", 2: "warn", 3: "info" };

export function vConfidence(inv: Invoice): Finding[] {
  const out: Finding[] = [];
  const conf = inv.field_confidence ?? {};

  // Ascending by confidence: the worst fields lead the review queue.
  // Sort must be stable so equal confidences keep insertion order.
  const entries = Object.entries(conf).sort((a, b) => a[1] - b[1]);

  for (const [fname, c] of entries) {
    const t = tierOf(fname);
    const threshold = TIER_THRESHOLD[t] as number;
    if (c < threshold) {
      out.push({
        code: "LOW_CONFIDENCE",
        severity: SEVERITY_BY_TIER[t] as Severity,
        message:
          `'${fname}' extracted at ${c.toFixed(2)} confidence, below the ` +
          `tier-${t} gate of ${threshold.toFixed(2)}. Queue a ` +
          "targeted high-resolution re-read of its bounding box.",
        fields: [fname],
        control: "confidence",
      });
    }
  }

  const grounding = inv.grounding ?? {};
  const missingGrounding = Object.keys(conf).filter((f) => !(f in grounding));
  if (missingGrounding.length > 0) {
    out.push({
      code: "NO_GROUNDING",
      severity: "warn",
      message:
        `${missingGrounding.length} field(s) returned with no page or ` +
        "bounding box. Un-auditable in a field exam.",
      fields: missingGrounding.slice(0, 5),
      control: "audit",
    });
  }

  return out;
}
