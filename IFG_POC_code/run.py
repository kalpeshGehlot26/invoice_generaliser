"""Run the control stack over the sample book and emit a console report + results.json."""
import json
import sys
from engine import run_controls
from samples import INVOICES, VENDOR_MASTER, BUYER_POS

SEV_ICON = {"critical": "[CRIT]", "high": "[HIGH]", "warn": "[WARN]", "info": "[INFO]"}
DEC_LABEL = {"AUTO_FUND": "AUTO FUND", "REVIEW_LIGHT": "LIGHT REVIEW",
             "REVIEW": "REVIEW QUEUE", "BLOCK": "BLOCK / ESCALATE"}


def main() -> None:
    ledger: list[dict] = []          # invoices already funded in this run
    results = []
    for inv in INVOICES:
        res = run_controls(inv, VENDOR_MASTER, BUYER_POS, ledger)
        results.append(res)
        # Only a funded invoice enters the ledger, which is what makes DOC-0006
        # collide with DOC-0001.
        if res["decision"] in ("AUTO_FUND", "REVIEW_LIGHT"):
            ledger.append(inv)

    width = 96
    print("=" * width)
    print("IFG INVOICE INGESTION POC : DETERMINISTIC CONTROL LAYER".center(width))
    print("8 documents, 5 corridors, 6 input channels".center(width))
    print("=" * width)

    for r in results:
        print(f"\n{r['doc_id']}  {DEC_LABEL[r['decision']]}   risk score {r['risk_score']}")
        print(f"  {r['label']}")
        print(f"  {r['seller']}  ->  {r['buyer']}")
        print(f"  {r['invoice_number']}   {r['currency']} {r['total_due']:,.2f}   "
              f"channel={r['channel']}   corridor={r['corridor']}")
        if r["clearance_id"]:
            print(f"  attested: {r['clearance_id'][:44]}")
        if not r["findings"]:
            print("  no findings")
        for f in r["findings"]:
            print(f"  {SEV_ICON[f['severity']]:7} {f['code']:32} {f['message']}")

    print("\n" + "=" * width)
    print("PORTFOLIO SUMMARY".center(width))
    print("=" * width)
    counts: dict[str, int] = {}
    for r in results:
        counts[r["decision"]] = counts.get(r["decision"], 0) + 1
    total = len(results)
    for d in ("AUTO_FUND", "REVIEW_LIGHT", "REVIEW", "BLOCK"):
        n = counts.get(d, 0)
        bar = "#" * int(n / total * 40)
        print(f"  {DEC_LABEL[d]:18} {n}/{total}  {n/total*100:5.1f}%  {bar}")

    crit_codes: dict[str, int] = {}
    for r in results:
        for f in r["findings"]:
            if f["severity"] in ("critical", "high"):
                crit_codes[f["code"]] = crit_codes.get(f["code"], 0) + 1
    print("\n  Controls that fired at high or critical severity:")
    for code, n in sorted(crit_codes.items(), key=lambda kv: -kv[1]):
        print(f"    {code:34} {n}")

    money_at_risk = sum(r["total_due"] for r in results if r["decision"] == "BLOCK")
    print(f"\n  Value held back by the BLOCK decisions: {money_at_risk:,.2f} "
          "(mixed currency, illustrative)")
    print("  Every finding above is deterministic, reproducible, and explainable in a")
    print("  field exam. None of it depends on which OCR model you choose.")

    with open("results.json", "w") as fh:
        json.dump(results, fh, indent=2)
    print("\n  results.json written\n")


if __name__ == "__main__":
    sys.exit(main())
