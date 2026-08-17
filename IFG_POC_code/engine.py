"""
IFG Invoice Ingestion POC : deterministic validation and risk-routing engine.

This is the layer that does NOT depend on which OCR/VLM you pick. It is portable
across extractors, fully auditable, and it is where straight-through-processing
rate actually comes from.

Design anchors (all from published evidence, Aug 2026):
  * arXiv 2510.15727 : 5-20% of invoices fail arithmetic even at 63-94% field accuracy
  * ConfBench (AWS, arXiv 2608.01792) : confidence-ranked review catches 1.4-2.4x
    more errors than random at the same review budget
  * EN 16931 : Payee party is modelled separately from Seller, "may differ in
    factoring scenarios" : that field is a duplicate-financing sensor
  * Clearance regimes (IT SdI, PL KSeF, IN IRP, SA ZATCA, MX SAT, BR SEFAZ) emit a
    state-attested identifier. Decentralised regimes (DE, BE, UK, generic Peppol)
    do not. Same-looking XML, very different evidential weight.
"""

from __future__ import annotations
import hashlib
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

TOL = 0.001  # 0.1% relative tolerance for money comparisons

# ---------------------------------------------------------------- field tiers
# Tier 1 : exact match, no tolerance. A wrong value here can misdirect money.
TIER1 = {"invoice_number", "seller_vat_id", "buyer_vat_id", "payee_iban",
         "currency", "po_number", "clearance_id"}
# Tier 2 : numeric, 0.1% tolerance, must survive arithmetic validation.
TIER2 = {"subtotal", "tax_amount", "total_due", "discount", "freight",
         "line_total", "unit_price", "qty"}
# Tier 3 : fuzzy / semantic match acceptable.
TIER3 = {"seller_name", "buyer_name", "payee_name", "description",
         "address", "payment_terms"}

TIER_THRESHOLD = {1: 0.95, 2: 0.90, 3: 0.75}


def tier_of(field_name: str) -> int:
    base = field_name.split(".")[-1]
    if base in TIER1:
        return 1
    if base in TIER2:
        return 2
    return 3


# ------------------------------------------------------- country VAT/GST rates
VALID_RATES: dict[str, set[float]] = {
    "DE": {19.0, 7.0, 0.0},
    "FR": {20.0, 10.0, 5.5, 2.1, 0.0},
    "IT": {22.0, 10.0, 5.0, 4.0, 0.0},
    "ES": {21.0, 10.0, 4.0, 0.0},
    "PL": {23.0, 8.0, 5.0, 0.0},
    "NL": {21.0, 9.0, 0.0},
    "IE": {23.0, 13.5, 9.0, 0.0},
    "GB": {20.0, 5.0, 0.0},
    "AU": {10.0, 0.0},
    "IN": {28.0, 18.0, 12.0, 5.0, 0.0},
    "SG": {9.0, 0.0},
    "US": None,   # sales tax varies by state/county : no national rate set
    "CA": {5.0, 13.0, 14.975, 15.0, 0.0},
}

CURRENCY_BY_COUNTRY = {
    "DE": "EUR", "FR": "EUR", "IT": "EUR", "ES": "EUR", "PL": "PLN",
    "NL": "EUR", "IE": "EUR", "GB": "GBP", "AU": "AUD", "IN": "INR",
    "SG": "SGD", "US": "USD", "CA": "CAD",
}

VAT_ID_PATTERN = {
    "DE": r"^DE\d{9}$", "FR": r"^FR[0-9A-Z]{2}\d{9}$", "IT": r"^IT\d{11}$",
    "ES": r"^ES[0-9A-Z]\d{7}[0-9A-Z]$", "PL": r"^PL\d{10}$",
    "NL": r"^NL\d{9}B\d{2}$", "IE": r"^IE\d{7}[A-W][A-I]?$",
    "GB": r"^GB(\d{9}|\d{12})$", "AU": r"^\d{11}$",
    "IN": r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$",
}

# Regimes that produce a state-attested invoice identifier.
CLEARANCE_REGIMES = {
    "IT": "SdI",  "PL": "KSeF", "IN": "IRP/IRN", "SA": "ZATCA",
    "MX": "SAT/CFDI", "BR": "SEFAZ/NF-e", "TR": "GIB",
}
# Regimes that are live-mandated but decentralised: transport receipt only.
DECENTRALISED_MANDATED = {"DE", "BE", "DK", "HR", "FR"}


# ------------------------------------------------------------------- utilities
def rel_close(a: float, b: float, tol: float = TOL) -> bool:
    if a is None or b is None:
        return False
    scale = max(abs(a), abs(b), 1.0)
    return abs(a - b) / scale <= tol


def iban_valid(iban: str | None) -> bool:
    """Real ISO 13616 mod-97 check. Cheap, deterministic, catches OCR digit slips."""
    if not iban:
        return False
    s = re.sub(r"\s+", "", iban).upper()
    if not re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$", s):
        return False
    s = s[4:] + s[:4]
    digits = "".join(str(ord(c) - 55) if c.isalpha() else c for c in s)
    return int(digits) % 97 == 1


def normalise_invoice_number(num: str | None) -> str:
    """Collapse the OCR confusion classes that create false-negative duplicates."""
    if not num:
        return ""
    s = num.upper()
    for a, b in (("O", "0"), ("I", "1"), ("L", "1"), ("S", "5"), ("B", "8"),
                 ("Z", "2"), ("-", ""), ("/", ""), (" ", ""), ("_", "")):
        s = s.replace(a, b)
    return s.lstrip("0")


def parse_date(v: str | None) -> date | None:
    if not v:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d.%m.%Y", "%d-%b-%Y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            continue
    return None


# ------------------------------------------------------------------ findings
SEVERITY_WEIGHT = {"info": 0, "warn": 8, "high": 30, "critical": 100}


@dataclass
class Finding:
    code: str
    severity: str            # info | warn | high | critical
    message: str
    fields: list[str] = field(default_factory=list)
    control: str = ""        # which control family this belongs to (for audit)

    def as_dict(self) -> dict[str, Any]:
        return {"code": self.code, "severity": self.severity,
                "message": self.message, "fields": self.fields,
                "control": self.control}


# ------------------------------------------------------------ the validators
def v_line_arithmetic(inv: dict) -> list[Finding]:
    out = []
    for i, li in enumerate(inv.get("line_items", []), start=1):
        # A per-line fee / surcharge / handling column is part of the row total.
        # Without it, an invoice that foots perfectly reports as broken arithmetic
        # and the control loses the reviewer's trust.
        expect = round((li.get("qty") or 0) * (li.get("unit_price") or 0)
                       + (li.get("charge") or 0), 2)
        got = li.get("line_total")
        if got is None:
            out.append(Finding("LINE_MISSING_TOTAL", "warn",
                               f"Line {i} has no line_total.",
                               [f"line[{i}].line_total"], "arithmetic"))
        elif not rel_close(expect, got):
            out.append(Finding("LINE_MATH", "high",
                               f"Line {i}: qty x unit_price = {expect:,.2f} "
                               f"but line_total reads {got:,.2f}.",
                               [f"line[{i}].line_total"], "arithmetic"))
    return out


def v_totals(inv: dict) -> list[Finding]:
    out = []
    lines = inv.get("line_items", [])
    if lines:
        s = round(sum((li.get("line_total") or 0) for li in lines), 2)
        if inv.get("subtotal") is not None and not rel_close(s, inv["subtotal"]):
            out.append(Finding("SUBTOTAL_MISMATCH", "high",
                               f"Line items sum to {s:,.2f} but subtotal reads "
                               f"{inv['subtotal']:,.2f}. Difference "
                               f"{abs(s - inv['subtotal']):,.2f}.",
                               ["subtotal"], "arithmetic"))
    sub = inv.get("subtotal") or 0
    tax = inv.get("tax_amount") or 0
    disc = inv.get("discount") or 0
    freight = inv.get("freight") or 0
    expect = round(sub + tax - disc + freight, 2)
    if inv.get("total_due") is not None and not rel_close(expect, inv["total_due"]):
        out.append(Finding("TOTAL_MISMATCH", "critical",
                           f"subtotal + tax - discount + freight = {expect:,.2f} "
                           f"but total_due reads {inv['total_due']:,.2f}. "
                           "Never auto-repair a total: recompute and flag.",
                           ["total_due"], "arithmetic"))
    return out


def v_tax(inv: dict) -> list[Finding]:
    out = []
    country = inv.get("seller", {}).get("country")
    rate = inv.get("tax_rate")
    valid = VALID_RATES.get(country, "missing")
    if valid == "missing":
        out.append(Finding("TAX_COUNTRY_UNKNOWN", "warn",
                           f"No VAT/GST rate table for country '{country}'.",
                           ["tax_rate"], "tax"))
    elif valid is None:
        out.append(Finding("TAX_NO_NATIONAL_RATE", "info",
                           "US sales tax is state/county level: rate check skipped, "
                           "arithmetic check still applies.", ["tax_rate"], "tax"))
    elif rate is not None and rate not in valid:
        sev = "high"
        out.append(Finding("TAX_RATE_INVALID", sev,
                           f"{rate}% is not a valid {country} rate. Valid: "
                           f"{sorted(valid, reverse=True)}.", ["tax_rate"], "tax"))
    sub = inv.get("subtotal")
    if rate and sub:
        implied = round(sub * rate / 100.0, 2)
        if inv.get("tax_amount") is not None and not rel_close(implied, inv["tax_amount"], 0.01):
            out.append(Finding("TAX_AMOUNT_MISMATCH", "high",
                               f"{rate}% of {sub:,.2f} = {implied:,.2f} but "
                               f"tax_amount reads {inv['tax_amount']:,.2f}.",
                               ["tax_amount"], "tax"))
    return out


def v_currency(inv: dict) -> list[Finding]:
    out = []
    cur = inv.get("currency")
    country = inv.get("seller", {}).get("country")
    expect = CURRENCY_BY_COUNTRY.get(country)
    if expect and cur and cur != expect:
        out.append(Finding("CURRENCY_COUNTRY_MISMATCH", "warn",
                           f"Seller is in {country} but invoice currency is {cur} "
                           f"(expected {expect}). Legitimate for export, but the "
                           "FX and the debtor's payment currency must agree.",
                           ["currency"], "currency"))
    return out


def v_dates(inv: dict) -> list[Finding]:
    out = []
    issue, due = parse_date(inv.get("issue_date")), parse_date(inv.get("due_date"))
    if issue and due:
        if due < issue:
            out.append(Finding("DUE_BEFORE_ISSUE", "high",
                               f"due_date {due} precedes issue_date {issue}.",
                               ["due_date"], "dates"))
        else:
            days = (due - issue).days
            terms = inv.get("payment_terms_days")
            if terms and abs(days - terms) > 2:
                out.append(Finding("TERMS_MISMATCH", "warn",
                                   f"Stated terms are {terms} days but issue-to-due "
                                   f"is {days} days.", ["due_date"], "dates"))
    if issue and issue > date(2026, 8, 17):
        out.append(Finding("FUTURE_DATED", "high",
                           f"issue_date {issue} is in the future. Pre-billing is the "
                           "single most common eligibility breach.",
                           ["issue_date"], "eligibility"))
    return out


def v_identifiers(inv: dict) -> list[Finding]:
    out = []
    seller = inv.get("seller", {})
    country, vat = seller.get("country"), seller.get("vat_id")
    pat = VAT_ID_PATTERN.get(country)
    if pat and vat and not re.match(pat, vat.replace(" ", "")):
        out.append(Finding("VAT_ID_MALFORMED", "high",
                           f"seller VAT/tax ID '{vat}' does not match the {country} "
                           "format. Registry lookup (VIES/GSTIN) required.",
                           ["seller.vat_id"], "identity"))
    payee_iban = (inv.get("payee") or {}).get("iban") or seller.get("iban")
    if payee_iban and not payee_iban.startswith(("US", "AU")):
        if not iban_valid(payee_iban):
            out.append(Finding("IBAN_CHECKSUM_FAIL", "critical",
                               f"IBAN '{payee_iban}' fails the mod-97 checksum. "
                               "Either an OCR error or a tampered remit-to line. "
                               "Do not fund.", ["payee.iban"], "payment_integrity"))
    return out


def v_payee_assignment(inv: dict) -> list[Finding]:
    """EN 16931 models Payee separately from Seller. In factoring that is the point."""
    out = []
    seller = inv.get("seller", {})
    payee = inv.get("payee") or {}
    if not payee:
        return out
    if payee.get("name") and payee["name"].strip().lower() != seller.get("name", "").strip().lower():
        out.append(Finding("PAYEE_NOT_SELLER", "critical",
                           f"Payee '{payee['name']}' differs from Seller "
                           f"'{seller.get('name')}'. This invoice already carries an "
                           "assignment to a third party. Funding it risks financing a "
                           "receivable that has been sold to another funder.",
                           ["payee.name"], "duplicate_financing"))
    return out


def v_bank_change(inv: dict, master: dict) -> list[Finding]:
    out = []
    sid = inv.get("seller", {}).get("supplier_id")
    rec = master.get(sid)
    if not rec:
        out.append(Finding("SUPPLIER_UNKNOWN", "warn",
                           f"Supplier id '{sid}' is not in the vendor master. "
                           "First-time supplier: full KYB required before funding.",
                           ["seller.name"], "master_data"))
        return out
    seen = (inv.get("payee") or {}).get("iban") or inv.get("seller", {}).get("iban")
    known = rec.get("iban")
    if seen and known and re.sub(r"\s", "", seen) != re.sub(r"\s", "", known):
        out.append(Finding("REMIT_TO_CHANGED", "critical",
                           f"Remit-to account changed from {known} (on file) to "
                           f"{seen} (on this invoice). This is the exact shape of an "
                           "invoice-redirection attack. Out-of-band callback to a "
                           "known contact required before funding.",
                           ["payee.iban"], "payment_integrity"))
    if rec.get("vat_id") and inv.get("seller", {}).get("vat_id") and \
       rec["vat_id"] != inv["seller"]["vat_id"]:
        out.append(Finding("VAT_ID_CHANGED", "high",
                           f"Seller VAT ID differs from master ({rec['vat_id']}).",
                           ["seller.vat_id"], "master_data"))
    return out


def v_po_match(inv: dict, pos: dict) -> list[Finding]:
    """Two-way match against the buyer PO. Three-way needs the GRN."""
    out = []
    po = inv.get("po_number")
    if not po:
        out.append(Finding("NO_PO", "warn",
                           "No PO reference. Two-way match impossible: eligibility "
                           "rests on debtor confirmation alone.",
                           ["po_number"], "matching"))
        return out
    rec = pos.get(po)
    if not rec:
        out.append(Finding("PO_NOT_FOUND", "high",
                           f"PO '{po}' not found in the buyer PO feed.",
                           ["po_number"], "matching"))
        return out
    if rec.get("buyer_vat_id") and inv.get("buyer", {}).get("vat_id") and \
       rec["buyer_vat_id"] != inv["buyer"]["vat_id"]:
        out.append(Finding("PO_BUYER_MISMATCH", "critical",
                           "PO belongs to a different buyer entity than the invoice "
                           "names.", ["buyer.vat_id"], "matching"))
    open_amt = rec.get("open_amount")
    if open_amt is not None and (inv.get("total_due") or 0) > open_amt * 1.02:
        out.append(Finding("PO_OVERBILL", "high",
                           f"Invoice {inv['total_due']:,.2f} exceeds PO open balance "
                           f"{open_amt:,.2f}. Value-inflation typology.",
                           ["total_due"], "matching"))
    return out


def v_regime(inv: dict) -> list[Finding]:
    """Trust weight of the source channel. This is the 'why now' lever."""
    out = []
    country = inv.get("buyer", {}).get("country") or inv.get("seller", {}).get("country")
    ch = inv.get("source_channel")
    cid = inv.get("clearance_id")
    if country in CLEARANCE_REGIMES:
        if cid:
            out.append(Finding("CLEARANCE_ATTESTED", "info",
                               f"{CLEARANCE_REGIMES[country]} identifier present "
                               f"({cid}). The tax authority independently attests this "
                               "invoice exists and was issued to this buyer. Strongest "
                               "verification artefact available, no debtor call needed.",
                               ["clearance_id"], "regime"))
        else:
            out.append(Finding("CLEARANCE_MISSING", "high",
                               f"{country} is a clearance regime "
                               f"({CLEARANCE_REGIMES[country]}) but no attested "
                               "identifier was found. A genuine invoice in this "
                               "corridor should have one.", ["clearance_id"], "regime"))
    elif country in DECENTRALISED_MANDATED and ch in ("peppol", "xml"):
        out.append(Finding("TRANSPORT_ONLY", "info",
                           f"{country} is a decentralised regime: the Peppol/EN 16931 "
                           "payload proves transport, not state attestation. Do not "
                           "treat structured as verified.", [], "regime"))
    if ch in ("xml", "peppol", "factur-x_xml"):
        out.append(Finding("STRUCTURED_INPUT", "info",
                           "Structured payload: extraction bypassed entirely, zero "
                           "OCR cost, zero extraction risk.", [], "regime"))
    return out


def v_hybrid_diff(inv: dict) -> list[Finding]:
    """Factur-X / ZUGFeRD: the XML is the operational source, the PDF layer is a sensor."""
    out = []
    # Profile sufficiency is a property of the document, not of whether a
    # divergence happens to exist. Checking it after an early return on an empty
    # diff made this control unreachable.
    profile = inv.get("facturx_profile")
    if profile and profile.upper() in ("MINIMUM", "BASIC WL", "BASIC"):
        out.append(Finding("FACTURX_PROFILE_INSUFFICIENT", "warn",
                           f"Factur-X profile '{profile}' is not fully EN 16931 "
                           "compliant: required business terms may be absent.",
                           [], "regime"))
    diff = inv.get("hybrid_diff")
    if not diff:
        return out
    for f, (xml_v, pdf_v) in diff.items():
        sev = "critical" if f in ("payee.iban", "total_due", "buyer.vat_id") else "high"
        out.append(Finding("HYBRID_DIVERGENCE", sev,
                           f"Hybrid PDF disagrees with its embedded XML on '{f}': "
                           f"XML says {xml_v!r}, the human-readable page says "
                           f"{pdf_v!r}. Treat as a fraud exception, never silently "
                           "reconcile.", [f], "hybrid_diff"))
    return out


def v_confidence(inv: dict) -> list[Finding]:
    out = []
    conf = inv.get("field_confidence", {})
    for fname, c in sorted(conf.items(), key=lambda kv: kv[1]):
        t = tier_of(fname)
        if c < TIER_THRESHOLD[t]:
            sev = {1: "high", 2: "warn", 3: "info"}[t]
            out.append(Finding("LOW_CONFIDENCE", sev,
                               f"'{fname}' extracted at {c:.2f} confidence, below the "
                               f"tier-{t} gate of {TIER_THRESHOLD[t]:.2f}. Queue a "
                               "targeted high-resolution re-read of its bounding box.",
                               [fname], "confidence"))
    missing_grounding = [f for f in conf if f not in inv.get("grounding", {})]
    if missing_grounding:
        out.append(Finding("NO_GROUNDING", "warn",
                           f"{len(missing_grounding)} field(s) returned with no page or "
                           "bounding box. Un-auditable in a field exam.",
                           missing_grounding[:5], "audit"))
    return out


# ------------------------------------------------------------ duplicate engine
def fingerprints(inv: dict) -> dict[str, str]:
    sid = inv.get("seller", {}).get("supplier_id") or ""
    num = inv.get("invoice_number") or ""
    tot = f"{inv.get('total_due') or 0:.2f}"
    cur = inv.get("currency") or ""
    d = parse_date(inv.get("issue_date"))
    return {
        "exact":       f"{sid}|{num}",
        "normalised":  f"{sid}|{normalise_invoice_number(num)}",
        "amount_date": f"{sid}|{tot}|{cur}|{d.isoformat() if d else ''}",
        "amount_po":   f"{sid}|{tot}|{inv.get('po_number') or ''}",
        "content":     inv.get("content_hash") or hashlib.sha256(
                           f"{sid}{num}{tot}".encode()).hexdigest()[:16],
    }


def v_duplicates(inv: dict, ledger: list[dict]) -> list[Finding]:
    out = []
    fp = fingerprints(inv)
    d_new = parse_date(inv.get("issue_date"))
    for prior in ledger:
        pfp = fingerprints(prior)
        if fp["exact"] == pfp["exact"]:
            out.append(Finding("DUPLICATE_EXACT", "critical",
                               f"Exact duplicate of {prior['doc_id']} "
                               f"(same supplier + invoice number), already funded.",
                               ["invoice_number"], "duplicate"))
            continue
        if fp["normalised"] == pfp["normalised"]:
            out.append(Finding("DUPLICATE_NORMALISED", "critical",
                               f"Invoice number '{inv.get('invoice_number')}' normalises "
                               f"to the same key as {prior['doc_id']} "
                               f"('{prior.get('invoice_number')}'). OCR character "
                               "confusion, not a different invoice.",
                               ["invoice_number"], "duplicate"))
            continue
        if fp["content"] == pfp["content"]:
            out.append(Finding("DUPLICATE_CONTENT_HASH", "critical",
                               f"Byte-level content hash matches {prior['doc_id']}: the "
                               "same file re-submitted through a different channel.",
                               [], "duplicate"))
            continue
        d_old = parse_date(prior.get("issue_date"))
        same_amt = rel_close(inv.get("total_due"), prior.get("total_due"), 0.005)
        near_date = d_new and d_old and abs((d_new - d_old).days) <= 3
        if same_amt and near_date and inv.get("currency") == prior.get("currency"):
            out.append(Finding("DUPLICATE_FUZZY", "high",
                               f"Same supplier, same amount and currency, issue dates "
                               f"{abs((d_new - d_old).days)} day(s) apart from "
                               f"{prior['doc_id']}. Probable re-presentation.",
                               ["total_due", "issue_date"], "duplicate"))
    return out


# ------------------------------------------------------------ decision routing
def score_and_route(findings: list[Finding]) -> dict[str, Any]:
    score = sum(SEVERITY_WEIGHT[f.severity] for f in findings)
    crit = [f for f in findings if f.severity == "critical"]
    high = [f for f in findings if f.severity == "high"]
    if crit:
        decision, reason = "BLOCK", f"{len(crit)} critical control failure(s)"
    elif score >= 30 or len(high) >= 2:
        decision, reason = "REVIEW", f"risk score {score}, {len(high)} high finding(s)"
    elif score > 0:
        decision, reason = "REVIEW_LIGHT", f"risk score {score}, no high findings"
    else:
        decision, reason = "AUTO_FUND", "all controls passed"
    return {"risk_score": score, "decision": decision, "reason": reason,
            "critical": len(crit), "high": len(high),
            "warn": len([f for f in findings if f.severity == "warn"]),
            "info": len([f for f in findings if f.severity == "info"])}


CONTROL_ORDER = ["regime", "arithmetic", "tax", "currency", "dates", "identity",
                 "payment_integrity", "master_data", "matching",
                 "duplicate_financing", "duplicate", "hybrid_diff",
                 "confidence", "eligibility", "audit"]


def run_controls(inv: dict, master: dict, pos: dict, ledger: list[dict]) -> dict[str, Any]:
    findings: list[Finding] = []
    findings += v_regime(inv)
    findings += v_hybrid_diff(inv)
    findings += v_line_arithmetic(inv)
    findings += v_totals(inv)
    findings += v_tax(inv)
    findings += v_currency(inv)
    findings += v_dates(inv)
    findings += v_identifiers(inv)
    findings += v_payee_assignment(inv)
    findings += v_bank_change(inv, master)
    findings += v_po_match(inv, pos)
    findings += v_duplicates(inv, ledger)
    findings += v_confidence(inv)
    findings.sort(key=lambda f: (-SEVERITY_WEIGHT[f.severity],
                                 CONTROL_ORDER.index(f.control) if f.control in CONTROL_ORDER else 99))
    routing = score_and_route(findings)
    return {
        "doc_id": inv["doc_id"],
        "label": inv.get("label", ""),
        "corridor": f"{inv.get('seller', {}).get('country')} to {inv.get('buyer', {}).get('country')}",
        "channel": inv.get("source_channel"),
        "currency": inv.get("currency"),
        "total_due": inv.get("total_due"),
        "invoice_number": inv.get("invoice_number"),
        "seller": inv.get("seller", {}).get("name"),
        "buyer": inv.get("buyer", {}).get("name"),
        "clearance_id": inv.get("clearance_id"),
        "findings": [f.as_dict() for f in findings],
        **routing,
    }
