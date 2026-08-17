import { describe, expect, it, vi } from "vitest";
import { VENDOR_MASTER } from "@ifg/control-engine";
import { extract } from "./extract.js";
import { LimitExceededError, UnsupportedFileError } from "./errors.js";
import { sniffFileType } from "./input.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JUNK = new Uint8Array(64).fill(7);

describe("sniffFileType", () => {
  it.each([
    [PNG, "png"],
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]), "pdf"],
    [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]), "jpeg"],
  ])("identifies by magic bytes, not filename", (bytes, expected) => {
    expect(sniffFileType(bytes as Uint8Array)).toBe(expected);
  });

  it("returns null for unrecognised content", () => {
    expect(sniffFileType(JUNK)).toBeNull();
  });
});

describe("validation order", () => {
  const base = { docId: "D1", master: VENDOR_MASTER };

  it("rejects an unsupported file before constructing a client", async () => {
    // No client injected and no OPENROUTER_API_KEY: if the client were built
    // first, this would surface as a config error instead of the real problem.
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    try {
      await expect(extract({ ...base, bytes: JUNK })).rejects.toBeInstanceOf(
        UnsupportedFileError,
      );
    } finally {
      if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous;
    }
  });

  it("rejects an oversized upload naming the limit and the actual size", async () => {
    const big = new Uint8Array(2048);
    big.set(PNG, 0);
    const error = await extract({
      ...base,
      bytes: big,
      limits: { maxBytes: 1024 },
    }).catch((e) => e);

    expect(error).toBeInstanceOf(LimitExceededError);
    expect(error.message).toContain("1024");
    expect(error.message).toContain("2048");
    expect(error.status).toBe(413);
  });

  it("never calls the model when the file is invalid", async () => {
    const complete = vi.fn();
    await extract({ ...base, bytes: JUNK, client: { complete } }).catch(() => {});
    expect(complete).not.toHaveBeenCalled();
  });
});
