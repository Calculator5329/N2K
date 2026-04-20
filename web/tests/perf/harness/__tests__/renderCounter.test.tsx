import { act } from "react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { CountProfiler, createRenderCounter } from "../renderCounter.js";

describe("renderCounter", () => {
  it("counts renders per profiler id", async () => {
    const counter = createRenderCounter();

    let setN: (n: number) => void = () => {};
    function Inner() {
      const [n, set] = useState(0);
      setN = set;
      return (
        <CountProfiler id="inner" counter={counter}>
          <span>{n}</span>
        </CountProfiler>
      );
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => { root.render(<Inner />); });
    expect(counter.get("inner")).toBe(1);

    await act(async () => { setN(1); });
    expect(counter.get("inner")).toBe(2);

    await act(async () => { root.unmount(); });
  });
});
