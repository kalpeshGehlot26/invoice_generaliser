import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { ConfigError, ExtractionFailedError, ModelRefusalError } from "./errors.js";
import type { ChatMessage } from "./prompt.js";
import { ModelOutputSchema } from "./schema.js";

export interface LlmConfig {
  apiKey: string;
  models: string[];
  baseURL: string;
  maxTokens: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface LlmClient {
  complete(messages: ChatMessage[]): Promise<LlmResponse>;
}

export function defaultConfig(): LlmConfig {
  return {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    models: [
      process.env.INVOICE_MODEL_PRIMARY ?? "openai/gpt-4.1",
      process.env.INVOICE_MODEL_FALLBACK ?? "openai/gpt-4.1-mini",
    ],
    baseURL: "https://openrouter.ai/api/v1",
    maxTokens: 16000,
  };
}

export class OpenRouterClient implements LlmClient {
  private openai: OpenAI;

  constructor(private config: LlmConfig) {
    if (!config.apiKey) {
      throw new ConfigError("OPENROUTER_API_KEY is not set.");
    }
    this.openai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  }

  async complete(messages: ChatMessage[]): Promise<LlmResponse> {
    // A long invoice can exhaust the ceiling. Retry once at double, then stop:
    // an unbounded loop on a genuinely huge document is worse than a clear error.
    let response = await this.request(messages, this.config.maxTokens);
    if (response.choices?.[0]?.finish_reason === "length") {
      response = await this.request(messages, this.config.maxTokens * 2);
      if (response.choices?.[0]?.finish_reason === "length") {
        throw new ExtractionFailedError(
          `Model output truncated at ${this.config.maxTokens * 2} tokens. ` +
            "The document may have more line items than one response can hold.",
        );
      }
    }

    const choice = response.choices?.[0];
    if (!choice) throw new ExtractionFailedError("Model returned no choices", response);
    if (choice.message?.refusal) {
      throw new ModelRefusalError(`Model declined: ${choice.message.refusal}`);
    }

    const content = choice.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new ExtractionFailedError(
        `Model returned no content (finish_reason: ${choice.finish_reason})`,
        response,
      );
    }

    return {
      content,
      model: response.model ?? this.config.models[0]!,
      promptTokens: response.usage?.prompt_tokens ?? null,
      completionTokens: response.usage?.completion_tokens ?? null,
    };
  }

  private async request(messages: ChatMessage[], maxTokens: number): Promise<any> {
    return this.openai.chat.completions.create({
      model: this.config.models[0]!,
      // OpenRouter-specific: ordered failover list.
      models: this.config.models,
      // Without this, OpenRouter may route to a provider that ignores
      // response_format and returns unconstrained prose.
      provider: { require_parameters: true },
      // Reading an invoice has one right answer, so there is nothing for
      // sampling to explore. Left at the provider default (1.0), the same
      // document returned a quantity of 1 on one run and 0 on the next, and a
      // line tax rate of 12% on one run and 17% on the next — each of which
      // flips the arithmetic controls and therefore the funding decision.
      // Determinism is a product requirement here, not a tuning preference.
      temperature: 0,
      top_p: 1,
      // Honoured by some providers and ignored by others; harmless where
      // ignored, and removes one more source of drift where it is not.
      seed: 7,
      max_tokens: maxTokens,
      messages: messages as any,
      response_format: zodResponseFormat(ModelOutputSchema, "invoice_extraction"),
    } as any);
  }
}

export function createClient(overrides: Partial<LlmConfig> = {}): LlmClient {
  return new OpenRouterClient({ ...defaultConfig(), ...overrides });
}
