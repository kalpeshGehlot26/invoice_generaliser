"use client";

import { useRef, useState } from "react";
// Import the catalog directly, not via the package index: the index pulls in
// the OpenAI SDK and the native PDF rasteriser, which must never reach the
// client bundle.
import { fieldGroups } from "@invoice/extract/fields";
import Results, { type ProcessResponse } from "./components/Results";

const GROUPS = fieldGroups();

const DEFAULT_TICKED = new Set([
  "invoice_number",
  "total_due",
  "currency",
  "issue_date",
  "seller_name",
]);

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set(DEFAULT_TICKED));
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

        <div className="panel-section">
          <div className="legend">Fields you require</div>
          <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
            Everything readable is always extracted. Ticking a field guarantees an explicit
            answer for it &mdash; found, not present, or unreadable.
          </p>
          {GROUPS.map(({ group, fields }) => (
            <div className="group" key={group}>
              <div className="group-name">{group}</div>
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
          ))}
        </div>

        <div className="panel-section">
          <div className="legend">Other &mdash; one per line</div>
          <textarea
            className="other"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder={"GSTIN\ndelivery date\napprover name"}
          />
          <p className="hint">Anything not in the list above. Plain English is fine.</p>
        </div>

        <div className="panel-section">
          <button className="go" onClick={submit} disabled={!file || busy}>
            {busy ? <span className="working">Reading document&hellip;</span> : "Process invoice"}
          </button>
        </div>
      </aside>

      <section>
        {error && (
          <div className="error">
            <strong>{error}</strong>
          </div>
        )}

        {!error && !result && !busy && (
          <div className="empty">
            <div className="display">Nothing loaded</div>
            <p>
              Upload an invoice. It is extracted to one canonical shape, then put through
              34 deterministic controls &mdash; arithmetic, tax, identity, duplicate
              financing &mdash; and returned with a funding decision.
            </p>
          </div>
        )}

        {busy && (
          <div className="empty">
            <div className="display working">Reading document</div>
            <p>Rasterising pages, extracting fields, running controls.</p>
          </div>
        )}

        {result && <Results data={result} />}
      </section>
    </main>
  );
}
