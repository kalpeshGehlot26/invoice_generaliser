import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ExtractError, processInvoice } from "@invoice/extract";

// pdf-to-img needs the Node runtime, not edge.
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data.", code: "bad_request" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No file was uploaded.", code: "no_file" },
      { status: 400 },
    );
  }

  // Ticked checkboxes plus one free-text line each from the Other box.
  const requestedFields = form
    .getAll("fields")
    .flatMap((v) => (typeof v === "string" ? [v] : []))
    .map((v) => v.trim())
    .filter(Boolean);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await processInvoice({
      bytes,
      docId: `DOC-${randomUUID().slice(0, 8).toUpperCase()}`,
      requestedFields,
      sourceChannel: "portal_upload",
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ExtractError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("process failed", error);
    return NextResponse.json(
      { error: "Extraction failed unexpectedly.", code: "internal" },
      { status: 500 },
    );
  }
}
