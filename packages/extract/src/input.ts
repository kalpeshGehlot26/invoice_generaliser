import { pdf } from "pdf-to-img";
import { effectiveDpi, readDimensions } from "./dimensions.js";
import { IllegibleInputError, LimitExceededError, UnsupportedFileError } from "./errors.js";

export type FileType = "pdf" | "png" | "jpeg" | "webp" | "gif";

export interface InputLimits {
  maxBytes: number;
  maxPages: number;
  dpi: number;
  /** Refuse an image whose long edge is below this. */
  minLongEdge: number;
  /** Warn below this, but proceed. */
  advisoryLongEdge: number;
}

export const DEFAULT_LIMITS: InputLimits = {
  maxBytes: Number(process.env.INVOICE_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024),
  maxPages: Number(process.env.INVOICE_MAX_PDF_PAGES ?? 20),
  dpi: Number(process.env.INVOICE_RASTER_DPI ?? 150),
  // Calibrated against real inputs: a 531px A4 thumbnail (~45 dpi) fabricated
  // its dates and totals; 1123px (~96 dpi) and 1438px (~123 dpi) both extracted
  // correctly. 700 sits well clear of the working cases and well above the
  // failing one.
  minLongEdge: Number(process.env.INVOICE_MIN_LONG_EDGE ?? 700),
  advisoryLongEdge: Number(process.env.INVOICE_ADVISORY_LONG_EDGE ?? 1100),
};

export interface PreparedInput {
  /** One `data:` URL per page. */
  images: string[];
  pageCount: number;
  sourceType: "pdf" | "image";
  /** Non-fatal input-quality notes, surfaced to the caller. */
  warnings: string[];
}

const MIME: Record<Exclude<FileType, "pdf">, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const at = (b: Uint8Array, sig: number[], offset = 0) =>
  sig.every((byte, i) => b[offset + i] === byte);

/**
 * Identify content by magic bytes. Filenames and declared MIME types lie —
 * phone scanner apps routinely emit a JPEG named `.pdf`.
 */
export function sniffFileType(bytes: Uint8Array): FileType | null {
  if (bytes.byteLength < 12) return null;
  if (at(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (at(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (at(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (at(bytes, [0x47, 0x49, 0x46, 0x38])) return "gif";
  if (at(bytes, [0x52, 0x49, 0x46, 0x46]) && at(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
}

/**
 * Both input kinds converge on images: a PDF is rasterised page by page rather
 * than having its text layer read. That keeps one code path for digital PDFs,
 * scans and photos, and preserves the spatial layout that makes tables legible.
 */
export async function prepareInput(
  bytes: Uint8Array,
  overrides: Partial<InputLimits> = {},
): Promise<PreparedInput> {
  const limits = { ...DEFAULT_LIMITS, ...overrides };

  if (bytes.byteLength > limits.maxBytes) {
    throw new LimitExceededError("Upload size", limits.maxBytes, bytes.byteLength);
  }

  const type = sniffFileType(bytes);
  if (type === null) {
    throw new UnsupportedFileError(
      "Unrecognised file. Supported types: PDF, PNG, JPEG, WebP, GIF.",
    );
  }

  if (type !== "pdf") {
    const warnings = checkLegibility(bytes, type, limits);
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      images: [`data:${MIME[type]};base64,${base64}`],
      pageCount: 1,
      sourceType: "image",
      warnings,
    };
  }

  // 72 dpi is the PDF user-space unit; scale is the multiplier from that.
  const document = await pdf(Buffer.from(bytes), { scale: limits.dpi / 72 });

  if (document.length > limits.maxPages) {
    throw new LimitExceededError("PDF page count", limits.maxPages, document.length);
  }

  const images: string[] = [];
  for await (const page of document) {
    images.push(`data:image/png;base64,${page.toString("base64")}`);
  }

  // A PDF is rasterised here at a known density, so its legibility is ours to
  // control rather than the caller's.
  return { images, pageCount: images.length, sourceType: "pdf", warnings: [] };
}

/**
 * Refuse an image too coarse to read; warn when it is merely marginal.
 *
 * Unknown dimensions produce a warning, never silent acceptance: a header we
 * cannot parse is a reason for less confidence, not more.
 */
function checkLegibility(
  bytes: Uint8Array,
  type: Exclude<FileType, "pdf">,
  limits: InputLimits,
): string[] {
  const dim = readDimensions(bytes, type);
  if (dim === null) {
    return ["Could not read the image dimensions, so legibility was not checked."];
  }

  const longEdge = Math.max(dim.width, dim.height);
  const dpi = effectiveDpi(dim);

  if (longEdge < limits.minLongEdge) {
    throw new IllegibleInputError(
      `Image is ${dim.width}x${dim.height} — about ${dpi} dpi for a page-sized ` +
        `document, below the ${limits.minLongEdge}px minimum. Text at this size ` +
        "cannot be read reliably, and a model given an unreadable page will " +
        "return confident invented values rather than refuse. Supply a scan of " +
        "at least 150 dpi.",
    );
  }

  if (longEdge < limits.advisoryLongEdge) {
    return [
      `Image is ${dim.width}x${dim.height} — about ${dpi} dpi for a page-sized ` +
        "document. Small text may be misread; treat individual figures with caution.",
    ];
  }

  return [];
}
