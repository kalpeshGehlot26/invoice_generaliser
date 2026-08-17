# Invoice Generaliser — Design

**Date:** 2026-08-17
**Status:** Approved

## Problem

Invoices arrive in endless formats — every vendor, country, and accounting package
emits a different layout. Any platform that consumes invoice data has to write a
new parser per source, or give up and key data in by hand.

The Invoice Generaliser is a normalisation layer that sits between messy invoice
inputs and any consuming system. Upload any invoice; get back one consistent
canonical structure. Ask for specific extra fields; get each one back with a
value or an explicit "not present in this document" — never silently dropped and
never invented.

## Scope

A POC, architected so it can grow into production without a rewrite.

**In scope for v1**

- Extraction from image and PDF invoices, including scans and phone photos
- A rich canonical schema: header, parties, amounts, tax breakdown, line items
- Caller-specified extra fields, with explicit found / not-found accounting
- A web platform (upload UI + one public API endpoint)
- An MCP server exposing the same capability to any MCP client

**Out of scope for v1** (deliberately, not accidentally)

- Multi-tenancy and per-user auth
- Multiple invoices inside one file
- Per-field confidence scores (the schema leaves room; the values come later)
- Saved field profiles / templates
- Human-in-the-loop correction UI

## Architecture

One extraction core, two thin surfaces. The web app and the MCP server contain
no extraction logic — both call the same function. Drift between the two is
structurally impossible because there is only one implementation.

```
invoice_poc/
├── packages/
│   └── core/                    @invoice/core — zero framework code
│       ├── schema.ts            canonical Zod schema (single source of truth)
│       ├── fields.ts            field catalog: id, label, group, description
│       ├── input.ts             file → image content blocks
│       ├── prompt.ts            system prompt + dynamic field instructions
│       ├── llm.ts               OpenRouter client (the only provider-aware file)
│       └── extract.ts           extract(file, requestedFields) → ExtractionResult
├── apps/
│   ├── web/                     Next.js — upload UI + POST /api/extract
│   └── mcp/                     MCP server — imports @invoice/core directly
└── docs/
```

pnpm workspace, TypeScript throughout. Matches the existing NestJS / Prisma /
Railway stack in this workspace.

### Data flow

```
file bytes + requested_fields[]
        ↓
input.ts     detect real type from bytes; images pass through,
             PDFs rasterise to PNG pages
        ↓
prompt.ts    static system prompt (cacheable prefix)
             + per-request required-field list
        ↓
llm.ts       OpenRouter chat completion, strict json_schema response format
        ↓
extract.ts   validate with Zod → repair round trip if needed →
             arithmetic reconciliation → ExtractionResult
```

## Input handling

Both input kinds converge on the same representation: images.

| Input | Handling |
|---|---|
| PNG, JPEG, WebP, GIF | Sent directly as `image_url` content blocks |
| PDF (digital or scanned) | Rasterised page-by-page to PNG via pdfjs (no native deps), then sent as `image_url` blocks |

**Why rasterise rather than use OpenRouter's file-parser plugin.** OpenRouter's
`engine: "native"` requires the underlying model to accept file input natively,
which is not confirmed for GPT models through OpenRouter's passthrough. Its
default engine, `mistral-ocr`, converts the PDF to text — which discards the
spatial layout that makes tables and multi-column invoices readable, and bills
per page.

Rasterising ourselves gives one code path for every input kind, direct control
over DPI (a cost/legibility lever for bad scans), no per-page OCR billing, and
portability across any vision model. The file-parser path stays available behind
a config flag if it later proves cheaper.

File type is detected by sniffing the actual bytes, not the filename or the
declared MIME type — a `.pdf` that is really a JPEG is common output from phone
scanner apps.

### Limits

All configurable via env; these are the v1 defaults, chosen to bound cost and
latency rather than to match any provider ceiling.

| Limit | Default | Reason |
|---|---|---|
| Upload size | 25 MB | Covers high-DPI multi-page scans with margin |
| PDF pages | 20 | Each page becomes an image and costs input tokens |
| Rasterisation DPI | 150 | Legible for 6pt invoice footers without ballooning token cost |
| Rasterised page cap | 2000 px on the long edge | Downscale beyond this; more resolution stops adding accuracy |

Anything exceeding a limit is rejected before an API call is made, with a typed
error naming the limit and the actual value.

## The canonical schema

Every field is `T | null`. `null` means "we read the document and this is not
present" — the model never omits a key and never invents a value.

```
document        type (invoice|credit_note|receipt|proforma|unknown),
                invoice_number, po_number, reference,
                issue_date, due_date, service_period_start/end
seller / buyer  name, legal_name, address (line1, line2, city, state,
                postal_code, country), tax_id, registration_number,
                email, phone, website
currency        ISO-4217 code
amounts         subtotal, discount_total, tax_total, shipping,
                rounding, total, amount_paid, amount_due
tax_breakdown[] rate, taxable_amount, tax_amount,
                tax_type (GST|VAT|sales_tax|other), jurisdiction
line_items[]    line_number, description, sku, hsn_sac, quantity, unit,
                unit_price, discount, tax_rate, tax_amount, line_total
payment         terms, method, bank_name, account_number, iban, swift,
                upi_id, payment_link
notes           free text
```

### Dates carry both raw and normalised forms

`03/04/2026` is March 4th in the US and April 3rd in India. A generaliser that
silently guesses corrupts data downstream. Every date is:

```ts
{ raw: "03/04/2026", iso: "2026-04-03" | null, ambiguous: true }
```

Resolution uses seller country, currency, and other dates on the document. When
it genuinely cannot be resolved, `iso` is `null` and `ambiguous` is `true` — the
consuming platform decides rather than inheriting a coin flip.

### Amounts carry both forms

`1.234,56` (EU), `1,234.56` (US) and `1,23,456.78` (Indian lakh grouping) mean
different things. Each amount is `{ numeric, raw }`. The raw string is the audit
trail when a number looks wrong.

## Requested-field accounting

This is what makes the system a middleman rather than just an extractor.
Alongside the canonical object:

```ts
requested: [
  { key: "po_number", status: "found", value: "PO-99812", source: "canonical" },
  { key: "gstin",     status: "found", value: "27AAAPZ...", source: "custom" },
  { key: "delivery_date", status: "not_found",
    reason: "No delivery or dispatch date appears on this document" }
]
```

Three statuses:

- **`found`** — extracted, value present
- **`not_found`** — the document was read; the field is genuinely absent
- **`unreadable`** — the field is present but illegible (torn scan, cut-off text)

`unreadable` matters: "the vendor didn't include a PO number" and "the PO number
is smudged" are different problems for whoever consumes the data.

**Checkbox semantics.** The API always returns the full canonical extraction it
could find. Ticked checkboxes and lines typed into "Other" mark fields as
*required*, meaning each one is guaranteed an entry in `requested[]` with one of
the three statuses. Callers get maximum data plus a guaranteed answer on the
fields they care about.

Custom fields land in `requested[]` with `source: "custom"` and never enter the
canonical object, so the canonical shape stays stable for every consumer
forever.

## Extraction engine

**Provider:** OpenRouter, OpenAI-compatible API, accessed through the OpenAI SDK
with a custom `baseURL`. All provider-aware code lives in `core/llm.ts`.

**Models:** primary `openai/gpt-5`, fallback `openai/gpt-4.1`, both configurable
via env and passed as OpenRouter's `models: []` array for automatic failover.

**Structured outputs:**

```ts
response_format: {
  type: "json_schema",
  json_schema: { name: "invoice_extraction", strict: true, schema }
}
provider: { require_parameters: true }
```

`require_parameters: true` is mandatory — without it OpenRouter may route to a
provider that silently ignores `response_format`.

The JSON Schema is generated from the Zod schema via `zodResponseFormat()`, and
the same Zod object validates the response. One definition, both ends.

### Strict-mode constraints that shape the schema

Verified against current OpenAI structured-output rules:

- Limits are 5,000 object properties and 10 nesting levels — the schema above
  fits comfortably.
- **Every property must appear in `required`**; optional is expressed as a union
  with `null`. This structurally enforces the not-found discipline.
- **`additionalProperties: false` is mandatory**, so free-form keyed maps are
  unrepresentable. This is why `requested` is an array of `{key, status, value}`
  rather than a `{fieldName: value}` object.
- `allOf`, `not`, `if`/`then`/`else` are unsupported — compose schemas with
  object spreads, never Zod `.and()` intersections.
- The root must be an object and cannot use `anyOf`.

### Validation and repair

OpenRouter's own documentation notes that strict-mode enforcement varies by
provider. OpenAI models honour it properly, but the core does not assume that:

```
call → parse JSON → Zod validate
   ├─ valid    → continue
   └─ invalid  → one repair round trip (schema + validation errors)
                 → validate → else typed error
```

The repair step is a safety net on OpenAI models and load-bearing if the model
list is ever changed.

### Prompt caching

The system prompt (role, canonical schema semantics, date and amount
normalisation rules, not-found discipline) is byte-identical on every call and
sits at the front of the request. Only the document and the per-request field
list vary. Cache behaviour depends on the underlying provider; the prompt is
structured to benefit wherever it is available.

### Post-extraction reconciliation

Arithmetic is checked in code, not by prompting: does
`sum(line_items.line_total) + tax_total ≈ total`? Mismatches do not fail the
request — they attach a `warnings[]` entry. Downstream systems want the data and
the flag, not an error.

## Failure handling

| Condition | Behaviour |
|---|---|
| Not an invoice (menu, blank page, unrelated photo) | `document.type: "unknown"` + warning. Not an error — the caller decides. |
| Too blurry or cropped to read | Canonical fields null, requested fields `unreadable`. Still a successful response with usable structure. |
| Unsupported file type, limit exceeded (see Limits), or password-protected PDF | Rejected before any API call, with a typed error naming the limit and actual value |
| Model refusal | Surfaced plainly; `finish_reason` is checked before touching content |
| Output truncated at token limit | One retry at a higher limit (a 40-page invoice with 300 line items is real) |
| Rate limit / provider 5xx | SDK backoff, then a typed error the surfaces map to 429 / 503 |
| Schema validation failure | One repair round trip, then a typed error |

## Surfaces

### Platform (`apps/web`, Next.js)

Upload dropzone accepting images and PDFs. Below it, a checkbox list rendered
from `fields.ts`, grouped by section, plus an "Other" textarea taking one
free-text field per line ("GSTIN", "delivery date", "approver name").

Submitting calls `POST /api/extract` — a thin handler that parses the upload,
calls `extract()`, and returns JSON.

Results render in three panels: canonical data, requested-field accounting with
found / not-found / unreadable status, and a raw JSON tab with a copy button.
The JSON is the product, so it is directly visible.

### MCP server (`apps/mcp`)

One tool, `extract_invoice`, over stdio:

```
input:  { file: base64 | url, filename?, requested_fields?: string[] }
output: the identical ExtractionResult
```

The tool description enumerates the canonical field keys so an agent knows what
it can request without a discovery round trip. Same `extract()` call underneath.

## Persistence

Postgres via Prisma. Extraction results stored as JSON with metadata; uploaded
files written to disk with a pointer row. This gives the platform an upload
history and makes the POC demoable.

`@invoice/core` stays storage-agnostic — it takes bytes and returns a result.
Real multi-tenancy and per-user auth slot in at the app layer later without
touching extraction.

Auth for v1 is a single shared API key on the public endpoint.

## Testing

**Unit tests** (fast, deterministic, no API calls; run in CI on every commit):
Zod schema round-trips, date resolution across locales, amount parsing for
EU / US / Indian formats, arithmetic reconciliation warnings, byte-level file
type sniffing, prompt composition, PDF rasterisation page counts.

**Fixture suite** (the one that measures the product): a folder of real
invoices — clean PDF, scanned, phone photo, multi-currency, GST with line items,
no line items, non-English — each with a hand-written expected JSON. A
`pnpm bench` script runs all fixtures and reports **per-field accuracy**, not
pass/fail, so it is visible that totals are at 100% while seller tax IDs are at
70%.

This suite is what makes prompt changes measurable and lets models be compared
honestly when the OpenRouter model list changes.

**Needed to seed it:** 10–15 real invoices. Synthetic samples will not surface
the failure modes that matter.

## Key decisions and rationale

| Decision | Rationale |
|---|---|
| Vision on the raw document, not OCR + text | Preserves layout, tables and columns; handles unseen formats with no templates; makes ad-hoc field requests a dynamic schema rather than new parsing code |
| Rasterise PDFs ourselves | One path for all inputs; DPI control; no per-page OCR billing; no dependency on plugin defaults |
| Shared core package, thin surfaces | The UI and MCP cannot drift because there is one implementation |
| Zod as single source of truth | Generates the JSON Schema *and* validates the response |
| Always extract everything; checkboxes mark required | Callers get maximum data plus a guaranteed answer on fields they care about |
| Dual raw/normalised dates and amounts | Locale ambiguity is real and silent corruption is worse than an explicit null |
| Custom fields as an array, not a map | Required by strict mode's `additionalProperties: false`; also keeps the canonical shape stable |
| Per-field accuracy benchmark over pass/fail tests | Extraction quality is a measurement problem, not an assertion problem |

## Open questions

- Which real invoices seed the fixture suite (needed from the user)
- Whether per-field confidence scores are wanted before production
- Whether multi-invoice PDFs need splitting support
