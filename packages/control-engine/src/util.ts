/**
 * Primitives shared by the controls.
 *
 * Several of these exist purely to reproduce Python semantics that JavaScript
 * does not share. Getting any of them wrong produces a control layer that looks
 * correct and silently disagrees with the reference implementation, so each is
 * covered by its own test.
 */

/** 0.1% relative tolerance for money comparisons. */
export const TOL = 0.001;

/**
 * Python's `round()`: half-to-even, not half-away-from-zero.
 * `round(2.5)` is 2 in Python and 3 in JavaScript, and money lands on `.5`
 * boundaries often enough that the difference is not theoretical.
 */
export function pyRound(value: number, digits = 0): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;

  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;

  return rounded / factor;
}

export function relClose(
  a: number | null | undefined,
  b: number | null | undefined,
  tol: number = TOL,
): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1.0);
  return Math.abs(a - b) / scale <= tol;
}

/**
 * Real ISO 13616 mod-97 check.
 *
 * The rearranged digit string runs past 30 characters, well beyond
 * Number.MAX_SAFE_INTEGER, so this must use BigInt. Doing it with Number
 * yields wrong remainders — and therefore wrong *valid* verdicts, silently.
 */
export function ibanValid(iban: string | null | undefined): boolean {
  if (!iban) return false;
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;

  const rearranged = s.slice(4) + s.slice(0, 4);
  let digits = "";
  for (const ch of rearranged) {
    digits += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  }
  return BigInt(digits) % 97n === 1n;
}

/** Collapse the OCR confusion classes that create false-negative duplicates. */
export function normaliseInvoiceNumber(num: string | null | undefined): string {
  if (!num) return "";
  let s = num.toUpperCase();
  const swaps: Array<[string, string]> = [
    ["O", "0"], ["I", "1"], ["L", "1"], ["S", "5"], ["B", "8"],
    ["Z", "2"], ["-", ""], ["/", ""], [" ", ""], ["_", ""],
  ];
  for (const [from, to] of swaps) s = s.split(from).join(to);
  // Python's lstrip("0") strips every leading zero: "000" becomes "".
  return s.replace(/^0+/, "");
}

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function makeDate(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return dt;
}

/**
 * Ported from engine.py's parse_date. Format order is load-bearing:
 * `%d/%m/%Y` is tried before `%m/%d/%Y`, so `03/04/2026` is 3 April.
 */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (m) return makeDate(+m[1]!, +m[2]!, +m[3]!);

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (m) {
    const dayFirst = makeDate(+m[3]!, +m[2]!, +m[1]!); // %d/%m/%Y
    if (dayFirst) return dayFirst;
    return makeDate(+m[3]!, +m[1]!, +m[2]!); // %m/%d/%Y
  }

  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value);
  if (m) return makeDate(+m[3]!, +m[2]!, +m[1]!);

  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (m) {
    const month = MONTH_ABBR[m[2]!.toLowerCase()];
    if (month) return makeDate(+m[3]!, month, +m[1]!);
  }

  return null;
}

/** Python prints a `date` as `2026-08-17`. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function daysBetween(later: Date, earlier: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

/** Python `f"{x:,.2f}"` — comma grouping, exactly two decimals. */
export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Python's `str(float)`: an integer-valued float keeps its `.0`.
 * `str(20.0)` is `"20.0"`, not `"20"`.
 */
export function pyFloat(n: number): string {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

/** Python's repr of a sorted float list: `[20.0, 5.0, 0.0]`. */
export function fmtRateList(rates: number[]): string {
  const desc = [...rates].sort((a, b) => b - a);
  return `[${desc.map(pyFloat).join(", ")}]`;
}
