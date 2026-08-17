import { vLineArithmetic, vTotals } from "./controls/arithmetic.js";
import { vConfidence } from "./controls/confidence.js";
import { DEFAULT_TODAY, vDates } from "./controls/dates.js";
import { vDuplicates } from "./controls/duplicates.js";
import { vIdentifiers, vPayeeAssignment } from "./controls/identity.js";
import { vBankChange, vPoMatch } from "./controls/masterData.js";
import { vHybridDiff, vRegime } from "./controls/regime.js";
import { vCurrency, vTax } from "./controls/tax.js";
import { CONTROL_ORDER, SEVERITY_WEIGHT, scoreAndRoute } from "./route.js";
import type { BuyerPos, ControlResult, Finding, Invoice, VendorMaster } from "./types.js";

function orderIndex(control: string): number {
  const i = CONTROL_ORDER.indexOf(control);
  return i === -1 ? 99 : i;
}

export interface RunOptions {
  /** Reference date for the future-dating check. */
  today?: Date;
}

export function runControls(
  inv: Invoice,
  master: VendorMaster,
  pos: BuyerPos,
  ledger: Invoice[],
  options: RunOptions = {},
): ControlResult {
  const findings: Finding[] = [
    ...vRegime(inv),
    ...vHybridDiff(inv),
    ...vLineArithmetic(inv),
    ...vTotals(inv),
    ...vTax(inv),
    ...vCurrency(inv),
    ...vDates(inv, options.today ?? DEFAULT_TODAY),
    ...vIdentifiers(inv),
    ...vPayeeAssignment(inv),
    ...vBankChange(inv, master),
    ...vPoMatch(inv, pos),
    ...vDuplicates(inv, ledger),
    ...vConfidence(inv),
  ];

  // Severity descending, then control family order. Must be a stable sort:
  // ties keep the emission order above, which is part of the contract.
  findings.sort((a, b) => {
    const bySeverity = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (bySeverity !== 0) return bySeverity;
    return orderIndex(a.control) - orderIndex(b.control);
  });

  return {
    doc_id: inv.doc_id,
    label: inv.label ?? "",
    corridor: `${inv.seller?.country ?? "None"} to ${inv.buyer?.country ?? "None"}`,
    channel: inv.source_channel,
    currency: inv.currency,
    total_due: inv.total_due,
    invoice_number: inv.invoice_number,
    seller: inv.seller?.name,
    buyer: inv.buyer?.name,
    clearance_id: inv.clearance_id ?? null,
    findings,
    ...scoreAndRoute(findings),
  };
}
