/** Severity ladder, lowest to highest. Drives both risk weight and routing. */
export type Severity = "info" | "warn" | "high" | "critical";

export type Decision = "AUTO_FUND" | "REVIEW_LIGHT" | "REVIEW" | "BLOCK";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  /** Fields this finding implicates, for the audit trail. */
  fields: string[];
  /** Control family, used for deterministic ordering. */
  control: string;
}

export interface Party {
  supplier_id?: string | null;
  buyer_id?: string | null;
  name?: string | null;
  country?: string | null;
  vat_id?: string | null;
  iban?: string | null;
  address?: string | null;
}

export interface Payee {
  name?: string | null;
  iban?: string | null;
}

export interface LineItem {
  seq?: number | null;
  description?: string | null;
  qty?: number | null;
  uom?: string | null;
  unit_price?: number | null;
  /** Per-line fee, surcharge or handling charge shown as its own column. */
  charge?: number | null;
  line_total?: number | null;
  tax_rate?: number | null;
  tax_category?: string | null;
}

export interface Grounding {
  page: number;
  bbox: number[];
}

/**
 * The invoice shape the control layer consumes. Mirrors `samples.py`, which is
 * the authoritative shape — PRD section 4 has drifted from it (`ingest.channel`
 * vs `source_channel`, `ingest.content_sha256` vs `content_hash`, and a
 * root-level scalar `tax_rate` that the PRD schema does not show).
 */
export interface Invoice {
  doc_id: string;
  label?: string;
  source_channel?: string | null;
  facturx_profile?: string | null;
  invoice_number?: string | null;
  clearance_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  payment_terms_days?: number | null;
  currency?: string | null;
  seller?: Party;
  buyer?: Party;
  payee?: Payee | null;
  po_number?: string | null;
  line_items?: LineItem[];
  subtotal?: number | null;
  tax_rate?: number | null;
  tax_amount?: number | null;
  discount?: number | null;
  freight?: number | null;
  total_due?: number | null;
  /** field path -> [value in embedded XML, value on the visual page] */
  hybrid_diff?: Record<string, [string, string]>;
  content_hash?: string | null;
  field_confidence?: Record<string, number>;
  grounding?: Record<string, Grounding>;
}

export interface VendorRecord {
  name?: string | null;
  vat_id?: string | null;
  iban?: string | null;
  account?: string | null;
  country?: string | null;
  since?: string | null;
}

export interface PoRecord {
  buyer_vat_id?: string | null;
  buyer?: string | null;
  open_amount?: number | null;
  currency?: string | null;
}

export type VendorMaster = Record<string, VendorRecord>;
export type BuyerPos = Record<string, PoRecord>;

export interface Routing {
  risk_score: number;
  decision: Decision;
  reason: string;
  critical: number;
  high: number;
  warn: number;
  info: number;
}

export interface ControlResult extends Routing {
  doc_id: string;
  label: string;
  corridor: string;
  channel: string | null | undefined;
  currency: string | null | undefined;
  total_due: number | null | undefined;
  invoice_number: string | null | undefined;
  seller: string | null | undefined;
  buyer: string | null | undefined;
  clearance_id: string | null | undefined;
  findings: Finding[];
}
