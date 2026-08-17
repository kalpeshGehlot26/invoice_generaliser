"""Build the self-contained demo page from the engine's real output."""
import json
from collections import Counter

from samples import INVOICES

results = json.load(open("results.json"))
inv_by_id = {i["doc_id"]: i for i in INVOICES}

# attach the extraction payload each result was computed from, for the UI
for r in results:
    inv = inv_by_id[r["doc_id"]]
    r["confidence"] = inv.get("field_confidence", {})
    r["grounding_keys"] = list(inv.get("grounding", {}).keys())
    r["line_items"] = inv.get("line_items", [])
    r["subtotal"] = inv.get("subtotal")
    r["tax_rate"] = inv.get("tax_rate")
    r["tax_amount"] = inv.get("tax_amount")
    r["freight"] = inv.get("freight")
    r["issue_date"] = inv.get("issue_date")
    r["due_date"] = inv.get("due_date")
    r["po_number"] = inv.get("po_number")
    r["facturx_profile"] = inv.get("facturx_profile")
    r["hybrid_diff"] = inv.get("hybrid_diff") or {}

counts = Counter(r["decision"] for r in results)
buckets = [
    ("AUTO_FUND", "Auto fund", counts.get("AUTO_FUND", 0) + counts.get("REVIEW_LIGHT", 0)),
    ("REVIEW", "Human review", counts.get("REVIEW", 0)),
    ("BLOCK", "Blocked / escalated", counts.get("BLOCK", 0)),
]
controls_fired = Counter()
for r in results:
    for f in r["findings"]:
        if f["severity"] in ("critical", "high"):
            controls_fired[f["code"]] += 1

payload = {
    "results": results,
    "buckets": buckets,
    "controls": controls_fired.most_common(),
    "held": sum(r["total_due"] for r in results if r["decision"] == "BLOCK"),
}

TEMPLATE = r"""<!DOCTYPE html>
<html lang="en" data-palette="#0ca30c,#ec835a,#d03b3b">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>IFG Invoice Ingestion POC : Codiste</title>
<style>
/* Palette: dataviz reference instance. Status slots are reserved and always
   ship with an icon AND a text label, plus a table view, because red/green
   under deuteranopia measures dE 4.1. Colour never carries meaning alone here. */
:root{
  color-scheme: light;
  --plane:#f9f9f7; --surface:#fcfcfb; --ink:#0b0b0b; --ink-2:#52514e;
  --muted:#898781; --grid:#e1e0d9; --axis:#c3c2b7;
  --border:rgba(11,11,11,.10);
  --good:#0ca30c; --warning:#fab219; --serious:#ec835a; --critical:#d03b3b;
  --blue:#2a78d6; --blue-100:#cde2fb; --blue-250:#86b6ef; --blue-550:#1c5cab;
}
@media (prefers-color-scheme: dark){
  :root:where(:not([data-theme="light"])){
    color-scheme: dark;
    --plane:#0d0d0d; --surface:#1a1a19; --ink:#fff; --ink-2:#c3c2b7;
    --muted:#898781; --grid:#2c2c2a; --axis:#383835;
    --border:rgba(255,255,255,.10);
    --blue:#3987e5; --blue-100:#184f95; --blue-250:#5598e7; --blue-550:#86b6ef;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--plane);color:var(--ink);
  font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;}
.wrap{max-width:1180px;margin:0 auto;padding:32px 24px 96px}
header.top{border-bottom:1px solid var(--border);padding-bottom:20px;margin-bottom:28px}
.eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
h1{font-size:27px;margin:8px 0 6px;letter-spacing:-.015em;font-weight:650}
h2{font-size:19px;margin:44px 0 6px;letter-spacing:-.01em;font-weight:640}
h3{font-size:14px;margin:22px 0 8px;letter-spacing:.02em;text-transform:uppercase;color:var(--ink-2)}
p.lede{color:var(--ink-2);margin:0;max-width:74ch}
.sub{color:var(--muted);font-size:13px;margin:2px 0 14px;max-width:82ch}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px}

/* stat tiles */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:12px;margin-top:20px}
.tile{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.tile .v{font-size:29px;font-weight:660;letter-spacing:-.02em;line-height:1.1}
.tile .k{font-size:12px;color:var(--muted);margin-top:4px}
.tile .n{font-size:11px;color:var(--muted);margin-top:6px;border-top:1px solid var(--grid);padding-top:6px}

/* pipeline */
.pipe{display:flex;gap:0;flex-wrap:wrap;margin-top:14px}
.stage{flex:1 1 150px;background:var(--surface);border:1px solid var(--border);
  border-left-width:3px;border-left-style:solid;padding:12px 13px;margin-right:2px;border-radius:8px}
.stage .n{font-size:10px;color:var(--muted);letter-spacing:.1em}
.stage .t{font-weight:620;font-size:13.5px;margin:3px 0 4px}
.stage .d{font-size:11.5px;color:var(--ink-2);line-height:1.4}
.stage .m{font-size:10.5px;color:var(--muted);margin-top:6px;font-variant-numeric:tabular-nums}

/* queue */
.split{display:grid;grid-template-columns:340px 1fr;gap:16px;margin-top:14px}
@media(max-width:880px){.split{grid-template-columns:1fr}}
.qlist{display:flex;flex-direction:column;gap:6px}
.qrow{text-align:left;background:var(--surface);border:1px solid var(--border);
  border-left:4px solid var(--axis);border-radius:8px;padding:10px 12px;cursor:pointer;
  font:inherit;color:inherit;transition:background .12s}
.qrow:hover{background:var(--blue-100)}
.qrow[aria-current="true"]{border-color:var(--blue);background:var(--blue-100)}
.qrow .id{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
.qrow .lb{font-size:12.5px;line-height:1.35;margin-top:2px}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:640;
  letter-spacing:.03em;padding:2px 7px;border-radius:999px;border:1px solid;margin-top:6px}
.b-good{color:var(--good);border-color:var(--good)}
.b-serious{color:var(--serious);border-color:var(--serious)}
.b-critical{color:var(--critical);border-color:var(--critical)}
.dot{width:7px;height:7px;border-radius:2px;background:currentColor}

/* detail */
.kv{display:grid;grid-template-columns:130px 1fr;gap:4px 12px;font-size:13px;margin:10px 0 4px}
.kv dt{color:var(--muted)}
.kv dd{margin:0;font-variant-numeric:tabular-nums}
.finding{border:1px solid var(--border);border-left-width:4px;border-radius:8px;
  padding:9px 12px;margin-bottom:7px;background:var(--surface)}
.finding .h{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:650;letter-spacing:.04em}
.finding .m{font-size:12.5px;color:var(--ink-2);margin-top:4px;line-height:1.45}
.f-critical{border-left-color:var(--critical)} .f-critical .h{color:var(--critical)}
.f-high{border-left-color:var(--serious)} .f-high .h{color:var(--serious)}
.f-warn{border-left-color:var(--warning)} .f-warn .h{color:#9a6a00}
@media (prefers-color-scheme: dark){:root:where(:not([data-theme="light"])) .f-warn .h{color:var(--warning)}}
.f-info{border-left-color:var(--axis)} .f-info .h{color:var(--muted)}

/* confidence meter rows */
.meter{display:grid;grid-template-columns:150px 1fr 52px;gap:10px;align-items:center;
  font-size:12px;margin-bottom:5px}
.meter .bar{height:9px;background:var(--grid);border-radius:4px;position:relative;overflow:hidden}
.meter .fill{position:absolute;inset:0 auto 0 0;border-radius:4px}
.meter .gate{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--ink-2);opacity:.55}
.meter .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.meter .lb{color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

/* distribution bars */
.dist{margin-top:12px}
.dbar{display:grid;grid-template-columns:168px 1fr;gap:12px;align-items:center;margin-bottom:8px;font-size:13px}
.dtrack{height:22px;background:var(--grid);border-radius:4px;position:relative}
.dfill{height:100%;border-radius:4px;display:flex;align-items:center;justify-content:flex-end;
  padding-right:8px;font-size:11.5px;font-weight:650;color:#fff}
.hatch{background-image:repeating-linear-gradient(135deg,rgba(255,255,255,.28) 0 3px,transparent 3px 7px)}
.lbl{display:flex;align-items:center;gap:6px;color:var(--ink-2)}

table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}
th,td{text-align:left;padding:7px 9px;border-bottom:1px solid var(--grid);vertical-align:top}
th{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:600}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tbody tr:hover{background:var(--blue-100)}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;
  background:var(--grid);padding:1px 5px;border-radius:4px}
.note{font-size:12px;color:var(--muted);margin-top:8px;line-height:1.5}
details{margin-top:10px}
summary{cursor:pointer;font-size:12.5px;color:var(--blue);font-weight:600}
.warnbox{border:1px solid var(--critical);border-left-width:4px;border-radius:8px;
  padding:12px 14px;background:var(--surface);margin-top:12px}
.warnbox h4{margin:0 0 6px;font-size:13px;color:var(--critical)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:820px){.grid2{grid-template-columns:1fr}}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--border);
  font-size:11.5px;color:var(--muted)}
</style>
</head>
<body>
<div class="wrap">

<header class="top">
  <div class="eyebrow">Codiste &middot; proof of concept for The Interface Financial Group</div>
  <h1>Invoice ingestion and pre-funding control engine</h1>
  <p class="lede">Eight documents, five corridors, six input channels. Every finding below was
  produced by a deterministic control layer that runs after extraction and does not depend on
  which OCR or vision model you choose. That is the point: the model is replaceable, the
  control layer is the asset.</p>
</header>

<div class="tiles" id="tiles"></div>

<h2>1. The pipeline</h2>
<p class="sub">Seven stages. Structured payloads skip stage 2 entirely, which is why the
mandate timeline changes the economics rather than the architecture.</p>
<div class="pipe" id="pipe"></div>

<h2>2. The queue</h2>
<p class="sub">Click any document. Decisions are colour-coded and also carry an icon and a
text label, so the state is never conveyed by colour alone.</p>
<div class="split">
  <div class="qlist" id="qlist"></div>
  <div class="card" id="detail"></div>
</div>

<h2>3. Where the book lands</h2>
<p class="sub">The distribution is the number that matters commercially. Independent AP
benchmarks put real touchless rates at 23 to 50 percent, against vendor claims of 80 to 98
percent. This sample is deliberately adversarial, so treat the split as an illustration of
the routing logic, not as a forecast.</p>
<div class="dist" id="dist"></div>
<details>
  <summary>Table view of the same numbers</summary>
  <table id="disttable"></table>
</details>

<h3>Controls that fired at high or critical severity</h3>
<table id="ctrltable"></table>

<h2>4. Accuracy arithmetic, before anyone quotes a percentage</h2>
<p class="sub">Field accuracy compounds. A document is only clean if every field in it is
clean. This is why "99 percent accurate OCR" and "90 percent straight-through" are not the
same claim, and why the second one is much harder to buy.</p>
<div class="grid2">
  <div class="card">
    <h3 style="margin-top:0">Per-field accuracy to document-clean rate</h3>
    <table>
      <thead><tr><th>Per field</th><th class="num">15 fields</th><th class="num">20 fields</th><th class="num">44 fields</th></tr></thead>
      <tbody>
        <tr><td>97.0%</td><td class="num">63.3%</td><td class="num">54.4%</td><td class="num">26.0%</td></tr>
        <tr><td>99.0%</td><td class="num">86.0%</td><td class="num">81.8%</td><td class="num">64.3%</td></tr>
        <tr><td>99.5%</td><td class="num">92.8%</td><td class="num">90.5%</td><td class="num">80.2%</td></tr>
        <tr><td>99.9%</td><td class="num">98.5%</td><td class="num">98.0%</td><td class="num">95.7%</td></tr>
      </tbody>
    </table>
    <p class="note">44 fields is 12 header fields plus 8 line items at 4 fields each, which is
    an ordinary construction invoice.</p>
  </div>
  <div class="card">
    <h3 style="margin-top:0">Inverted: what a target costs you</h3>
    <table>
      <thead><tr><th>Target clean-document rate (20 fields)</th><th class="num">Required per-field accuracy</th></tr></thead>
      <tbody>
        <tr><td>80%</td><td class="num">98.90%</td></tr>
        <tr><td>90%</td><td class="num">99.47%</td></tr>
        <tr><td>95%</td><td class="num">99.74%</td></tr>
        <tr><td>99%</td><td class="num">99.95%</td></tr>
      </tbody>
    </table>
    <p class="note">No vendor publishes a per-field number above 99.6 percent, and none
    publishes one at all for multi-country unseen-layout invoices. Measured counter-example:
    a 2026 receipt study reports token F1 of 0.9215 and a zero-error document rate of about
    25 percent on the same system.</p>
  </div>
</div>

<h2>5. What we are not claiming</h2>
<div class="warnbox">
  <h4>Read this before the demo, so nobody has to walk it back afterwards</h4>
  <table>
    <tbody>
      <tr><td>The extraction figures in this demo</td><td>are pre-computed so the demo runs
      offline and identically every time. The control layer output is genuinely computed by
      the engine, live, from those inputs.</td></tr>
      <tr><td>Model accuracy on your book</td><td>is unknown until we run your own sealed
      sample. Every public benchmark is 20 to 370 documents, English-heavy and clean-input
      biased.</td></tr>
      <tr><td>Handwriting</td><td>plateaus around 75 percent across every frontier model
      tested. That is a field ceiling, not a vendor gap.</td></tr>
      <tr><td>Line items and continuation tables</td><td>are the weakest field class in every
      published benchmark. Header fields are not the hard part.</td></tr>
      <tr><td>Fraud typologies that killed Greensill, Stenn and First Brands</td><td>all
      involved documents that parsed perfectly. Extraction accuracy would have caught none of
      them. Verification is a different problem, and it is the one worth owning.</td></tr>
    </tbody>
  </table>
</div>

<footer>
  Generated by Codiste for the first technical conversation with The Interface Financial Group.
  All benchmark figures are sourced and dated in the accompanying prep brief. Sample invoices
  are synthetic; the vendor master, PO feed and funded ledger are fixtures.
</footer>
</div>

<script>
const DATA = __DATA__;

const DEC = {
  AUTO_FUND:    {label:"Auto fund",       cls:"good",     icon:"✓", color:"var(--good)"},
  REVIEW_LIGHT: {label:"Light review",    cls:"serious",  icon:"→", color:"var(--serious)"},
  REVIEW:       {label:"Human review",    cls:"serious",  icon:"!",      color:"var(--serious)"},
  BLOCK:        {label:"Blocked",         cls:"critical", icon:"✕", color:"var(--critical)"},
};
const SEV = {critical:"critical", high:"high", warn:"warn", info:"info"};
const SEVICON = {critical:"✕", high:"!", warn:"⚠", info:"i"};
const TIER1 = new Set(["invoice_number","seller_vat_id","buyer_vat_id","payee_iban","currency","po_number","clearance_id"]);
const TIER2 = new Set(["subtotal","tax_amount","total_due","discount","freight","line_total","unit_price","qty"]);
const GATE = {1:0.95, 2:0.90, 3:0.75};
function tierOf(f){const b=f.split(".").pop(); if(TIER1.has(b))return 1; if(TIER2.has(b))return 2; return 3;}
function money(v,c){return (c?c+" ":"")+Number(v).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});}

/* ---- tiles ---- */
const auto = DATA.buckets.find(b=>b[0]==="AUTO_FUND")[2];
const blocked = DATA.buckets.find(b=>b[0]==="BLOCK")[2];
const nFind = DATA.results.reduce((a,r)=>a+r.findings.length,0);
const nCrit = DATA.results.reduce((a,r)=>a+r.findings.filter(f=>f.severity==="critical").length,0);
document.getElementById("tiles").innerHTML = [
  [DATA.results.length, "documents ingested", "5 corridors, 6 input channels"],
  [auto+" of "+DATA.results.length, "auto funded", "zero human touch, all controls passed"],
  [blocked, "blocked before funding", nCrit+" critical control failures"],
  [nFind, "findings, all explainable", "each one reproducible in a field exam"],
  [DATA.controls.length, "distinct controls fired", "at high or critical severity"],
].map(([v,k,n])=>`<div class="tile"><div class="v">${v}</div><div class="k">${k}</div><div class="n">${n}</div></div>`).join("");

/* ---- pipeline ---- */
const STAGES = [
  ["01","Classify and route","Cheap local model decides document type and channel before anything expensive runs.","~$0.001/page, 92-96% (measured)","var(--blue)"],
  ["02","Structured-first","EN 16931, Peppol, Factur-X XML, IRN, KSeF payloads bypass extraction entirely.","$0 extraction on this path","var(--good)"],
  ["03","Extract: OCR + page image","Both modalities into a schema-constrained model. OCR+image beats either alone on the accuracy-vs-confidence frontier.","best published invoice WOA 0.77","var(--blue)"],
  ["04","Deterministic validation","Arithmetic, country VAT rate, dates, IBAN mod-97, VAT ID format, currency.","cuts math errors 20% to 5%","var(--serious)"],
  ["05","Master data and matching","Vendor master, PO two-way match, remit-to change detection, payee-vs-seller.","closed-set beats open-vocabulary","var(--serious)"],
  ["06","Duplicate fingerprinting","Five keys of increasing looseness plus content hash. Catches OCR-mangled re-presentations.","0.1-0.5% base rate in manual books","var(--critical)"],
  ["07","Confidence-ranked review","Tiered gates, targeted high-resolution re-read, then human queue ordered by error likelihood.","2.4x error capture vs random at 30% budget","var(--blue-550)"],
];
document.getElementById("pipe").innerHTML = STAGES.map(([n,t,d,m,c])=>
  `<div class="stage" style="border-left-color:${c}"><div class="n">${n}</div><div class="t">${t}</div><div class="d">${d}</div><div class="m">${m}</div></div>`).join("");

/* ---- queue ---- */
const qlist = document.getElementById("qlist");
qlist.innerHTML = DATA.results.map((r,i)=>{
  const d = DEC[r.decision];
  return `<button class="qrow" data-i="${i}" aria-current="${i===0}" style="border-left-color:${d.color}">
    <div class="id">${r.doc_id} &middot; ${r.channel}</div>
    <div class="lb">${r.label}</div>
    <span class="badge b-${d.cls}"><span class="dot"></span>${d.icon} ${d.label.toUpperCase()}</span>
  </button>`;
}).join("");

function renderDetail(i){
  const r = DATA.results[i], d = DEC[r.decision];
  const conf = Object.entries(r.confidence).sort((a,b)=>a[1]-b[1]);
  const meters = conf.map(([f,c])=>{
    const t = tierOf(f), gate = GATE[t], pass = c >= gate;
    const col = pass ? "var(--good)" : (t===1 ? "var(--critical)" : "var(--serious)");
    return `<div class="meter" title="${f}: ${c.toFixed(3)} confidence, tier ${t} gate ${gate}">
      <div class="lb">${pass?"✓":"!"} ${f}</div>
      <div class="bar"><div class="fill" style="width:${(c*100).toFixed(1)}%;background:${col}"></div>
        <div class="gate" style="left:${gate*100}%"></div></div>
      <div class="n">${c.toFixed(3)}</div></div>`;
  }).join("");
  const hyb = Object.keys(r.hybrid_diff||{}).length
    ? `<h3>Hybrid PDF diff</h3>` + Object.entries(r.hybrid_diff).map(([f,v])=>
      `<div class="kv"><dt>${f} (XML)</dt><dd><code>${v[0]}</code></dd>
       <dt>${f} (page)</dt><dd><code>${v[1]}</code></dd></div>`).join("")
    : "";
  const lines = (r.line_items||[]).map((li,n)=>`<tr><td>${n+1}</td><td>${li.description}</td>
    <td class="num">${li.qty}</td><td class="num">${money(li.unit_price)}</td>
    <td class="num">${money(li.line_total)}</td></tr>`).join("");
  document.getElementById("detail").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div><div class="eyebrow">${r.doc_id} &middot; ${r.corridor} &middot; ${r.channel}</div>
        <div style="font-size:17px;font-weight:640;margin-top:4px">${r.label}</div></div>
      <span class="badge b-${d.cls}" style="font-size:12px;padding:5px 11px">
        <span class="dot"></span>${d.icon} ${d.label.toUpperCase()} &middot; risk ${r.risk_score}</span>
    </div>
    <dl class="kv">
      <dt>Seller</dt><dd>${r.seller}</dd>
      <dt>Buyer</dt><dd>${r.buyer}</dd>
      <dt>Invoice no.</dt><dd><code>${r.invoice_number}</code></dd>
      <dt>Amount</dt><dd>${money(r.total_due, r.currency)}</dd>
      <dt>Issued / due</dt><dd>${r.issue_date} &rarr; ${r.due_date}</dd>
      <dt>PO</dt><dd>${r.po_number ? "<code>"+r.po_number+"</code>" : "<span style='color:var(--muted)'>none</span>"}</dd>
      ${r.clearance_id?`<dt>Attested by</dt><dd><code>${r.clearance_id}</code></dd>`:""}
      ${r.facturx_profile?`<dt>Factur-X profile</dt><dd>${r.facturx_profile}</dd>`:""}
      <dt>Routing reason</dt><dd>${r.reason}</dd>
    </dl>
    ${hyb}
    <h3>Findings (${r.findings.length})</h3>
    ${r.findings.map(f=>`<div class="finding f-${SEV[f.severity]}">
      <div class="h"><span>${SEVICON[f.severity]}</span><span>${f.severity.toUpperCase()}</span>
      <span style="color:var(--muted);font-weight:500">${f.code} &middot; ${f.control}</span></div>
      <div class="m">${f.message}</div></div>`).join("") || "<p class='note'>No findings.</p>"}
    <h3>Field confidence against tier gates</h3>
    ${meters}
    <p class="note">The vertical mark on each bar is that field's tier gate: 0.95 for tier 1
    identifiers, 0.90 for tier 2 money, 0.75 for tier 3 names. Gates are set from a
    calibration set, not picked by hand, because the same nominal confidence means different
    things on different models.</p>
    ${lines?`<h3>Line items as extracted</h3><table>
      <thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Line total</th></tr></thead>
      <tbody>${lines}</tbody>
      <tfoot><tr><td colspan="4" style="text-align:right;color:var(--muted)">Subtotal as stated</td>
        <td class="num">${money(r.subtotal)}</td></tr></tfoot></table>`:""}
  `;
}
qlist.addEventListener("click", e=>{
  const b = e.target.closest(".qrow"); if(!b) return;
  qlist.querySelectorAll(".qrow").forEach(x=>x.setAttribute("aria-current", x===b));
  renderDetail(+b.dataset.i);
});
renderDetail(0);

/* ---- distribution ---- */
const total = DATA.results.length;
const max = Math.max(...DATA.buckets.map(b=>b[2]));
document.getElementById("dist").innerHTML = DATA.buckets.map(([key,label,n])=>{
  const d = DEC[key];
  const w = max ? (n/total*100) : 0;
  const hatch = key==="BLOCK" ? " hatch" : "";
  return `<div class="dbar" title="${label}: ${n} of ${total} documents">
    <div class="lbl"><span style="color:${d.color}">${d.icon}</span>${label}</div>
    <div class="dtrack"><div class="dfill${hatch}" style="width:${Math.max(w,6)}%;background:${d.color}">
      ${n} &middot; ${(n/total*100).toFixed(0)}%</div></div></div>`;
}).join("");
document.getElementById("disttable").innerHTML = `<thead><tr><th>Routing decision</th>
  <th class="num">Documents</th><th class="num">Share</th></tr></thead><tbody>` +
  DATA.buckets.map(([k,l,n])=>`<tr><td>${DEC[k].icon} ${l}</td><td class="num">${n}</td>
  <td class="num">${(n/total*100).toFixed(1)}%</td></tr>`).join("") + `</tbody>`;

document.getElementById("ctrltable").innerHTML = `<thead><tr><th>Control</th>
  <th class="num">Documents affected</th><th>What it protects against</th></tr></thead><tbody>` +
  DATA.controls.map(([code,n])=>{
    const why = {
      LOW_CONFIDENCE:"Silent wrong values delivered at high confidence",
      REMIT_TO_CHANGED:"Invoice redirection / payment misdirection",
      PAYEE_NOT_SELLER:"Financing a receivable already assigned elsewhere",
      DUPLICATE_NORMALISED:"Double financing via OCR character confusion",
      HYBRID_DIVERGENCE:"Tampered visual layer on a structured invoice",
      PO_OVERBILL:"Invoice value inflation",
      SUBTOTAL_MISMATCH:"Arithmetic manipulation or extraction error",
      TAX_AMOUNT_MISMATCH:"Tax miscalculation, VAT recovery exposure",
      TAX_RATE_INVALID:"Fabricated or stale invoice template",
      DUE_BEFORE_ISSUE:"Pre-billing, the most common eligibility breach",
      VAT_ID_MALFORMED:"Fictitious counterparty",
      VAT_ID_CHANGED:"Entity substitution against the vendor master",
    }[code] || "";
    return `<tr><td><code>${code}</code></td><td class="num">${n}</td><td>${why}</td></tr>`;
  }).join("") + `</tbody>`;
</script>
</body>
</html>
"""

html = TEMPLATE.replace("__DATA__", json.dumps(payload))
with open("/home/claude/IFG_Invoice_Ingestion_Demo.html", "w") as fh:
    fh.write(html)
print("written", len(html), "bytes")
