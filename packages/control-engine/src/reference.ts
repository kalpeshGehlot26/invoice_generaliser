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
  // Added after AT produced TAX_COUNTRY_UNKNOWN on a real invoice. Note the
  // asymmetry: a missing country is a warn (8), a rate absent from a present
  // country is a high (30). So an incomplete set is safer than an inaccurate
  // one, and where a rate changed recently both values are listed rather than
  // risking a false alarm. This table is point-in-time and is not a substitute
  // for the registry validation in PRD section 5.
  AT: [20.0, 13.0, 10.0, 0.0],
  BE: [21.0, 12.0, 6.0, 0.0],
  DK: [25.0, 0.0],
  SE: [25.0, 12.0, 6.0, 0.0],
  FI: [25.5, 24.0, 14.0, 10.0, 0.0],
  PT: [23.0, 13.0, 6.0, 0.0],
  GR: [24.0, 13.0, 6.0, 0.0],
  HU: [27.0, 18.0, 5.0, 0.0],
  CZ: [21.0, 15.0, 12.0, 0.0],
  RO: [19.0, 11.0, 9.0, 5.0, 0.0],
  NO: [25.0, 15.0, 12.0, 0.0],
  CH: [8.1, 7.7, 3.8, 2.6, 0.0],
  NZ: [15.0, 0.0],
  JP: [10.0, 8.0, 0.0],
  AE: [5.0, 0.0],
  SA: [15.0, 0.0],
  ZA: [15.0, 0.0],
};

export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR", PL: "PLN",
  NL: "EUR", IE: "EUR", GB: "GBP", AU: "AUD", IN: "INR",
  SG: "SGD", US: "USD", CA: "CAD",
  AT: "EUR", BE: "EUR", DK: "DKK", SE: "SEK", FI: "EUR",
  PT: "EUR", GR: "EUR", HU: "HUF", CZ: "CZK", RO: "RON",
  NO: "NOK", CH: "CHF", NZ: "NZD", JP: "JPY", AE: "AED",
  SA: "SAR", ZA: "ZAR",
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
