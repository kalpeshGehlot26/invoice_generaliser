/**
 * Country reference tables, ported verbatim from engine.py.
 *
 * `null` for a country means "no national rate set" (US sales tax is
 * state/county level), which is distinct from the country being absent
 * from the table entirely.
 */
export const VALID_RATES: Record<string, number[] | null> = {
  DE: [19.0, 7.0, 0.0],
  FR: [20.0, 10.0, 5.5, 2.1, 0.0],
  IT: [22.0, 10.0, 5.0, 4.0, 0.0],
  ES: [21.0, 10.0, 4.0, 0.0],
  PL: [23.0, 8.0, 5.0, 0.0],
  NL: [21.0, 9.0, 0.0],
  IE: [23.0, 13.5, 9.0, 0.0],
  GB: [20.0, 5.0, 0.0],
  AU: [10.0, 0.0],
  IN: [28.0, 18.0, 12.0, 5.0, 0.0],
  SG: [9.0, 0.0],
  US: null,
  CA: [5.0, 13.0, 14.975, 15.0, 0.0],
};

export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", PL: "PLN",
  NL: "EUR", IE: "EUR", GB: "GBP", AU: "AUD", IN: "INR",
  SG: "SGD", US: "USD", CA: "CAD",
};

export const VAT_ID_PATTERN: Record<string, RegExp> = {
  DE: /^DE\d{9}$/,
  FR: /^FR[0-9A-Z]{2}\d{9}$/,
  IT: /^IT\d{11}$/,
  ES: /^ES[0-9A-Z]\d{7}[0-9A-Z]$/,
  PL: /^PL\d{10}$/,
  NL: /^NL\d{9}B\d{2}$/,
  IE: /^IE\d{7}[A-W][A-I]?$/,
  GB: /^GB(\d{9}|\d{12})$/,
  AU: /^\d{11}$/,
  IN: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
};

/** Regimes that produce a state-attested invoice identifier. */
export const CLEARANCE_REGIMES: Record<string, string> = {
  IT: "SdI", PL: "KSeF", IN: "IRP/IRN", SA: "ZATCA",
  MX: "SAT/CFDI", BR: "SEFAZ/NF-e", TR: "GIB",
};

/** Live-mandated but decentralised: the payload proves transport, not attestation. */
export const DECENTRALISED_MANDATED = new Set(["DE", "BE", "DK", "HR", "FR"]);
