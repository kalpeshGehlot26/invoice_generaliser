import type { Finding, Invoice } from "../types.js";
import { daysBetween, isoDate, parseDate } from "../util.js";

/**
 * engine.py hardcodes `date(2026, 8, 17)` here, which means the control's
 * meaning drifts every day the file is not edited. Injected instead, defaulting
 * to the same literal so the reference behaviour is preserved exactly.
 */
export const DEFAULT_TODAY = new Date(Date.UTC(2026, 7, 17));

export function vDates(inv: Invoice, today: Date = DEFAULT_TODAY): Finding[] {
  const out: Finding[] = [];
  const issue = parseDate(inv.issue_date);
  const due = parseDate(inv.due_date);

  if (issue && due) {
    if (due.getTime() < issue.getTime()) {
      out.push({
        code: "DUE_BEFORE_ISSUE",
        severity: "high",
        message: `due_date ${isoDate(due)} precedes issue_date ${isoDate(issue)}.`,
        fields: ["due_date"],
        control: "dates",
      });
    } else {
      const days = daysBetween(due, issue);
      const terms = inv.payment_terms_days;
      if (terms && Math.abs(days - terms) > 2) {
        out.push({
          code: "TERMS_MISMATCH",
          severity: "warn",
          message:
            `Stated terms are ${terms} days but issue-to-due ` +
            `is ${days} days.`,
          fields: ["due_date"],
          control: "dates",
        });
      }
    }
  }

  if (issue && issue.getTime() > today.getTime()) {
    out.push({
      code: "FUTURE_DATED",
      severity: "high",
      message:
        `issue_date ${isoDate(issue)} is in the future. Pre-billing is the ` +
        "single most common eligibility breach.",
      fields: ["issue_date"],
      control: "eligibility",
    });
  }

  return out;
}
