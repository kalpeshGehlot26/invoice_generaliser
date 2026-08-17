# @ifg/control-engine

TypeScript port of `IFG_POC_code/engine.py` — the deterministic validation and
risk-routing layer that sits between invoice extraction and the funding
decision.

Zero runtime dependencies, matching the Python's deliberate stdlib-only stance:
the control layer should be trivially portable into whatever runtime the client
runs, and readable by a credit officer rather than only an engineer.

## Running

```bash
npm install
npm test          # unit tests + golden-file parity
npm run typecheck
npm run report    # console report over the 8-document sample book
```

## Verification

The port is verified against `IFG_POC_code/results.json`, produced by the
Python. `src/golden.test.ts` runs the same 8-document book through the
TypeScript engine and deep-equals every finding, message string, ordering, risk
score and routing decision.

Console output is byte-identical to `python3 run.py`:

```bash
npm run report > ts.txt
(cd ../../IFG_POC_code && python3 run.py > py.txt)
diff <(head -n -2 py.txt) <(head -n -2 ts.txt)   # only the trailing path line differs
```

`results.json` in the reference folder is the test oracle. `npm run report`
writes its output to this package's directory instead, never to the oracle.

## Porting hazards

These are the places where a faithful-looking port silently diverges. Each has
a dedicated test in `src/util.test.ts`.

| Hazard | Why it breaks | Handling |
|---|---|---|
| IBAN mod-97 | The rearranged digit string exceeds `Number.MAX_SAFE_INTEGER`, so a Number-based modulo returns wrong *valid* verdicts, not errors | `BigInt` |
| Rounding | Python `round()` is half-to-even; `Math.round(2.5)` is 3, Python's is 2 | `pyRound` |
| Money formatting | Messages embed `f"{x:,.2f}"` and are compared literally | `fmtMoney` |
| Float rendering | Python prints `20.0`, JS prints `20` | `pyFloat` / `fmtRateList` |
| `lstrip("0")` | Strips *all* leading zeros: `"000"` becomes `""` | regex, no fallback |
| Date format order | `%d/%m/%Y` is tried before `%m/%d/%Y`, so `03/04/2026` is 3 April | ordered parsers |
| `or` on `0` | `if rate and sub` skips zero-rated invoices — deliberate, not a bug | ported literally |

## Known defect, ported deliberately

`FACTURX_PROFILE_INSUFFICIENT` is unreachable in the Python. `v_hybrid_diff`
returns early when `hybrid_diff` is empty, before the profile check below it, so
a document with an insufficient Factur-X profile and no divergence never
triggers it. DOC-0003 is the fixture built to demonstrate that control and it
does not fire; the code appears nowhere in `results.json`.

The port reproduces this exactly, so golden parity holds. It is pinned by a test
in `src/controls/regime.test.ts` — fixing it will break that test on purpose.

## Regenerating fixtures

`src/samples.ts` is generated from `samples.py` rather than hand-transcribed, so
a transcription slip cannot masquerade as a port bug.

```bash
npm run gen:samples
```
