import type { VendorMaster } from "@ifg/control-engine";
import { toInvoice } from "./enrich.js";
import { ExtractionFailedError } from "./errors.js";
import { getFieldByKey } from "./fields.js";
import { prepareInput, type InputLimits } from "./input.js";
import { createClient, type LlmClient } from "./llm.js";
import { buildMessages, type ChatMessage } from "./prompt.js";
import { ModelOutputSchema, type ModelOutput, type RequestedField } from "./schema.js";
import type { Invoice } from "@ifg/control-engine";

export interface ExtractInput {
  bytes: Uint8Array;
  docId: string;
  master: VendorMaster;
  requestedFields?: string[];
  sourceChannel?: string;
  limits?: Partial<InputLimits>;
  /** Injectable for tests; defaults to a real OpenRouter client. */
  client?: LlmClient;
}

export interface ExtractOutput {
  invoice: Invoice;
  requested: RequestedField[];
  warnings: string[];
  meta: {
    model: string;
    pageCount: number;
    sourceType: "pdf" | "image";
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    repaired: boolean;
  };
}

function parseAndValidate(content: string): ModelOutput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ExtractionFailedError("Model output was not valid JSON");
  }
  const result = ModelOutputSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionFailedError(
      "Model output did not match the schema",
      result.error.issues.slice(0, 10),
    );
  }
  return result.data;
}

/**
 * Guarantee one entry per required field. The prompt asks for this, but the
 * contract is ours to keep: a caller who ticked a box gets an answer.
 */
function completeRequested(
  reported: ModelOutput["requested"],
  requestedFields: string[],
  warnings: string[],
): RequestedField[] {
  const byKey = new Map(reported.map((r) => [r.key, r]));
  const missing: string[] = [];

  const complete = requestedFields.map((key): RequestedField => {
    const existing = byKey.get(key);
    const source = getFieldByKey(key) ? ("canonical" as const) : ("custom" as const);
    if (existing) return { ...existing, source };
    missing.push(key);
    return {
      key,
      status: "not_found",
      value: null,
      reason: "The model did not report on this field; treated as absent.",
      source,
    };
  });

  if (missing.length > 0) {
    warnings.push(
      `The model omitted ${missing.length} required field(s): ${missing.join(", ")}.`,
    );
  }
  return complete;
}

export async function extract(input: ExtractInput): Promise<ExtractOutput> {
  const startedAt = Date.now();
  const requestedFields = input.requestedFields ?? [];
  const warnings: string[] = [];

  // Validate the file before touching configuration or the network. An
  // unsupported or oversized upload must report *that*, not a missing API key.
  const prepared = await prepareInput(input.bytes, input.limits ?? {});

  const client = input.client ?? createClient();
  const messages = buildMessages(prepared, requestedFields);

  let response = await client.complete(messages);
  let model: ModelOutput;
  let repaired = false;

  try {
    model = parseAndValidate(response.content);
  } catch (first) {
    if (!(first instanceof ExtractionFailedError)) throw first;

    repaired = true;
    const repairMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content:
          "Your previous response did not conform to the required schema.\n\n" +
          `Problem: ${first.message}\n` +
          `Detail: ${JSON.stringify(first.detail ?? null)}\n\n` +
          "Return the same extraction again, conforming exactly to the schema. " +
          "Do not change any value you read from the document — only fix the structure.",
      },
    ];
    response = await client.complete(repairMessages);
    model = parseAndValidate(response.content);
  }

  const invoice = toInvoice(model.invoice, {
    docId: input.docId,
    bytes: input.bytes,
    sourceChannel: input.sourceChannel ?? "portal_upload",
    master: input.master,
  });

  return {
    invoice,
    requested: completeRequested(model.requested, requestedFields, warnings),
    warnings,
    meta: {
      model: response.model,
      pageCount: prepared.pageCount,
      sourceType: prepared.sourceType,
      latencyMs: Date.now() - startedAt,
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
      repaired,
    },
  };
}
