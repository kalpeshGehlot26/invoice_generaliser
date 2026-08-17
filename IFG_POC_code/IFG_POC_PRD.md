# POC PRD: Invoice Ingestion and Pre-Funding Control Engine

**Client (prospect):** The Interface Financial Group (IFG), digital invoice finance and supply chain finance, Bethesda MD, with UK and Australian operations.
**Owner:** Nishant (Codiste)
**Version:** 1.0, 17 August 2026
**Status:** Pre-meeting. Build the demo-grade slice now; the full POC starts only after IFG provides a document sample.
**Working code already in repo:** `ifg_poc/engine.py`, `ifg_poc/samples.py`, `ifg_poc/run.py`, `ifg_poc/build_demo.py`

---

## 1. Why this exists, in one paragraph

IFG already built invoice extraction with Google Cloud (joint whitepaper dated 15 May 2019 plus a Google Cloud blog post on 4 June 2019, co-authored by their Chief Financial Engineer Vishnu Kumar; a further document extraction PDF appears on their site dated October 2023 but its contents are unverified) and already outsources predictive ML to ai1 Technologies (arXiv 2602.15248, February 2026). So we are **not** selling extraction. We are selling the deterministic layer that sits between extraction and the funding decision: arithmetic and tax validation, master-data and PO matching, remit-to change detection, payee-versus-seller assignment detection, duplicate fingerprinting, clearance-regime awareness, hybrid-PDF divergence detection, calibrated confidence gating, and a full per-field audit trail. That layer is model-agnostic, portable, auditable, and it is where straight-through-processing rate actually comes from.

**The design principle to hold onto:** the extractor is a replaceable component behind a schema. The control layer is the product.

---

## 2. Goals and non-goals

### Goals

| # | Goal | Measured how |
|---|---|---|
| G1 | Ingest an invoice from any of six channels and emit one normalised schema | Round-trip test per channel |
| G2 | Run every deterministic control and emit findings with severity, control family, and affected fields | Golden-file test per rule |
| G3 | Route each document to auto-fund, review, or block with an explainable risk score | Decision matrix test |
| G4 | Emit a complete audit record per extracted field: source hash, page, bounding box, model and prompt version, confidence, reviewer identity and timestamp | Audit-record schema validation |
| G5 | Measure extraction quality on a sealed ground-truth set, at document level and field-tier level, including silent-error rate | Eval harness report |
| G6 | Cost per 1,000 invoices reported for both the cloud path and the self-hosted path | Cost telemetry per run |

### Non-goals for the POC

- No credit decisioning, no dilution prediction, no pricing. That is IFG's and ai1's territory. Touching it starts a fight we do not need.
- No debtor confirmation orchestration. Phase 2 at the earliest, and only if IFG says debtor verification is the bottleneck.
- No production integration with IFG's decision engine, client portal or Goldman Sachs virtual account provisioning.
- No attempt to beat any published benchmark. We measure on IFG's own documents or we say nothing.
- No handwriting solution. Detect, route to human, log. The field ceiling is around 75 percent across all frontier models and we are not going to move it.

---

## 3. Architecture

```
                    ┌─────────────────────────────────────────────┐
  channels          │ 0. INGEST                                   │
  email PDF         │   channel adapter, content hash, page count, │
  portal upload     │   MIME sniff, PDF/A-3 attachment probe       │
  scan / photo      └────────────────────┬────────────────────────┘
  Peppol / AS4                           │
  Factur-X hybrid   ┌────────────────────▼────────────────────────┐
  EDI               │ 1. CLASSIFY AND ROUTE                       │
                    │   cheap local model: doc type, orientation,  │
                    │   quality score, language, page split        │
                    └──────┬──────────────────────────┬───────────┘
                           │ structured                │ unstructured
              ┌────────────▼─────────────┐  ┌──────────▼──────────────────┐
              │ 2a. STRUCTURED PARSE     │  │ 2b. EXTRACT                 │
              │  UBL 2.1 / CII /         │  │  OCR text + page image      │
              │  FatturaPA / FA(3) /     │  │  BOTH into a schema-        │
              │  CFDI / X12 810 /        │  │  constrained VLM            │
              │  EDIFACT INVOIC          │  │  returns values + per-field │
              │  capture clearance id    │  │  confidence + bboxes        │
              │  ZERO extraction cost    │  └──────────┬──────────────────┘
              └────────────┬─────────────┘             │
                           │      ┌────────────────────┘
                           │      │  ┌──────────────────────────────────┐
                           │      │  │ 2c. HYBRID DIFF (Factur-X only)  │
                           └──────┴──│  parse embedded XML AND extract  │
                                     │  visual layer, then diff them    │
                                     └────────────┬─────────────────────┘
                    ┌─────────────────────────────▼──────────────────────┐
                    │ 3. NORMALISE to canonical schema (section 4)        │
                    └─────────────────────────────┬──────────────────────┘
                    ┌─────────────────────────────▼──────────────────────┐
                    │ 4. CONTROL LAYER  (engine.py, already written)      │
                    │   arithmetic · tax · currency · dates · identity ·  │
                    │   payment integrity · master data · PO match ·      │
                    │   duplicate fingerprint · payee assignment ·        │
                    │   regime trust · confidence gates                   │
                    └─────────────────────────────┬──────────────────────┘
                    ┌─────────────────────────────▼──────────────────────┐
                    │ 5. TARGETED RE-READ                                │
                    │   crop low-confidence field bbox, re-read at high   │
                    │   resolution, reconcile, log both attempts          │
                    └─────────────────────────────┬──────────────────────┘
                    ┌─────────────────────────────▼──────────────────────┐
                    │ 6. ROUTE  auto-fund / review / block                │
                    │   review queue ordered by error likelihood          │
                    └─────────────────────────────┬──────────────────────┘
                    ┌─────────────────────────────▼──────────────────────┐
                    │ 7. AUDIT STORE  append-only, per-field provenance   │
                    └────────────────────────────────────────────────────┘
```

### Why this shape and not something simpler

| Decision | Evidence |
|---|---|
| Feed OCR text **and** page image, not one or the other | ConfBench (AWS, arXiv 2608.01792, Aug 2026, 75 invoices expanded to 1,346 degradation variants; note the corpus is FCC-format broadcast advertising invoices, per the paper's own caveat): OCR plus image consistently dominates image-only and OCR-only on the joint accuracy and confidence-quality frontier |
| Schema-guided extraction, never per-layout templates | 102-invoice independent study (arXiv 2510.15727): schema-guided LLM 94 percent versus structural document model 63 percent; arithmetic error rate 5 percent versus 20 percent |
| Do **not** rely on provider "structured output" mode on large schemas | Contextual AI ExtractBench (arXiv 2602.12247, Feb 2026): enabling it dropped valid-JSON from 51 percent to 37 percent and pass rate from 4.6 to 3.0 percent |
| Cheap classifier in front | Kungfu.ai production paper (arXiv 2605.18818): hybrid classifier at 92 percent for about $0.001 per page, LLM fallback on the 4 percent it is unsure about, 96 percent combined at one tenth the cost |
| Targeted re-read instead of uniformly high resolution | InSight-doc (arXiv 2608.10628, Aug 2026): plus 4.3 to 16.4 points accuracy, over 40 percent hallucination reduction, and latency **down** 41 to 68 percent |
| Confidence-ranked review queue | ConfBench: 2.43 times better error capture than random sampling at a 30 percent review budget, and every model tested beat random |
| Grounding is mandatory | In a 2026 benchmark every raw vision model and coding agent scored **0.0 percent** word-level grounding. No bbox means no field-exam defence |
| Chunk long documents | Past 50 pages, raw vision models collapse; one measured drop was 79.8 percent to 27.9 percent |

---

## 4. Canonical schema

One schema, versioned, additive-only. Every field carries a value, a confidence, and a grounding reference.

```jsonc
{
  "schema_version": "1.0",
  "doc_id": "uuid",
  "ingest": {
    "channel": "email_pdf_digital|portal_upload|scan_200dpi|scan_300dpi|mobile_photo|peppol|as4|factur-x_hybrid|edi_x12|edifact",
    "received_at": "iso8601",
    "content_sha256": "hex",
    "page_count": 3,
    "source_uri": "s3://...",
    "embedded_xml_present": true,
    "facturx_profile": "MINIMUM|BASIC WL|BASIC|EN 16931|EXTENDED|XRECHNUNG|null"
  },
  "regime": {
    "buyer_country": "PL",
    "model": "clearance|decentralised|none",
    "clearance_authority": "KSeF|SdI|IRP|ZATCA|SAT|SEFAZ|null",
    "clearance_id": "KSEF-20260810-9F2A47C1-8831",
    "attested": true
  },
  "invoice_number": "…",
  "issue_date": "2026-08-10",
  "due_date": "2026-09-24",
  "payment_terms_days": 45,
  "currency": "PLN",
  "seller":  { "supplier_id": "…", "name": "…", "country": "PL", "vat_id": "PL5262587234", "iban": "…", "address": "…" },
  "buyer":   { "buyer_id": "…", "name": "…", "country": "PL", "vat_id": "PL7770003062", "address": "…" },
  "payee":   { "name": "…", "iban": "…" },          // EN 16931 Payee, distinct from Seller
  "po_number": "…",
  "delivery_note_ref": "…",
  "line_items": [
    { "seq": 1, "description": "…", "qty": 40000, "uom": "EA", "unit_price": 6.85,
      "line_total": 274000.00, "tax_rate": 23.0, "tax_category": "S" }
  ],
  "subtotal": 274000.00,
  "tax_breakdown": [ { "rate": 23.0, "category": "S", "taxable_base": 274000.00, "amount": 63020.00 } ],
  "tax_amount": 63020.00,
  "discount": 0.00,
  "freight": 0.00,
  "total_due": 337020.00,

  "field_confidence": { "invoice_number": 0.996, "total_due": 0.998, "…": 0.0 },
  "grounding":        { "invoice_number": { "page": 1, "bbox": [x1,y1,x2,y2] } },
  "hybrid_diff":      { "payee.iban": ["<from xml>", "<from visual layer>"] },

  "extraction_meta": {
    "path": "structured|vlm|vlm_reread",
    "model": "vendor/model-name",
    "model_version": "pinned-id",
    "prompt_version": "p-2026-08-17-a",
    "ocr_engine": "…",
    "latency_ms": 2140,
    "cost_usd": 0.0031,
    "reread_fields": ["tax_amount"]
  }
}
```

### Field tiers, which drive both gating and the eval matchers

| Tier | Fields | Matcher | Gate |
|---|---|---|---|
| **1** | `invoice_number`, `seller.vat_id`, `buyer.vat_id`, `payee.iban`, `currency`, `po_number`, `clearance_id` | `string_exact`, no tolerance, no normalisation beyond whitespace | 0.95 |
| **2** | `subtotal`, `tax_amount`, `total_due`, `discount`, `freight`, `line_total`, `unit_price`, `qty` | `number_tolerance` 0.1 percent relative | 0.90 |
| **3** | names, addresses, descriptions, `payment_terms` | `string_fuzzy` Levenshtein ≥ 0.8, or `string_semantic` | 0.75 |

Three value states, never two: `present`, `null` (the document genuinely has no value), `MISSING` (the extractor failed to return it). Collapsing these makes omission and hallucination indistinguishable in error reports. Borrowed from the Contextual AI metric design.

**Gates are provisional.** Replace hand-set thresholds with split conformal prediction against a 100-plus document calibration set as soon as one exists: set a target coverage level, let the calibration set derive the threshold. That is the version a regulator finds defensible, and it survives a model swap.

---

## 5. Control catalogue

Already implemented in `engine.py`. Each control emits a `Finding` with `code`, `severity`, `message`, `fields`, `control`.

| Family | Controls | Severity ceiling |
|---|---|---|
| `arithmetic` | `LINE_MATH`, `SUBTOTAL_MISMATCH`, `TOTAL_MISMATCH`, `LINE_MISSING_TOTAL` | critical |
| `tax` | `TAX_RATE_INVALID`, `TAX_AMOUNT_MISMATCH`, `TAX_COUNTRY_UNKNOWN` | high |
| `currency` | `CURRENCY_COUNTRY_MISMATCH` | warn |
| `dates` | `DUE_BEFORE_ISSUE`, `TERMS_MISMATCH` | high |
| `eligibility` | `FUTURE_DATED` (pre-billing) | high |
| `identity` | `VAT_ID_MALFORMED`, `IBAN_CHECKSUM_FAIL` (real mod-97) | critical |
| `payment_integrity` | `REMIT_TO_CHANGED`, `IBAN_CHECKSUM_FAIL` | critical |
| `master_data` | `SUPPLIER_UNKNOWN`, `VAT_ID_CHANGED` | high |
| `matching` | `NO_PO`, `PO_NOT_FOUND`, `PO_BUYER_MISMATCH`, `PO_OVERBILL` | critical |
| `duplicate_financing` | `PAYEE_NOT_SELLER` | critical |
| `duplicate` | `DUPLICATE_EXACT`, `DUPLICATE_NORMALISED`, `DUPLICATE_CONTENT_HASH`, `DUPLICATE_FUZZY` | critical |
| `hybrid_diff` | `HYBRID_DIVERGENCE`, `FACTURX_PROFILE_INSUFFICIENT` | critical |
| `regime` | `CLEARANCE_ATTESTED`, `CLEARANCE_MISSING`, `TRANSPORT_ONLY`, `STRUCTURED_INPUT` | high |
| `confidence` | `LOW_CONFIDENCE` (tier-aware), `NO_GROUNDING` | high |

### Rules to add during the POC

1. **VAT ID registry validation** against EU VIES and India GSTIN, not just format regex. Cache with TTL. A VAT ID that fails registry lookup is a high-value flag regardless of model confidence.
2. **Three-way match** once GRN or delivery-note data is available. Two-way (invoice to PO) is all the POC can do without it.
3. **Reverse charge and intra-community supply** handling: 0 percent with a valid counterparty VAT ID in a different member state is legitimate, and a naive tax-rate check will false-positive on it constantly. Get this right early or the review queue fills with noise.
4. **Credit note and contra linkage.** Credit notes are economically decisive for eligibility and frequently arrive separately.
5. **Concentration and aged-debt eligibility** rules, per client programme, config-driven.
6. **ISO 20022 `camt.053` reconciliation hook.** Collection-path monitoring is the control that First Brands defeated. Out of POC scope, in the architecture from day one.
7. **Cross-lender duplicate check** via a registry (MonetaGo, TReDS-style) if IFG participates in one. Internal fingerprinting cannot see another lender's book. Say so explicitly rather than implying coverage we do not have.

### Two rules that must never be relaxed

- **Never silently repair a total.** Recompute, compare, flag. A silently repaired total is a fraud vector.
- **Never resolve a hybrid-PDF divergence automatically.** Prefer the XML operationally, still extract the visual layer, diff, and route any divergence on amount, tax, IBAN, buyer identity or due date to a human as a fraud exception.

---

## 6. Eval harness, which is the actual deliverable

The harness is worth more than the pipeline, because it is what makes any vendor decision (including keeping IFG's current Google-era stack) measurable. Build it first.

### 6.1 Sealed sample

- **500 documents minimum**, drawn from IFG's real book, stratified by: corridor (US, UK, AU, cross-border), supplier tier (top-20 by volume versus long tail), input channel (digital PDF, scan, mobile photo, structured payload, hybrid PDF), and document class (standard invoice, construction payment application, credit note, statement).
- **Frozen and hashed.** Never used for prompt tuning. Keep a separate 150-document dev set for that.
- **Human-annotated ground truth**, double-keyed on tier-1 fields, with disagreements adjudicated and logged. Budget this honestly: it is the single largest line item in the POC.
- **Calibration set:** 100 to 150 documents, disjoint from both, used only to derive conformal thresholds.

### 6.2 Metrics to report, all of them, every run

| Metric | Definition | Why |
|---|---|---|
| **Document-level zero-error rate** | Share of documents where every field in the tier set is correct | The only number that predicts touchless rate |
| Field accuracy by tier | Per-tier, using that tier's matcher | Where the loss actually is |
| **Line-item accuracy, reported separately** | Rows aligned by Hungarian matching over unordered records; omitted rows count as recall failures | Line items are the weakest field class in every published benchmark and averaging them into a header number hides that |
| **Silent-error rate at threshold T** | Share of values that are wrong while confidence ≥ T | A wrong value at 0.95 confidence is worse than a refusal |
| AUROC | Does confidence separate correct from incorrect | Below about 0.7 confidence is not usable for triage |
| ECE (calibration error) | Mean gap between stated confidence and observed accuracy | Measured spread across models on the same invoices is six-fold (0.05 to 0.31) |
| **ECARB at review budget B** | Errors caught by confidence-ranked review versus random, at B percent review | The number to write into a contract. Reference point: 2.43 times at B = 30 percent |
| Grounding F1 | Word-level, IoU ≥ 0.5 | Audit defensibility |
| Cost per document | Full journey, all meters, not per API call | Vendors bill per meter and stack them |
| p50 and p95 latency | Per channel | Only matters against the funding SLA |
| Control precision and recall | Per control code, against adjudicated labels | A control that cries wolf gets switched off by ops |

**Report every metric per stratum, never only in aggregate.** An aggregate number hides the corridor or channel that is failing, which is exactly the thing worth knowing.

### 6.3 The compounding table to put in every report

At `n` fields and per-field accuracy `p`, clean-document rate is `p^n`. This is not a footnote, it is the headline.

| Per-field | 15 fields | 20 fields | 44 fields |
|---|---|---|---|
| 97.0% | 63.3% | 54.4% | 26.0% |
| 99.0% | 86.0% | 81.8% | 64.3% |
| 99.5% | 92.8% | 90.5% | 80.2% |
| 99.9% | 98.5% | 98.0% | 95.7% |

Inverted, for 20 fields: 90 percent clean requires **99.47 percent per field**; 99 percent clean requires **99.95 percent**.

---

## 7. Model selection, as a data question

Benchmark all of these on the sealed sample. Do not pre-commit. Re-run quarterly, because the leaderboard changed four times in the last six months.

### Cloud path candidates

| Candidate | Why it is a candidate | Watch out for |
|---|---|---|
| Gemini 3 Flash, OCR plus image, our schema | Top published score on the key-information-extraction sub-benchmark (91.1 percent, fourth overall) at roughly $0.17 per 1,000 pages | No grounding, no native confidence: we derive both |
| Gemini 3.1 Pro | Only model measured as **more** accurate on real-degraded pages than clean ones | Roughly 4 times the cost for about 5 points |
| Claude Opus 4.6 / Sonnet 4.5 | Best-calibrated confidence measured on invoices (AUROC 0.84, ECE 0.05); Sonnet best raw invoice accuracy at 0.77 | Cost |
| Azure Document Intelligence prebuilt-invoice | Only fixed-schema parser that does not collapse on line items; roughly $13 per 1,000 invoices list | Fixed schema, no shipped review queue |
| Nanonets OCR-3 | Number one on the IDP leaderboard, per-element confidence | $10 per 1,000 pages, licence not disclosed |
| LlamaExtract Agentic | Only vendor with non-zero word-level grounding, plus corroborated invoice results | About 3.1 cents per page: use as a fallback tier, not the primary |

### Self-hosted / VPC path candidates

| Candidate | Why | Watch out for |
|---|---|---|
| **PaddleOCR-VL-1.6** | Apache 2.0, about 2 GB FP16, bounding boxes **and** confidence, table score 94.76, 100 plus languages | Weak on old scans (38.6) |
| OvisOCR2 | Current top OmniDocBench score, Apache 2.0, 0.8B | **No confidence output at all.** Disqualifying on its own for lending |
| Surya-OCR-2 | Per-token confidence, 5.35 pages per second on a single consumer GPU, 91 languages | Licence free only under $5M revenue |
| Azure DI disconnected container | Only fully offline invoice-specific commercial model, same rate as connected | Annual commitment floor |
| Unstract, AGPL | Bring-your-own-LLM including fully local, ships dual-LLM verification and HITL | No published accuracy at all: eval is mandatory |

**Licence review is a build task, not a legal afterthought.** Chandra-2 forbids competing with the vendor's API and is free only under $2M; Marker weights are restricted under $5M; MinerU has revenue conditions. Get sign-off before any of these enter a client deliverable.

---

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Audit trail** | Append-only. Per field: source content hash, page, bbox, model and prompt version, confidence, control findings, reviewer identity, timestamp, before-and-after on any human edit. Immutable. This is the requirement most likely to be demanded in diligence and least likely to be built up front |
| **Data residency** | Region-scoped processing and storage, configurable per client programme. Assume US, UK, EU and AU need to be separable |
| **Retention** | Jurisdiction-scoped and long horizon. France moves VAT retention from 6 to 10 years on 1 January 2027; a German July 2026 proposal floats 15 years plus in-country storage. A single global retention setting will be wrong. Note France's go-live is 1 September 2026: all established businesses must be able to receive, and large plus mid-sized enterprises must also issue, from day one |
| **PII** | Invoices carry named contacts, signatures, employee names and sometimes individual bank details; sole-trader invoices are personal data end to end. Extract only fields we need, mask in logs, document lawful basis |
| **Sub-processors** | Maintain a named list including every model inference provider and processing location, with change notification. DORA Articles 28 to 30 will require exactly this from any vendor selling into an EU lender |
| **Model pinning** | Pin versions. Re-run the sealed sample on every version change. Rollback right. Google alone deprecated four invoice and expense parser versions and discontinued its human-review product in January 2024 with no replacement |
| **Explainability** | Every block or flag returns a reason code in plain language, mappable to adverse-action wording where the obligor is an individual or sole trader |
| **No training on client data** | Contractual and enforced in configuration |
| **Certifications to target** | SOC 2 Type II including **Processing Integrity** (usually omitted, and it is the one that matters for an extraction engine), ISO 27001, and ISO 42001 which is moving from nice-to-have to procurement requirement during 2026 |

---

## 9. Plan

### Phase 0: pre-meeting, 1 day, done

Demo slice built: `engine.py` with 20-plus controls, 8 synthetic invoices across 5 corridors and 6 channels, `run.py` console report, `IFG_Invoice_Ingestion_Demo.html` as the screen-share artifact. No client data required.

### Phase 1: the paid evaluation, 2 weeks (the actual ask)

| Day | Work | Output |
|---|---|---|
| 1 to 2 | Sample design workshop with IFG. Agree strata, field list, tier assignment and matchers **before** any measurement | Signed matcher spec |
| 2 to 5 | Receive and seal the 500-document sample. Build the annotation tool. Begin double-keyed annotation | Sealed hashed corpus |
| 4 to 8 | Annotation completes and disagreements are adjudicated. Build the harness: all metrics in section 6.2 | Ground-truth set plus harness |
| 6 to 9 | Run 4 to 6 model configurations across both paths | Raw runs, cost and latency telemetry |
| 9 to 11 | Run the control layer over the same corpus. Measure control precision and recall against adjudicated labels | Control scorecard |
| 11 to 13 | Derive conformal thresholds from the calibration set. Model the touchless rate at each review budget | Threshold spec plus touchless curve |
| 13 to 14 | Write up: recommendation, costed both paths, and an explicit list of what we could not measure | Evaluation report |

**Phase 1 acceptance:** IFG can state, with a number they trust, their current document-level zero-error rate and silent-error rate on their own book. That is the deliverable, and it is valuable to them even if they never sign a build.

### Phase 2: the build, 4 to 6 weeks, only if Phase 1 justifies it

Week 1: ingest adapters plus classifier plus structured-first path (UBL, CII, FatturaPA, FA(3), clearance-ID capture).
Week 2: extraction service, both paths, behind one interface. Grounding and confidence normalisation across models.
Week 3: hybrid-PDF diff, targeted re-read loop, audit store.
Week 4: master data and PO matching, registry validation, duplicate service.
Week 5: review UI with confidence-ranked queue and reviewer feedback capture.
Week 6: hardening, load test, runbook, handover.

### Team

| Role | Allocation | Doing what |
|---|---|---|
| Senior backend / ML engineer | 1.0 FTE | Extraction service, harness, model integration |
| Backend engineer | 1.0 FTE | Ingest adapters, structured parsers, control layer extensions, audit store |
| Data annotator or ops | 0.5 FTE Phase 1 | Ground-truth annotation and adjudication |
| Frontend | 0.5 FTE Phase 2 only | Review queue UI |
| Tech lead / architect | 0.3 FTE | Schema, thresholds, client interface |

---

## 10. Acceptance criteria

### Phase 1

- [ ] Sealed sample of at least 500 documents, hashed, stratified across at least 4 corridors and 5 channels, never used for tuning
- [ ] Matcher spec signed **before** the first measurement run
- [ ] All metrics in section 6.2 reported, per stratum as well as in aggregate
- [ ] At least 4 model configurations compared across cloud and self-hosted paths, with cost and latency
- [ ] Conformal thresholds derived, not hand-set, with the target coverage level stated
- [ ] Touchless-rate curve as a function of review budget
- [ ] An explicit "what we could not measure" section. Non-negotiable

### Phase 2

- [ ] Six channels round-trip to one schema
- [ ] Structured payloads bypass extraction entirely and cost zero extraction spend, verified in telemetry
- [ ] Every control has a golden-file test, including a deliberate negative case
- [ ] Hybrid-PDF divergence detected on a purpose-built adversarial fixture set
- [ ] Every extracted field carries page plus bbox plus model version plus confidence in the audit store
- [ ] Duplicate detection catches all five key classes, proven with an adversarial set including OCR character confusion
- [ ] Zero silent repairs of any monetary field, proven by test
- [ ] Reviewer decisions captured in a form usable as future training or calibration data
- [ ] Runbook plus rollback procedure plus a documented model-swap process

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| IFG never provides real documents | **High** | Fatal to Phase 1 | Make the sealed sample the entire deliverable of a small paid engagement, so providing documents *is* the project. Offer to work on-site or in their VPC if egress is the blocker |
| ai1 Technologies treats ingestion as their scope | Medium | Loses the deal | Ask the boundary question directly in meeting one (question C3). Position as adjacent, not competitive. Offer the harness, which is useful to ai1 too |
| Their existing extraction stack already good enough | Medium | Shrinks scope to verification only | Fine. Verification is the better business anyway. The harness proves it either way |
| Line-item accuracy is unacceptable and unfixable | Medium | Reduces achievable touchless rate | Report it early and honestly. Design the review queue around it rather than pretending |
| Reverse-charge and intra-community false positives swamp the review queue | **High** if rushed | Ops switches the controls off | Build tax-category handling in week 1, not week 4. Measure control precision, not just recall |
| Model deprecation mid-engagement | Medium | Rework | Version pinning plus sealed-sample re-run plus rollback right, from day one |
| Handwriting expectations | Medium | Credibility damage | State the roughly 75 percent field ceiling in meeting one, in writing, before anyone hopes otherwise |
| Scope creep into credit decisioning | Medium | Political collision with ai1 and with Sabeen Ahmed's remit | Non-goal, stated in the SOW |
| We overstate what the demo proves | Medium | Fatal to trust | The demo's extraction values are fixtures. Say so out loud, once, early |

---

## 12. Open questions for IFG (bring these to meeting one)

1. Channel split by volume: structured versus PDF versus scan versus photo, per corridor.
2. What the supplier must upload today: invoice only, or the full pack with PO, delivery note, timesheet, acceptance.
3. Distinct supplier layout count and the shape of the tail.
4. Which step between "invoice arrives" and "funds released" is the actual bottleneck. Their FAQ says 48 hours from first client contact and same day thereafter; the product page says as little as 24 hours.
5. How duplicate financing is detected today, and whether they participate in any external registry.
6. Whether remit-to bank details are automatically compared against file on every invoice.
7. Whether the 2019 Google-era extraction stack is still the production path, and what the October 2023 document extraction paper on their site actually changed.
8. Where the ai1 Technologies scope boundary sits.
9. Whether invoice data can leave their infrastructure.
10. What provenance a field examiner asks them for today.
11. Whether a labelled ground-truth set exists, and if so how large and how stratified.
12. Their current touchless rate, defined as zero human touch and no post-hoc correction.

---

## 13. Appendix: run the existing slice

```bash
cd ifg_poc
python3 run.py                 # console report over the 8-document book
python3 build_demo.py           # regenerates the self-contained demo HTML
```

`engine.py` has no third-party dependencies. It is pure standard library on purpose: the control layer should be trivially portable into whatever runtime IFG uses, and it should be readable by a credit officer, not just an engineer.

**Sources for every figure quoted in this PRD are listed in the accompanying prep brief, section 10.**
