import { describe, expect, it } from "vitest";
import { StubAIService } from "../src/services/local/stubAIService.js";
import type { JSONSchema } from "../src/services/aiService.js";

describe("StubAIService", () => {
  it("complete returns a deterministic stubbed string", async () => {
    const ai = new StubAIService();
    expect(await ai.complete("hi")).toBe("[stub-ai] hi");
  });

  it("complete honors fixedCompletion", async () => {
    const ai = new StubAIService({ fixedCompletion: "pinned" });
    expect(await ai.complete("anything")).toBe("pinned");
  });

  it("stream yields tokens that concatenate to the full text", async () => {
    const ai = new StubAIService();
    const out: string[] = [];
    for await (const t of ai.stream("hello world")) out.push(t);
    expect(out.join("")).toBe("[stub-ai] hello world");
    expect(out.length).toBeGreaterThan(1); // actually streamed
  });

  it("completeStructured satisfies a basic object schema", async () => {
    const schema: JSONSchema = {
      type: "object",
      required: ["name", "age", "tags"],
      properties: {
        name: { type: "string" },
        age: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
        opt: { type: "string" }, // not required → omitted
      },
    };
    const result = await new StubAIService().completeStructured<{
      name: string;
      age: number;
      tags: string[];
      opt?: string;
    }>("prompt", schema);
    expect(typeof result.name).toBe("string");
    expect(typeof result.age).toBe("number");
    expect(Array.isArray(result.tags)).toBe(true);
    expect(result.tags[0]).toBe("stub");
    expect(result.opt).toBeUndefined();
  });

  it("completeStructured honors enum", async () => {
    const result = await new StubAIService().completeStructured<{
      mood: string;
    }>("p", {
      type: "object",
      required: ["mood"],
      properties: { mood: { enum: ["happy", "sad"], type: "string" } },
    });
    expect(result.mood).toBe("happy");
  });
});
