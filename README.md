# Invoice Generaliser

Upload any invoice — digital PDF, scan, or phone photo — extract it to one
canonical shape, run 34 deterministic controls over it, and get a funding
decision.

## Layout

```
packages/control-engine/   deterministic controls + risk routing (TypeScript port of engine.py)
packages/extract/          vision extraction via OpenRouter, plus the pipeline
apps/web/                  Next.js UI
IFG_POC_code/              the original Python reference implementation
```

There is **one canonical schema** — the control engine's `Invoice`. Extraction
targets it directly. No adapter layer, because an adapter is where two schemas
silently drift apart.

## Running

```bash
npm install
cp .env.example .env          # add OPENROUTER_API_KEY
npm test                      # 78 tests
npm run build --workspace @invoice/web
npm start --workspace @invoice/web
```

Configuration:

| Variable | Default |
|---|---|
| `OPENROUTER_API_KEY` | required |
| `INVOICE_MODEL_PRIMARY` | `openai/gpt-4.1` |
| `INVOICE_MODEL_FALLBACK` | `openai/gpt-4.1-mini` |
| `INVOICE_MAX_UPLOAD_BYTES` | 26214400 (25 MB) |
| `INVOICE_MAX_PDF_PAGES` | 20 |
| `INVOICE_RASTER_DPI` | 150 |

## How a document flows

```
upload ─► sniff bytes ─► rasterise PDF pages to images ─► vision model
        (magic bytes,     (one path for PDFs, scans        (strict json_schema)
         limits)           and photos)                           │
                                                                 ▼
        decision ◄─ 34 controls ◄─ enrich ◄─ validate + repair once
      AUTO_FUND /   (arithmetic,   (hash,     (Zod; one retry on
      REVIEW /       tax, identity, supplier   schema failure)
      BLOCK          duplicates)   match)
```

PDFs are rasterised rather than text-extracted, so tables and columns keep their
spatial layout and a photo of a crumpled invoice takes the same path as a clean
vendor PDF.

## Design rules that are load-bearing

- **Never repair a value.** Extraction reports what is printed. If the totals do
  not foot, all the numbers come through as printed and `TOTAL_MISMATCH` fires. A
  silently repaired total is a fraud vector.
- **Never default payee to seller.** EN 16931 models Payee separately, and in
  invoice finance a payee that differs from the seller means the receivable is
  already assigned. Defaulting it would permanently silence `PAYEE_NOT_SELLER`.
- **Never fabricate confidence.** A made-up `0.95` would disable the tier gates
  that exist to catch bad extraction.
- **Validate before configuring.** An unsupported or oversized upload is rejected
  before anything touches the API key or the network.

## What this cannot do yet

Stated in the UI on every result, not buried here:

1. **No per-field confidence.** Vision models do not return calibrated values, so
   the tier gates and the confidence-ranked review queue do not operate. The
   pipeline raises `EXTRACTION_UNVERIFIED` rather than passing in silence.
2. **No grounding.** No bounding boxes, so no finding traces to a page region —
   not defensible in a field exam as it stands.
3. **Reference data is fixtures.** The vendor master and PO list are the demo
   fixtures, not live client data.
4. **One invoice per file.** Multi-invoice PDFs are not split.

## Tests

```bash
npm test
```

- `control-engine` is verified against `IFG_POC_code/results.json` as a golden
  file: all 8 reference documents deep-equal on every finding, message, ordering,
  score and decision. Console output is byte-identical to `python3 run.py`.
- `extract` proves its Zod output feeds the unmodified engine, and covers
  supplier resolution, payee handling, validation ordering and the
  requested-field contract.
