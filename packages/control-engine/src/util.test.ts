import { describe, expect, it } from "vitest";
import {
  daysBetween,
  fmtMoney,
  fmtRateList,
  ibanValid,
  normaliseInvoiceNumber,
  parseDate,
  pyFloat,
  pyRound,
  relClose,
} from "./util.js";

describe("pyRound", () => {
  it("rounds half to even, matching Python and not Math.round", () => {
    expect(pyRound(2.5)).toBe(2); // Math.round gives 3
    expect(pyRound(3.5)).toBe(4);
    expect(pyRound(0.5)).toBe(0);
    expect(pyRound(1.5)).toBe(2);
  });

  it("rounds to a digit count", () => {
    expect(pyRound(1234.5678, 2)).toBe(1234.57);
    expect(pyRound(28375.0 * 0.0, 2)).toBe(0);
  });
});

describe("ibanValid", () => {
  it("accepts real IBANs whose digit string exceeds MAX_SAFE_INTEGER", () => {
    // 27 chars -> ~32-digit numeric string. A Number-based mod would be wrong.
    expect(ibanValid("PL61109010140000071219812874")).toBe(true);
    expect(ibanValid("FR7630006000011234567890189")).toBe(true);
    expect(ibanValid("DE89370400440532013000")).toBe(true);
    expect(ibanValid("GB29NWBK60161331926819")).toBe(true);
  });

  it("proves the BigInt path is load-bearing", () => {
    const s = "PL61109010140000071219812874";
    const rearranged = s.slice(4) + s.slice(0, 4);
    let digits = "";
    for (const ch of rearranged) {
      digits += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    }
    // The naive Number path silently disagrees with the correct BigInt result.
    expect(Number(digits)).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(BigInt(digits) % 97n).toBe(1n);
  });

  it("rejects a tampered digit", () => {
    expect(ibanValid("DE89370400440532013001")).toBe(false);
  });

  it("rejects malformed and empty input", () => {
    expect(ibanValid("AU BSB 083-004 ACC 15872011")).toBe(false);
    expect(ibanValid(null)).toBe(false);
    expect(ibanValid("")).toBe(false);
  });

  it("ignores whitespace and case", () => {
    expect(ibanValid("de89 3704 0044 0532 0130 00")).toBe(true);
  });
});

describe("normaliseInvoiceNumber", () => {
  it("collapses the OCR confusion classes", () => {
    expect(normaliseInvoiceNumber("HPC-2O26-447I")).toBe(
      normaliseInvoiceNumber("HPC-2026-4471"),
    );
  });

  it("strips every leading zero, like Python lstrip", () => {
    expect(normaliseInvoiceNumber("000")).toBe("");
    expect(normaliseInvoiceNumber("007")).toBe("7");
  });

  it("returns empty for nullish input", () => {
    expect(normaliseInvoiceNumber(null)).toBe("");
  });
});

describe("parseDate", () => {
  it("parses ISO", () => {
    expect(parseDate("2026-08-04")?.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("tries day-first before month-first, matching the Python format order", () => {
    expect(parseDate("03/04/2026")?.toISOString().slice(0, 10)).toBe("2026-04-03");
  });

  it("falls through to month-first when day-first is impossible", () => {
    expect(parseDate("12/25/2026")?.toISOString().slice(0, 10)).toBe("2026-12-25");
  });

  it("parses dotted and abbreviated-month forms", () => {
    expect(parseDate("04.08.2026")?.toISOString().slice(0, 10)).toBe("2026-08-04");
    expect(parseDate("04-Aug-2026")?.toISOString().slice(0, 10)).toBe("2026-08-04");
  });

  it("returns null for unparseable and nullish input", () => {
    expect(parseDate("next Tuesday")).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate("2026-13-45")).toBeNull();
  });
});

describe("relClose", () => {
  it("is false when either side is nullish", () => {
    expect(relClose(null, 1)).toBe(false);
    expect(relClose(1, undefined)).toBe(false);
  });

  it("compares relative to the larger magnitude, verified against Python", () => {
    // 0.05/100.05 = 0.0005, inside the default 0.001 tolerance.
    expect(relClose(100.0, 100.05)).toBe(true);
    // 1/101 = 0.0099, outside it.
    expect(relClose(100.0, 101.0)).toBe(false);
    expect(relClose(100000.0, 100050.0, 0.01)).toBe(true);
  });

  it("uses a scale floor of 1.0 so small absolute values are not over-tolerant", () => {
    // Without the floor, 0.001 vs 0.002 would compare as close.
    expect(relClose(0.001, 0.002)).toBe(true);
    expect(relClose(0.0, 0.5)).toBe(false);
  });
});

describe("formatting", () => {
  it("renders money with comma grouping and two decimals", () => {
    expect(fmtMoney(28785)).toBe("28,785.00");
    expect(fmtMoney(1532160)).toBe("1,532,160.00");
    expect(fmtMoney(4759.2)).toBe("4,759.20");
  });

  it("keeps the .0 on integer-valued floats, like Python str()", () => {
    expect(pyFloat(20)).toBe("20.0");
    expect(pyFloat(17.5)).toBe("17.5");
    expect(pyFloat(14.975)).toBe("14.975");
  });

  it("renders a rate list as Python renders a sorted float list", () => {
    expect(fmtRateList([20.0, 5.0, 0.0])).toBe("[20.0, 5.0, 0.0]");
    expect(fmtRateList([0.0, 5.5, 20.0, 2.1, 10.0])).toBe("[20.0, 10.0, 5.5, 2.1, 0.0]");
  });
});

describe("daysBetween", () => {
  it("counts whole days", () => {
    expect(daysBetween(new Date("2026-09-03"), new Date("2026-08-04"))).toBe(30);
  });
});
