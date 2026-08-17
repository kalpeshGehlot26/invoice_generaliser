"use client";

import { useRef, useState } from "react";
// Import the catalog directly, not via the package index: the index pulls in
// the OpenAI SDK and the native PDF rasteriser, which must never reach the
// client bundle.
import { fieldGroups } from "@invoice/extract/fields";
import Results, { type ProcessResponse } from "./components/Results";

const GROUPS = fieldGroups();

/** What a funding decision actually needs, ticked on arrival. */
const COMMON = [
  "invoice_number",
  "issue_date",
  "due_date",
  "currency",
  "total_due",
  "tax_amount",
  "seller_name",
  "seller_vat_id",
  "buyer_name",
  "po_number",
];

const ALL_KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

/** Groups open on first load; the rest collapse to keep the panel scannable. */
const OPEN_BY_DEFAULT = new Set(["Document", "Amounts"]);

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set(COMMON));
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (key: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append("file", file);
    // Ticked checkboxes, then one custom field per non-empty line of Other.
    for (const key of ticked) body.append("fields", key);
    for (const line of other.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) body.append("fields", trimmed);
    }

    try {
      const response = await fetch("/api/process", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? "Something went wrong.");
      } else {
        setResult(payload as ProcessResponse);
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <aside className="panel">
        <div className="panel-section">
          <div className="legend">Document</div>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,application/pdf,image/*"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className={`drop${file ? " has-file" : ""}${dragging ? " is-over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) setFile(dropped);
            }}
          >
            {file ? (
              <>
                <span className="filename">{file.name}</span>
                <span className="filemeta">
                  {(file.size / 1024).toFixed(0)} KB &middot; click to replace
                </span>
              </>
            ) : (
              <>
                Drop an invoice
                <span className="filemeta">PDF, PNG, JPEG, WebP or GIF &middot; scans and photos fine</span>
              </>
            )}
          </button>
        </div>

        <div className="panel-scroll">
        <div className="panel-section">
          <div className="legend">
            Fields you require &nbsp;&middot;&nbsp; {ticked.size} of {ALL_KEYS.length}
          </div>
          <p className="hint">
            Everything readable is always extracted. Ticking a field guarantees an explicit
            answer for it &mdash; found, not present, or unreadable.
          </p>

          <div className="presets">
            <button type="button" className="preset" onClick={() => setTicked(new Set(COMMON))}>
              Common
            </button>
            <button type="button" className="preset" onClick={() => setTicked(new Set(ALL_KEYS))}>
              All
            </button>
            <button type="button" className="preset" onClick={() => setTicked(new Set())}>
              None
            </button>
          </div>

          {GROUPS.map(({ group, fields }) => {
            const active = fields.filter((f) => ticked.has(f.key)).length;
            return (
              <details className="group" key={group} open={OPEN_BY_DEFAULT.has(group)}>
                <summary>
                  {group}
                  <span className={`group-count${active > 0 ? " active" : ""}`}>
                    {active}/{fields.length}
                  </span>
                </summary>
                <div className="group-body">
                  {fields.map((f) => (
                    <label className="check" key={f.key} title={f.description}>
                      <input
                        type="checkbox"
                        checked={ticked.has(f.key)}
                        onChange={() => toggle(f.key)}
                      />
                      <span>{f.label}</span>
                    </label>
                  ))}
                </div>
              </details>
            );
          })}
        </div>

        <div className="panel-section">
          <div className="legend">Other &mdash; one per line</div>
          <textarea
            className="other"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder={"CIS deduction\ndelivery date\napprover name"}
          />
          <p className="hint after">Anything not in the list above. Plain English is fine.</p>
        </div>
        </div>

        <div className="panel-foot">
          <button className="go" onClick={submit} disabled={!file || busy}>
            {busy ? <span className="working">Reading document&hellip;</span> : "Process invoice"}
          </button>
          {!file && <p className="go-note">Add a document to begin</p>}
        </div>
      </aside>

      <section>
        {error && (
          <div className="error">
            <strong>{error}</strong>
            {error.includes("OPENROUTER_API_KEY") && (
              <p>
                Extraction needs an OpenRouter key. Add{" "}
                <code>OPENROUTER_API_KEY=&hellip;</code> to <code>.env</code> at the repo
                root and restart the server.
              </p>
            )}
          </div>
        )}

        {!error && !result && !busy && (
          <div className="empty">
            <div className="display">Nothing loaded</div>
            <p>
              Upload an invoice &mdash; a clean vendor PDF, a scan, or a photograph taken on
              a phone. All three take the same path.
            </p>
            <ol className="steps">
              <li>
                <span className="n">1</span>
                <span>Pages are rasterised, so tables and columns keep their layout.</span>
              </li>
              <li>
                <span className="n">2</span>
                <span>Fields are read into one canonical shape. Nothing is repaired or inferred.</span>
              </li>
              <li>
                <span className="n">3</span>
                <span>
                  34 deterministic controls run &mdash; arithmetic, tax, identity, duplicate
                  financing.
                </span>
              </li>
              <li>
                <span className="n">4</span>
                <span>You get findings, a risk score, and a funding decision.</span>
              </li>
            </ol>
          </div>
        )}

        {busy && (
          <div className="empty">
            <div className="display working">Reading document</div>
            <p>Rasterising pages, extracting fields, running controls. This takes a few seconds.</p>
          </div>
        )}

        {result && <Results data={result} />}
      </section>
    </main>
  );
}
