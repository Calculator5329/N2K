/**
 * AI service abstraction.
 *
 * Wraps text completion + structured-output + streaming for the future
 * AI-powered features:
 *   - **NL solve** — "Find me an equation for 47 using these dice"
 *   - **Theme generation** — "A frosty winter forest theme with deep blues"
 *   - **Commentary** — narrating a multiplayer match in real time
 *   - **Tutoring** — explaining why one solution is "easier" than another
 *
 * Today's default impl is `StubAIService` which returns canned responses
 * for development. The real impl (`GeminiAIService`) will live behind
 * the future Cloud Run backend so the API key never ships in browser
 * bundles.
 */

export interface AIOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly stop?: readonly string[];
}

/**
 * Minimal JSON Schema subset we promise to support across providers.
 * Stays loose so it can degrade to plain JSON validation when the
 * underlying model doesn't natively support structured output.
 */
export interface JSONSchema {
  readonly type?: "object" | "array" | "string" | "number" | "boolean" | "null";
  readonly properties?: Record<string, JSONSchema>;
  readonly items?: JSONSchema;
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly description?: string;
  /** Index signature for forward-compat with vendor-specific extensions. */
  readonly [key: string]: unknown;
}

export interface AIService {
  /** Plain text completion. */
  complete(prompt: string, opts?: AIOptions): Promise<string>;

  /**
   * Structured output. The provider is asked to emit JSON conforming
   * to `schema`. Implementations MUST validate the result and throw
   * if the model violates the schema (so callers don't have to
   * re-validate downstream).
   */
  completeStructured<T = unknown>(
    prompt: string,
    schema: JSONSchema,
    opts?: AIOptions,
  ): Promise<T>;

  /**
   * Token-level streaming. Yields the running delta as the model
   * produces it. Consumers iterate with `for await`. Cancellation:
   * call `.return()` on the iterator (handled by `for await` `break`).
   */
  stream(prompt: string, opts?: AIOptions): AsyncIterable<string>;
}
