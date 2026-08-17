# Invoice Generaliser + Control Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One Next.js product: upload any invoice image or PDF, extract it to the canonical shape, run the 34 deterministic controls over it, and show the data, the findings and a funding decision.

**Architecture:** Three packages behind one app. `@invoice/extract` turns bytes into the control engine's `Invoice` shape using a vision model via OpenRouter. `@ifg/control-engine` (already built and golden-tested) turns an `Invoice` into findings and a routing decision. `apps/web` is a thin Next.js surface over both. There is exactly one canonical schema — the engine's — so extraction and controls cannot drift apart.

**Tech Stack:** TypeScript, Next.js (App Router), Zod, OpenAI SDK pointed at OpenRouter, `pdf-to-img`, Vitest.

## Global Constraints

- **The control engine is frozen.** It is verified against `results.json` by golden test. Nothing in this plan edits `packages/control-engine/src` except its public exports. If extraction needs a shape change, the change goes in extraction.
- **One canonical schema:** the engine's `Invoice` type. Extraction produces it. No second schema, no adapter layer.
- **Never fabricate confidence or grounding.** If the model does not supply a value, the field is absent. A made-up `0.95` would silently disable the tier gates that exist to catch bad extraction.
- **Never silently repair a value.** Same rule the engine enforces: recompute, compare, flag. Extraction must not "fix" a total that does not foot.
- Zero new runtime dependencies in `control-engine`.
- ESM, Node >= 20, `"type": "module"`.
- Secrets via env only. `OPENROUTER_API_KEY` never reaches the client bundle.

## What extraction can and cannot supply

The engine's `Invoice` has fields no vision model can produce. Being explicit about this up front, because guessing at them is how the control layer gets quietly neutered.

| Field | Source | Notes |
|---|---|---|
| `invoice_number`, dates, amounts, parties, line items, `tax_rate` | **model** | The actual extraction |
| `payee` | **model** | EN 16931 party; drives `PAYEE_NOT_SELLER`. Must be extracted separately from seller, never defaulted to it |
| `content_hash` | **computed** | SHA-256 of the uploaded bytes |
| `source_channel` | **upload context** | `portal_upload` for the web app |
| `supplier_id` | **resolved** | Not extractable. Matched against the vendor master by VAT ID, then name. Unmatched leaves it null, which correctly fires `SUPPLIER_UNKNOWN` |
| `field_confidence` | **absent in v1** | GPT does not return calibrated per-field confidence. Left empty rather than invented |
| `grounding` | **absent in v1** | No reliable bounding boxes from a raw vision model |
| `clearance_id` | **model** | Extract if printed; drives the regime controls |
| `hybrid_diff` | **absent in v1** | Requires parsing embedded XML; out of scope |

### The empty-confidence gap

`vConfidence` derives its missing-grounding list from the keys of `field_confidence`. With both maps empty it emits nothing at all — so an un-auditable extraction produces silence rather than a warning. That is the opposite of the intent.

Task 6 adds a single finding, `EXTRACTION_UNVERIFIED`, emitted by the pipeline (**not** by the frozen engine) when a document reaches the controls with no confidence or grounding data. Severity `warn`.

## File structure

| File | Responsibility |
|---|---|
| `packages/extract/src/schema.ts` | Zod mirror of the engine's `Invoice`, plus `RequestedField`. Single source for the JSON Schema sent to the model |
| `packages/extract/src/fields.ts` | Field catalog: key, label, group, description, path. Drives the UI checkboxes |
| `packages/extract/src/input.ts` | Byte sniffing, limits, PDF rasterisation to images |
| `packages/extract/src/prompt.ts` | Stable system prompt + per-request field instructions |
| `packages/extract/src/llm.ts` | OpenRouter client. The only provider-aware file |
| `packages/extract/src/enrich.ts` | `content_hash`, `source_channel`, `supplier_id` resolution |
| `packages/extract/src/extract.ts` | Orchestration: prepare → call → validate → repair → enrich |
| `packages/extract/src/pipeline.ts` | `processInvoice()`: extract, then run controls, then assemble the response |
| `packages/extract/src/errors.ts` | Typed errors |
| `apps/web/app/page.tsx` | Upload form: dropzone, field checkboxes, Other box |
| `apps/web/app/api/process/route.ts` | POST handler: multipart in, `ProcessResult` out |
| `apps/web/app/components/*` | Decision banner, findings list, canonical data view, requested-fields panel, raw JSON tab |

## Response contract

```ts
interface ProcessResult {
  invoice: Invoice;              // what fed the controls
  requested: RequestedField[];   // the checkbox / Other feature
  control: ControlResult;        // findings, risk score, decision
  meta: { model, pageCount, sourceType, latencyMs, repaired };
}
```

## Tasks

- [x] **Task 1** — Scaffold `packages/extract`. Zod schema mirroring the engine's `Invoice`, with a test asserting a value validated by Zod is assignable to the engine's `Invoice` type and is accepted by `runControls`.
- [x] **Task 2** — `fields.ts` catalog + `input.ts` (sniff, limits, rasterise). Tests: magic-byte detection, limit rejection naming the actual value, one image per PDF page.
- [x] **Task 3** — `prompt.ts`. Stable prefix, per-request required-field list, explicit instruction that `payee` is extracted separately from seller and never assumed equal.
- [x] **Task 4** — `llm.ts`. OpenRouter with `response_format: json_schema` strict, `provider.require_parameters: true`, model failover list, truncation retry. Tests use an injected fake client.
- [x] **Task 5** — `enrich.ts` + `extract.ts`. Hash, channel, supplier resolution by VAT then name; validation with one repair round trip. Test: unmatched supplier leaves `supplier_id` null and the engine then fires `SUPPLIER_UNKNOWN`.
- [x] **Task 6** — `pipeline.ts`. Wire extraction into `runControls`, add `EXTRACTION_UNVERIFIED`, guarantee one `requested[]` entry per asked-for field. Test end-to-end with a stub model against the real engine.
- [x] **Task 7** — Next.js scaffold + `/api/process` route. Multipart parsing, typed errors mapped to status codes, API key server-side only.
- [x] **Task 8** — Upload UI: dropzone, checkbox groups from the catalog, Other textarea.
- [x] **Task 9** — Results UI: decision banner (colour by AUTO_FUND / REVIEW / BLOCK), findings grouped by severity, canonical data, requested-fields panel with found / not_found / unreadable, raw JSON tab.
- [x] **Task 10** — End-to-end test against a real invoice fixture, plus a README documenting what v1 cannot verify.

## Definition of done

- `npm test` green across all packages, control-engine golden test still passing untouched
- Upload a real invoice PDF and a phone photo; both produce data, findings and a decision
- No `OPENROUTER_API_KEY` in any client bundle
- The four unsupplied fields documented in the UI, not silently absent

## Known limitations to state in the UI

1. No per-field confidence, so the tier gates and the confidence-ranked review queue do not operate.
2. No grounding, so findings cannot be traced to a page region. `EXTRACTION_UNVERIFIED` makes this visible rather than silent.
3. Vendor master and PO list are the demo fixtures, not real reference data.
4. Single invoice per file.
