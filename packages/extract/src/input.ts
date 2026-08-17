import { pdf } from "pdf-to-img";
import { LimitExceededError, UnsupportedFileError } from "./errors.js";

export type FileType = "pdf" | "png" | "jpeg" | "webp" | "gif";

export interface InputLimits {
  maxBytes: number;
  maxPages: number;
  dpi: number;
}

export const DEFAULT_LIMITS: InputLimits = {
  maxBytes: Number(process.env.INVOICE_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024),
  maxPages: Number(process.env.INVOICE_MAX_PDF_PAGES ?? 20),
  dpi: Number(process.env.INVOICE_RASTER_DPI ?? 150),
};

export interface PreparedInput {
  /** One `data:` URL per page. */
  images: string[];
  pageCount: number;
  sourceType: "pdf" | "image";
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
    const base64 = Buffer.from(bytes).toString("base64");
    return {
      images: [`data:${MIME[type]};base64,${base64}`],
      pageCount: 1,
      sourceType: "image",
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

  return { images, pageCount: images.length, sourceType: "pdf" };
}
