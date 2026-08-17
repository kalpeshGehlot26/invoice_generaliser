import type { FileType } from "./input.js";

export interface Dimensions {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32be = (b: Uint8Array, o: number) =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

/**
 * Read pixel dimensions straight from the file header.
 *
 * Done by hand rather than with a dependency: the control layer's whole premise
 * is portability, and four header formats is less liability than another package.
 * Returns null when the header cannot be understood — callers must treat unknown
 * dimensions as "cannot judge", never as "fine".
 */
export function readDimensions(bytes: Uint8Array, type: FileType): Dimensions | null {
  try {
    if (type === "png") {
      // IHDR is the first chunk; width and height are the first two fields.
      if (bytes.byteLength < 24) return null;
      return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
    }

    if (type === "gif") {
      if (bytes.byteLength < 10) return null;
      return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
    }

    if (type === "jpeg") {
      // Walk the marker chain to a Start-Of-Frame segment.
      let i = 2;
      while (i + 9 < bytes.byteLength) {
        if (bytes[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = bytes[i + 1]!;
        // SOF0..SOF15, excluding DHT (C4), JPG (C8) and DAC (CC).
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) };
        }
        if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
          i += 2;
          continue;
        }
        i += 2 + u16be(bytes, i + 2);
      }
      return null;
    }

    if (type === "webp") {
      // RIFF....WEBP<fourcc>
      const fourcc = String.fromCharCode(...bytes.slice(12, 16));
      if (fourcc === "VP8X" && bytes.byteLength >= 30) {
        return { width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 };
      }
      if (fourcc === "VP8 " && bytes.byteLength >= 30) {
        return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
      }
      if (fourcc === "VP8L" && bytes.byteLength >= 25) {
        const bits = u32be(bytes, 21);
        const le = ((bits & 0xff) << 24) | (((bits >> 8) & 0xff) << 16) | (((bits >> 16) & 0xff) << 8) | ((bits >> 24) & 0xff);
        return { width: (le & 0x3fff) + 1, height: ((le >> 14) & 0x3fff) + 1 };
      }
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

/** A4 long edge in inches, used to turn pixels into an effective scan density. */
const A4_LONG_EDGE_INCHES = 11.7;

export function effectiveDpi(dim: Dimensions): number {
  return Math.round(Math.max(dim.width, dim.height) / A4_LONG_EDGE_INCHES);
}
