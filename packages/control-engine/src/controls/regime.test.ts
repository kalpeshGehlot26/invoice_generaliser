import { describe, expect, it } from "vitest";
import type { Invoice } from "../types.js";
import { vHybridDiff, vRegime } from "./regime.js";

const base = (over: Partial<Invoice> = {}): Invoice => ({
  doc_id: "T-1",
  seller: { country: "DE" },
  buyer: { country: "DE" },
  ...over,
});

describe("vRegime", () => {
  it("reports a clearance identifier as attested", () => {
    const f = vRegime(base({ seller: { country: "PL" }, buyer: { country: "PL" }, clearance_id: "KSEF-1" }));
    expect(f.map((x) => x.code)).toContain("CLEARANCE_ATTESTED");
  });

  it("flags a clearance regime with no identifier", () => {
    const f = vRegime(base({ seller: { country: "PL" }, buyer: { country: "PL" } }));
    expect(f.map((x) => x.code)).toContain("CLEARANCE_MISSING");
  });

  it("treats a decentralised regime's structured payload as transport only", () => {
    const f = vRegime(base({ source_channel: "peppol" }));
    expect(f.map((x) => x.code)).toEqual(["TRANSPORT_ONLY", "STRUCTURED_INPUT"]);
  });

  it("prefers the buyer country over the seller country", () => {
    const f = vRegime(base({ seller: { country: "DE" }, buyer: { country: "PL" } }));
    expect(f.map((x) => x.code)).toContain("CLEARANCE_MISSING");
  });
});

describe("vHybridDiff", () => {
  it("raises a critical divergence on money-directing fields", () => {
    const f = vHybridDiff(
      base({ hybrid_diff: { "payee.iban": ["DE89...", "DE21..."] } }),
    );
    expect(f[0]!.code).toBe("HYBRID_DIVERGENCE");
    expect(f[0]!.severity).toBe("critical");
  });

  it("raises a high divergence on other fields", () => {
    const f = vHybridDiff(base({ hybrid_diff: { seller_name: ["A", "B"] } }));
    expect(f[0]!.severity).toBe("high");
  });

  /**
   * PINNED KNOWN DEFECT, ported deliberately.
   *
   * engine.py returns early on a falsy `hybrid_diff`, so a document with an
   * empty diff never reaches the profile check below it. The result is that
   * FACTURX_PROFILE_INSUFFICIENT is unreachable unless a divergence also
   * exists — even though the PRD lists it as a control in its own right, and
   * DOC-0003 ("insufficient Factur-X profile") is the fixture built to
   * demonstrate it. Confirmed against results.json: the code never appears.
   *
   * The port reproduces this exactly. Changing it is a behaviour change and
   * must break this test on purpose.
   */
  it("cannot report an insufficient profile when the diff is empty (known defect)", () => {
    const f = vHybridDiff(base({ facturx_profile: "BASIC", hybrid_diff: {} }));
    expect(f).toEqual([]);
  });

  it("reports an insufficient profile only alongside a divergence", () => {
    const f = vHybridDiff(
      base({ facturx_profile: "BASIC", hybrid_diff: { total_due: ["1", "2"] } }),
    );
    expect(f.map((x) => x.code)).toEqual([
      "FACTURX_PROFILE_INSUFFICIENT",
      "HYBRID_DIVERGENCE",
    ]);
  });
});
