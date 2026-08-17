#!/usr/bin/env python3
"""Regenerate packages/control-engine/src/samples.ts from IFG_POC_code/samples.py.

Generated rather than hand-transcribed so that a transcription slip cannot
masquerade as a bug in the port.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "IFG_POC_code"))

import samples  # noqa: E402

HEADER = '''/**
 * Fixtures generated from IFG_POC_code/samples.py — do not hand-edit.
 * Regenerate with: npm run gen:samples
 *
 * These are pre-computed extraction outputs, not live model calls. The demo
 * exercises the control layer; extraction values are fixtures by design.
 */
import type { BuyerPos, Invoice, VendorMaster } from "./types.js";

const data = '''

FOOTER = ''' as {
  VENDOR_MASTER: VendorMaster;
  BUYER_POS: BuyerPos;
  INVOICES: Invoice[];
};

export const VENDOR_MASTER: VendorMaster = data.VENDOR_MASTER;
export const BUYER_POS: BuyerPos = data.BUYER_POS;
export const INVOICES: Invoice[] = data.INVOICES;
'''


def main() -> None:
    payload = {
        "VENDOR_MASTER": samples.VENDOR_MASTER,
        "BUYER_POS": samples.BUYER_POS,
        "INVOICES": samples.INVOICES,
    }
    target = ROOT / "packages" / "control-engine" / "src" / "samples.ts"
    body = json.dumps(payload, indent=2, ensure_ascii=False)
    target.write_text(HEADER + body + FOOTER)
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
