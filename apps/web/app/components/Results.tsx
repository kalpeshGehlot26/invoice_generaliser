"use client";

import type { ControlResult, Finding, Invoice } from "@ifg/control-engine";

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

function Canonical({ invoice }: { invoice: Invoice }) {
  const rows: Array<[string, string | number | null | undefined]> = [
    ["Invoice number", invoice.invoice_number],
    ["PO number", invoice.po_number],
    ["Clearance ID", invoice.clearance_id],
    ["Issue date", invoice.issue_date],
    ["Due date", invoice.due_date],
    ["Payment terms (days)", invoice.payment_terms_days],
    ["Currency", invoice.currency],
    ["Seller", invoice.seller?.name],
    ["Seller country", invoice.seller?.country],
    ["Seller tax ID", invoice.seller?.vat_id],
    ["Seller account", invoice.seller?.iban],
    ["Supplier ID (resolved)", invoice.seller?.supplier_id],
    ["Buyer", invoice.buyer?.name],
    ["Buyer country", invoice.buyer?.country],
    ["Buyer tax ID", invoice.buyer?.vat_id],
    ["Payee", invoice.payee?.name],
    ["Payee account", invoice.payee?.iban],
    ["Subtotal", money(invoice.subtotal)],
    ["Tax rate", invoice.tax_rate === null || invoice.tax_rate === undefined ? null : `${invoice.tax_rate}%`],
    ["Tax amount", money(invoice.tax_amount)],
    ["Discount", money(invoice.discount)],
    ["Freight", money(invoice.freight)],
    ["Total due", money(invoice.total_due)],
    ["Content hash", invoice.content_hash],
  ];

  return (
    <>
      <table className="data">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>
                <Cell value={value} />
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Results({ data }: { data: ProcessResponse }) {
  const { control, invoice, requested, warnings } = data;

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
              <span>
                <span className="key">{r.key}</span>
                {r.source === "custom" && <span className="sev">custom</span>}
                {r.value !== null && <div className="val">{r.value}</div>}
                {r.reason !== null && <div className="why">{r.reason}</div>}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className={`block${requested.length === 0 ? " first" : ""}`}>
        <div className="block-head">
          <h2>Canonical data</h2>
          <span className="count">as read from the document</span>
        </div>
        <Canonical invoice={invoice} />
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

      <div className="block">
        <div className="note">
          <h3>What this run could not verify</h3>
          <ul>
            <li>
              No per-field confidence was produced, so the tier gates and the
              confidence-ranked review queue did not operate.
            </li>
            <li>
              No grounding, so no finding can be traced to a page region. Not defensible in
              a field exam as it stands.
            </li>
            <li>Vendor master and PO list are demo fixtures, not live reference data.</li>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
