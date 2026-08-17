/**
 * Fixtures generated from IFG_POC_code/samples.py — do not hand-edit.
 * Regenerate with: npm run gen:samples
 *
 * These are pre-computed extraction outputs, not live model calls. The demo
 * exercises the control layer; extraction values are fixtures by design.
 */
import type { BuyerPos, Invoice, VendorMaster } from "./types.js";

const data = {
  "VENDOR_MASTER": {
    "SUP-1041": {
      "name": "Halcyon Precision Components LLC",
      "vat_id": null,
      "iban": null,
      "account": "US 021000021 / 4471820933",
      "country": "US",
      "since": "2021-03"
    },
    "SUP-2277": {
      "name": "Nordwerk Antriebstechnik GmbH",
      "vat_id": "DE811234567",
      "iban": "DE89370400440532013000",
      "country": "DE",
      "since": "2019-11"
    },
    "SUP-3390": {
      "name": "Atelier Levasseur SARL",
      "vat_id": "FRAB123456789",
      "iban": "FR7630006000011234567890189",
      "country": "FR",
      "since": "2022-06"
    },
    "SUP-4412": {
      "name": "Sundara Textiles Pvt Ltd",
      "vat_id": "27AAKCS9575H1ZP",
      "iban": null,
      "account": "HDFC 50200012345678",
      "country": "IN",
      "since": "2023-01"
    },
    "SUP-5510": {
      "name": "Zaklad Metalowy Wisniewski Sp. z o.o.",
      "vat_id": "PL5262587234",
      "iban": "PL61109010140000071219812874",
      "country": "PL",
      "since": "2024-02"
    },
    "SUP-6601": {
      "name": "Kalgoorlie Freight Services Pty Ltd",
      "vat_id": "51824753556",
      "iban": "AU BSB 083-004 ACC 15872011",
      "country": "AU",
      "since": "2020-08"
    },
    "SUP-7702": {
      "name": "Thameside Fabrication Ltd",
      "vat_id": "GB432109876",
      "iban": "GB29NWBK60161331926819",
      "country": "GB",
      "since": "2018-04"
    },
    "SUP-8813": {
      "name": "Officine Meccaniche Barzanti S.r.l.",
      "vat_id": "IT04729310158",
      "iban": null,
      "account": "IT c/c 000012345678",
      "country": "IT",
      "since": "2021-09"
    }
  },
  "BUYER_POS": {
    "PO-88104": {
      "buyer_vat_id": null,
      "buyer": "Meridian Aerospace Inc",
      "open_amount": 48250.0,
      "currency": "USD"
    },
    "PO-DE-5521": {
      "buyer_vat_id": "DE119876543",
      "buyer": "Rheinstahl Werke AG",
      "open_amount": 96000.0,
      "currency": "EUR"
    },
    "PO-FR-7788": {
      "buyer_vat_id": "FRCD987654321",
      "buyer": "Groupe Cavaillon SA",
      "open_amount": 22000.0,
      "currency": "EUR"
    },
    "PO-IN-3301": {
      "buyer_vat_id": "29AABCT1332L1ZT",
      "buyer": "Trivandrum Apparel Ltd",
      "open_amount": 1850000.0,
      "currency": "INR"
    },
    "PO-PL-9012": {
      "buyer_vat_id": "PL7770003062",
      "buyer": "Volkswagen Poznan Sp. z o.o.",
      "open_amount": 310000.0,
      "currency": "PLN"
    },
    "PO-GB-4410": {
      "buyer_vat_id": "GB556677889",
      "buyer": "Severn Modular Ltd",
      "open_amount": 61000.0,
      "currency": "GBP"
    }
  },
  "INVOICES": [
    {
      "doc_id": "DOC-0001",
      "label": "Clean US digital PDF: the happy path",
      "source_channel": "email_pdf_digital",
      "invoice_number": "HPC-2026-4471",
      "issue_date": "2026-08-04",
      "due_date": "2026-09-03",
      "payment_terms_days": 30,
      "currency": "USD",
      "seller": {
        "supplier_id": "SUP-1041",
        "name": "Halcyon Precision Components LLC",
        "country": "US",
        "vat_id": null
      },
      "buyer": {
        "name": "Meridian Aerospace Inc",
        "country": "US",
        "vat_id": null
      },
      "po_number": "PO-88104",
      "line_items": [
        {
          "description": "Ti-6Al-4V bracket, machined",
          "qty": 120,
          "unit_price": 214.5,
          "line_total": 25740.0
        },
        {
          "description": "Anodising, type II",
          "qty": 120,
          "unit_price": 18.75,
          "line_total": 2250.0
        },
        {
          "description": "CoC + material cert pack",
          "qty": 1,
          "unit_price": 385.0,
          "line_total": 385.0
        }
      ],
      "subtotal": 28375.0,
      "tax_rate": 0.0,
      "tax_amount": 0.0,
      "discount": 0.0,
      "freight": 410.0,
      "total_due": 28785.0,
      "content_hash": "a1f0c93b77de4210",
      "field_confidence": {
        "invoice_number": 0.996,
        "issue_date": 0.994,
        "due_date": 0.991,
        "total_due": 0.998,
        "subtotal": 0.997,
        "tax_amount": 0.995,
        "po_number": 0.989,
        "seller_name": 0.993,
        "buyer_name": 0.99,
        "line[1].line_total": 0.994,
        "line[2].line_total": 0.992,
        "line[3].line_total": 0.981
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "issue_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "due_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "buyer_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[1].line_total": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[2].line_total": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[3].line_total": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0002",
      "label": "ZUGFeRD hybrid PDF: embedded XML and visual page disagree on the IBAN",
      "source_channel": "factur-x_hybrid",
      "facturx_profile": "EN 16931",
      "invoice_number": "NW-2026-08-1193",
      "issue_date": "2026-08-06",
      "due_date": "2026-09-20",
      "payment_terms_days": 45,
      "currency": "EUR",
      "seller": {
        "supplier_id": "SUP-2277",
        "name": "Nordwerk Antriebstechnik GmbH",
        "country": "DE",
        "vat_id": "DE811234567",
        "iban": "DE89370400440532013000"
      },
      "buyer": {
        "name": "Rheinstahl Werke AG",
        "country": "DE",
        "vat_id": "DE119876543"
      },
      "payee": {
        "name": "Nordwerk Antriebstechnik GmbH",
        "iban": "DE89370400440532013000"
      },
      "po_number": "PO-DE-5521",
      "line_items": [
        {
          "description": "Planetengetriebe PG-240, Serie",
          "qty": 40,
          "unit_price": 1685.0,
          "line_total": 67400.0
        },
        {
          "description": "Montagesatz",
          "qty": 40,
          "unit_price": 92.5,
          "line_total": 3700.0
        }
      ],
      "subtotal": 71100.0,
      "tax_rate": 19.0,
      "tax_amount": 13509.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 84609.0,
      "hybrid_diff": {
        "payee.iban": [
          "DE89370400440532013000",
          "DE21500105174829371842"
        ]
      },
      "content_hash": "c72b1de40a99f317",
      "field_confidence": {
        "invoice_number": 0.999,
        "total_due": 0.999,
        "subtotal": 0.999,
        "tax_amount": 0.999,
        "payee_iban": 0.999,
        "seller_vat_id": 0.999,
        "buyer_vat_id": 0.999,
        "po_number": 0.999
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "payee_iban": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "buyer_vat_id": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0003",
      "label": "French scan, insufficient Factur-X profile, tax arithmetic off",
      "source_channel": "scan_300dpi",
      "facturx_profile": "BASIC",
      "invoice_number": "AL-2026-0442",
      "issue_date": "2026-07-28",
      "due_date": "2026-09-11",
      "payment_terms_days": 45,
      "currency": "EUR",
      "seller": {
        "supplier_id": "SUP-3390",
        "name": "Atelier Levasseur SARL",
        "country": "FR",
        "vat_id": "FRAB123456789",
        "iban": "FR7630006000011234567890189"
      },
      "buyer": {
        "name": "Groupe Cavaillon SA",
        "country": "FR",
        "vat_id": "FRCD987654321"
      },
      "po_number": "PO-FR-7788",
      "line_items": [
        {
          "description": "Menuiserie sur mesure, chene",
          "qty": 14,
          "unit_price": 1180.0,
          "line_total": 16520.0
        },
        {
          "description": "Pose et finition",
          "qty": 1,
          "unit_price": 2400.0,
          "line_total": 2400.0
        }
      ],
      "subtotal": 18920.0,
      "tax_rate": 20.0,
      "tax_amount": 3596.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 22516.0,
      "hybrid_diff": {},
      "content_hash": "5b0e7ac21f3d8890",
      "field_confidence": {
        "invoice_number": 0.912,
        "issue_date": 0.958,
        "due_date": 0.874,
        "total_due": 0.972,
        "subtotal": 0.941,
        "tax_amount": 0.889,
        "po_number": 0.823,
        "seller_vat_id": 0.906,
        "line[1].line_total": 0.868,
        "line[2].line_total": 0.913,
        "seller_name": 0.951
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "issue_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "due_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0004",
      "label": "India GST e-invoice with IRN: state-attested, extraction bypassed",
      "source_channel": "xml",
      "invoice_number": "ST/2026-27/1188",
      "clearance_id": "IRN-3f9a7c21b8e4d5061a2f88cc90de4471bb2ce8a91d0f7734",
      "issue_date": "2026-08-11",
      "due_date": "2026-10-10",
      "payment_terms_days": 60,
      "currency": "INR",
      "seller": {
        "supplier_id": "SUP-4412",
        "name": "Sundara Textiles Pvt Ltd",
        "country": "IN",
        "vat_id": "27AAKCS9575H1ZP"
      },
      "buyer": {
        "name": "Trivandrum Apparel Ltd",
        "country": "IN",
        "vat_id": "29AABCT1332L1ZT"
      },
      "po_number": "PO-IN-3301",
      "line_items": [
        {
          "description": "Combed cotton 40s, 2400 kg",
          "qty": 2400,
          "unit_price": 512.0,
          "line_total": 1228800.0
        },
        {
          "description": "Reactive dyeing",
          "qty": 2400,
          "unit_price": 96.0,
          "line_total": 230400.0
        }
      ],
      "subtotal": 1459200.0,
      "tax_rate": 5.0,
      "tax_amount": 72960.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 1532160.0,
      "content_hash": "9d3c04ff1baa7726",
      "field_confidence": {
        "invoice_number": 1.0,
        "total_due": 1.0,
        "subtotal": 1.0,
        "tax_amount": 1.0,
        "clearance_id": 1.0,
        "seller_vat_id": 1.0,
        "buyer_vat_id": 1.0,
        "po_number": 1.0,
        "line[1].line_total": 1.0,
        "line[2].line_total": 1.0
      },
      "grounding": {
        "invoice_number": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "clearance_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "buyer_vat_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[1].line_total": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[2].line_total": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0005",
      "label": "Poland KSeF: Payee party differs from Seller, receivable already assigned",
      "source_channel": "peppol",
      "invoice_number": "ZMW/08/2026/5521",
      "clearance_id": "KSEF-20260810-9F2A47C1-8831",
      "issue_date": "2026-08-10",
      "due_date": "2026-09-24",
      "payment_terms_days": 45,
      "currency": "PLN",
      "seller": {
        "supplier_id": "SUP-5510",
        "name": "Zaklad Metalowy Wisniewski Sp. z o.o.",
        "country": "PL",
        "vat_id": "PL5262587234",
        "iban": "PL61109010140000071219812874"
      },
      "buyer": {
        "name": "Volkswagen Poznan Sp. z o.o.",
        "country": "PL",
        "vat_id": "PL7770003062"
      },
      "payee": {
        "name": "Faktoria Kapital S.A.",
        "iban": "PL27114020040000300201355387"
      },
      "po_number": "PO-PL-9012",
      "line_items": [
        {
          "description": "Tloczenie blachy, seria 40k",
          "qty": 40000,
          "unit_price": 6.85,
          "line_total": 274000.0
        }
      ],
      "subtotal": 274000.0,
      "tax_rate": 23.0,
      "tax_amount": 63020.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 337020.0,
      "content_hash": "2ea88b40c7159933",
      "field_confidence": {
        "invoice_number": 1.0,
        "total_due": 1.0,
        "subtotal": 1.0,
        "tax_amount": 1.0,
        "clearance_id": 1.0,
        "payee_iban": 1.0,
        "payee_name": 1.0,
        "seller_vat_id": 1.0,
        "po_number": 1.0
      },
      "grounding": {
        "invoice_number": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "clearance_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "payee_iban": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "payee_name": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0006",
      "label": "Phone photo re-presentation of DOC-0001, invoice number OCR-mangled",
      "source_channel": "mobile_photo",
      "invoice_number": "HPC-2O26-447I",
      "issue_date": "2026-08-04",
      "due_date": "2026-09-03",
      "payment_terms_days": 30,
      "currency": "USD",
      "seller": {
        "supplier_id": "SUP-1041",
        "name": "Halcyon Precision Components LLC",
        "country": "US",
        "vat_id": null
      },
      "buyer": {
        "name": "Meridian Aerospace Inc",
        "country": "US",
        "vat_id": null
      },
      "po_number": "PO-88104",
      "line_items": [
        {
          "description": "Ti-6Al-4V bracket, machined",
          "qty": 120,
          "unit_price": 214.5,
          "line_total": 25740.0
        },
        {
          "description": "Anodising, type II",
          "qty": 120,
          "unit_price": 18.75,
          "line_total": 2250.0
        },
        {
          "description": "CoC + material cert pack",
          "qty": 1,
          "unit_price": 385.0,
          "line_total": 385.0
        }
      ],
      "subtotal": 28375.0,
      "tax_rate": 0.0,
      "tax_amount": 0.0,
      "discount": 0.0,
      "freight": 410.0,
      "total_due": 28785.0,
      "content_hash": "a1f0c93b77de4210",
      "field_confidence": {
        "invoice_number": 0.681,
        "issue_date": 0.774,
        "due_date": 0.712,
        "total_due": 0.883,
        "subtotal": 0.851,
        "tax_amount": 0.902,
        "po_number": 0.664,
        "seller_name": 0.798,
        "line[1].line_total": 0.742,
        "line[3].line_total": 0.598
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "issue_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0007",
      "label": "Australian scan: line items short of subtotal AND remit-to changed",
      "source_channel": "scan_200dpi",
      "invoice_number": "KFS-3390-2026",
      "issue_date": "2026-08-01",
      "due_date": "2026-08-31",
      "payment_terms_days": 30,
      "currency": "AUD",
      "seller": {
        "supplier_id": "SUP-6601",
        "name": "Kalgoorlie Freight Services Pty Ltd",
        "country": "AU",
        "vat_id": "51824753556",
        "iban": "AU BSB 083-004 ACC 15872011"
      },
      "buyer": {
        "name": "Pilbara Minerals Logistics Pty Ltd",
        "country": "AU",
        "vat_id": "72123456789"
      },
      "payee": {
        "name": "Kalgoorlie Freight Services Pty Ltd",
        "iban": "AU BSB 062-000 ACC 44219087"
      },
      "po_number": null,
      "line_items": [
        {
          "description": "Linehaul Perth to Kalgoorlie, 14 runs",
          "qty": 14,
          "unit_price": 2850.0,
          "line_total": 39900.0
        },
        {
          "description": "Fuel levy",
          "qty": 1,
          "unit_price": 3192.0,
          "line_total": 3192.0
        }
      ],
      "subtotal": 47592.0,
      "tax_rate": 10.0,
      "tax_amount": 4759.2,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 52351.2,
      "content_hash": "77c0ba9e33f14028",
      "field_confidence": {
        "invoice_number": 0.874,
        "issue_date": 0.902,
        "due_date": 0.881,
        "total_due": 0.934,
        "subtotal": 0.796,
        "tax_amount": 0.912,
        "seller_name": 0.888,
        "payee_iban": 0.741,
        "line[1].line_total": 0.812,
        "line[2].line_total": 0.688
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "issue_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0008",
      "label": "UK invoice: obsolete VAT rate, inverted dates, malformed VAT ID",
      "source_channel": "email_pdf_digital",
      "invoice_number": "TF-0781",
      "issue_date": "2026-08-12",
      "due_date": "2026-07-29",
      "payment_terms_days": 30,
      "currency": "GBP",
      "seller": {
        "supplier_id": "SUP-7702",
        "name": "Thameside Fabrication Ltd",
        "country": "GB",
        "vat_id": "GB43210987",
        "iban": "GB29NWBK60161331926819"
      },
      "buyer": {
        "name": "Severn Modular Ltd",
        "country": "GB",
        "vat_id": "GB556677889"
      },
      "po_number": "PO-GB-4410",
      "line_items": [
        {
          "description": "Structural steel fabrication, phase 2",
          "qty": 1,
          "unit_price": 51200.0,
          "line_total": 51200.0
        }
      ],
      "subtotal": 51200.0,
      "tax_rate": 17.5,
      "tax_amount": 8960.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 60160.0,
      "content_hash": "e41bb0da29570c65",
      "field_confidence": {
        "invoice_number": 0.981,
        "issue_date": 0.963,
        "due_date": 0.944,
        "total_due": 0.991,
        "subtotal": 0.988,
        "tax_amount": 0.976,
        "po_number": 0.972,
        "seller_vat_id": 0.934,
        "seller_name": 0.985,
        "line[1].line_total": 0.987
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "issue_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "due_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[1].line_total": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0009",
      "label": "Italian invoice with no SdI identifier and arithmetic that does not foot",
      "source_channel": "email_pdf_digital",
      "invoice_number": "OMB-2026-0417",
      "issue_date": "2026-08-05",
      "due_date": "2026-10-04",
      "payment_terms_days": 60,
      "currency": "EUR",
      "seller": {
        "supplier_id": "SUP-8813",
        "name": "Officine Meccaniche Barzanti S.r.l.",
        "country": "IT",
        "vat_id": "IT04729310158"
      },
      "buyer": {
        "name": "Carrozzeria Lombarda SpA",
        "country": "IT",
        "vat_id": "IT09876543210"
      },
      "line_items": [
        {
          "description": "Staffa acciaio zincato",
          "qty": 60,
          "unit_price": 148.0,
          "line_total": 8080.0
        },
        {
          "description": "Trattamento superficiale",
          "qty": 60,
          "unit_price": 22.5,
          "line_total": null
        },
        {
          "description": "Imballaggio industriale",
          "qty": 1,
          "unit_price": 340.0,
          "line_total": 340.0
        }
      ],
      "subtotal": 9770.0,
      "tax_rate": 22.0,
      "tax_amount": 2149.4,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 12419.4,
      "content_hash": "b81f5c07d3a94612",
      "field_confidence": {
        "invoice_number": 0.981,
        "issue_date": 0.977,
        "due_date": 0.969,
        "total_due": 0.983,
        "subtotal": 0.971,
        "tax_amount": 0.964,
        "seller_vat_id": 0.978,
        "seller_name": 0.986,
        "line[1].line_total": 0.942,
        "line[3].line_total": 0.938
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "issue_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "due_date": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[1].line_total": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "line[3].line_total": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0010",
      "label": "First-time Icelandic supplier: IBAN checksum fails, PO not on file",
      "source_channel": "portal_upload",
      "invoice_number": "FJ-2026-2288",
      "issue_date": "2026-08-09",
      "due_date": "2026-09-08",
      "payment_terms_days": 30,
      "currency": "ISK",
      "seller": {
        "supplier_id": "SUP-9004",
        "name": "Fjardaraf Idnadarthjonusta hf.",
        "country": "IS",
        "vat_id": "IS1234567",
        "iban": "IS140159260076545510730330"
      },
      "buyer": {
        "name": "Nordsjo Marine Ltd",
        "country": "GB",
        "vat_id": "GB556677889"
      },
      "po_number": "PO-NO-0001",
      "line_items": [
        {
          "description": "Subsea inspection, 4 days",
          "qty": 4,
          "unit_price": 42500.0,
          "line_total": 170000.0
        }
      ],
      "subtotal": 170000.0,
      "tax_rate": 25.0,
      "tax_amount": 42500.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 212500.0,
      "content_hash": "3f77a1cc58b0e294",
      "field_confidence": {
        "invoice_number": 0.953,
        "total_due": 0.961,
        "subtotal": 0.958,
        "tax_amount": 0.949,
        "payee_iban": 0.712,
        "seller_name": 0.934,
        "po_number": 0.901
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "payee_iban": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0011",
      "label": "Exact re-submission of DOC-0001 through the supplier portal",
      "source_channel": "portal_upload",
      "invoice_number": "HPC-2026-4471",
      "issue_date": "2026-08-04",
      "due_date": "2026-09-03",
      "payment_terms_days": 30,
      "currency": "USD",
      "seller": {
        "supplier_id": "SUP-1041",
        "name": "Halcyon Precision Components LLC",
        "country": "US",
        "vat_id": null
      },
      "buyer": {
        "name": "Meridian Aerospace Inc",
        "country": "US",
        "vat_id": null
      },
      "po_number": "PO-88104",
      "line_items": [
        {
          "description": "Ti-6Al-4V bracket, machined",
          "qty": 120,
          "unit_price": 214.5,
          "line_total": 25740.0
        },
        {
          "description": "Anodising, type II",
          "qty": 120,
          "unit_price": 18.75,
          "line_total": 2250.0
        },
        {
          "description": "CoC + material cert pack",
          "qty": 1,
          "unit_price": 385.0,
          "line_total": 385.0
        }
      ],
      "subtotal": 28375.0,
      "tax_rate": 0.0,
      "tax_amount": 0.0,
      "discount": 0.0,
      "freight": 410.0,
      "total_due": 28785.0,
      "content_hash": "a1f0c93b77de4210",
      "field_confidence": {
        "invoice_number": 0.994,
        "total_due": 0.996,
        "subtotal": 0.993,
        "tax_amount": 0.991,
        "po_number": 0.987,
        "seller_name": 0.99
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_name": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0012",
      "label": "Renumbered resubmission of DOC-0004: only the content hash matches",
      "source_channel": "portal_upload",
      "invoice_number": "ST/2026-27/7742",
      "clearance_id": "IRN-3f9a7c21b8e4d5061a2f88cc90de4471bb2ce8a91d0f7734",
      "issue_date": "2026-08-11",
      "due_date": "2026-10-10",
      "payment_terms_days": 60,
      "currency": "INR",
      "seller": {
        "supplier_id": "SUP-4412",
        "name": "Sundara Textiles Pvt Ltd",
        "country": "IN",
        "vat_id": "27AAKCS9575H1ZP"
      },
      "buyer": {
        "name": "Trivandrum Apparel Ltd",
        "country": "IN",
        "vat_id": "29AABCT1332L1ZT"
      },
      "po_number": "PO-IN-3301",
      "line_items": [
        {
          "description": "Combed cotton 40s, 2400 kg",
          "qty": 2400,
          "unit_price": 512.0,
          "line_total": 1228800.0
        },
        {
          "description": "Reactive dyeing",
          "qty": 2400,
          "unit_price": 96.0,
          "line_total": 230400.0
        }
      ],
      "subtotal": 1459200.0,
      "tax_rate": 5.0,
      "tax_amount": 72960.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 1532160.0,
      "content_hash": "9d3c04ff1baa7726",
      "field_confidence": {
        "invoice_number": 0.996,
        "total_due": 0.998,
        "subtotal": 0.997,
        "tax_amount": 0.995,
        "clearance_id": 0.999,
        "seller_vat_id": 0.994
      },
      "grounding": {
        "invoice_number": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "clearance_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0013",
      "label": "Same supplier, same amount, two days apart: probable re-presentation",
      "source_channel": "email_pdf_digital",
      "invoice_number": "SDT-AUG-5590",
      "issue_date": "2026-08-13",
      "due_date": "2026-10-12",
      "payment_terms_days": 60,
      "currency": "INR",
      "seller": {
        "supplier_id": "SUP-4412",
        "name": "Sundara Textiles Pvt Ltd",
        "country": "IN",
        "vat_id": "27AAKCS9575H1ZP"
      },
      "buyer": {
        "name": "Trivandrum Apparel Ltd",
        "country": "IN",
        "vat_id": "29AABCT1332L1ZT"
      },
      "po_number": "PO-IN-3301",
      "line_items": [
        {
          "description": "Combed cotton 40s, 2400 kg",
          "qty": 2400,
          "unit_price": 512.0,
          "line_total": 1228800.0
        },
        {
          "description": "Reactive dyeing",
          "qty": 2400,
          "unit_price": 96.0,
          "line_total": 230400.0
        }
      ],
      "subtotal": 1459200.0,
      "tax_rate": 5.0,
      "tax_amount": 72960.0,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 1532160.0,
      "content_hash": "cc1902ea7740fb35",
      "field_confidence": {
        "invoice_number": 0.968,
        "total_due": 0.981,
        "subtotal": 0.977,
        "tax_amount": 0.972,
        "seller_vat_id": 0.965
      },
      "grounding": {
        "invoice_number": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "seller_vat_id": {
          "page": 1,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    },
    {
      "doc_id": "DOC-0014",
      "label": "Pre-billed German Peppol invoice: terms, currency and PO buyer all disagree",
      "source_channel": "peppol",
      "invoice_number": "NW-2026-09-1204",
      "issue_date": "2026-09-01",
      "due_date": "2026-10-31",
      "payment_terms_days": 30,
      "currency": "USD",
      "seller": {
        "supplier_id": "SUP-2277",
        "name": "Nordwerk Antriebstechnik GmbH",
        "country": "DE",
        "vat_id": "DE811234567",
        "iban": "DE89370400440532013000"
      },
      "buyer": {
        "name": "Rheinstahl Werke AG",
        "country": "DE",
        "vat_id": "DE555000111"
      },
      "po_number": "PO-DE-5521",
      "line_items": [
        {
          "description": "Planetengetriebe PG-240, Vorserie",
          "qty": 12,
          "unit_price": 1685.0,
          "line_total": 20220.0
        }
      ],
      "subtotal": 20220.0,
      "tax_rate": 19.0,
      "tax_amount": 3841.8,
      "discount": 0.0,
      "freight": 0.0,
      "total_due": 24061.8,
      "content_hash": "6a40dd11c8e7b503",
      "field_confidence": {
        "invoice_number": 0.991,
        "issue_date": 0.988,
        "due_date": 0.984,
        "total_due": 0.993,
        "subtotal": 0.99,
        "tax_amount": 0.987,
        "buyer_vat_id": 0.979,
        "po_number": 0.985
      },
      "grounding": {
        "invoice_number": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "issue_date": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "due_date": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "total_due": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "subtotal": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "tax_amount": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "buyer_vat_id": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        },
        "po_number": {
          "page": 0,
          "bbox": [
            0,
            0,
            0,
            0
          ]
        }
      }
    }
  ]
} as {
  VENDOR_MASTER: VendorMaster;
  BUYER_POS: BuyerPos;
  INVOICES: Invoice[];
};

export const VENDOR_MASTER: VendorMaster = data.VENDOR_MASTER;
export const BUYER_POS: BuyerPos = data.BUYER_POS;
export const INVOICES: Invoice[] = data.INVOICES;
