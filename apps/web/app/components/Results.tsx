"use client";

import type { ControlResult, Finding, Invoice } from "@ifg/control-engine";
import { SEVERITY_WEIGHT } from "@ifg/control-engine/route";
import { isCovered, reasonFor } from "@ifg/control-engine/coverage";
import { getFieldByKey } from "@invoice/extract/fields";

export interface ProcessResponse {
  invoice: Invoice;
  requested: Array<{
    key: string;
    status: "found" | "not_found" | "unreadable";
    value: string | null;
    reason: string | null;
    source: "canonical" | "custom";
  }>;
  control: ControlResult;
  warnings: string[];
}

const SEVERITY_COLOUR: Record<Finding["severity"], string> = {
  critical: "var(--critical)",
  high: "var(--high)",
  warn: "var(--warn)",
  info: "var(--info)",
};

const DECISION_COLOUR: Record<string, string> = {
  AUTO_FUND: "var(--fund)",
  REVIEW_LIGHT: "var(--warn)",
  REVIEW: "var(--high)",
  BLOCK: "var(--critical)",
};

const DECISION_WORD: Record<string, string> = {
  AUTO_FUND: "Auto-fund",
  REVIEW_LIGHT: "Light review",
  REVIEW: "Review queue",
  BLOCK: "Block",
};

const money = (n: number | null | undefined) =>
  n === null || n === undefined
    ? null
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Cell({ value }: { value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") {
    return <span className="null">not on document</span>;
  }
  return <>{value}</>;
}

function Verdict({ control }: { control: ControlResult }) {
  const accent = DECISION_COLOUR[control.decision] ?? "var(--info)";
  return (
    <div className="verdict" style={{ ["--accent" as string]: accent }}>
      <div className="score">
        {control.risk_score}
        <small>Risk score</small>
      </div>
      <div>
        <div className="call">{DECISION_WORD[control.decision] ?? control.decision}</div>
        <div className="reason">{control.reason}</div>
        <div className="tallies">
          <span className="tally">
            Critical <b>{control.critical}</b>
          </span>
          <span className="tally">
            High <b>{control.high}</b>
          </span>
          <span className="tally">
            Warn <b>{control.warn}</b>
          </span>
          <span className="tally">
            Info <b>{control.info}</b>
          </span>
        </div>
        <p className="scale">
          Score is a sum of finding weights — info 0, warn 8, high 30, critical 100 —
          with no upper bound. It is the bands that decide:{" "}
          <b>0</b> auto-fund &middot; <b>1&ndash;29</b> light review &middot;{" "}
          <b>30+ or two highs</b> review &middot; <b>any critical</b> blocks regardless
          of score.
        </p>
      </div>
    </div>
  );
}

function Findings({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return <p className="null">Every control passed. No findings.</p>;
  }
  return (
    <>
      {findings.map((f, i) => (
        <div
          key={`${f.code}-${i}`}
          className="finding"
          style={{
            ["--accent" as string]: SEVERITY_COLOUR[f.severity],
            animationDelay: `${Math.min(i * 32, 400)}ms`,
          }}
        >
          <div className="bar" />
          <div>
            <div>
              <span className="code">{f.code}</span>
              <span className="sev">
                {f.severity} &middot; {f.control}
              </span>
            </div>
            <div className="msg">{f.message}</div>
            {f.fields.length > 0 && <div className="fields">fields: {f.fields.join(", ")}</div>}
          </div>
        </div>
      ))}
    </>
  );
}

interface FieldRisk {
  points: number;
  severity: Finding["severity"];
  codes: string[];
}

/**
 * Price each field by the findings that name it.
 *
 * Every finding already carries the field paths it implicates, so a per-field
 * score is a regrouping of the total rather than a new judgement: the points
 * here sum to the document's risk score, minus the findings that name no field
 * at all (EXTRACTION_UNVERIFIED being the usual one). Weights come from the
 * engine, not from a copy of them, so the badge can never drift from the score
 * it is decomposing.
 */
function fieldRisk(findings: Finding[]): Map<string, FieldRisk> {
  const map = new Map<string, FieldRisk>();

  for (const f of findings) {
    const weight = SEVERITY_WEIGHT[f.severity];
    for (const path of f.fields) {
      const existing = map.get(path);
      if (!existing) {
        map.set(path, { points: weight, severity: f.severity, codes: [f.code] });
        continue;
      }
      existing.points += weight;
      existing.codes.push(f.code);
      // Keep the worst severity for the colour: a field with a critical and a
      // warning against it is a critical field.
      if (weight > SEVERITY_WEIGHT[existing.severity]) existing.severity = f.severity;
    }
  }

  return map;
}

/** Lookup that also covers a line row, whose findings are keyed `line[n].field`. */
function riskFor(risk: Map<string, FieldRisk>, path: string | undefined): FieldRisk | null {
  if (!path) return null;
  const direct = risk.get(path);
  if (direct) return direct;

  // A row-level badge aggregates every finding against that row.
  const prefix = `${path}.`;
  let total: FieldRisk | null = null;
  for (const [key, value] of risk) {
    if (!key.startsWith(prefix)) continue;
    if (!total) {
      total = { points: 0, severity: value.severity, codes: [] };
    }
    total.points += value.points;
    total.codes.push(...value.codes);
    if (SEVERITY_WEIGHT[value.severity] > SEVERITY_WEIGHT[total.severity]) {
      total.severity = value.severity;
    }
  }
  return total;
}

/**
 * Every field gets a number. Three states, because a clean field is clean for
 * one of two very different reasons:
 *
 *   points > 0     a control objected — points, in its severity colour
 *   0 · checked    a control examined it and was satisfied
 *   0 · unchecked  no control examines this field at all
 *
 * The last one matters most. Printing a plain 0 there would report
 * `seller.address` as verified when nothing has ever looked at it — the same
 * quiet false assurance as a confident read of an unreadable page.
 */
function Score({ risk, path }: { risk: FieldRisk | null; path?: string }) {
  if (risk) {
    const colour = SEVERITY_COLOUR[risk.severity];
    // Two findings on one field would make a run-on label, so name the worst
    // and count the rest.
    const codes = [...new Set(risk.codes)];
    const reason =
      codes.length === 1 ? reasonFor(codes[0]!) : `${reasonFor(codes[0]!)} +${codes.length - 1} more`;

    return (
      <span className="score" title={`${risk.points} risk points — ${codes.join(", ")}`}>
        <span className="score-why" style={{ color: colour }}>
          {reason}
        </span>
        <span className="score-chip" style={{ color: colour, borderColor: colour, background: "var(--surface)" }}>
          {risk.points}
        </span>
      </span>
    );
  }

  const covered = path !== undefined && isCovered(path);

  return (
    <span
      className="score"
      title={
        covered
          ? "Examined by the controls, nothing flagged."
          : "No control examines this field, so a clean result here is not a verified one."
      }
    >
      <span className={`score-why ${covered ? "is-clean" : "is-uncovered"}`}>
        {covered ? "checked" : "not checked"}
      </span>
      <span className={`score-chip ${covered ? "is-clean" : "is-uncovered"}`}>0</span>
    </span>
  );
}

function Canonical({ invoice, risk }: { invoice: Invoice; risk: Map<string, FieldRisk> }) {
  // Third element is the engine's own field path, which is what findings name.
  const rows: Array<[string, string | number | null | undefined, string?]> = [
    ["Invoice number", invoice.invoice_number, "invoice_number"],
    ["PO number", invoice.po_number, "po_number"],
    ["Clearance ID", invoice.clearance_id, "clearance_id"],
    ["Issue date", invoice.issue_date, "issue_date"],
    ["Due date", invoice.due_date, "due_date"],
    ["Payment terms (days)", invoice.payment_terms_days, "payment_terms_days"],
    ["Currency", invoice.currency, "currency"],
    ["Seller", invoice.seller?.name, "seller.name"],
    ["Seller country", invoice.seller?.country, "seller.country"],
    ["Seller tax ID", invoice.seller?.vat_id, "seller.vat_id"],
    ["Seller account", invoice.seller?.iban, "seller.iban"],
    ["Supplier ID (resolved)", invoice.seller?.supplier_id],
    ["Buyer", invoice.buyer?.name, "buyer.name"],
    ["Buyer country", invoice.buyer?.country, "buyer.country"],
    ["Buyer tax ID", invoice.buyer?.vat_id, "buyer.vat_id"],
    ["Payee", invoice.payee?.name, "payee.name"],
    ["Payee account", invoice.payee?.iban, "payee.iban"],
    ["Subtotal", money(invoice.subtotal), "subtotal"],
    ["Tax rate", invoice.tax_rate === null || invoice.tax_rate === undefined ? null : `${invoice.tax_rate}%`, "tax_rate"],
    ["Tax amount", money(invoice.tax_amount), "tax_amount"],
    ["Discount", money(invoice.discount), "discount"],
    ["Freight", money(invoice.freight), "freight"],
    ["Total due", money(invoice.total_due), "total_due"],
    ["Content hash", invoice.content_hash],
  ];

  return (
    <>
      <table className="data">
        <tbody>
          {rows.map(([label, value, path]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>
                <Cell value={value} />
              </td>
              <td className="score-cell">
                <Score risk={riskFor(risk, path)} path={path} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(invoice.line_items?.length ?? 0) > 0 && (
        <div className="block">
          <div className="block-head">
            <h2>Line items</h2>
            <span className="count">{invoice.line_items!.length} rows</span>
          </div>
          <table className="data">
            <tbody>
              {invoice.line_items!.map((li, i) => (
                <tr key={i}>
                  <td>
                    <Cell value={li.description} />
                  </td>
                  <td>
                    {li.qty ?? "?"} &times; {money(li.unit_price) ?? "?"} ={" "}
                    {money(li.line_total) ?? "?"}
                  </td>
                  <td className="score-cell">
                    <Score risk={riskFor(risk, `line[${i + 1}]`)} path={`line[${i + 1}]`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}


/**
 * Render a requested value that is really a structure.
 *
 * `line_items` arrives as a stringified array because the requested list is a
 * flat key/value contract. Printed raw it was a single unbroken 900-character
 * line, which no amount of wrapping helps: it forced the whole page to scroll
 * sideways and buried the figures a reviewer came for. Parsed, it is a table.
 *
 * Falls back to wrapped text whenever the value is not an array of objects, so
 * a custom free-text field is never mangled by a failed parse.
 */
function StructuredValue({ value }: { value: string }) {
  let rows: Record<string, unknown>[] | null = null;
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((r) => r && typeof r === "object")) {
      rows = parsed as Record<string, unknown>[];
    }
  } catch {
    // Not JSON. Plain text below.
  }

  if (rows === null) return <div className="val">{value}</div>;
  if (rows.length === 0) return <div className="val nil">no rows</div>;

  const cell = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);

  return (
    <div className="val">
      <table className="rows">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="rows-seq">{cell(r.seq ?? i + 1)}</td>
              <td className="rows-desc">{cell(r.description)}</td>
              <td className="rows-num">
                {cell(r.qty)}
                {r.uom ? ` ${r.uom}` : ""}
              </td>
              <td className="rows-num">{cell(r.unit_price)}</td>
              <td className="rows-num rows-total">{cell(r.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Results({ data }: { data: ProcessResponse }) {
  const { control, invoice, requested } = data;
  const risk = fieldRisk(control.findings);

  return (
    <div>
      {requested.length > 0 && (
        <div className="block first">
          <div className="block-head">
            <h2>Requested fields</h2>
            <span className="count">{requested.length} asked for</span>
          </div>
          {requested.map((r) => (
            <div key={r.key} className={`req ${r.status}`}>
              <span className="status">{r.status.replace("_", " ")}</span>
              <span className="req-body">
                <span className="key">{r.key}</span>
                {r.source === "custom" && <span className="sev">custom</span>}
                {r.value !== null && <StructuredValue value={r.value} />}
                {r.reason !== null && <div className="why">{r.reason}</div>}
              </span>
              <Score risk={riskFor(risk, getFieldByKey(r.key)?.path)} path={getFieldByKey(r.key)?.path} />
            </div>
          ))}
        </div>
      )}

      <div className={`block${requested.length === 0 ? " first" : ""}`}>
        <div className="block-head">
          <h2>Canonical data</h2>
          <span className="count">as read from the document</span>
        </div>
        <Canonical invoice={invoice} risk={risk} />
      </div>

      <div className="block">
        <div className="block-head">
          <h2>Raw output</h2>
          <span className="count">exactly what a consuming system receives</span>
        </div>
        <pre className="json">{JSON.stringify(data, null, 2)}</pre>
      </div>

      <div className="block">
        <div className="block-head">
          <h2>Review</h2>
          <span className="count">
            {control.findings.length} finding{control.findings.length === 1 ? "" : "s"}
          </span>
        </div>
        <Verdict control={control} />
        <div style={{ marginTop: 24 }}>
          <Findings findings={control.findings} />
        </div>
      </div>

    </div>
  );
}
