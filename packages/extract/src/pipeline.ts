import {
  BUYER_POS,
  CONTROL_ORDER,
  SEVERITY_WEIGHT,
  VENDOR_MASTER,
  runControls,
  scoreAndRoute,
  type BuyerPos,
  type ControlResult,
  type Finding,
  type Invoice,
  type VendorMaster,
} from "@ifg/control-engine";
import { extract, type ExtractInput, type ExtractOutput } from "./extract.js";

export interface ProcessInput extends Omit<ExtractInput, "master"> {
  master?: VendorMaster;
  pos?: BuyerPos;
  /** Previously funded invoices, for duplicate detection. */
  ledger?: Invoice[];
}

export interface ProcessResult {
  invoice: Invoice;
  requested: ExtractOutput["requested"];
  control: ControlResult;
  warnings: string[];
  meta: ExtractOutput["meta"];
}

/**
 * Reproduces the engine's ordering so an appended finding lands where the
 * engine would have put it. Severity descending, then control family order.
 */
function sortFindings(findings: Finding[]): Finding[] {
  const idx = (c: string) => {
    const i = CONTROL_ORDER.indexOf(c);
    return i === -1 ? 99 : i;
  };
  return [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    return bySeverity !== 0 ? bySeverity : idx(a.control) - idx(b.control);
  });
}

/**
 * The engine's confidence control derives its missing-grounding list from the
 * keys of `field_confidence`. With both maps empty it emits nothing at all — so
 * a completely un-auditable extraction would pass in silence, which is the
 * opposite of the intent.
 *
 * This finding is added by the pipeline rather than the engine, because the
 * engine is frozen against its golden file and its 8 fixtures all carry
 * confidence data.
 */
function unverifiedFinding(invoice: Invoice): Finding | null {
  const hasConfidence = Object.keys(invoice.field_confidence ?? {}).length > 0;
  const hasGrounding = Object.keys(invoice.grounding ?? {}).length > 0;
  if (hasConfidence || hasGrounding) return null;

  return {
    code: "EXTRACTION_UNVERIFIED",
    severity: "warn",
    message:
      "Extraction returned no per-field confidence and no grounding. The " +
      "tier confidence gates and the confidence-ranked review queue cannot " +
      "operate on this document, and no finding can be traced to a page region.",
    fields: [],
    control: "audit",
  };
}

/**
 * Upload to funding decision: extract, then run the deterministic controls.
 *
 * The vendor master and PO list default to the demo fixtures. In production
 * these come from the client's own reference data.
 */
export async function processInvoice(input: ProcessInput): Promise<ProcessResult> {
  const master = input.master ?? VENDOR_MASTER;
  const pos = input.pos ?? BUYER_POS;
  const ledger = input.ledger ?? [];

  const extracted = await extract({ ...input, master });
  const control = runControls(extracted.invoice, master, pos, ledger);

  const extra = unverifiedFinding(extracted.invoice);
  if (extra) {
    const findings = sortFindings([...control.findings, extra]);
    Object.assign(control, { findings }, scoreAndRoute(findings));
  }

  return {
    invoice: extracted.invoice,
    requested: extracted.requested,
    control,
    warnings: extracted.warnings,
    meta: extracted.meta,
  };
}
