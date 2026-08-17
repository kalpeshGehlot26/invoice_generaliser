# Invoice Generaliser — Core Engine Implementation Plan

> **STATUS: SUPERSEDED — do not execute.** Replaced on 2026-08-17 by
> `2026-08-17-control-engine-port.md`. The project direction changed to porting
> the existing IFG control layer (`IFG_POC_code/engine.py`) to TypeScript, with
> no extraction work. Kept for reference only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@invoice/core` — a framework-free TypeScript package that turns any invoice image or PDF into a canonical JSON structure, plus a benchmark harness that measures per-field extraction accuracy.

**Architecture:** A single `extract()` function orchestrates six stages: sniff file type → rasterise PDFs to images → build a cached-prefix prompt → call OpenRouter with strict `json_schema` → validate with Zod (repairing once if invalid) → reconcile arithmetic and dates into warnings. Zod is the single source of truth: it generates the JSON Schema sent to the model *and* validates what comes back.

**Tech Stack:** TypeScript, pnpm workspaces, Zod 3, OpenAI SDK (pointed at OpenRouter), `pdf-to-img` for rasterisation, Vitest for tests.

## Global Constraints

- Node.js >= 20. pnpm >= 9. ESM only (`"type": "module"` in every package).
- **Zod pinned to `^3.23`** — `zodResponseFormat` from `openai/helpers/zod` targets Zod 3. Do not upgrade to Zod 4.
- **Never use Zod `.and()` / intersections.** OpenAI strict mode rejects `allOf`. Compose object schemas by spreading shape objects.
- **Every schema field must be nullable.** Strict mode requires all properties in `required`; optional is expressed as a union with `null`. `null` carries meaning: "read the document, this is absent".
- **Never use a Zod record / free-form map.** Strict mode mandates `additionalProperties: false`. Keyed collections must be arrays of objects.
- **`packages/core` imports no web or MCP framework code.** It takes bytes, returns a result.
- All limits configurable via env; defaults: 25 MB upload, 20 PDF pages, 150 DPI, 2000 px long edge.
- OpenRouter requests always send `provider: { require_parameters: true }`.
- Every task ends with a passing test run and a commit.

## Refinements to the spec, made during planning

Two things changed as the plan got concrete. Both are noted here so the spec and plan don't silently disagree:

1. **PDF rasterisation uses prebuilt native binaries.** The spec says "no native deps". `pdf-to-img` depends on `@napi-rs/canvas`, which ships *prebuilt* binaries — it installs without a compiler toolchain on Linux and macOS, but it is not pure JS. Practically equivalent for our purposes; factually the spec overstated it.
2. **Dates are resolved in code, not trusted from the model.** The schema still carries `{raw, iso, ambiguous}` as specified, but `dates.ts` independently resolves `iso` from `raw` plus locale hints. Where code and model disagree, code wins and a warning is emitted. Deterministic date logic is testable; model date-guessing is not.

## File structure

| File | Responsibility |
|---|---|
| `packages/core/src/schema.ts` | Canonical Zod schema and inferred types. Single source of truth. |
| `packages/core/src/fields.ts` | Field catalog: id, label, group, description, schema path. Drives UI checkboxes and MCP tool docs. |
| `packages/core/src/amounts.ts` | Locale-aware amount string → number. |
| `packages/core/src/dates.ts` | Locale-aware date string → ISO + ambiguity flag. |
| `packages/core/src/input.ts` | Byte sniffing, limit enforcement, PDF rasterisation, image block construction. |
| `packages/core/src/prompt.ts` | System prompt (stable prefix) and per-request field instructions. |
| `packages/core/src/llm.ts` | OpenRouter client. The only provider-aware file. |
| `packages/core/src/reconcile.ts` | Arithmetic and date cross-checks → warnings. |
| `packages/core/src/extract.ts` | Orchestration, validation, repair loop. |
| `packages/core/src/errors.ts` | Typed error classes. |
| `packages/core/src/index.ts` | Public exports. |
| `bench/run.ts` | Fixture runner reporting per-field accuracy. |

---

### Task 1: Workspace scaffolding and test infrastructure

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Test: `packages/core/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `pnpm test` at the repo root; `@invoice/core` resolvable by workspace packages

- [ ] **Step 1: Write the failing test**

`packages/core/src/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { VERSION } from "./index.js";

describe("core package", () => {
  it("exports a version string", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test`
Expected: FAIL — cannot resolve `./index.js` (module does not exist yet)

- [ ] **Step 3: Write minimal implementation**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

Root `package.json`:

```json
{
  "name": "invoice-generaliser",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20", "pnpm": ">=9" },
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "verbatimModuleSyntax": true
  }
}
```

`packages/core/package.json`:

```json
{
  "name": "@invoice/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts"]
}
```

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

`packages/core/src/index.ts`:

```ts
export const VERSION = "0.1.0";
```

`.gitignore`:

```
node_modules/
dist/
.env
.env.local
bench/fixtures/*/input.*
```

`.env.example`:

```
OPENROUTER_API_KEY=
INVOICE_MODEL_PRIMARY=openai/gpt-5
INVOICE_MODEL_FALLBACK=openai/gpt-4.1
INVOICE_MAX_UPLOAD_BYTES=26214400
INVOICE_MAX_PDF_PAGES=20
INVOICE_RASTER_DPI=150
INVOICE_RASTER_MAX_EDGE=2000
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm --filter @invoice/core test`
Expected: PASS — 1 test

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace and core package"
```

---

### Task 2: Canonical schema

**Files:**
- Create: `packages/core/src/schema.ts`
- Test: `packages/core/src/schema.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `Money = { numeric: number | null; raw: string | null }`
  - `DateValue = { raw: string | null; iso: string | null; ambiguous: boolean }`
  - `CanonicalInvoice` (Zod object + inferred type)
  - `RequestedField = { key: string; status: "found" | "not_found" | "unreadable"; value: string | null; source: "canonical" | "custom"; reason: string | null }`
  - `Warning = { code: string; message: string; severity: "info" | "warn" }`
  - `ExtractionResult = { canonical: CanonicalInvoice; requested: RequestedField[]; warnings: Warning[]; metadata: ExtractionMetadata }`
  - `ModelOutputSchema` — the subset the model fills (canonical + requested), used for `zodResponseFormat`

- [ ] **Step 1: Write the failing test**

`packages/core/src/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { zodResponseFormat } from "openai/helpers/zod";
import { CanonicalInvoiceSchema, ModelOutputSchema } from "./schema.js";

const minimal = {
  document: {
    type: "invoice",
    invoice_number: "INV-1",
    po_number: null,
    reference: null,
    issue_date: { raw: "2026-01-05", iso: "2026-01-05", ambiguous: false },
    due_date: null,
    service_period_start: null,
    service_period_end: null,
  },
  seller: null,
  buyer: null,
  currency: "USD",
  amounts: {
    subtotal: { numeric: 100, raw: "100.00" },
    discount_total: null,
    tax_total: { numeric: 10, raw: "10.00" },
    shipping: null,
    rounding: null,
    total: { numeric: 110, raw: "110.00" },
    amount_paid: null,
    amount_due: null,
  },
  tax_breakdown: [],
  line_items: [],
  payment: null,
  notes: null,
};

describe("CanonicalInvoiceSchema", () => {
  it("accepts a minimal invoice with nulls for absent sections", () => {
    expect(() => CanonicalInvoiceSchema.parse(minimal)).not.toThrow();
  });

  it("rejects a missing key rather than treating it as absent", () => {
    const { currency, ...withoutCurrency } = minimal;
    expect(() => CanonicalInvoiceSchema.parse(withoutCurrency)).toThrow();
  });

  it("produces a strict JSON Schema OpenAI will accept", () => {
    const format = zodResponseFormat(ModelOutputSchema, "invoice_extraction");
    expect(format.json_schema.strict).toBe(true);

    const walk = (node: any): void => {
      if (!node || typeof node !== "object") return;
      // strict mode forbids these composition keywords entirely
      expect(node.allOf).toBeUndefined();
      expect(node.not).toBeUndefined();
      expect(node.if).toBeUndefined();
      if (node.type === "object") {
        expect(node.additionalProperties).toBe(false);
        expect(new Set(node.required ?? [])).toEqual(
          new Set(Object.keys(node.properties ?? {})),
        );
      }
      Object.values(node).forEach(walk);
    };
    walk(format.json_schema.schema);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test schema`
Expected: FAIL — cannot resolve `./schema.js`

- [ ] **Step 3: Write minimal implementation**

Add the OpenAI SDK first: `pnpm --filter @invoice/core add openai@^4.70.0`

`packages/core/src/schema.ts`:

```ts
import { z } from "zod";

/** Every leaf is nullable: null means "read the document, this is absent". */
const nstr = () => z.string().nullable();
const nnum = () => z.number().nullable();

export const MoneySchema = z.object({
  numeric: nnum().describe("Parsed numeric value, e.g. 1234.56"),
  raw: nstr().describe("Exactly as printed, e.g. '1.234,56'"),
});

export const DateValueSchema = z.object({
  raw: nstr().describe("Exactly as printed, e.g. '03/04/2026'"),
  iso: nstr().describe("YYYY-MM-DD, or null if the order cannot be determined"),
  ambiguous: z
    .boolean()
    .describe("True when day/month order cannot be determined from the document"),
});

export const AddressSchema = z.object({
  line1: nstr(),
  line2: nstr(),
  city: nstr(),
  state: nstr(),
  postal_code: nstr(),
  country: nstr().describe("ISO-3166 alpha-2 if determinable, else as printed"),
});

export const PartySchema = z.object({
  name: nstr(),
  legal_name: nstr(),
  address: AddressSchema.nullable(),
  tax_id: nstr().describe("VAT number, GSTIN, EIN, ABN — whichever appears"),
  registration_number: nstr(),
  email: nstr(),
  phone: nstr(),
  website: nstr(),
});

export const TaxLineSchema = z.object({
  rate: nnum().describe("Percentage, e.g. 18 for 18%"),
  taxable_amount: MoneySchema.nullable(),
  tax_amount: MoneySchema.nullable(),
  tax_type: z.enum(["GST", "VAT", "sales_tax", "other"]).nullable(),
  jurisdiction: nstr(),
});

export const LineItemSchema = z.object({
  line_number: nnum(),
  description: nstr(),
  sku: nstr(),
  hsn_sac: nstr().describe("HSN or SAC code on Indian invoices"),
  quantity: nnum(),
  unit: nstr(),
  unit_price: MoneySchema.nullable(),
  discount: MoneySchema.nullable(),
  tax_rate: nnum(),
  tax_amount: MoneySchema.nullable(),
  line_total: MoneySchema.nullable(),
});

export const PaymentSchema = z.object({
  terms: nstr(),
  method: nstr(),
  bank_name: nstr(),
  account_number: nstr(),
  iban: nstr(),
  swift: nstr(),
  upi_id: nstr(),
  payment_link: nstr(),
});

export const DocumentSchema = z.object({
  type: z.enum(["invoice", "credit_note", "receipt", "proforma", "unknown"]),
  invoice_number: nstr(),
  po_number: nstr(),
  reference: nstr(),
  issue_date: DateValueSchema.nullable(),
  due_date: DateValueSchema.nullable(),
  service_period_start: DateValueSchema.nullable(),
  service_period_end: DateValueSchema.nullable(),
});

export const AmountsSchema = z.object({
  subtotal: MoneySchema.nullable(),
  discount_total: MoneySchema.nullable(),
  tax_total: MoneySchema.nullable(),
  shipping: MoneySchema.nullable(),
  rounding: MoneySchema.nullable(),
  total: MoneySchema.nullable(),
  amount_paid: MoneySchema.nullable(),
  amount_due: MoneySchema.nullable(),
});

export const CanonicalInvoiceSchema = z.object({
  document: DocumentSchema,
  seller: PartySchema.nullable(),
  buyer: PartySchema.nullable(),
  currency: nstr().describe("ISO-4217 code, e.g. USD, EUR, INR"),
  amounts: AmountsSchema,
  tax_breakdown: z.array(TaxLineSchema),
  line_items: z.array(LineItemSchema),
  payment: PaymentSchema.nullable(),
  notes: nstr(),
});

export const RequestedFieldSchema = z.object({
  key: z.string(),
  status: z.enum(["found", "not_found", "unreadable"]),
  value: nstr().describe("Stringified value; null unless status is 'found'"),
  source: z.enum(["canonical", "custom"]),
  reason: nstr().describe("Why it is absent or unreadable; null when found"),
});

/** Exactly what the model returns. Nothing computed by us appears here. */
export const ModelOutputSchema = z.object({
  canonical: CanonicalInvoiceSchema,
  requested: z.array(RequestedFieldSchema),
});

export const WarningSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warn"]),
});

export interface ExtractionMetadata {
  model: string;
  pageCount: number;
  sourceType: "pdf" | "image";
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  repaired: boolean;
}

export type Money = z.infer<typeof MoneySchema>;
export type DateValue = z.infer<typeof DateValueSchema>;
export type CanonicalInvoice = z.infer<typeof CanonicalInvoiceSchema>;
export type RequestedField = z.infer<typeof RequestedFieldSchema>;
export type Warning = z.infer<typeof WarningSchema>;
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

export interface ExtractionResult {
  canonical: CanonicalInvoice;
  requested: RequestedField[];
  warnings: Warning[];
  metadata: ExtractionMetadata;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./schema.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test schema`
Expected: PASS — 3 tests. If the strict-schema walk fails on `additionalProperties`, a `.nullable()` was applied to a bare shape instead of a `z.object()`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schema.ts packages/core/src/schema.test.ts packages/core/src/index.ts packages/core/package.json
git commit -m "feat(core): add canonical invoice schema with strict-mode compatibility"
```

---

### Task 3: Field catalog

**Files:**
- Create: `packages/core/src/fields.ts`
- Test: `packages/core/src/fields.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `CanonicalInvoiceSchema` from Task 2
- Produces:
  - `FieldDescriptor = { key: string; label: string; group: string; description: string; path: string }`
  - `FIELD_CATALOG: FieldDescriptor[]`
  - `getFieldByKey(key: string): FieldDescriptor | undefined`
  - `resolvePath(canonical: CanonicalInvoice, path: string): unknown`

- [ ] **Step 1: Write the failing test**

`packages/core/src/fields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FIELD_CATALOG, getFieldByKey, resolvePath } from "./fields.js";
import { CanonicalInvoiceSchema } from "./schema.js";

describe("field catalog", () => {
  it("has unique keys", () => {
    const keys = FIELD_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every catalog path exists in the canonical schema shape", () => {
    // Build a fully-populated object from the schema's own key structure,
    // then confirm each catalog path resolves to a defined slot.
    const shape = (schema: any): any => {
      const def = schema._def;
      if (def.typeName === "ZodNullable" || def.typeName === "ZodOptional") {
        return shape(def.innerType);
      }
      if (def.typeName === "ZodObject") {
        return Object.fromEntries(
          Object.entries(schema.shape).map(([k, v]) => [k, shape(v)]),
        );
      }
      if (def.typeName === "ZodArray") return [];
      return null;
    };
    const skeleton = shape(CanonicalInvoiceSchema);

    for (const field of FIELD_CATALOG) {
      const parts = field.path.split(".");
      let node: any = skeleton;
      for (const part of parts) {
        expect(node, `path ${field.path} broke at ${part}`).not.toBeUndefined();
        node = node?.[part];
      }
    }
  });

  it("resolves a nested path against a canonical object", () => {
    expect(
      resolvePath({ document: { invoice_number: "INV-9" } } as any, "document.invoice_number"),
    ).toBe("INV-9");
  });

  it("returns undefined for an unknown key", () => {
    expect(getFieldByKey("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test fields`
Expected: FAIL — cannot resolve `./fields.js`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/fields.ts`:

```ts
import type { CanonicalInvoice } from "./schema.js";

export interface FieldDescriptor {
  /** Stable identifier used by the UI and MCP callers. */
  key: string;
  label: string;
  group: string;
  description: string;
  /** Dotted path into CanonicalInvoice. */
  path: string;
}

export const FIELD_CATALOG: FieldDescriptor[] = [
  { key: "invoice_number", label: "Invoice number", group: "Document", description: "The vendor's invoice identifier", path: "document.invoice_number" },
  { key: "po_number", label: "PO number", group: "Document", description: "Purchase order reference", path: "document.po_number" },
  { key: "reference", label: "Reference", group: "Document", description: "Any other reference printed on the document", path: "document.reference" },
  { key: "document_type", label: "Document type", group: "Document", description: "Invoice, credit note, receipt or proforma", path: "document.type" },
  { key: "issue_date", label: "Issue date", group: "Document", description: "Date the invoice was issued", path: "document.issue_date" },
  { key: "due_date", label: "Due date", group: "Document", description: "Date payment is due", path: "document.due_date" },
  { key: "service_period_start", label: "Service period start", group: "Document", description: "Start of the billed period", path: "document.service_period_start" },
  { key: "service_period_end", label: "Service period end", group: "Document", description: "End of the billed period", path: "document.service_period_end" },

  { key: "seller_name", label: "Seller name", group: "Seller", description: "Trading name of the party issuing the invoice", path: "seller.name" },
  { key: "seller_legal_name", label: "Seller legal name", group: "Seller", description: "Registered legal entity name", path: "seller.legal_name" },
  { key: "seller_address", label: "Seller address", group: "Seller", description: "Full postal address of the seller", path: "seller.address" },
  { key: "seller_tax_id", label: "Seller tax ID", group: "Seller", description: "VAT number, GSTIN, EIN or equivalent", path: "seller.tax_id" },
  { key: "seller_email", label: "Seller email", group: "Seller", description: "Contact email for the seller", path: "seller.email" },
  { key: "seller_phone", label: "Seller phone", group: "Seller", description: "Contact phone for the seller", path: "seller.phone" },

  { key: "buyer_name", label: "Buyer name", group: "Buyer", description: "Trading name of the party being billed", path: "buyer.name" },
  { key: "buyer_legal_name", label: "Buyer legal name", group: "Buyer", description: "Registered legal entity name", path: "buyer.legal_name" },
  { key: "buyer_address", label: "Buyer address", group: "Buyer", description: "Full postal address of the buyer", path: "buyer.address" },
  { key: "buyer_tax_id", label: "Buyer tax ID", group: "Buyer", description: "VAT number, GSTIN, EIN or equivalent", path: "buyer.tax_id" },

  { key: "currency", label: "Currency", group: "Amounts", description: "ISO-4217 currency code", path: "currency" },
  { key: "subtotal", label: "Subtotal", group: "Amounts", description: "Total before tax", path: "amounts.subtotal" },
  { key: "discount_total", label: "Discount total", group: "Amounts", description: "Total discount applied", path: "amounts.discount_total" },
  { key: "tax_total", label: "Tax total", group: "Amounts", description: "Total tax charged", path: "amounts.tax_total" },
  { key: "shipping", label: "Shipping", group: "Amounts", description: "Shipping or freight charge", path: "amounts.shipping" },
  { key: "total", label: "Total", group: "Amounts", description: "Grand total payable", path: "amounts.total" },
  { key: "amount_paid", label: "Amount paid", group: "Amounts", description: "Amount already paid", path: "amounts.amount_paid" },
  { key: "amount_due", label: "Amount due", group: "Amounts", description: "Outstanding balance", path: "amounts.amount_due" },

  { key: "tax_breakdown", label: "Tax breakdown", group: "Tax", description: "Per-rate tax lines with taxable and tax amounts", path: "tax_breakdown" },
  { key: "line_items", label: "Line items", group: "Line items", description: "Itemised goods or services", path: "line_items" },

  { key: "payment_terms", label: "Payment terms", group: "Payment", description: "e.g. Net 30", path: "payment.terms" },
  { key: "payment_method", label: "Payment method", group: "Payment", description: "How payment should be made", path: "payment.method" },
  { key: "bank_name", label: "Bank name", group: "Payment", description: "Beneficiary bank", path: "payment.bank_name" },
  { key: "account_number", label: "Account number", group: "Payment", description: "Bank account number", path: "payment.account_number" },
  { key: "iban", label: "IBAN", group: "Payment", description: "International bank account number", path: "payment.iban" },
  { key: "swift", label: "SWIFT / BIC", group: "Payment", description: "Bank identifier code", path: "payment.swift" },
  { key: "upi_id", label: "UPI ID", group: "Payment", description: "UPI virtual payment address", path: "payment.upi_id" },
  { key: "notes", label: "Notes", group: "Other", description: "Free-text notes printed on the invoice", path: "notes" },
];

const BY_KEY = new Map(FIELD_CATALOG.map((f) => [f.key, f]));

export function getFieldByKey(key: string): FieldDescriptor | undefined {
  return BY_KEY.get(key);
}

export function resolvePath(canonical: CanonicalInvoice, path: string): unknown {
  let node: unknown = canonical;
  for (const part of path.split(".")) {
    if (node === null || node === undefined || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./fields.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test fields`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/fields.ts packages/core/src/fields.test.ts packages/core/src/index.ts
git commit -m "feat(core): add field catalog with schema path validation"
```

---

### Task 4: Locale-aware amount parsing

**Files:**
- Create: `packages/core/src/amounts.ts`
- Test: `packages/core/src/amounts.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `parseAmount(raw: string): number | null`

- [ ] **Step 1: Write the failing test**

`packages/core/src/amounts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAmount } from "./amounts.js";

describe("parseAmount", () => {
  it.each([
    ["1,234.56", 1234.56],      // US / UK
    ["1.234,56", 1234.56],      // EU
    ["1 234,56", 1234.56],      // FR with space separator
    ["1,23,456.78", 123456.78], // Indian lakh grouping
    ["1234.56", 1234.56],
    ["1234,56", 1234.56],       // decimal comma, no grouping
    ["1,234", 1234],            // grouping only, no decimals
    ["1.234", 1234],            // EU grouping only
    ["$1,234.56", 1234.56],     // leading symbol
    ["1.234,56 €", 1234.56],    // trailing symbol
    ["₹1,23,456.78", 123456.78],
    ["-1,234.56", -1234.56],
    ["(1,234.56)", -1234.56],   // accounting negative
    ["0.00", 0],
  ])("parses %s to %s", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(["", "  ", "N/A", "abc", "-"])("returns null for %s", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test amounts`
Expected: FAIL — cannot resolve `./amounts.js`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/amounts.ts`:

```ts
/**
 * Parse an amount as printed on an invoice into a number.
 *
 * Separator convention is inferred from the string itself rather than assumed,
 * because "1.234" is 1234 in Germany and 1.234 in the US. The rule: whichever
 * of "." or "," appears last is the decimal separator, unless that group has
 * exactly three digits and the other separator also appears — in which case
 * both are grouping separators.
 */
export function parseAmount(raw: string): number | null {
  if (typeof raw !== "string") return null;

  let s = raw.trim();
  if (s === "") return null;

  // Accounting notation: (1,234.56) means negative.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  // Strip currency symbols, codes and whitespace — keep digits, separators, sign.
  s = s.replace(/[^\d.,\-  ]/g, "").replace(/[ \s]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  s = s.replace(/-/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  let normalised: string;
  if (lastDot === -1 && lastComma === -1) {
    normalised = s;
  } else {
    const decimalPos = Math.max(lastDot, lastComma);
    const decimalSep = s[decimalPos]!;
    const tail = s.slice(decimalPos + 1);
    const hasOtherSep = s.slice(0, decimalPos).includes(decimalSep === "." ? "," : ".");

    // A 3-digit tail with another separator present means this is grouping,
    // not a decimal point: "1,234" and "1.234" are both 1234.
    const isGrouping = tail.length === 3 && (hasOtherSep || !/[.,]/.test(s.slice(0, decimalPos)));

    if (isGrouping && !hasOtherSep) {
      normalised = s.replace(/[.,]/g, "");
    } else if (isGrouping) {
      normalised = s.replace(/[.,]/g, "");
    } else {
      const intPart = s.slice(0, decimalPos).replace(/[.,]/g, "");
      normalised = `${intPart}.${tail}`;
    }
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test amounts`
Expected: PASS — 19 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/amounts.ts packages/core/src/amounts.test.ts packages/core/src/index.ts
git commit -m "feat(core): add locale-aware amount parsing"
```

---

### Task 5: Locale-aware date resolution

**Files:**
- Create: `packages/core/src/dates.ts`
- Test: `packages/core/src/dates.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `DateValue` from Task 2
- Produces:
  - `DateHints = { country?: string | null; currency?: string | null }`
  - `resolveDate(raw: string, hints: DateHints): { iso: string | null; ambiguous: boolean }`

`DAY_FIRST_COUNTRIES` and `MONTH_FIRST_COUNTRIES` are module-private.

- [ ] **Step 1: Write the failing test**

`packages/core/src/dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveDate } from "./dates.js";

describe("resolveDate", () => {
  it("resolves an unambiguous ISO date", () => {
    expect(resolveDate("2026-04-03", {})).toEqual({ iso: "2026-04-03", ambiguous: false });
  });

  it("resolves day>12 without needing a hint", () => {
    expect(resolveDate("25/12/2026", {})).toEqual({ iso: "2026-12-25", ambiguous: false });
  });

  it("resolves a spelled month regardless of order", () => {
    expect(resolveDate("3 April 2026", {})).toEqual({ iso: "2026-04-03", ambiguous: false });
    expect(resolveDate("Apr 3, 2026", {})).toEqual({ iso: "2026-04-03", ambiguous: false });
  });

  it("uses country to break a genuine ambiguity", () => {
    expect(resolveDate("03/04/2026", { country: "IN" })).toEqual({ iso: "2026-04-03", ambiguous: false });
    expect(resolveDate("03/04/2026", { country: "US" })).toEqual({ iso: "2026-03-04", ambiguous: false });
  });

  it("falls back to currency when country is absent", () => {
    expect(resolveDate("03/04/2026", { currency: "USD" })).toEqual({ iso: "2026-03-04", ambiguous: false });
    expect(resolveDate("03/04/2026", { currency: "EUR" })).toEqual({ iso: "2026-04-03", ambiguous: false });
  });

  it("returns null iso and flags ambiguity when nothing can break the tie", () => {
    expect(resolveDate("03/04/2026", {})).toEqual({ iso: null, ambiguous: true });
  });

  it("expands two-digit years", () => {
    expect(resolveDate("25/12/26", {})).toEqual({ iso: "2026-12-25", ambiguous: false });
  });

  it("returns null for unparseable input", () => {
    expect(resolveDate("sometime next week", {})).toEqual({ iso: null, ambiguous: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test dates`
Expected: FAIL — cannot resolve `./dates.js`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/dates.ts`:

```ts
export interface DateHints {
  country?: string | null;
  currency?: string | null;
}

export interface ResolvedDate {
  iso: string | null;
  /** True only when the value IS a date but day/month order is undecidable. */
  ambiguous: boolean;
}

const MONTH_FIRST_COUNTRIES = new Set(["US", "PH"]);
const MONTH_FIRST_CURRENCIES = new Set(["USD"]);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

function expandYear(y: number): number {
  if (y >= 100) return y;
  // Invoices are near-present: 00-79 -> 2000s, 80-99 -> 1900s.
  return y < 80 ? 2000 + y : 1900 + y;
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** True when the locale writes month before day. */
function prefersMonthFirst(hints: DateHints): boolean | null {
  const country = hints.country?.trim().toUpperCase();
  if (country) {
    if (MONTH_FIRST_COUNTRIES.has(country)) return true;
    if (country.length === 2) return false; // any other known country: day-first
  }
  const currency = hints.currency?.trim().toUpperCase();
  if (currency) {
    if (MONTH_FIRST_CURRENCIES.has(currency)) return true;
    return false;
  }
  return null;
}

export function resolveDate(raw: string, hints: DateHints): ResolvedDate {
  if (typeof raw !== "string") return { iso: null, ambiguous: false };
  const s = raw.trim();
  if (s === "") return { iso: null, ambiguous: false };

  // ISO 8601 — unambiguous by definition.
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (isoMatch) {
    const [, y, m, d] = isoMatch.map(Number) as [number, number, number, number];
    return valid(y, m, d)
      ? { iso: iso(y, m, d), ambiguous: false }
      : { iso: null, ambiguous: false };
  }

  // Spelled month, either order: "3 April 2026" / "Apr 3, 2026" / "April 3 2026".
  const named = /^(?:(\d{1,2})[\s.,-]+)?([A-Za-z]{3,})[\s.,-]+(?:(\d{1,2})[\s.,-]+)?(\d{2,4})$/.exec(s);
  if (named) {
    const monthKey = named[2]!.slice(0, 3).toLowerCase();
    const month = MONTHS[monthKey];
    if (month) {
      const day = Number(named[1] ?? named[3]);
      const year = expandYear(Number(named[4]));
      if (Number.isFinite(day) && valid(year, month, day)) {
        return { iso: iso(year, month, day), ambiguous: false };
      }
    }
  }

  // Numeric triple with any of / . -
  const numeric = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s);
  if (!numeric) return { iso: null, ambiguous: false };

  const a = Number(numeric[1]);
  const b = Number(numeric[2]);
  const year = expandYear(Number(numeric[3]));

  const dayFirstValid = valid(year, b, a);   // a=day,   b=month
  const monthFirstValid = valid(year, a, b); // a=month, b=day

  if (dayFirstValid && !monthFirstValid) return { iso: iso(year, b, a), ambiguous: false };
  if (monthFirstValid && !dayFirstValid) return { iso: iso(year, a, b), ambiguous: false };
  if (!dayFirstValid && !monthFirstValid) return { iso: null, ambiguous: false };

  // Both readings are valid dates — genuine ambiguity. Break it with locale.
  const monthFirst = prefersMonthFirst(hints);
  if (monthFirst === null) return { iso: null, ambiguous: true };
  return monthFirst
    ? { iso: iso(year, a, b), ambiguous: false }
    : { iso: iso(year, b, a), ambiguous: false };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./amounts.js";
export * from "./dates.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test dates`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dates.ts packages/core/src/dates.test.ts packages/core/src/index.ts
git commit -m "feat(core): add locale-aware date resolution with explicit ambiguity"
```

---

### Task 6: Input pipeline — sniffing, limits, rasterisation

**Files:**
- Create: `packages/core/src/errors.ts`
- Create: `packages/core/src/input.ts`
- Test: `packages/core/src/input.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `InvoiceError` (base), `UnsupportedFileError`, `LimitExceededError`, `ExtractionFailedError`, `ModelRefusalError`
  - `sniffFileType(bytes: Uint8Array): "pdf" | "png" | "jpeg" | "webp" | "gif" | null`
  - `InputLimits = { maxBytes: number; maxPages: number; dpi: number; maxEdge: number }`
  - `DEFAULT_LIMITS: InputLimits`
  - `PreparedInput = { images: string[]; pageCount: number; sourceType: "pdf" | "image" }` — `images` are `data:` URLs
  - `prepareInput(bytes: Uint8Array, limits?: Partial<InputLimits>): Promise<PreparedInput>`

- [ ] **Step 1: Write the failing test**

`packages/core/src/input.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, prepareInput, sniffFileType } from "./input.js";
import { LimitExceededError, UnsupportedFileError } from "./errors.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const GIF = new Uint8Array([...Buffer.from("GIF89a"), 0, 0]);
const PDF = new Uint8Array([...Buffer.from("%PDF-1.7"), 0, 0]);
const WEBP = new Uint8Array([
  ...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"),
]);

describe("sniffFileType", () => {
  it.each([
    [PNG, "png"], [JPEG, "jpeg"], [GIF, "gif"], [PDF, "pdf"], [WEBP, "webp"],
  ])("identifies by magic bytes, not filename", (bytes, expected) => {
    expect(sniffFileType(bytes as Uint8Array)).toBe(expected);
  });

  it("returns null for unknown content", () => {
    expect(sniffFileType(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe("prepareInput", () => {
  it("passes an image through as a single data URL", async () => {
    const result = await prepareInput(PNG);
    expect(result.sourceType).toBe("image");
    expect(result.pageCount).toBe(1);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatch(/^data:image\/png;base64,/);
  });

  it("rejects an unsupported file type before any work", async () => {
    await expect(prepareInput(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toBeInstanceOf(
      UnsupportedFileError,
    );
  });

  it("rejects an oversized upload naming the limit and actual value", async () => {
    const big = new Uint8Array(DEFAULT_LIMITS.maxBytes + 1);
    big.set(PNG, 0);
    const error = await prepareInput(big).catch((e) => e);
    expect(error).toBeInstanceOf(LimitExceededError);
    expect(error.message).toContain(String(DEFAULT_LIMITS.maxBytes));
    expect(error.message).toContain(String(big.byteLength));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test input`
Expected: FAIL — cannot resolve `./input.js`

- [ ] **Step 3: Write minimal implementation**

Add the rasteriser: `pnpm --filter @invoice/core add pdf-to-img@^4.2.0`

> Note: `pdf-to-img` pulls in `@napi-rs/canvas`, which ships prebuilt binaries. No compiler toolchain is needed on Linux or macOS, but this is not pure JS.

`packages/core/src/errors.ts`:

```ts
export class InvoiceError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnsupportedFileError extends InvoiceError {
  constructor(message: string) {
    super(message, "unsupported_file");
  }
}

export class LimitExceededError extends InvoiceError {
  constructor(limitName: string, limit: number, actual: number) {
    super(`${limitName} exceeded: limit ${limit}, actual ${actual}`, "limit_exceeded");
  }
}

export class ModelRefusalError extends InvoiceError {
  constructor(message: string) {
    super(message, "model_refusal");
  }
}

export class ExtractionFailedError extends InvoiceError {
  constructor(message: string, readonly detail?: unknown) {
    super(message, "extraction_failed");
  }
}
```

`packages/core/src/input.ts`:

```ts
import { pdf } from "pdf-to-img";
import { LimitExceededError, UnsupportedFileError } from "./errors.js";

export type FileType = "pdf" | "png" | "jpeg" | "webp" | "gif";

export interface InputLimits {
  maxBytes: number;
  maxPages: number;
  dpi: number;
  maxEdge: number;
}

export const DEFAULT_LIMITS: InputLimits = {
  maxBytes: Number(process.env.INVOICE_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024),
  maxPages: Number(process.env.INVOICE_MAX_PDF_PAGES ?? 20),
  dpi: Number(process.env.INVOICE_RASTER_DPI ?? 150),
  maxEdge: Number(process.env.INVOICE_RASTER_MAX_EDGE ?? 2000),
};

export interface PreparedInput {
  /** One `data:` URL per page. */
  images: string[];
  pageCount: number;
  sourceType: "pdf" | "image";
}

const MIME: Record<Exclude<FileType, "pdf">, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((byte, i) => b[offset + i] === byte);

/**
 * Identify content by magic bytes. Filenames and declared MIME types lie —
 * phone scanner apps routinely emit a JPEG named `.pdf`.
 */
export function sniffFileType(bytes: Uint8Array): FileType | null {
  if (bytes.byteLength < 8) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf";                 // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";                 // GIF8
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "webp";                                                                // RIFF....WEBP
  return null;
}

export async function prepareInput(
  bytes: Uint8Array,
  overrides: Partial<InputLimits> = {},
): Promise<PreparedInput> {
  const limits = { ...DEFAULT_LIMITS, ...overrides };

  if (bytes.byteLength > limits.maxBytes) {
    throw new LimitExceededError("Upload size", limits.maxBytes, bytes.byteLength);
  }

  const type = sniffFileType(bytes);
  if (type === null) {
    throw new UnsupportedFileError(
      "Unrecognised file. Supported: PDF, PNG, JPEG, WebP, GIF.",
    );
  }

  if (type !== "pdf") {
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      images: [`data:${MIME[type]};base64,${base64}`],
      pageCount: 1,
      sourceType: "image",
    };
  }

  // 72 dpi is the PDF user-space unit; scale is the multiplier from that.
  const document = await pdf(Buffer.from(bytes), { scale: limits.dpi / 72 });

  if (document.length > limits.maxPages) {
    throw new LimitExceededError("PDF page count", limits.maxPages, document.length);
  }

  const images: string[] = [];
  for await (const page of document) {
    images.push(`data:image/png;base64,${page.toString("base64")}`);
  }

  return { images, pageCount: images.length, sourceType: "pdf" };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./errors.js";
export * from "./input.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test input`
Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/errors.ts packages/core/src/input.ts packages/core/src/input.test.ts packages/core/src/index.ts packages/core/package.json
git commit -m "feat(core): add input pipeline with byte sniffing and PDF rasterisation"
```

---

### Task 7: Prompt construction

**Files:**
- Create: `packages/core/src/prompt.ts`
- Test: `packages/core/src/prompt.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `FIELD_CATALOG`, `getFieldByKey` (Task 3); `PreparedInput` (Task 6)
- Produces:
  - `SYSTEM_PROMPT: string` — byte-stable across every call
  - `buildMessages(prepared: PreparedInput, requestedFields: string[]): ChatMessage[]`
  - `ChatMessage` — OpenAI chat message shape

- [ ] **Step 1: Write the failing test**

`packages/core/src/prompt.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, buildMessages } from "./prompt.js";

const prepared = {
  images: ["data:image/png;base64,AAAA", "data:image/png;base64,BBBB"],
  pageCount: 2,
  sourceType: "pdf" as const,
};

describe("buildMessages", () => {
  it("puts the stable system prompt first so it can be cached", () => {
    const a = buildMessages(prepared, ["po_number"]);
    const b = buildMessages(prepared, ["seller_tax_id", "custom thing"]);
    expect(a[0]).toEqual(b[0]);
    expect(a[0]!.content).toBe(SYSTEM_PROMPT);
  });

  it("sends one image block per page", () => {
    const [, user] = buildMessages(prepared, []);
    const images = (user!.content as any[]).filter((c) => c.type === "image_url");
    expect(images).toHaveLength(2);
    expect(images[0].image_url.url).toBe("data:image/png;base64,AAAA");
  });

  it("describes a known field by its catalog label, not its raw key", () => {
    const [, user] = buildMessages(prepared, ["seller_tax_id"]);
    const text = (user!.content as any[]).find((c) => c.type === "text").text;
    expect(text).toContain("seller_tax_id");
    expect(text).toContain("VAT number, GSTIN, EIN or equivalent");
  });

  it("passes an unknown field through verbatim as a custom request", () => {
    const [, user] = buildMessages(prepared, ["approver signature"]);
    const text = (user!.content as any[]).find((c) => c.type === "text").text;
    expect(text).toContain("approver signature");
    expect(text).toContain("custom");
  });

  it("still asks for full extraction when no fields are requested", () => {
    const [, user] = buildMessages(prepared, []);
    const text = (user!.content as any[]).find((c) => c.type === "text").text;
    expect(text).toMatch(/no specific fields/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test prompt`
Expected: FAIL — cannot resolve `./prompt.js`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/prompt.ts`:

```ts
import { getFieldByKey } from "./fields.js";
import type { PreparedInput } from "./input.js";

export interface ChatMessage {
  role: "system" | "user";
  content: string | Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  >;
}

/**
 * Stable across every request so it forms a cacheable prefix.
 * Never interpolate per-request data into this string.
 */
export const SYSTEM_PROMPT = `You extract structured data from invoices.

You will be shown one or more images. They may be a digital invoice, a scan, or \
a photograph, in any language and from any country. Read every page before answering.

Rules:

1. Report only what is on the document. Never infer, calculate, or invent a value. \
If a field is not printed, return null for it.

2. Amounts: return both forms. "raw" is exactly as printed, including the original \
grouping and decimal separators and excluding the currency symbol. "numeric" is your \
best numeric reading of it. If you cannot read it, both are null.

3. Dates: return "raw" exactly as printed. For "iso", give YYYY-MM-DD only when the \
day/month order is certain. When a numeric date could be read either way and nothing \
on the document settles it, set iso to null and ambiguous to true. Never guess an order.

4. Line items: one entry per billed line. Do not include subtotal, tax, or total rows \
as line items — those belong in amounts.

5. Tax breakdown: one entry per distinct tax rate shown. For Indian invoices, CGST and \
SGST are separate entries.

6. Document type: use "unknown" if this is not an invoice, credit note, receipt or \
proforma. Do not force a classification.

7. Requested fields: for each field listed in the user message, add an entry to \
"requested". Use status "found" with a stringified value when present; "not_found" \
when the document genuinely does not contain it, with a one-sentence reason; \
"unreadable" when it is present but illegible, with a reason describing what obscures it. \
Never omit a requested field, and never mark something "found" that you inferred rather \
than read.`;

export function buildMessages(
  prepared: PreparedInput,
  requestedFields: string[],
): ChatMessage[] {
  const lines: string[] = [];

  if (requestedFields.length === 0) {
    lines.push(
      "The caller requested no specific fields. Extract the full canonical structure " +
        "and return an empty `requested` array.",
    );
  } else {
    lines.push("The caller requires these fields. Each must appear in `requested`:");
    lines.push("");
    for (const key of requestedFields) {
      const known = getFieldByKey(key);
      lines.push(
        known
          ? `- ${known.key} (canonical) — ${known.label}: ${known.description}`
          : `- ${key} (custom) — locate this on the document; it is not part of the standard schema`,
      );
    }
  }

  lines.push("");
  lines.push(
    `This document has ${prepared.pageCount} page(s), supplied in order below.`,
  );

  return [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: lines.join("\n") },
        ...prepared.images.map((url) => ({
          type: "image_url" as const,
          image_url: { url },
        })),
      ],
    },
  ];
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./prompt.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test prompt`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/prompt.ts packages/core/src/prompt.test.ts packages/core/src/index.ts
git commit -m "feat(core): add prompt builder with stable cacheable prefix"
```

---

### Task 8: OpenRouter client

**Files:**
- Create: `packages/core/src/llm.ts`
- Test: `packages/core/src/llm.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ChatMessage` (Task 7); `ModelOutputSchema` (Task 2); `ModelRefusalError`, `ExtractionFailedError` (Task 6)
- Produces:
  - `LlmConfig = { apiKey: string; models: string[]; baseURL: string; maxTokens: number }`
  - `LlmResponse = { content: string; model: string; promptTokens: number | null; completionTokens: number | null }`
  - `defaultConfig(): LlmConfig`
  - `createClient(config?: Partial<LlmConfig>): LlmClient`
  - `LlmClient.complete(messages: ChatMessage[]): Promise<LlmResponse>`

- [ ] **Step 1: Write the failing test**

`packages/core/src/llm.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createClient } from "./llm.js";
import { ModelRefusalError } from "./errors.js";

const ok = {
  model: "openai/gpt-5",
  choices: [{ message: { content: '{"canonical":{},"requested":[]}' }, finish_reason: "stop" }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

function clientWithResponse(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  const client = createClient({ apiKey: "test", models: ["openai/gpt-5", "openai/gpt-4.1"] });
  (client as any).openai = { chat: { completions: { create } } };
  return { client, create };
}

describe("llm client", () => {
  it("sends strict json_schema and pins require_parameters", async () => {
    const { client, create } = clientWithResponse(ok);
    await client.complete([{ role: "user", content: "hi" }]);

    const body = create.mock.calls[0]![0];
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider.require_parameters).toBe(true);
  });

  it("passes the full model list so OpenRouter can fail over", async () => {
    const { client, create } = clientWithResponse(ok);
    await client.complete([{ role: "user", content: "hi" }]);
    expect(create.mock.calls[0]![0].models).toEqual(["openai/gpt-5", "openai/gpt-4.1"]);
  });

  it("returns content and usage from the response", async () => {
    const { client } = clientWithResponse(ok);
    const result = await client.complete([{ role: "user", content: "hi" }]);
    expect(result.content).toBe('{"canonical":{},"requested":[]}');
    expect(result.promptTokens).toBe(100);
  });

  it("raises a typed error on refusal rather than returning empty content", async () => {
    const { client } = clientWithResponse({
      ...ok,
      choices: [{ message: { refusal: "declined" }, finish_reason: "content_filter" }],
    });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(
      ModelRefusalError,
    );
  });

  it("raises when the model returns no content", async () => {
    const { client } = clientWithResponse({ ...ok, choices: [] });
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow();
  });

  it("retries once at a higher token ceiling when output is truncated", async () => {
    const truncated = {
      ...ok,
      choices: [{ message: { content: '{"canonical":' }, finish_reason: "length" }],
    };
    const create = vi.fn().mockResolvedValueOnce(truncated).mockResolvedValueOnce(ok);
    const client = createClient({ apiKey: "test", models: ["openai/gpt-5"], maxTokens: 16000 });
    (client as any).openai = { chat: { completions: { create } } };

    const result = await client.complete([{ role: "user", content: "hi" }]);

    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![0].max_tokens).toBe(16000);
    expect(create.mock.calls[1]![0].max_tokens).toBe(32000);
    expect(result.content).toBe('{"canonical":{},"requested":[]}');
  });

  it("gives up after one truncation retry rather than looping", async () => {
    const truncated = {
      ...ok,
      choices: [{ message: { content: "{" }, finish_reason: "length" }],
    };
    const { client, create } = clientWithResponse(truncated);
    create.mockResolvedValue(truncated);
    await expect(client.complete([{ role: "user", content: "hi" }])).rejects.toThrow(/truncat/i);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test llm`
Expected: FAIL — cannot resolve `./llm.js`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/llm.ts`:

```ts
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ExtractionFailedError, ModelRefusalError } from "./errors.js";
import type { ChatMessage } from "./prompt.js";
import { ModelOutputSchema } from "./schema.js";

export interface LlmConfig {
  apiKey: string;
  models: string[];
  baseURL: string;
  maxTokens: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export function defaultConfig(): LlmConfig {
  return {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    models: [
      process.env.INVOICE_MODEL_PRIMARY ?? "openai/gpt-5",
      process.env.INVOICE_MODEL_FALLBACK ?? "openai/gpt-4.1",
    ],
    baseURL: "https://openrouter.ai/api/v1",
    maxTokens: 16000,
  };
}

export class LlmClient {
  private openai: OpenAI;

  constructor(private config: LlmConfig) {
    this.openai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  }

  async complete(messages: ChatMessage[]): Promise<LlmResponse> {
    // A long invoice (300 line items) can exhaust the ceiling. Retry once at
    // double, then stop — an unbounded loop on a genuinely huge document is worse
    // than a clear error.
    let response = await this.request(messages, this.config.maxTokens);
    if (response.choices?.[0]?.finish_reason === "length") {
      response = await this.request(messages, this.config.maxTokens * 2);
      if (response.choices?.[0]?.finish_reason === "length") {
        throw new ExtractionFailedError(
          `Model output truncated at ${this.config.maxTokens * 2} tokens. ` +
            "The document may have more line items than one response can hold.",
        );
      }
    }

    const choice = response.choices?.[0];
    if (!choice) {
      throw new ExtractionFailedError("Model returned no choices", response);
    }
    if (choice.message?.refusal) {
      throw new ModelRefusalError(`Model declined: ${choice.message.refusal}`);
    }
    const content = choice.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new ExtractionFailedError(
        `Model returned no content (finish_reason: ${choice.finish_reason})`,
        response,
      );
    }

    return {
      content,
      model: response.model ?? this.config.models[0]!,
      promptTokens: response.usage?.prompt_tokens ?? null,
      completionTokens: response.usage?.completion_tokens ?? null,
    };
  }

  private async request(messages: ChatMessage[], maxTokens: number): Promise<any> {
    return this.openai.chat.completions.create({
      model: this.config.models[0]!,
      // OpenRouter-specific: ordered failover list.
      models: this.config.models,
      // Without this, OpenRouter may route to a provider that ignores response_format.
      provider: { require_parameters: true },
      max_tokens: maxTokens,
      messages: messages as any,
      response_format: zodResponseFormat(ModelOutputSchema, "invoice_extraction"),
    } as any);
  }
}

export function createClient(overrides: Partial<LlmConfig> = {}): LlmClient {
  return new LlmClient({ ...defaultConfig(), ...overrides });
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./llm.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test llm`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/llm.ts packages/core/src/llm.test.ts packages/core/src/index.ts
git commit -m "feat(core): add OpenRouter client with strict structured outputs"
```

---

### Task 9: Reconciliation

**Files:**
- Create: `packages/core/src/reconcile.ts`
- Test: `packages/core/src/reconcile.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `CanonicalInvoice`, `Warning` (Task 2); `parseAmount` (Task 4); `resolveDate` (Task 5)
- Produces: `reconcile(canonical: CanonicalInvoice): { canonical: CanonicalInvoice; warnings: Warning[] }` — returns a corrected copy; never mutates its argument

- [ ] **Step 1: Write the failing test**

`packages/core/src/reconcile.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { reconcile } from "./reconcile.js";
import type { CanonicalInvoice } from "./schema.js";

const base = (): CanonicalInvoice =>
  ({
    document: {
      type: "invoice", invoice_number: "INV-1", po_number: null, reference: null,
      issue_date: null, due_date: null,
      service_period_start: null, service_period_end: null,
    },
    seller: null, buyer: null, currency: "USD",
    amounts: {
      subtotal: { numeric: 100, raw: "100.00" }, discount_total: null,
      tax_total: { numeric: 10, raw: "10.00" }, shipping: null, rounding: null,
      total: { numeric: 110, raw: "110.00" }, amount_paid: null, amount_due: null,
    },
    tax_breakdown: [], line_items: [], payment: null, notes: null,
  }) as CanonicalInvoice;

describe("reconcile", () => {
  it("emits no warnings when totals agree", () => {
    expect(reconcile(base()).warnings).toHaveLength(0);
  });

  it("warns when subtotal plus tax does not equal total", () => {
    const inv = base();
    inv.amounts.total = { numeric: 999, raw: "999.00" };
    const { warnings } = reconcile(inv);
    expect(warnings.map((w) => w.code)).toContain("total_mismatch");
  });

  it("tolerates rounding differences under one currency unit", () => {
    const inv = base();
    inv.amounts.total = { numeric: 110.01, raw: "110.01" };
    expect(reconcile(inv).warnings).toHaveLength(0);
  });

  it("warns when line item totals do not sum to subtotal", () => {
    const inv = base();
    inv.line_items = [
      { line_number: 1, description: "A", sku: null, hsn_sac: null, quantity: 1,
        unit: null, unit_price: null, discount: null, tax_rate: null,
        tax_amount: null, line_total: { numeric: 40, raw: "40.00" } },
    ];
    const { warnings } = reconcile(inv);
    expect(warnings.map((w) => w.code)).toContain("line_items_mismatch");
  });

  it("overrides a model date reading that disagrees with deterministic resolution", () => {
    const inv = base();
    inv.seller = { name: "X", legal_name: null, address: { line1: null, line2: null,
      city: null, state: null, postal_code: null, country: "US" }, tax_id: null,
      registration_number: null, email: null, phone: null, website: null };
    // Model claimed day-first; seller is US, so month-first is correct.
    inv.document.issue_date = { raw: "03/04/2026", iso: "2026-04-03", ambiguous: false };

    const { canonical, warnings } = reconcile(inv);
    expect(canonical.document.issue_date!.iso).toBe("2026-03-04");
    expect(warnings.map((w) => w.code)).toContain("date_corrected");
  });

  it("flags a date it cannot resolve, replacing the model's guess with null", () => {
    const inv = base();
    inv.document.issue_date = { raw: "03/04/2026", iso: "2026-03-04", ambiguous: false };
    const { canonical, warnings } = reconcile(inv);
    expect(canonical.document.issue_date!.iso).toBeNull();
    expect(canonical.document.issue_date!.ambiguous).toBe(true);
    expect(warnings.map((w) => w.code)).toContain("date_ambiguous");
  });

  it("corrects a numeric that disagrees with its own raw string", () => {
    const inv = base();
    // Model misread EU grouping: "1.234,56" is 1234.56, not 1.23456
    inv.amounts.total = { numeric: 1.23456, raw: "1.234,56" };
    const { canonical, warnings } = reconcile(inv);
    expect(canonical.amounts.total!.numeric).toBe(1234.56);
    expect(warnings.map((w) => w.code)).toContain("amount_corrected");
  });

  it("leaves a numeric alone when it agrees with its raw string", () => {
    const inv = base();
    inv.amounts.total = { numeric: 1234.56, raw: "1,234.56" };
    const { canonical, warnings } = reconcile(inv);
    expect(canonical.amounts.total!.numeric).toBe(1234.56);
    expect(warnings.map((w) => w.code)).not.toContain("amount_corrected");
  });

  it("does not mutate its argument", () => {
    const inv = base();
    inv.amounts.total = { numeric: 999, raw: "999.00" };
    reconcile(inv);
    expect(inv.amounts.total!.numeric).toBe(999);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test reconcile`
Expected: FAIL — cannot resolve `./reconcile.js`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/reconcile.ts`:

```ts
import { parseAmount } from "./amounts.js";
import { resolveDate } from "./dates.js";
import type { CanonicalInvoice, DateValue, Money, Warning } from "./schema.js";

/** Invoices routinely round to the minor unit; anything under 1.0 is not a discrepancy. */
const TOLERANCE = 1.0;

const DATE_PATHS: Array<keyof CanonicalInvoice["document"]> = [
  "issue_date",
  "due_date",
  "service_period_start",
  "service_period_end",
];

export function reconcile(input: CanonicalInvoice): {
  canonical: CanonicalInvoice;
  warnings: Warning[];
} {
  const canonical: CanonicalInvoice = structuredClone(input);
  const warnings: Warning[] = [];

  const warn = (code: string, message: string, severity: Warning["severity"] = "warn") =>
    warnings.push({ code, message, severity });

  // --- Dates: code owns resolution; the model's reading is only a hint. ---
  const hints = {
    country: canonical.seller?.address?.country ?? canonical.buyer?.address?.country ?? null,
    currency: canonical.currency,
  };

  for (const key of DATE_PATHS) {
    const value = canonical.document[key] as DateValue | null;
    if (!value?.raw) continue;

    const resolved = resolveDate(value.raw, hints);

    if (resolved.ambiguous) {
      if (value.iso !== null) {
        warn(
          "date_ambiguous",
          `${key} "${value.raw}" could be read as either day-first or month-first and ` +
            `nothing on the document settles it; the model's guess was discarded.`,
        );
      }
      canonical.document[key] = { raw: value.raw, iso: null, ambiguous: true } as never;
      continue;
    }

    if (resolved.iso !== null && resolved.iso !== value.iso) {
      warn(
        "date_corrected",
        `${key} "${value.raw}" resolved to ${resolved.iso}; the model reported ${value.iso}.`,
      );
    }
    canonical.document[key] = {
      raw: value.raw,
      iso: resolved.iso,
      ambiguous: false,
    } as never;
  }

  // --- Arithmetic ---
  const { subtotal, tax_total, total, shipping, discount_total, rounding } = canonical.amounts;

  if (subtotal?.numeric != null && total?.numeric != null) {
    const expected =
      subtotal.numeric +
      (tax_total?.numeric ?? 0) +
      (shipping?.numeric ?? 0) +
      (rounding?.numeric ?? 0) -
      (discount_total?.numeric ?? 0);
    if (Math.abs(expected - total.numeric) > TOLERANCE) {
      warn(
        "total_mismatch",
        `Subtotal and tax imply a total of ${expected.toFixed(2)}, ` +
          `but the document states ${total.numeric.toFixed(2)}.`,
      );
    }
  }

  if (canonical.line_items.length > 0 && subtotal?.numeric != null) {
    const lineSum = canonical.line_items.reduce(
      (acc, item) => acc + (item.line_total?.numeric ?? 0),
      0,
    );
    if (Math.abs(lineSum - subtotal.numeric) > TOLERANCE) {
      warn(
        "line_items_mismatch",
        `Line items sum to ${lineSum.toFixed(2)}, ` +
          `but the stated subtotal is ${subtotal.numeric.toFixed(2)}.`,
      );
    }
  }

  if (canonical.tax_breakdown.length > 0 && tax_total?.numeric != null) {
    const taxSum = canonical.tax_breakdown.reduce(
      (acc, line) => acc + (line.tax_amount?.numeric ?? 0),
      0,
    );
    if (Math.abs(taxSum - tax_total.numeric) > TOLERANCE) {
      warn(
        "tax_breakdown_mismatch",
        `Tax breakdown sums to ${taxSum.toFixed(2)}, ` +
          `but the stated tax total is ${tax_total.numeric.toFixed(2)}.`,
      );
    }
  }

  if (canonical.document.type === "unknown") {
    warn(
      "not_an_invoice",
      "This document does not appear to be an invoice, credit note, receipt or proforma.",
      "info",
    );
  }

  return { canonical, warnings };
}
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./reconcile.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test reconcile`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reconcile.ts packages/core/src/reconcile.test.ts packages/core/src/index.ts
git commit -m "feat(core): add arithmetic and date reconciliation warnings"
```

---

### Task 10: extract() orchestration with repair loop

**Files:**
- Create: `packages/core/src/extract.ts`
- Test: `packages/core/src/extract.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–9
- Produces:
  - `ExtractInput = { bytes: Uint8Array; requestedFields?: string[]; limits?: Partial<InputLimits>; client?: LlmClient }`
  - `extract(input: ExtractInput): Promise<ExtractionResult>`

- [ ] **Step 1: Write the failing test**

`packages/core/src/extract.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { extract } from "./extract.js";
import { ExtractionFailedError } from "./errors.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const validOutput = {
  canonical: {
    document: { type: "invoice", invoice_number: "INV-1", po_number: null, reference: null,
      issue_date: null, due_date: null, service_period_start: null, service_period_end: null },
    seller: null, buyer: null, currency: "USD",
    amounts: { subtotal: { numeric: 100, raw: "100.00" }, discount_total: null,
      tax_total: { numeric: 10, raw: "10.00" }, shipping: null, rounding: null,
      total: { numeric: 110, raw: "110.00" }, amount_paid: null, amount_due: null },
    tax_breakdown: [], line_items: [], payment: null, notes: null,
  },
  requested: [],
};

const stubClient = (...responses: string[]) => {
  const complete = vi.fn();
  for (const content of responses) {
    complete.mockResolvedValueOnce({
      content, model: "openai/gpt-5", promptTokens: 10, completionTokens: 5,
    });
  }
  return { complete } as any;
};

describe("extract", () => {
  it("returns a validated result on the happy path", async () => {
    const result = await extract({
      bytes: PNG, client: stubClient(JSON.stringify(validOutput)),
    });
    expect(result.canonical.document.invoice_number).toBe("INV-1");
    expect(result.metadata.repaired).toBe(false);
    expect(result.metadata.pageCount).toBe(1);
  });

  it("repairs once when the first response fails validation", async () => {
    const client = stubClient('{"canonical":{"nonsense":true}}', JSON.stringify(validOutput));
    const result = await extract({ bytes: PNG, client });
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(result.metadata.repaired).toBe(true);
  });

  it("fails with a typed error when the repair also fails", async () => {
    const client = stubClient("{}", "{}");
    await expect(extract({ bytes: PNG, client })).rejects.toBeInstanceOf(ExtractionFailedError);
    expect(client.complete).toHaveBeenCalledTimes(2);
  });

  it("fails with a typed error on unparseable JSON", async () => {
    const client = stubClient("not json at all", "still not json");
    await expect(extract({ bytes: PNG, client })).rejects.toBeInstanceOf(ExtractionFailedError);
  });

  it("guarantees an entry for every requested field even if the model omits it", async () => {
    const result = await extract({
      bytes: PNG,
      requestedFields: ["po_number", "approver name"],
      client: stubClient(JSON.stringify(validOutput)),
    });
    const keys = result.requested.map((r) => r.key);
    expect(keys).toEqual(["po_number", "approver name"]);
    expect(result.requested.every((r) => r.status === "not_found")).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("requested_field_missing");
  });

  it("attaches reconciliation warnings to the result", async () => {
    const broken = structuredClone(validOutput);
    broken.canonical.amounts.total = { numeric: 999, raw: "999.00" };
    const result = await extract({ bytes: PNG, client: stubClient(JSON.stringify(broken)) });
    expect(result.warnings.map((w) => w.code)).toContain("total_mismatch");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/core test extract`
Expected: FAIL — cannot resolve `./extract.js`

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/extract.ts`:

```ts
import { ExtractionFailedError } from "./errors.js";
import { getFieldByKey } from "./fields.js";
import { DEFAULT_LIMITS, prepareInput, type InputLimits } from "./input.js";
import { createClient, type LlmClient } from "./llm.js";
import { buildMessages, type ChatMessage } from "./prompt.js";
import { reconcile } from "./reconcile.js";
import {
  ModelOutputSchema,
  type ExtractionResult,
  type ModelOutput,
  type RequestedField,
  type Warning,
} from "./schema.js";

export interface ExtractInput {
  bytes: Uint8Array;
  requestedFields?: string[];
  limits?: Partial<InputLimits>;
  /** Injectable for tests; defaults to a real OpenRouter client. */
  client?: LlmClient;
}

function parseAndValidate(content: string): ModelOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ExtractionFailedError("Model output was not valid JSON");
  }
  const result = ModelOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionFailedError(
      "Model output did not match the schema",
      result.error.issues.slice(0, 10),
    );
  }
  return result.data;
}

/**
 * Guarantee one entry per requested field. The prompt asks for this, but the
 * contract is ours to keep — a caller that ticked a box must get an answer.
 */
function completeRequested(
  requested: RequestedField[],
  requestedFields: string[],
  warnings: Warning[],
): RequestedField[] {
  const byKey = new Map(requested.map((r) => [r.key, r]));
  const missing: string[] = [];

  const complete = requestedFields.map((key): RequestedField => {
    const existing = byKey.get(key);
    if (existing) return existing;
    missing.push(key);
    return {
      key,
      status: "not_found",
      value: null,
      source: getFieldByKey(key) ? "canonical" : "custom",
      reason: "The model did not report on this field; treated as absent.",
    };
  });

  if (missing.length > 0) {
    warnings.push({
      code: "requested_field_missing",
      message: `The model omitted ${missing.length} requested field(s): ${missing.join(", ")}.`,
      severity: "warn",
    });
  }
  return complete;
}

export async function extract(input: ExtractInput): Promise<ExtractionResult> {
  const startedAt = Date.now();
  const requestedFields = input.requestedFields ?? [];
  const client = input.client ?? createClient();

  const prepared = await prepareInput(input.bytes, input.limits ?? {});
  const messages = buildMessages(prepared, requestedFields);

  let response = await client.complete(messages);
  let model: ModelOutput;
  let repaired = false;

  try {
    model = parseAndValidate(response.content);
  } catch (first) {
    if (!(first instanceof ExtractionFailedError)) throw first;

    repaired = true;
    const repairMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content:
          "Your previous response did not conform to the required schema.\n\n" +
          `Problem: ${first.message}\n` +
          `Detail: ${JSON.stringify(first.detail ?? null)}\n\n` +
          "Return the same extraction again, conforming exactly to the schema. " +
          "Do not change any value you read from the document — only fix the structure.",
      },
    ];
    response = await client.complete(repairMessages);
    model = parseAndValidate(response.content); // throws ExtractionFailedError if still bad
  }

  const { canonical, warnings } = reconcile(model.canonical);
  const requested = completeRequested(model.requested, requestedFields, warnings);

  return {
    canonical,
    requested,
    warnings,
    metadata: {
      model: response.model,
      pageCount: prepared.pageCount,
      sourceType: prepared.sourceType,
      latencyMs: Date.now() - startedAt,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      repaired,
    },
  };
}

export { DEFAULT_LIMITS };
```

Append to `packages/core/src/index.ts`:

```ts
export * from "./extract.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @invoice/core test`
Expected: PASS — all suites green (approximately 46 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/extract.ts packages/core/src/extract.test.ts packages/core/src/index.ts
git commit -m "feat(core): add extract orchestration with schema repair loop"
```

---

### Task 11: Benchmark harness

**Files:**
- Create: `bench/package.json`, `bench/run.ts`, `bench/accuracy.ts`, `bench/README.md`
- Create: `bench/fixtures/.gitkeep`
- Test: `bench/accuracy.test.ts`
- Modify: root `package.json` (add `bench` script)

**Interfaces:**
- Consumes: `extract`, `FIELD_CATALOG`, `resolvePath` from `@invoice/core`
- Produces:
  - `flatten(obj: unknown, prefix?: string): Map<string, string>`
  - `compareFields(expected: unknown, actual: unknown): FieldComparison[]`
  - `FieldComparison = { path: string; expected: string | null; actual: string | null; match: boolean }`

**Fixture layout:** `bench/fixtures/<name>/input.{pdf,png,jpg}` alongside `bench/fixtures/<name>/expected.json`. Input files are gitignored (real invoices are confidential); `expected.json` is committed.

- [ ] **Step 1: Write the failing test**

`bench/accuracy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareFields, flatten } from "./accuracy.js";

describe("flatten", () => {
  it("flattens nested objects to dotted paths", () => {
    const flat = flatten({ a: { b: "x" }, c: 1 });
    expect(flat.get("a.b")).toBe("x");
    expect(flat.get("c")).toBe("1");
  });

  it("indexes array entries", () => {
    expect(flatten({ items: [{ v: 1 }, { v: 2 }] }).get("items.1.v")).toBe("2");
  });

  it("skips nulls so absent fields are not scored as values", () => {
    expect(flatten({ a: null }).has("a")).toBe(false);
  });
});

describe("compareFields", () => {
  it("marks matching values", () => {
    const [row] = compareFields({ a: "x" }, { a: "x" });
    expect(row!.match).toBe(true);
  });

  it("marks differing values", () => {
    const [row] = compareFields({ a: "x" }, { a: "y" });
    expect(row!.match).toBe(false);
    expect(row!.actual).toBe("y");
  });

  it("reports an expected field the extraction missed entirely", () => {
    const [row] = compareFields({ a: "x" }, {});
    expect(row!.match).toBe(false);
    expect(row!.actual).toBeNull();
  });

  it("ignores extra fields the fixture does not assert", () => {
    expect(compareFields({ a: "x" }, { a: "x", b: "extra" })).toHaveLength(1);
  });

  it("compares numbers and numeric strings as equal", () => {
    expect(compareFields({ a: 110 }, { a: "110" })[0]!.match).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @invoice/bench test`
Expected: FAIL — cannot resolve `./accuracy.js`

- [ ] **Step 3: Write minimal implementation**

`bench/package.json`:

```json
{
  "name": "@invoice/bench",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "bench": "tsx run.ts"
  },
  "dependencies": {
    "@invoice/core": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0"
  }
}
```

`bench/accuracy.ts`:

```ts
export interface FieldComparison {
  path: string;
  expected: string | null;
  actual: string | null;
  match: boolean;
}

/** Flatten to dotted paths, dropping nulls so absent fields are not scored. */
export function flatten(value: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();

  const walk = (node: unknown, path: string): void => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, path ? `${path}.${i}` : String(i)));
      return;
    }
    if (typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        walk(child, path ? `${path}.${key}` : key);
      }
      return;
    }
    out.set(path, String(node));
  };

  walk(value, prefix);
  return out;
}

const equivalent = (a: string, b: string): boolean => {
  if (a === b) return true;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
};

/** Score only what the fixture asserts. Extra extracted fields are not penalised. */
export function compareFields(expected: unknown, actual: unknown): FieldComparison[] {
  const want = flatten(expected);
  const got = flatten(actual);

  return [...want.entries()].map(([path, expectedValue]) => {
    const actualValue = got.get(path) ?? null;
    return {
      path,
      expected: expectedValue,
      actual: actualValue,
      match: actualValue !== null && equivalent(expectedValue, actualValue),
    };
  });
}
```

`bench/run.ts`:

```ts
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { extract } from "@invoice/core";
import { compareFields, type FieldComparison } from "./accuracy.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

async function findInput(dir: string): Promise<string | null> {
  for (const name of await readdir(dir)) {
    if (/^input\.(pdf|png|jpe?g|webp|gif)$/i.test(name)) return join(dir, name);
  }
  return null;
}

async function main(): Promise<void> {
  const names = (await readdir(FIXTURES)).filter((n) => !n.startsWith("."));
  if (names.length === 0) {
    console.error("No fixtures found. See bench/README.md for the expected layout.");
    process.exit(1);
  }

  const perField = new Map<string, { hit: number; total: number }>();
  let fixtureCount = 0;

  for (const name of names) {
    const dir = join(FIXTURES, name);
    if (!(await stat(dir)).isDirectory()) continue;

    const inputPath = await findInput(dir);
    if (!inputPath) {
      console.warn(`skip ${name}: no input file`);
      continue;
    }

    const expected = JSON.parse(await readFile(join(dir, "expected.json"), "utf8"));
    const bytes = new Uint8Array(await readFile(inputPath));

    const started = Date.now();
    let rows: FieldComparison[];
    try {
      const result = await extract({
        bytes,
        requestedFields: expected.requested_fields ?? [],
      });
      rows = compareFields(expected.canonical, result.canonical);
    } catch (error) {
      console.log(`✗ ${name}: ${(error as Error).message}`);
      continue;
    }

    fixtureCount += 1;
    const hits = rows.filter((r) => r.match).length;
    console.log(
      `${hits === rows.length ? "✓" : "~"} ${name}: ${hits}/${rows.length} fields ` +
        `(${Date.now() - started}ms)`,
    );
    for (const row of rows.filter((r) => !r.match)) {
      console.log(`    ${row.path}: expected ${row.expected}, got ${row.actual}`);
    }

    for (const row of rows) {
      const key = row.path.replace(/\.\d+\./g, ".*."); // collapse array indices
      const entry = perField.get(key) ?? { hit: 0, total: 0 };
      entry.total += 1;
      if (row.match) entry.hit += 1;
      perField.set(key, entry);
    }
  }

  console.log(`\nPer-field accuracy across ${fixtureCount} fixture(s):\n`);
  const sorted = [...perField.entries()].sort(
    (a, b) => a[1].hit / a[1].total - b[1].hit / b[1].total,
  );
  for (const [path, { hit, total }] of sorted) {
    const pct = ((hit / total) * 100).toFixed(0);
    console.log(`  ${pct.padStart(3)}%  ${path}  (${hit}/${total})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

`bench/README.md`:

```markdown
# Benchmark harness

Measures per-field extraction accuracy against real invoices.

## Layout

    bench/fixtures/<name>/input.pdf      # or .png / .jpg — gitignored
    bench/fixtures/<name>/expected.json  # committed

`expected.json` asserts only the fields you care about. Anything you omit is
not scored, so start with the fields that matter and grow the fixture over time.

    {
      "requested_fields": ["po_number", "seller_tax_id"],
      "canonical": {
        "document": { "invoice_number": "INV-2026-0041" },
        "currency": "INR",
        "amounts": { "total": { "numeric": 118000 } }
      }
    }

## Running

    export OPENROUTER_API_KEY=...
    pnpm bench

Output is per-fixture pass/fail plus a per-field accuracy table sorted worst
first — that ordering is the point. It tells you where to spend prompt effort,
and it is how you compare two models honestly.

## Seeding

Aim for 10–15 real invoices spanning: clean digital PDF, scanned, phone photo,
multi-currency, GST with line items, no line items, non-English.
Synthetic invoices will not surface the failure modes that matter.
```

`bench/fixtures/.gitkeep`: (empty file)

Add to root `package.json` scripts: `"bench": "pnpm --filter @invoice/bench bench"`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm --filter @invoice/bench test`
Expected: PASS — 8 tests

- [ ] **Step 5: Commit**

```bash
git add bench/ package.json pnpm-lock.yaml
git commit -m "feat(bench): add per-field accuracy harness"
```

---

## Definition of done

- `pnpm test` green across the workspace (~54 tests)
- `pnpm typecheck` clean
- `extract()` callable from any workspace package with bytes and a field list
- `pnpm bench` runs against fixtures and prints a per-field accuracy table
- No provider-specific code outside `llm.ts`

## Follow-on plans

1. **Web platform** — Next.js upload UI, `POST /api/extract`, results view, Prisma persistence
2. **MCP server** — `extract_invoice` tool over stdio
