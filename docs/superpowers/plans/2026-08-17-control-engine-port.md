# Control Engine — Python to TypeScript Port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Port `IFG_POC_code/engine.py` to TypeScript with byte-identical behaviour, verified against the existing `results.json` as a golden file.

**Architecture:** A faithful port. Same control codes, severities, message strings, ordering, risk scores and routing decisions. Structure splits the 540-line module into focused files, but no control logic is redesigned. Extraction stays out of scope — `samples.py` fixtures port across as-is.

**Tech Stack:** TypeScript, Node 20+, Vitest. Zero runtime dependencies, mirroring `engine.py`'s deliberate stdlib-only stance — the control layer must stay trivially portable into whatever runtime the client uses.

## Global Constraints

- **`results.json` is the oracle.** The ported engine must reproduce it exactly — every finding code, severity, message string, field list, control family, ordering, risk score and decision. A diff is a bug in the port, never a reason to edit `results.json`.
- **No behaviour changes, no "improvements", no extra controls.** Anything that looks wrong gets noted in "Deviations", not fixed silently.
- Zero runtime dependencies. Dev dependencies (TypeScript, Vitest) only.
- ESM, `"type": "module"`, Node >= 20.
- Schema shape follows `samples.py`, not PRD §4 — they have drifted (`source_channel` vs `ingest.channel`, `content_hash` vs `ingest.content_sha256`, root-level `tax_rate`).

## Porting hazards

These are the places a "straightforward" port silently diverges. Each gets a unit test before the control that depends on it.

| # | Hazard | Why it breaks | Handling |
|---|---|---|---|
| 1 | **IBAN mod-97** | `int(digits) % 97` in Python is arbitrary-precision. The digit string runs to 30+ characters, far past `Number.MAX_SAFE_INTEGER`, so JS silently returns a wrong remainder — and wrong *valid* answers, not errors. | `BigInt(digits) % 97n === 1n` |
| 2 | **Rounding** | Python `round()` is banker's rounding (half-to-even): `round(2.5)` is `2`. JS `Math.round(2.5)` is `3`. Money comparisons land on `.5` boundaries more often than intuition suggests. | Implement `pyRound(x, digits)` half-to-even |
| 3 | **Thousands formatting** | Messages embed `f"{x:,.2f}"`. Golden-file comparison is on the exact message string. | `toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})` |
| 4 | **Float list rendering** | `sorted(valid, reverse=True)` on `{19.0, 7.0, 0.0}` prints `[19.0, 7.0, 0.0]`. JS gives `19,7,0` — the `.0` is lost and so are the brackets and spaces. | Explicit formatter emitting Python list syntax |
| 5 | **Set iteration order** | `VALID_RATES` values are Python sets; the code sorts before printing, so order is deterministic — but only because of the sort. | Model as arrays, sort explicitly |
| 6 | **`None` vs `0`** | `inv.get("subtotal") or 0` treats `0.0` as falsy and substitutes `0` — same result here, but `or` on `0` is a live trap elsewhere. | Port `or` semantics literally, do not "fix" to `??` |
| 7 | **Sort stability** | `findings.sort(key=...)` is stable in Python. Two findings with equal severity and control family must keep insertion order. | `Array.prototype.sort` is stable in Node 20 — safe, but the comparator must return `0` for ties, never a tiebreak |
| 8 | **`lstrip("0")`** | Strips *all* leading zeros; `"000"` becomes `""`, not `"0"`. | Regex `^0+` replace, no fallback |
| 9 | **Date parsing** | Python tries five formats in order and returns `None` on total failure. `%d/%m/%Y` before `%m/%d/%Y` means `03/04/2026` is 3 April. | Port the format list in the same order |
| 10 | **Hardcoded today** | `date(2026, 8, 17)` is a literal in `v_dates`. | Inject as a parameter defaulting to `2026-08-17` so golden parity holds; note in Deviations |

## File structure

| File | Responsibility |
|---|---|
| `src/types.ts` | `Finding`, `Severity`, `Invoice`, `LineItem`, `Party`, `VendorRecord`, `PoRecord`, `ControlResult` |
| `src/reference.ts` | `VALID_RATES`, `CURRENCY_BY_COUNTRY`, `VAT_ID_PATTERN`, `CLEARANCE_REGIMES`, `DECENTRALISED_MANDATED` |
| `src/tiers.ts` | `TIER1/2/3`, `TIER_THRESHOLD`, `tierOf` |
| `src/util.ts` | `pyRound`, `relClose`, `ibanValid`, `normaliseInvoiceNumber`, `parseDate`, `fmtMoney`, `fmtRateList` |
| `src/controls/arithmetic.ts` | `vLineArithmetic`, `vTotals` |
| `src/controls/tax.ts` | `vTax`, `vCurrency` |
| `src/controls/dates.ts` | `vDates` |
| `src/controls/identity.ts` | `vIdentifiers`, `vPayeeAssignment` |
| `src/controls/masterData.ts` | `vBankChange`, `vPoMatch` |
| `src/controls/regime.ts` | `vRegime`, `vHybridDiff` |
| `src/controls/confidence.ts` | `vConfidence` |
| `src/controls/duplicates.ts` | `fingerprints`, `vDuplicates` |
| `src/route.ts` | `SEVERITY_WEIGHT`, `CONTROL_ORDER`, `scoreAndRoute` |
| `src/engine.ts` | `runControls` |
| `src/index.ts` | Public exports |
| `src/samples.ts` | `INVOICES`, `VENDOR_MASTER`, `BUYER_POS` ported from `samples.py` |
| `src/golden.test.ts` | Full-book comparison against `IFG_POC_code/results.json` |
| `src/run.ts` | Console report, mirroring `run.py` |

## Tasks

Ordered so the hazards are proven before anything depends on them.

- [x] **Task 1** — Scaffold `packages/control-engine`, types, reference data. Test: reference tables match the Python values exactly.
- [x] **Task 2** — `util.ts`. Test every hazard above: `pyRound` half-to-even, `ibanValid` with a real 30-char IBAN proving the BigInt path, `normaliseInvoiceNumber` on `"000"`, `parseDate` format precedence, `fmtMoney` and `fmtRateList` string output.
- [x] **Task 3** — Arithmetic and tax controls. Test: golden messages for `LINE_MATH`, `SUBTOTAL_MISMATCH`, `TOTAL_MISMATCH`, `TAX_RATE_INVALID`, `TAX_AMOUNT_MISMATCH`.
- [x] **Task 4** — Dates, identity, payee controls.
- [x] **Task 5** — Master data, PO match, regime, hybrid diff controls.
- [x] **Task 6** — Confidence gating and duplicate fingerprinting.
- [x] **Task 7** — `route.ts` and `engine.ts`, including finding sort order.
- [x] **Task 8** — Port `samples.py` to `samples.ts`.
- [x] **Task 9** — Golden test: run the full 8-document book with the ledger-accumulation behaviour from `run.py`, deep-equal against `results.json`.
- [x] **Task 10** — `run.ts` console report matching `run.py` output.

## Definition of done

- `pnpm test` green, including a deep-equal golden test over all 8 documents
- Zero runtime dependencies in `package.json`
- `npx tsx src/run.ts` produces the same console report as `python3 run.py`
- Every deviation from the Python recorded below

## Deviations from the Python

Recorded here as they are found. Anything in this list is a deliberate, noted
difference — never a silent one.

1. **`v_dates` "today"** — `engine.py:252` hardcodes `date(2026, 8, 17)` for the
   `FUTURE_DATED` check, so the control's behaviour changes meaning every day
   the file is not edited. Ported as an injected parameter defaulting to
   `2026-08-17`, preserving golden-file parity while making the dependency
   explicit and testable.

2. **`run.ts` does not overwrite `results.json`** — `run.py` rewrites the file in
   place. That file is the port's test oracle, so the TypeScript report writes to
   `packages/control-engine/results.json` instead. Content is byte-identical;
   only the destination differs.

## Defect found in the reference implementation (ported as-is)

**`FACTURX_PROFILE_INSUFFICIENT` is unreachable.** `v_hybrid_diff` opens with
`if not diff: return out`, and an empty dict is falsy in Python — so a document
carrying an insufficient Factur-X profile but no divergence returns before the
profile check ever runs.

DOC-0003 is the fixture built to demonstrate this control (labelled *"French
scan, insufficient Factur-X profile, tax arithmetic off"*), and it does not
fire. Confirmed empirically: the code appears nowhere in `results.json`. The PRD
lists it in the §5 control catalogue under the `hybrid_diff` family, so the
demo currently advertises a control that cannot run.

The port reproduces this exactly — parity is the contract — and pins it with a
test in `src/controls/regime.test.ts` so that fixing it is a deliberate act that
breaks the test on purpose.

**Suggested fix for the Python, if wanted:** move the profile check above the
early return, so it evaluates on `facturx_profile` alone.
