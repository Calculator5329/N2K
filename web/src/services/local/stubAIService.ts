/**
 * Stub `AIService` for development and tests.
 *
 * `complete` echoes the prompt with a deterministic prefix, `stream`
 * yields it word-by-word with a configurable delay, and
 * `completeStructured` returns a structurally valid object derived
 * from the schema (filling required fields with sentinel values).
 *
 * This exists so feature code can be written and tested against the
 * AI surface area before the real Gemini integration lands. Tests can
 * inject a sub-class that overrides individual methods to return
 * specific fixtures.
 */
import type {
  AIOptions,
  AIService,
  JSONSchema,
} from "../aiService.js";

export interface StubAIServiceOptions {
  /** Delay between streamed tokens in ms. Default 0 for tests. */
  readonly streamDelayMs?: number;
  /** Optional override for `complete` so tests can pin a response. */
  readonly fixedCompletion?: string;
}

export class StubAIService implements AIService {
  constructor(private readonly opts: StubAIServiceOptions = {}) {}

  async complete(prompt: string, _opts?: AIOptions): Promise<string> {
    if (this.opts.fixedCompletion !== undefined) return this.opts.fixedCompletion;
    return `[stub-ai] ${prompt}`;
  }

  async completeStructured<T = unknown>(
    _prompt: string,
    schema: JSONSchema,
    _opts?: AIOptions,
  ): Promise<T> {
    return this.synthesize(schema) as T;
  }

  async *stream(prompt: string, _opts?: AIOptions): AsyncIterable<string> {
    const text =
      this.opts.fixedCompletion !== undefined
        ? this.opts.fixedCompletion
        : `[stub-ai] ${prompt}`;
    const tokens = text.split(/(\s+)/);
    for (const t of tokens) {
      if (this.opts.streamDelayMs !== undefined && this.opts.streamDelayMs > 0) {
        await new Promise((r) => setTimeout(r, this.opts.streamDelayMs));
      }
      yield t;
    }
  }

  /** Builds a minimal value matching `schema` — recursive over properties/items. */
  private synthesize(schema: JSONSchema): unknown {
    if (schema.enum !== undefined && schema.enum.length > 0) {
      return schema.enum[0];
    }
    switch (schema.type) {
      case "string":
        return "stub";
      case "number":
        return 0;
      case "boolean":
        return false;
      case "null":
        return null;
      case "array":
        return schema.items !== undefined ? [this.synthesize(schema.items)] : [];
      case "object":
      default: {
        const out: Record<string, unknown> = {};
        const required = new Set(schema.required ?? []);
        const props = schema.properties ?? {};
        for (const [key, sub] of Object.entries(props)) {
          if (required.has(key)) out[key] = this.synthesize(sub);
        }
        return out;
      }
    }
  }
}
