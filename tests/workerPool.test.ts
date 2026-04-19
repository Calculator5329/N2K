import { describe, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkerPool } from "../src/services/workerPool.js";

// Worker source is written to a temp file; keeping the tests self-contained
// (no fixture file to maintain alongside). A CommonJS-flavored `.cjs` file
// side-steps the ESM loader entirely.
const ECHO_WORKER = `
  const { parentPort } = require('node:worker_threads');
  parentPort.on('message', (msg) => {
    const { id, payload } = msg;
    if (payload === 'throw') {
      parentPort.postMessage({ ok: false, id, error: 'simulated failure' });
      return;
    }
    if (payload === 'crash') {
      process.exit(1);
    }
    const delay = payload && typeof payload === 'object' && 'delay' in payload
      ? payload.delay
      : 0;
    const value = typeof payload === 'number' ? payload : (payload.value ?? 0);
    setTimeout(() => {
      parentPort.postMessage({ ok: true, id, result: value * 2 });
    }, delay);
  });
`;

function workerFileFromSource(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "n2k-pool-test-"));
  const path = join(dir, "worker.cjs");
  writeFileSync(path, source);
  return path;
}

function newPool(
  concurrency: number,
): WorkerPool<number | string | { delay?: number; value?: number }, number> {
  return new WorkerPool({
    workerFile: workerFileFromSource(ECHO_WORKER),
    concurrency,
  });
}

// ---------------------------------------------------------------------------
//  Smoke: a direct Worker created from the same source must also work.
// ---------------------------------------------------------------------------

describe("WorkerPool — smoke", () => {
  it("round-trips a single job", async () => {
    const pool = newPool(1);
    try {
      const r = await pool.run(7);
      expect(r).toBe(14);
    } finally {
      await pool.terminate();
    }
  });

  it("reports pool size from the concurrency option", () => {
    const pool = newPool(3);
    try {
      expect(pool.size).toBe(3);
    } finally {
      void pool.terminate();
    }
  });
});

describe("WorkerPool — concurrency / queueing", () => {
  it("dispatches up to `concurrency` jobs in parallel", async () => {
    // Strategy: measure serial baseline (concurrency=1) and parallel
    // (concurrency=3) on the same workload, then assert parallel is
    // meaningfully faster than serial. This avoids a hard wall-clock
    // threshold that goes flaky under Windows worker_threads startup
    // jitter (cold worker boot routinely costs 100–200 ms).
    const DELAY_MS = 200;
    const JOBS = 6;
    const payload = { delay: DELAY_MS, value: 0 };

    const serialPool = newPool(1);
    let serialElapsed: number;
    try {
      const start = Date.now();
      await Promise.all(Array.from({ length: JOBS }, () => serialPool.run(payload)));
      serialElapsed = Date.now() - start;
    } finally {
      await serialPool.terminate();
    }

    const parallelPool = newPool(3);
    let parallelElapsed: number;
    let results: readonly number[];
    try {
      const start = Date.now();
      results = await Promise.all(
        Array.from({ length: JOBS }, () => parallelPool.run(payload)),
      );
      parallelElapsed = Date.now() - start;
    } finally {
      await parallelPool.terminate();
    }

    expect(results.length).toBe(JOBS);
    // Concurrency=3 over 6 jobs of equal length should take roughly
    // half as long as serial. Allow generous slack: parallel must be
    // at most 70% of serial.
    expect(parallelElapsed).toBeLessThan(serialElapsed * 0.7);
  });

  it("processes more jobs than workers via the internal queue", async () => {
    const pool = newPool(2);
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => pool.run(i)),
      );
      expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
    } finally {
      await pool.terminate();
    }
  });
});

describe("WorkerPool — error propagation", () => {
  it("rejects when the worker returns { ok: false }", async () => {
    const pool = newPool(1);
    try {
      await expect(pool.run("throw")).rejects.toThrow(/simulated failure/);
    } finally {
      await pool.terminate();
    }
  });

  it("continues dispatching after a rejected job", async () => {
    const pool = newPool(1);
    try {
      await expect(pool.run("throw")).rejects.toThrow();
      const good = await pool.run(5);
      expect(good).toBe(10);
    } finally {
      await pool.terminate();
    }
  });

  it("rejects a job whose worker crashes mid-flight", async () => {
    const pool = newPool(1);
    try {
      await expect(pool.run("crash")).rejects.toThrow();
    } finally {
      await pool.terminate();
    }
  });
});

describe("WorkerPool — lifecycle", () => {
  it("rejects run() after terminate()", async () => {
    const pool = newPool(1);
    await pool.terminate();
    await expect(pool.run(1)).rejects.toThrow(/destroyed/);
  });

  it("close() drains pending jobs then terminates", async () => {
    const pool = newPool(2);
    const jobs = Array.from({ length: 6 }, (_, i) => pool.run(i));
    await pool.close();
    const results = await Promise.all(jobs);
    expect(results).toEqual([0, 2, 4, 6, 8, 10]);
    await expect(pool.run(99)).rejects.toThrow();
  });
});

describe("direct Worker sanity (ensures the inline source is valid)", () => {
  it("executes the worker source without the pool layer", async () => {
    const path = workerFileFromSource(ECHO_WORKER);
    const w = new Worker(path);
    try {
      const result = await new Promise<number>((resolve, reject) => {
        w.once("message", (m) => (m.ok ? resolve(m.result) : reject(new Error(m.error))));
        w.postMessage({ id: 1, payload: 3 });
      });
      expect(result).toBe(6);
    } finally {
      await w.terminate();
    }
  });
});
