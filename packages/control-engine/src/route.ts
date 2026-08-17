import type { Finding, Routing, Severity } from "./types.js";

export const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 0,
  warn: 8,
  high: 30,
  critical: 100,
};

/** Deterministic ordering of control families within a severity band. */
export const CONTROL_ORDER = [
  "regime", "arithmetic", "tax", "currency", "dates", "identity",
  "payment_integrity", "master_data", "matching",
  "duplicate_financing", "duplicate", "hybrid_diff",
  "confidence", "eligibility", "audit",
];

export function scoreAndRoute(findings: Finding[]): Routing {
  const score = findings.reduce((acc, f) => acc + SEVERITY_WEIGHT[f.severity], 0);
  const crit = findings.filter((f) => f.severity === "critical");
  const high = findings.filter((f) => f.severity === "high");

  let decision: Routing["decision"];
  let reason: string;

  if (crit.length > 0) {
    decision = "BLOCK";
    reason = `${crit.length} critical control failure(s)`;
  } else if (score >= 30 || high.length >= 2) {
    decision = "REVIEW";
    reason = `risk score ${score}, ${high.length} high finding(s)`;
  } else if (score > 0) {
    decision = "REVIEW_LIGHT";
    reason = `risk score ${score}, no high findings`;
  } else {
    decision = "AUTO_FUND";
    reason = "all controls passed";
  }

  return {
    risk_score: score,
    decision,
    reason,
    critical: crit.length,
    high: high.length,
    warn: findings.filter((f) => f.severity === "warn").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
}
